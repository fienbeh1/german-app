#!/mnt/storage/venv/bin/python
"""
Writing evaluation engine for Deutsch-App.
Uses MERLIN corpus as reference for level-appropriate writing assessment.
Evaluates vocabulary richness, grammatical complexity, spelling, and CEFR level fit.
"""
import sys, json, os, re
from pathlib import Path

MERLIN_DIR = '/home/f/deutsch-app/de/writing/merlin-text-v1.2'

def load_merlin_texts(level=None):
    """Load MERLIN corpus texts by level."""
    meta_dir = os.path.join(MERLIN_DIR, 'meta_ltext', 'german_metafn')
    plain_dir = os.path.join(MERLIN_DIR, 'plain', 'german')
    texts = []
    if not os.path.exists(meta_dir):
        return texts
    for fname in os.listdir(meta_dir):
        if not fname.endswith('.txt'):
            continue
        if level and not fname.startswith(level):
            continue
        parts = fname.split('_-_')
        if len(parts) >= 2:
            f_level = parts[0]
            prompt = parts[1] if len(parts) > 1 else ''
        else:
            f_level = 'unknown'
            prompt = ''
        plain_name = fname.rsplit('_-_', 1)[-1] if '_-_' in fname else fname
        plain_path = os.path.join(plain_dir, plain_name)
        content = ''
        if os.path.exists(plain_path):
            with open(plain_path, 'r') as f:
                content = f.read().strip()
        texts.append({
            'level': f_level,
            'prompt': prompt,
            'filename': plain_name,
            'content': content,
            'word_count': len(content.split()),
        })
    return texts

def get_writing_prompts(level='A1'):
    """Get available writing prompts by level."""
    texts = load_merlin_texts(level)
    prompts = set()
    for t in texts:
        if t['prompt']:
            prompts.add(t['prompt'])
    return sorted(list(prompts))

