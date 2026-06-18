#!/mnt/storage/venv/bin/python
"""
Audio evaluation engine for Deutsch-App Speaking module.
Performs DTW (Dynamic Time Warping) + MFCC comparison between user and reference audio.
Returns rhythm, intonation, and accuracy scores with word-level timing.
"""
import sys, json, os, re
import numpy as np

def load_audio(path, sr=16000):
    import librosa
    y, _ = librosa.load(path, sr=sr, mono=True)
    if np.max(np.abs(y)) > 0:
        y = y / np.max(np.abs(y))
    return y, sr


def extract_mfcc(y, sr, n_mfcc=13):
    import librosa
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, n_fft=1024, hop_length=512)
    return mfcc.T


def dtw_distance(X, Y):
    from scipy.spatial.distance import cdist
    D = cdist(X, Y, metric='cosine')
    N, M = D.shape
    cost = np.full((N + 1, M + 1), np.inf)
    cost[0, 0] = 0
    for i in range(1, N + 1):
        for j in range(1, M + 1):
            cost[i, j] = D[i - 1, j - 1] + min(cost[i - 1, j], cost[i, j - 1], cost[i - 1, j - 1])
    return cost[N, M] / max(N, M)


def extract_pitch(y, sr):
    import librosa
    f0, voiced_flag, _ = librosa.pyin(y, fmin=65, fmax=525, sr=sr)
    f0 = np.nan_to_num(f0)
    voiced = voiced_flag.astype(float)
    return f0, voiced


def extract_energy(y, sr, hop_length=512):
    import librosa
    rms = librosa.feature.rms(y=y, hop_length=hop_length, frame_length=2048)
    return rms[0]


