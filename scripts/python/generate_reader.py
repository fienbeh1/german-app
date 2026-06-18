#!/usr/bin/env python3
"""
Graded Reader Generator
- Pulls 15-20 random vocabulary words from goethe_wortschatz by level
- Looks up EN translations from dictionary/vocabulario
- Sends to Mistral via Ollama to generate a short story
- Post-processes the story, wrapping vocab words in tooltip spans
- Generates comprehension questions with 4 options
- Stores everything in graded_readers + reader_questions tables
"""

import argparse, json, os, re, sys, subprocess
from psycopg2 import connect

DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"

OLLAMA_BIN = os.environ.get("OLLAMA_BIN", "ollama")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")

LEVELS = {"A1": 20, "A2": 30, "B1": 40, "B2": 50, "C1": 50, "C2": 50}
STORY_LENGTHS = {"A1": "200-300", "A2": "400", "B1": "600", "B2": "800", "C1": "1000", "C2": "1500"}
TARGET_WORDS = 20
TARGET_SPHERE_WORDS = 20


def get_db():
    return connect(DB_DSN)


def fetch_vocab(level, limit=TARGET_WORDS):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT level FROM goethe_wortschatz")
            available = [r[0] for r in cur.fetchall()]
            if level not in available:
                fallback_order = ['C2', 'C1', 'B2', 'B1', 'A2', 'A1']
                for fb in fallback_order:
                    if fb in available:
                        print(f"  Level {level} not in goethe_wortschatz (available: {available}), using {fb} instead")
                        level = fb
                        break
            cur.execute("""
                SELECT g.wort, g.artikel, g.wortart,
                    COALESCE(v.english, v2.english, d.english, '') as english
                FROM goethe_wortschatz g
                LEFT JOIN vocabulario v ON LOWER(v.palabra) = LOWER(g.wort)
                LEFT JOIN vocabulario v2 ON LOWER(v2.palabra) = LOWER(g.wort || 'n')
                LEFT JOIN dictionary d ON LOWER(d.german_word) = LOWER(g.wort)
                WHERE g.level = %s
                ORDER BY RANDOM() LIMIT %s
            """, (level, limit))
            return cur.fetchall()


def fetch_sphere_vocab(theme_name, limit=TARGET_SPHERE_WORDS):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT sw.german, sw.article, 'Substantiv' as wortart, sw.english
                FROM sphere_words sw
                JOIN themed_spheres ts ON ts.id = sw.sphere_id
                WHERE ts.theme = %s AND sw.german IS NOT NULL AND sw.english IS NOT NULL
                ORDER BY RANDOM() LIMIT %s
            """, (theme_name, limit))
            return cur.fetchall()


def ollama_generate(prompt):
    import urllib.request
    body = json.dumps({"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request("http://localhost:11434/api/generate", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read())
    return data.get("response", "").strip()


def extract_story(raw):
    raw = re.sub(r'(\w{2,})\n\1\b', r'\1', raw)
    raw = re.sub(r'(\w)\n(\w)', r'\1\2', raw)
    lines = raw.split("\n")
    story_lines = []
    in_story = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r'^(Hier ist|Titel:|Title:|Story:|Geschichte:)', stripped, re.I):
            in_story = True
            continue
        if re.match(r'^(Fragen:|Questions:|Verständnisfragen:|Comprehension:)', stripped, re.I):
            break
        if in_story:
            story_lines.append(stripped)
    if not story_lines:
        return raw
    return "\n".join(story_lines)


def extract_questions(raw, vocab_list):
    questions = []
    lines = raw.split("\n")
    in_questions = False
    q_buffer = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r'^(Fragen:|Questions:|Verständnisfragen:|Comprehension:|Quiz:)', stripped, re.I):
            in_questions = True
            continue
        if in_questions:
            q_buffer.append(stripped)
    if not q_buffer:
        q_buffer = lines[-20:] if len(lines) > 20 else lines
    current_q = None
    current_options = []
    for line in q_buffer:
        stripped = line.strip()
        if not stripped:
            continue
        q_match = re.match(r'^(?:\d+[.)]\s*)(.*?)\?', stripped)
        if q_match and len(stripped) > 15:
            if current_q and len(current_options) >= 2:
                questions.append({"question": current_q, "options": current_options[:4]})
            current_q = q_match.group(1) + "?"
            current_options = []
        else:
            opt_match = re.match(r'^[-*•]\s*(.*)', stripped)
            if opt_match:
                current_options.append(opt_match.group(1))
            elif current_q and len(stripped) > 5:
                current_options.append(stripped)
    if current_q and len(current_options) >= 2:
        questions.append({"question": current_q, "options": current_options[:4]})
    if not questions:
        questions = generate_questions_fallback(vocab_list)
    for q in questions:
        options = q["options"]
        if len(options) > 4:
            options = options[:4]
    return questions


def generate_questions_fallback(vocab_list):
    words = [v[0] for v in vocab_list[:5]]
    return [
        {"question": f"Was bedeutet das Wort '{w}' in der Geschichte?", "options": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"]}
        for w in words
    ]


def load_dict():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT LOWER(german_word), english FROM dictionary WHERE english IS NOT NULL AND english != ''
                UNION
                SELECT LOWER(palabra), COALESCE(english, traduccion, '') FROM vocabulario
                WHERE english IS NOT NULL AND english != ''
            """)
            d = {}
            for row in cur.fetchall():
                word, trans = row
                if word and trans:
                    d[word.strip()] = trans.strip()
            cur.execute("""
                SELECT LOWER(wort), NULLIF(COALESCE(v.english, d.english, ''), '')
                FROM goethe_wortschatz g
                LEFT JOIN vocabulario v ON LOWER(v.palabra) = LOWER(g.wort)
                LEFT JOIN dictionary d ON LOWER(d.german_word) = LOWER(g.wort)
            """)
            for row in cur.fetchall():
                word, trans = row
                if word and trans:
                    d[word.strip()] = trans.strip()
            return d