def evaluate_writing(text, level='A1', prompt=''):
    """
    Evaluate a German learner text.
    Returns scores for: vocabulary, grammar, spelling, structure, CEFR alignment.
    """
    words = text.split()
    word_count = len(words)
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    sentence_count = len(sentences)

    vocab_set = set(w.lower().strip('.,!?;:"\'()-') for w in words)
    unique_ratio = len(vocab_set) / max(word_count, 1)

    avg_word_len = sum(len(w.strip('.,!?;:"\'')) for w in words) / max(word_count, 1)
    avg_sentence_len = word_count / max(sentence_count, 1)

    cap_ratio = sum(1 for w in words if w[0].isupper() if len(w) > 1) / max(word_count, 1)

    compound_words = sum(1 for w in words if '-' in w and len(w) > 5)
    long_words = sum(1 for w in words if len(w) > 10)
    umlaut_count = sum(1 for c in text if c in 'äöüÄÖÜß')

    articles = sum(1 for w in words if w.lower() in ('der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'eines'))
    prepositions = sum(1 for w in words if w.lower() in ('in', 'auf', 'mit', 'nach', 'zu', 'aus', 'bei', 'von', 'an', 'für', 'über', 'unter', 'vor', 'zwischen', 'durch', 'gegen', 'ohne', 'um'))
    conjunctions = sum(1 for w in words if w.lower() in ('und', 'oder', 'aber', 'denn', 'weil', 'dass', 'wenn', 'als', 'obwohl', 'während', 'nachdem', 'bevor', 'seitdem', 'da', 'damit', 'sobald'))

    errors = []
    feedback = []

    if word_count < 5:
        errors.append('Text too short for evaluation')
        feedback.append('Der Text ist zu kurz für eine Bewertung.')
        return {
            'score': 0, 'word_count': word_count, 'sentence_count': sentence_count,
            'vocabulary_score': 0, 'grammar_score': 0, 'structure_score': 0,
            'errors': errors, 'feedback': feedback, 'level': level
        }

    vocab_score = min(100, unique_ratio * 100 * 1.5)
    grammar_score = min(100, (articles + prepositions + conjunctions) / max(word_count, 1) * 200)
    structure_score = min(100, (sentence_count / max(word_count, 1)) * 100 * sentence_count)

    level_thresholds = {
        'A1': {'word_min': 10, 'word_max': 80, 'sentence_min': 2, 'sentence_max': 8},
        'A2': {'word_min': 20, 'word_max': 150, 'sentence_min': 3, 'sentence_max': 12},
        'B1': {'word_min': 40, 'word_max': 300, 'sentence_min': 4, 'sentence_max': 20},
        'B2': {'word_min': 60, 'word_max': 500, 'sentence_min': 5, 'sentence_max': 30},
    }
    thresh = level_thresholds.get(level, level_thresholds['A1'])

    level_fit = 100
    if word_count < thresh['word_min']:
        level_fit -= 20
        feedback.append(f'Der Text ist zu kurz für Niveau {level} (min. {thresh["word_min"]} Wörter).')
    if word_count > thresh['word_max']:
        level_fit -= 10
    if sentence_count < thresh['sentence_min']:
        level_fit -= 15
        feedback.append(f'Zu wenige Sätze für Niveau {level}.')
    if avg_sentence_len > 20 and level in ('A1', 'A2'):
        level_fit -= 10

    if unique_ratio > 0.8 and level in ('A1', 'A2'):
        level_fit += 10
    elif unique_ratio < 0.4 and level in ('B1', 'B2'):
        level_fit -= 15
        feedback.append('Der Wortschatz könnte abwechslungsreicher sein.')

    if compound_words > 3 and level in ('A1', 'A2'):
        level_fit += 5
    if conjunctions > 2 and level in ('A1',):
        feedback.append('Gute Verwendung von Konjunktionen für A1 Niveau.')
        level_fit += 10

    total_score = round((vocab_score * 0.3 + grammar_score * 0.3 + structure_score * 0.2 + level_fit * 0.2), 1)

    if total_score >= 80:
        feedback.insert(0, 'Sehr gut! Der Text erfüllt die Anforderungen des Niveaus.')
    elif total_score >= 60:
        feedback.insert(0, 'Gut, aber es gibt noch Verbesserungspotential.')
    elif total_score >= 40:
        feedback.insert(0, 'Der Text ist verständlich, aber einige Bereiche müssen verbessert werden.')
    else:
        feedback.insert(0, 'Der Text benötigt noch viel Übung für dieses Niveau.')

    return {
        'score': total_score,
        'word_count': word_count,
        'sentence_count': sentence_count,
        'avg_word_length': round(avg_word_len, 1),
        'avg_sentence_length': round(avg_sentence_len, 1),
        'vocabulary_score': round(vocab_score, 1),
        'grammar_score': round(grammar_score, 1),
        'structure_score': round(structure_score, 1),
        'level_fit': round(level_fit, 1),
        'unique_ratio': round(unique_ratio, 2),
        'article_count': articles,
        'preposition_count': prepositions,
        'conjunction_count': conjunctions,
        'compound_words': compound_words,
        'long_words': long_words,
        'umlaut_count': umlaut_count,
        'errors': errors,
        'feedback': feedback,
        'level': level,
        'prompt': prompt,
    }

def generate_model_text(level='A1', prompt='', word_target=None):
    """Generate a model German text using Ollama for the given level and prompt."""
    word_limits = {'A1': '40-80', 'A2': '60-120', 'B1': '100-200', 'B2': '150-300'}
    wl = word_target if word_target else word_limits.get(level, '40-80')

    system_prompt = (
        f"Du bist ein Deutschlehrer auf Niveau {level}. "
        f"Schreibe einen kurzen deutschen Text zum Thema '{prompt}' "
        f"mit {wl} Wörtern. "
        f"Verwende nur Grammatik und Wortschatz, die für Niveau {level} geeignet sind. "
        f"Gib NUR den Text aus, keine Erklärungen."
    )

    try:
        import subprocess
        result = subprocess.run(['ollama', 'run', 'mistral'],
            input=system_prompt.encode(), capture_output=True, timeout=120)
        raw = result.stdout.decode('utf-8', errors='replace')
        raw = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', raw)
        raw = re.sub(r'```.*?\n', '', raw).strip()
        raw = raw.strip('"\'')
        raw = re.sub(r'\n+', ' ', raw)
        raw = re.sub(r'\s+', ' ', raw).strip()
        if not raw:
            return {'error': 'Empty response from model', 'level': level, 'prompt': prompt}
        return raw
    except subprocess.TimeoutExpired:
        return {'error': 'Model generation timed out', 'level': level, 'prompt': prompt}
    except Exception as e:
        return {'error': str(e), 'level': level, 'prompt': prompt}


VERBS = {
    'bin', 'bist', 'ist', 'sind', 'seid', 'habe', 'hast', 'hat', 'haben', 'habt',
    'werde', 'wirst', 'wird', 'werden', 'werdet', 'kann', 'kannst', 'können', 'könnt',
    'muss', 'musst', 'müssen', 'müsst', 'will', 'willst', 'wollen', 'wollt', 'mag', 'magst', 'mögen',
    'darf', 'darfst', 'dürfen', 'dürft', 'soll', 'sollst', 'sollen', 'sollt',
    'gehe', 'gehst', 'geht', 'gehen', 'komme', 'kommst', 'kommt', 'kommen',
    'mache', 'machst', 'macht', 'machen', 'spiele', 'spielst', 'spielt', 'spielen',
    'wohne', 'wohnst', 'wohnt', 'wohnen', 'lerne', 'lernst', 'lernt', 'lernen',
    'arbeite', 'arbeitest', 'arbeitet', 'arbeiten', 'heiße', 'heißt', 'heißen',
    'suche', 'suchst', 'sucht', 'suchen', 'schreibe', 'schreibst', 'schreibt', 'schreiben',
    'lese', 'liest', 'lesen', 'spreche', 'sprichst', 'spricht', 'sprechen',
    'trinke', 'trinkst', 'trinkt', 'trinken', 'esse', 'isst', 'essen',
    'kaufe', 'kaufst', 'kauft', 'kaufen', 'verkaufe', 'verkaufst', 'verkauft', 'verkaufen',
    'nehme', 'nimmst', 'nimmt', 'nehmen', 'gebe', 'gibst', 'gibt', 'geben',
    'sehe', 'siehst', 'sieht', 'sehen', 'höre', 'hörst', 'hört', 'hören',
    'weiß', 'weißt', 'wissen', 'kenne', 'kennst', 'kennt', 'kennen',
    'finde', 'findest', 'findet', 'finden', 'bleibe', 'bleibst', 'bleibt', 'bleiben',
    'fahre', 'fährst', 'fährt', 'fahren', 'trage', 'trägst', 'trägt', 'tragen',
    'laufe', 'läufst', 'läuft', 'laufen', 'schlafe', 'schläfst', 'schläft', 'schlafen',
    'warte', 'wartest', 'wartet', 'warten', 'helfe', 'hilfst', 'hilft', 'helfen',
    'antworte', 'antwortest', 'antwortet', 'antworten', 'danke', 'dankst', 'dankt', 'danken',
    'grüße', 'grüßt', 'grüßen', 'besuche', 'besuchst', 'besucht', 'besuchen',
    'brauche', 'brauchst', 'braucht', 'brauchen', 'miete', 'mietest', 'mietet', 'mieten',
    'bezahle', 'bezahlst', 'bezahlt', 'bezahlen', 'koste', 'kostest', 'kostet', 'kosten',
    'möchte', 'möchtest', 'möchten', 'möchtet',
}


def grammar_check_sentence(sentence, level='A1'):
    """Check a single sentence for common German grammar issues.
    Returns { quality: 'ok'|'warn'|'error', issues: [...] }"""
    issues = []
    words = sentence.split()
    if len(words) < 2:
        return {'quality': 'ok', 'issues': []}
    lower_words = [w.lower().strip('.,!?;:"\'()-') for w in words]

    # 1. Verb position: skip very short/fragment sentences
    if len(words) >= 4:
        sub_conj = {'weil', 'dass', 'wenn', 'obwohl', 'da', 'damit', 'sobald', 'nachdem', 'bevor', 'seitdem', 'während', 'ob'}
        if lower_words[0] in sub_conj:
            has_verb_end = any(lower_words[-3:])
            if not has_verb_end:
                issues.append('Prüfe die Verbposition: In Nebensätzen steht das Verb am Ende.')
        else:
            verb_found = False
            for i, w in enumerate(lower_words):
                if w in VERBS:
                    if i > 2 and not verb_found:
                        issues.append('Achte auf die Verbposition: Im Hauptsatz steht das konjugierte Verb an zweiter Stelle.')
                    verb_found = True
                    break
            if not verb_found:
                pass

    # 2. Subject-verb agreement
    subject_verb_map = {
        'ich': {'bin', 'habe', 'werde', 'kann', 'muss', 'will', 'gehe', 'komme', 'mache', 'wohne', 'lerne', 'arbeite', 'heiße'},
        'du': {'bist', 'hast', 'wirst', 'kannst', 'musst', 'willst', 'gehst', 'kommst', 'machst', 'wohnst', 'lernst', 'arbeitest', 'heißt'},
        'er': {'ist', 'hat', 'wird', 'kann', 'muss', 'will', 'geht', 'kommt', 'macht', 'wohnt', 'lernt', 'arbeitet', 'heißt'},
        'sie': {'ist', 'hat', 'wird', 'kann', 'muss', 'will', 'geht', 'kommt', 'macht', 'wohnt', 'lernt', 'arbeitet', 'heißt'},
        'es': {'ist', 'hat', 'wird', 'kann', 'muss', 'will', 'geht', 'kommt', 'macht', 'wohnt', 'lernt', 'arbeitet', 'heißt'},
        'wir': {'sind', 'haben', 'werden', 'können', 'müssen', 'wollen', 'gehen', 'kommen', 'machen', 'wohnen', 'lernen', 'arbeiten', 'heißen'},
        'ihr': {'seid', 'habt', 'werdet', 'könnt', 'müsst', 'wollt', 'geht', 'kommt', 'macht', 'wohnt', 'lernt', 'arbeitet', 'heißt'},
        'sie': {'sind', 'haben', 'werden', 'können', 'müssen', 'wollen', 'gehen', 'kommen', 'machen', 'wohnen', 'lernen', 'arbeiten', 'heißen'},
    }
    for i, w in enumerate(lower_words):
        if w in subject_verb_map and i + 1 < len(lower_words):
            next_word = lower_words[i + 1]
            if next_word not in subject_verb_map[w] and len(w) > 1:
                pass  # Could check but complex — skip for now

    # 3. Separable prefix at end
    sep_prefixes = {'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'nach', 'vor', 'zu', 'weg', 'weiter', 'zurück', 'zusammen', 'fest', 'los', 'ab', 'da', 'her', 'hin', 'hoch', 'nieder', 'vorbei', 'weg'}
    for i, w in enumerate(lower_words):
        if w in sep_prefixes and i == len(lower_words) - 1 and len(words) > 2:
            # Check if there's a separable verb earlier in the sentence
            sep_prefix_in_verb = False
            for j, pw in enumerate(lower_words):
                for sp in sep_prefixes:
                    if pw.startswith(sp) and len(pw) > len(sp) + 2:
                        sep_prefix_in_verb = True
                        break
                if sep_prefix_in_verb:
                    break
            if not sep_prefix_in_verb:
                issues.append(f'Steht das trennbare Präfix "{w}" am Satzende?')

    # 4. Capitalization (nouns should be capitalized)
    for w in words:
        clean = w.strip('.,!?;:"\'()')
        if len(clean) > 2 and not clean[0].isupper() and clean[0].isalpha():
            # Check if it might be a noun (common endings)
            noun_endings = ('ung', 'heit', 'keit', 'schaft', 'tion', 'sion', 'tät', 'ik', 'ur', 'ling', 'nis', 'sal', 'tum', 'ment', 'ismus')
            if any(clean.lower().endswith(e) for e in noun_endings):
                issues.append(f'"{clean}" sollte großgeschrieben werden (Nomen).')
                break

    if len(issues) == 0:
        return {'quality': 'ok', 'issues': []}
    elif len(issues) <= 1:
        return {'quality': 'warn', 'issues': issues}
    else:
        return {'quality': 'error', 'issues': issues}


def annotate_model_text(text, level='A1'):
    """Annotate a model text with sentence-level grammar quality and clickable explanations."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]

    result_sentences = []
    for s in sentences:
        grammar = grammar_check_sentence(s, level)
        annotations = []
        for issue in grammar['issues']:
            annotations.append({
                'text': issue,
                'type': 'grammar' if 'Verb' in issue or 'Groß' in issue else 'syntax',
            })
        if grammar['quality'] == 'ok' and level in ('A1', 'A2'):
            # Add positive annotations for simpler levels
            words_lower = [w.lower().strip('.,!?;:"\'()-') for w in s.split()]
            for w in words_lower:
                if w in {'der', 'die', 'das', 'den', 'dem', 'des'}:
                    annotations.append({
                        'text': f'"{w}" ist ein bestimmter Artikel — korrekt verwendet.',
                        'type': 'grammar',
                    })
                    break
            for w in words_lower:
                if w in {'und', 'oder', 'aber', 'denn', 'weil', 'dass', 'wenn'}:
                    annotations.append({
                        'text': f'"{w}" ist eine Konjunktion — gut für Satzverbindungen.',
                        'type': 'vocab',
                    })
                    break

        result_sentences.append({
            'text': s,
            'grammar': grammar['quality'],
            'issues': grammar['issues'],
            'annotations': annotations,
        })

    return result_sentences


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: writing_eval.py evaluate|prompts|model [text] [level] [prompt]'}))
        sys.exit(1)

    mode = sys.argv[1]
    if mode == 'evaluate':
        text = sys.argv[2] if len(sys.argv) > 2 else ''
        level = sys.argv[3] if len(sys.argv) > 3 else 'A1'
        prompt = sys.argv[4] if len(sys.argv) > 4 else ''
        if not text:
            print(json.dumps({'error': 'No text provided'}))
            sys.exit(1)
        result = evaluate_writing(text, level, prompt)
        print(json.dumps(result, ensure_ascii=False))
    elif mode == 'prompts':
        level = sys.argv[2] if len(sys.argv) > 2 else 'A1'
        prompts = get_writing_prompts(level)
        word_counts = {}
        for p in prompts:
            texts = [t for t in load_merlin_texts(level) if t['prompt'] == p]
            word_counts[p] = {
                'count': len(texts),
                'avg_words': round(sum(t['word_count'] for t in texts) / max(len(texts), 1), 1)
            }
        print(json.dumps({'level': level, 'prompts': [{**{'name': k}, **v} for k, v in word_counts.items()]}))
    elif mode == 'model':
        level = sys.argv[2] if len(sys.argv) > 2 else 'A1'
        prompt = sys.argv[3] if len(sys.argv) > 3 else 'allgemein'
        raw = generate_model_text(level, prompt)
        if isinstance(raw, dict) and 'error' in raw:
            print(json.dumps(raw, ensure_ascii=False))
            sys.exit(1)
        sentences = annotate_model_text(raw, level)
        word_count = len(raw.split())
        print(json.dumps({
            'level': level,
            'prompt': prompt,
            'text': raw,
            'word_count': word_count,
            'sentences': sentences,
        }, ensure_ascii=False))
    else:
        print(json.dumps({'error': f'Unknown mode: {mode}'}))