def detect_word_boundaries(y, sr, text, hop_length=512):
    """Estimate word boundaries using energy-based VAD + rough timing."""
    import librosa
    energy = extract_energy(y, sr, hop_length)
    thr = np.mean(energy) * 0.3
    is_speech = energy > thr

    frames = np.where(is_speech)[0]
    if len(frames) == 0:
        return []

    boundaries = []
    prev = frames[0]
    gap_thr = int(0.15 * sr / hop_length)

    for f in frames[1:]:
        if f - prev > gap_thr:
            boundaries.append(int(prev * hop_length / sr * 1000))
            boundaries.append(int(f * hop_length / sr * 1000))
        prev = f

    if boundaries:
        boundaries.insert(0, int(frames[0] * hop_length / sr * 1000))
        boundaries.append(int(frames[-1] * hop_length / sr * 1000))
    else:
        boundaries = [0, int(len(y) / sr * 1000)]

    words = text.split()
    timings = []
    n_words = len(words)
    n_bounds = len(boundaries)

    if n_words > 0 and n_bounds >= 2:
        bounds_per_word = max(1, (n_bounds - 1) // n_words)
        for i in range(n_words):
            bi = min(i * bounds_per_word, n_bounds - 2)
            start = boundaries[bi]
            end = boundaries[min(bi + bounds_per_word, n_bounds - 1)]
            timings.append({
                'word': words[i],
                'start_ms': start,
                'end_ms': end,
            })
    else:
        total_ms = int(len(y) / sr * 1000)
        for i, w in enumerate(words):
            seg = total_ms / max(n_words, 1)
            timings.append({
                'word': w,
                'start_ms': int(i * seg),
                'end_ms': int((i + 1) * seg),
            })

    return timings


def compare_rhythm(user_y, user_sr, ref_y, ref_sr):
    """Compare amplitude envelopes for rhythm similarity."""
    import librosa

    user_env = np.abs(librosa.stft(user_y, n_fft=1024, hop_length=512)).sum(axis=0)
    ref_env = np.abs(librosa.stft(ref_y, n_fft=1024, hop_length=512)).sum(axis=0)

    user_env = (user_env - np.mean(user_env)) / (np.std(user_env) + 1e-10)
    ref_env = (ref_env - np.mean(ref_env)) / (np.std(ref_env) + 1e-10)

    import scipy.signal
    user_autocorr = np.correlate(user_env, user_env, mode='same')
    ref_autocorr = np.correlate(ref_env, ref_env, mode='same')

    mid = len(user_autocorr) // 2
    if len(user_autocorr) > mid and len(ref_autocorr) > mid:
        user_peaks = scipy.signal.find_peaks(user_autocorr[mid:], distance=10)[0]
        ref_peaks = scipy.signal.find_peaks(ref_autocorr[mid:], distance=10)[0]
        if len(user_peaks) > 0 and len(ref_peaks) > 0:
            user_period = np.median(np.diff(user_peaks))
            ref_period = np.median(np.diff(ref_peaks))
            ratio = min(user_period, ref_period) / max(user_period, ref_period)
            rhythm_score = ratio * 100
        else:
            rhythm_score = 50
    else:
        rhythm_score = 50

    return round(float(min(100, max(0, rhythm_score))), 1)


def compare_intonation(user_y, user_sr, ref_y, ref_sr):
    """Compare pitch contours for intonation similarity."""
    user_f0, _ = extract_pitch(user_y, user_sr)
    ref_f0, _ = extract_pitch(ref_y, ref_sr)

    min_len = min(len(user_f0), len(ref_f0))
    if min_len < 5:
        return {'score': 0, 'detail': 'Audio too short for intonation analysis'}

    user_f0 = user_f0[:min_len]
    ref_f0 = ref_f0[:min_len]

    user_f0 = (user_f0 - np.mean(user_f0)) / (np.std(user_f0) + 1e-10)
    ref_f0 = (ref_f0 - np.mean(ref_f0)) / (np.std(ref_f0) + 1e-10)

    corr = np.corrcoef(user_f0, ref_f0)[0, 1]
    if np.isnan(corr):
        corr = 0

    dist = np.sqrt(np.mean((user_f0 - ref_f0) ** 2))
    dist_score = max(0, 100 - (dist / 2.0) * 100)

    score = corr * 50 + dist_score * 0.5
    score = max(0, min(100, score))

    return {
        'score': round(float(score), 1),
        'pitch_correlation': round(float(corr), 3),
        'pitch_distance': round(float(dist), 3),
    }


def compare_accuracy(user_y, user_sr, ref_y, ref_sr):
    """Compare MFCC features for phonetic accuracy using DTW."""
    user_mfcc = extract_mfcc(user_y, user_sr)
    ref_mfcc = extract_mfcc(ref_y, ref_sr)

    d = dtw_distance(user_mfcc, ref_mfcc)
    score = max(0, 100 - d * 50)
    score = min(100, score)
    return round(float(score), 1)


def transcribe_audio(audio_path):
    """Transcribe audio with fast-whisper for text accuracy. Falls back to CPU if GPU fails."""
    try:
        from faster_whisper import WhisperModel
        try:
            model = WhisperModel('base', device='cuda', compute_type='float16')
        except Exception:
            model = WhisperModel('base', device='cpu', compute_type='int8', num_workers=2)
        segments, info = model.transcribe(audio_path, language='de', beam_size=5)
        text = ' '.join(seg.text for seg in segments)
        return text.strip(), info.duration
    except Exception as e:
        return '', 0


def generate_ref_audio(text, out_path):
    """Generate reference audio from text using gTTS."""
    try:
        from gtts import gTTS
        tts = gTTS(text, lang='de', slow=False)
        tts.save(out_path)
        return True
    except Exception:
        return False


def evaluate_audio(user_audio_path, expected_text, ref_audio_path=None):
    """Full audio evaluation: transcribe + compare with DTW/MFCC."""
    result = {
        'accuracy': 0,
        'intonation': {},
        'rhythm_score': 0,
        'text_accuracy': 0,
        'transcribed': '',
        'word_timings': [],
        'feedback': [],
        'duration': 0,
    }

    transcribed, duration = transcribe_audio(user_audio_path)
    result['transcribed'] = transcribed
    result['duration'] = round(duration, 1)

    et = expected_text.lower().strip()
    tt = transcribed.lower().strip()

    et_words = set(et.split())
    tt_words = set(tt.split())
    if et_words:
        correct_words = et_words & tt_words
        text_accuracy = len(correct_words) / len(et_words) * 100
    else:
        text_accuracy = 0
    result['text_accuracy'] = round(text_accuracy, 1)

    user_y, user_sr = load_audio(user_audio_path)

    tmp_ref = None
    if not (ref_audio_path and os.path.exists(ref_audio_path)):
        if expected_text.strip():
            tmp_ref = '/tmp/_ref_' + os.path.basename(user_audio_path) + '.mp3'
            if generate_ref_audio(expected_text, tmp_ref):
                ref_audio_path = tmp_ref

    if ref_audio_path and os.path.exists(ref_audio_path):
        ref_y, ref_sr = load_audio(ref_audio_path)

        if len(user_y) > sr * 0.5 and len(ref_y) > sr * 0.5:
            mfcc_accuracy = compare_accuracy(user_y, user_sr, ref_y, ref_sr)
            result['accuracy'] = mfcc_accuracy

            intonation = compare_intonation(user_y, user_sr, ref_y, ref_sr)
            result['intonation'] = intonation

            rhythm = compare_rhythm(user_y, user_sr, ref_y, ref_sr)
            result['rhythm_score'] = rhythm

            word_timings = detect_word_boundaries(user_y, user_sr, expected_text)
            result['word_timings'] = word_timings
        else:
            result['accuracy'] = result['text_accuracy']
    else:
        result['accuracy'] = result['text_accuracy']

    if tmp_ref and os.path.exists(tmp_ref):
        try:
            os.unlink(tmp_ref)
        except Exception:
            pass

    combined = result['accuracy'] * 0.4 + result['text_accuracy'] * 0.6
    result['combined_score'] = round(combined, 1)

    if combined < 40:
        result['feedback'].append('Die Aussprache muss verbessert werden. Übe langsam und deutlich.')
    elif combined < 70:
        result['feedback'].append('Gut, aber es gibt Abweichungen. Höre das Original noch einmal.')
    else:
        result['feedback'].append('Sehr gut! Deine Aussprache ist klar und verständlich.')

    return result


sr = 16000

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: audio_eval.py <user_audio> <expected_text> [ref_audio]'}))
        sys.exit(1)

    user_audio = sys.argv[1]
    expected = sys.argv[2] if len(sys.argv) > 2 else ''
    ref_audio = sys.argv[3] if len(sys.argv) > 3 else None

    if not os.path.exists(user_audio):
        print(json.dumps({'error': f'Audio file not found: {user_audio}'}))
        sys.exit(1)

    result = evaluate_audio(user_audio, expected, ref_audio)
    print(json.dumps(result, ensure_ascii=False))
