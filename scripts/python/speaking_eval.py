#!/mnt/storage/venv/bin/python
"""
Speaking evaluation engine for Deutsch-App.
Evaluates pronunciation, intonation, and accuracy using faster-whisper + librosa.
"""
import sys, json, os, tempfile, base64
import numpy as np
from scipy.spatial.distance import cdist

WHISPER_MODEL = None

def get_model():
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        from faster_whisper import WhisperModel
        try:
            WHISPER_MODEL = WhisperModel('base', device='cuda', compute_type='float16')
        except Exception:
            WHISPER_MODEL = WhisperModel('base', device='cpu', compute_type='int8', num_workers=2)
    return WHISPER_MODEL

def transcribe(audio_path: str, language: str = 'de'):
    model = get_model()
    segments, info = model.transcribe(audio_path, language=language, beam_size=5)
    text = ' '.join(seg.text for seg in segments)
    return text.strip(), info.duration

def evaluate_intonation(audio_path: str, ref_audio_path: str) -> dict:
    import librosa
    y_u, sr = librosa.load(audio_path, sr=16000)
    y_r, _ = librosa.load(ref_audio_path, sr=16000)

    f0_u, _, _ = librosa.pyin(y_u, fmin=75, fmax=500, sr=sr)
    f0_r, _, _ = librosa.pyin(y_r, fmin=75, fmax=500, sr=sr)

    f0_u = np.nan_to_num(f0_u)
    f0_r = np.nan_to_num(f0_r)

    min_len = min(len(f0_u), len(f0_r))
    if min_len < 10:
        return {'score': 0, 'detail': 'Audio too short'}

    f0_u = f0_u[:min_len]
    f0_r = f0_r[:min_len]

    dist = np.sqrt(np.mean((f0_u - f0_r) ** 2))
    score = max(0, min(100, 100 - (dist / 50) * 100))
    return {'score': round(score, 1), 'distance': round(float(dist), 2)}

def evaluate_speaking(audio_path: str, expected_text: str, ref_audio: str = None) -> dict:
    result = {'accuracy': 0, 'intonation': None, 'transcribed': '', 'feedback': []}

    transcribed, duration = transcribe(audio_path)
    result['transcribed'] = transcribed

    et = expected_text.lower().strip()
    tt = transcribed.lower().strip()

    words_expected = set(et.split())
    words_transcribed = set(tt.split())
    if words_expected:
        correct_words = words_expected & words_transcribed
        accuracy = len(correct_words) / len(words_expected) * 100
    else:
        accuracy = 0

    result['accuracy'] = round(accuracy, 1)

    if accuracy < 40:
        result['feedback'].append('Die Aussprache muss verbessert werden. Versuchen Sie es noch einmal.')
    elif accuracy < 70:
        result['feedback'].append('Gut, aber einige Wörter fehlen. Hören Sie noch einmal genau hin.')
    else:
        result['feedback'].append('Sehr gut! Die Aussprache ist klar und verständlich.')

    if ref_audio and os.path.exists(ref_audio):
        intonation = evaluate_intonation(audio_path, ref_audio)
        result['intonation'] = intonation
        if intonation['score'] < 50:
            result['feedback'].append('Die Betonung könnte natürlicher sein.')
        else:
            result['feedback'].append('Die Intonation ist natürlich.')

    result['duration'] = round(duration, 1)
    return result

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Usage: speaking_eval.py <audio_path> <expected_text> [ref_audio]'}))
        sys.exit(1)

    audio_path = sys.argv[1]
    expected = sys.argv[2]
    ref_path = sys.argv[3] if len(sys.argv) > 3 else None

    if not os.path.exists(audio_path):
        print(json.dumps({'error': f'Audio file not found: {audio_path}'}))
        sys.exit(1)

    result = evaluate_speaking(audio_path, expected, ref_path)
    print(json.dumps(result, ensure_ascii=False))