STOP_WORDS = set()


def build_lookup(dictionary):
    lookup = dict(dictionary)
    extra = []
    for word, trans in dictionary.items():
        w = word.strip()
        if not w or len(w) < 2:
            continue
        extra.append((w + 'n', trans))
        extra.append((w + 'en', trans))
        extra.append((w + 'e', trans))
        extra.append((w + 'er', trans))
        extra.append((w + 'es', trans))
        extra.append((w + 's', trans))
        extra.append((w + 'st', trans))
        extra.append((w + 't', trans))
        extra.append((w + 'te', trans))
        extra.append((w + 'ten', trans))
        extra.append((w + 'test', trans))
        extra.append((w + 'tet', trans))
        extra.append((w + 'nd', trans))
        extra.append((w + 'nde', trans))
        extra.append((w + 'nder', trans))
        extra.append((w + 'ndes', trans))
        if w.endswith('e'):
            extra.append((w[:-1], trans))
            extra.append((w[:-1] + 'n', trans))
            extra.append((w[:-1] + 't', trans))
        if w.endswith('en'):
            extra.append((w[:-2], trans))
            extra.append((w[:-2] + 't', trans))
            extra.append((w[:-2] + 'te', trans))
        if w.endswith('n'):
            extra.append((w[:-1], trans))
            extra.append((w[:-1] + 'e', trans))
        if w.endswith('t'):
            extra.append((w[:-1] + 'e', trans))
            extra.append((w[:-1] + 'en', trans))
    for form, trans in extra:
        if form not in lookup:
            lookup[form] = trans
    return lookup


SEP_PREFIXES = ['auf', 'aus', 'ein', 'an', 'ab', 'bei', 'mit', 'nach', 'vor',
                'zu', 'weg', 'fest', 'los', 'weiter', 'zurück', 'her', 'hin',
                'da', 'durch', 'um', 'über', 'unter', 'wider', 'entgegen',
                'gegenüber', 'zurecht', 'hervor', 'empor', 'herab', 'hinauf',
                'hinunter', 'hinein', 'heraus', 'vorbei', 'voraus']


COMMON_WORDS = {
    'ich': 'I', 'du': 'you', 'er': 'he', 'sie': 'she/they', 'es': 'it',
    'wir': 'we', 'ihr': 'you (pl)', 'man': 'one/you',
    'mich': 'me', 'mir': 'to me', 'dich': 'you', 'dir': 'to you',
    'sich': 'himself/herself/itself', 'uns': 'us', 'euch': 'you (pl)',
    'ihn': 'him', 'ihm': 'to him', 'ihnen': 'to them',
    'mein': 'my', 'dein': 'your', 'sein': 'his/its', 'ihr': 'her/their',
    'unser': 'our', 'euer': 'your (pl)', 'meine': 'my', 'deine': 'your',
    'seine': 'his', 'unsere': 'our', 'eure': 'your (pl)',
    'ist': 'is', 'sind': 'are', 'war': 'was', 'waren': 'were',
    'bin': 'am', 'bist': 'are', 'seid': 'are',
    'wird': 'becomes/will', 'werden': 'become/will', 'wurde': 'became',
    'hat': 'has', 'haben': 'have', 'hatte': 'had', 'hätte': 'would have',
    'kann': 'can', 'können': 'can (pl)', 'konnte': 'could', 'musste': 'had to',
    'muss': 'must', 'müssen': 'must (pl)',
    'soll': 'should', 'sollte': 'should (past)',
    'will': 'wants', 'wollte': 'wanted',
    'mag': 'like', 'möchte': 'would like',
    'darf': 'may', 'durfte': 'was allowed to',
    'weiß': 'know', 'wusste': 'knew',
    'und': 'and', 'oder': 'or', 'aber': 'but', 'denn': 'because/than',
    'doch': 'yet/however', 'auch': 'also', 'nicht': 'not',
    'kein': 'no/not a', 'keine': 'no (pl)',
    'der': 'the (masc)', 'die': 'the (fem/pl)', 'das': 'the (neut)',
    'den': 'the (masc acc)', 'dem': 'the (masc/neut dat)',
    'des': 'the (masc/neut gen)', 'ein': 'a/an', 'eine': 'a/an (fem)',
    'einen': 'a/an (masc acc)', 'einem': 'a/an (dat)', 'einer': 'a/an (fem dat/gen)',
    'eines': 'a/an (masc/neut gen)', 'in': 'in/into', 'an': 'at/on',
    'auf': 'on/onto', 'über': 'above/about', 'unter': 'under/among',
    'neben': 'next to', 'vor': 'before/in front of', 'hinter': 'behind',
    'zwischen': 'between', 'aus': 'from/out of', 'nach': 'after/to',
    'zu': 'to/too', 'von': 'from/of', 'bei': 'at/near/with',
    'seit': 'since/for', 'für': 'for', 'gegen': 'against',
    'durch': 'through', 'ohne': 'without', 'um': 'around/at',
    'bis': 'until/by', 'mit': 'with', 'da': 'there/because',
    'dort': 'there', 'hier': 'here', 'wo': 'where', 'wie': 'how/like',
    'was': 'what', 'wer': 'who', 'wem': 'whom (dat)', 'wen': 'whom (acc)',
    'wessen': 'whose', 'als': 'as/when/than', 'wenn': 'if/when',
    'weil': 'because', 'dass': 'that', 'ob': 'whether/if',
    'so': 'so/thus', 'sehr': 'very', 'immer': 'always', 'noch': 'still/yet',
    'schon': 'already', 'bereits': 'already', 'erst': 'first/only',
    'nur': 'only', 'ganz': 'whole/very', 'etwas': 'something/somewhat',
    'alle': 'all/everyone', 'viel': 'much', 'viele': 'many',
    'wenig': 'little', 'wenige': 'few', 'etwas': 'something',
    'nichts': 'nothing', 'jemand': 'someone', 'niemand': 'no one',
    'heute': 'today', 'gestern': 'yesterday', 'morgen': 'tomorrow',
    'jetzt': 'now', 'dann': 'then', 'davor': 'before that',
    'danach': 'after that', 'später': 'later', 'früher': 'earlier',
    'immer': 'always', 'nie': 'never', 'manchmal': 'sometimes',
    'oft': 'often', 'selten': 'rarely', 'wieder': 'again',
    'auch': 'also', 'nur': 'only', 'auch': 'also', 'halt': 'just',
    'eben': 'just/exactly', 'mal': 'once/times', 'einfach': 'simple/simply',
    'natürlich': 'naturally/of course', 'vielleicht': 'maybe',
    'bestimmt': 'certainly', 'sicher': 'sure/safely',
    'wohl': 'probably/well', 'eigentlich': 'actually',
    'zusammen': 'together', 'allein': 'alone',
    'genug': 'enough', 'ungefähr': 'approximately',
    'fast': 'almost', 'kaum': 'barely/hardly',
    'deshalb': 'therefore', 'trotzdem': 'nevertheless',
    'allerdings': 'however', 'übrigens': 'by the way',
    'nämlich': 'namely/because', 'nun': 'now/well',
    'dann': 'then', 'sonst': 'otherwise',
    'zum': 'to the', 'zur': 'to the', 'vom': 'from the',
    'beim': 'at the', 'ins': 'into the', 'ans': 'to the',
    'aufs': 'onto the', 'im': 'in the', 'am': 'at the',
    'übers': 'over the', 'unters': 'under the', 'hinters': 'behind the',
}


def stem_word(w):
    w = w.strip(".,!?;:()\"'„“»«-").lower()
    if not w or len(w) < 2:
        return None, w
    candidates = [w]
    if w.endswith('ge') and len(w) > 5:
        candidates.append(w[:-2])
        candidates.append(w[:-2] + 'en')
    if w.endswith('es') and len(w) > 4:
        candidates.append(w[:-2])
    if w.endswith('er') and len(w) > 4:
        candidates.append(w[:-2])
    if w.endswith('en') and len(w) > 4:
        candidates.append(w[:-2])
        candidates.append(w[:-2] + 'e')
        candidates.append(w[:-2] + 't')
    if w.endswith('e') and len(w) > 3:
        candidates.append(w[:-1])
        candidates.append(w[:-1] + 'en')
    if w.endswith('st') and len(w) > 4:
        candidates.append(w[:-2])
        candidates.append(w[:-2] + 'en')
    if w.endswith('t') and len(w) > 4:
        candidates.append(w[:-1])
        candidates.append(w[:-1] + 'en')
        candidates.append(w[:-1] + 'e')
    if w.endswith('n') and len(w) > 4:
        candidates.append(w[:-1])
    if w.endswith('s') and len(w) > 4 and not w.endswith('ss'):
        candidates.append(w[:-1])
    if w.endswith('nd') and len(w) > 4:
        candidates.append(w[:-2])
    return candidates, w


def lookup_word(w, lookup):
    w_clean = w.strip(".,!?;:()\"'„“»«-").lower()
    if not w_clean or len(w_clean) < 2:
        return None
    if w_clean in COMMON_WORDS:
        return COMMON_WORDS[w_clean]
    if w_clean in lookup:
        return lookup[w_clean]
    candidates, _ = stem_word(w)
    for c in candidates:
        if c in lookup:
            return lookup[c]
    for prefix in SEP_PREFIXES:
        if w_clean.startswith(prefix) and len(w_clean) > len(prefix) + 2:
            rest = w_clean[len(prefix):]
            if rest in lookup:
                return lookup[rest]
            cr, _ = stem_word(rest)
            for c in cr:
                if c in lookup:
                    return lookup[c]
    return None


COVERAGE_TARGETS = {'A1': 80, 'A2': 70, 'B1': 60, 'B2': 50, 'C1': 25, 'C2': 10}

def markup_story(text, dictionary, level='A1'):
    target = COVERAGE_TARGETS.get(level, 50)
    lookup = build_lookup(dictionary)
    html = ""
    paragraphs = re.split(r'\n\s*\n', text.strip())
    total_words = 0
    marked_words = 0
    for p_text in paragraphs:
        p_text = p_text.strip()
        if not p_text:
            continue
        tokens = re.findall(r'[\w]+|[^\w]', p_text)
        result = []
        for tok in tokens:
            if re.match(r'^\w+$', tok):
                total_words += 1
                trans = lookup_word(tok, lookup)
                if trans:
                    marked_words += 1
                    result.append(f'<span class="reader-vocab" data-tooltip="{trans}">{tok}</span>')
                else:
                    result.append(tok)
            else:
                result.append(tok)
        html += f"<p>{''.join(result)}</p>\n"
    pct = 100 * marked_words // total_words if total_words else 0
    status = "OK" if pct >= target else f"LOW ({pct}% vs target {target}%)"
    print(f"  Marked {marked_words}/{total_words} words ({pct}%) — target {target}% [{status}]")
    return html.strip()


def store_reader(title, level, html_content, vocab_count, source=None):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO graded_readers (title, level, content, word_count, vocabulary_count, source)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (title, level, html_content, len(html_content.split()), vocab_count, source or ''))
            conn.commit()
            return cur.fetchone()[0]


def store_questions(reader_id, questions):
    with get_db() as conn:
        with conn.cursor() as cur:
            for i, q in enumerate(questions):
                opts = q["options"]
                correct = 0
                cur.execute("""
                    INSERT INTO reader_questions (reader_id, question, options, correct, order_num)
                    VALUES (%s, %s, %s, %s, %s)
                """, (reader_id, q["question"], opts, correct, i))
            conn.commit()


def generate(title, level, sphere=None):
    vocab = fetch_vocab(level, TARGET_WORDS)
    if not vocab:
        print(f"ERROR: No vocabulary found for level {level}")
        return

    sphere_vocab = []
    sphere_name = sphere
    if sphere:
        sphere_vocab = fetch_sphere_vocab(sphere)
        print(f"  Sphere '{sphere}': {len(sphere_vocab)} words")
        if not sphere_vocab:
            print(f"  WARNING: No sphere words found for '{sphere}', continuing without")
            sphere_name = None

    all_words = list(vocab) + sphere_vocab
    word_list = "\n".join(f"- {v[0]}" for v in all_words)
    sphere_section = ""
    if sphere_vocab:
        sphere_section = f"\nThema: {sphere_name}\nVerwende auch Wörter aus diesem Themenbereich."

    wc = STORY_LENGTHS.get(level, "300")
    story_prompt = f"""Erzähle eine kurze Geschichte auf Deutsch (Niveau {level}, ca. {wc} Wörter).

Verwende diese {len(all_words)} Wörter in der Geschichte:
{word_list}{sphere_section}

Wichtige Regeln:
- Die Geschichte muss ALLE diese Wörter enthalten
- Verwende natürliches, einfaches Deutsch
- Die Geschichte soll einen klaren Anfang, Mittelteil und Ende haben
- Keine Einleitung, keine Fragen, NUR die Geschichte

Schreibe NUR die Geschichte:"""

    print(f"Generating story for {level} ({len(vocab)} goethe + {len(sphere_vocab)} sphere = {len(all_words)} words)...")
    story_raw = ollama_generate(story_prompt)
    story_text = extract_story(story_raw)
    # 1. Self-correction: prefix + newline + full word -> full word
    story_text = re.sub(r'(\w{2,})\n\1(\w+)', r'\1\2', story_text)
    # 2. Exact duplicates across newline: "Mit\nMit" -> "Mit"
    story_text = re.sub(r'(\w{3,})\n\1\b', r'\1', story_text)
    # 3. Conservative letter-join (only single-letter fragments)
    story_text = re.sub(r'(\w)\n(\w)', r'\1\2', story_text)
    # 4. Duplicate word with space
    story_text = re.sub(r'\b(\w+)\s+\1\b', r'\1', story_text)
    print(f"Story generated ({len(story_text.split())} words)")

    print(f"Loading dictionary ({len(all_words)} seed words)...")
    dictionary = load_dict()
    print(f"  Dictionary has {len(dictionary)} entries")

    html = markup_story(story_text, dictionary, level)

    q_prompt = f"""Erstelle 3-4 Verständnisfragen auf Deutsch zu folgender Geschichte.
Jede Frage soll 4 Antwortmöglichkeiten haben (nur eine richtig).

Format (genau so):
1. Frage?
- Option A
- Option B
- Option C
- Option D

Geschichte:
{story_text[:1000]}

NUR die Fragen im angegebenen Format, keine Einleitung."""

    print("Generating comprehension questions...")
    q_raw = ollama_generate(q_prompt)
    questions = extract_questions(q_raw, vocab)
    print(f"Generated {len(questions)} questions")

    source_info = f"goethe_{level}"
    if sphere_name:
        source_info += f"+sphere:{sphere_name}"

    reader_id = store_reader(title, level, html, len(all_words), source=source_info)
    store_questions(reader_id, questions)
    print(f"Stored reader #{reader_id} ({title}) with {len(questions)} questions")

    print(f"\n--- Story Preview (first 300 chars) ---")
    print(story_text[:300] + "...")
    print(f"\n--- Questions ({len(questions)}) ---")
    for q in questions:
        print(f"  {q['question']}")
        for o in q["options"]:
            print(f"    - {o}")

    return reader_id


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a graded reader story")
    parser.add_argument("--title", default=None, help="Story title")
    parser.add_argument("--level", default="A1", choices=["A1", "A2", "B1", "B2", "C1", "C2"], help="CEFR level")
    parser.add_argument("--words", type=int, default=15, help="Number of goethe vocabulary words")
    parser.add_argument("--sphere", default=None, help="Visual dictionary theme name (e.g. 'Das Haus • Home')")
    args = parser.parse_args()

    TARGET_WORDS = args.words
    title = args.title or f"{args.level} Geschichte #{os.urandom(2).hex()}"

    generate(title, args.level, sphere=args.sphere)
