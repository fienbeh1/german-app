#!/usr/bin/env python3
"""Generate ONE German grammar exercise via Mistral and insert into DB.
Can be called from command line or imported by launcher."""
import subprocess, json, re, sys, time, os, traceback

COURSES = [
    (1,  "Lagune 1",          "A1"),
    (2,  "Lagune 2",          "A2"),
    (3,  "Lagune 3",          "B1"),
    (4,  "Tangram Aktuell 1", "A1"),
    (5,  "Tangram Aktuell 2", "A2"),
    (6,  "Tangram Aktuell 3", "B1"),
    (7,  "Menschen A1",       "A1"),
    (8,  "Menschen A2",       "A2"),
    (9,  "EM B2",             "B2"),
    (10, "C1",                "C1"),
]

TOPICS = {
    1: "articles der/die/das, present tense conjugation, sein/haben, plural, word order, accusative, modal verbs können/müssen, prepositions in/auf",
    2: "Präteritum, Perfekt with haben/sein, separable prefixes, dative, temporal prepositions, adjective declension, comparative, Konjunktiv II würde",
    3: "passive voice, relative clauses, Konjunktiv II past, indirect questions, n-declension, genitive, two-way prepositions, infinitive um/zu",
    4: "articles, present tense, personal pronouns, accusative, modal verbs, plural, imperative, possessive articles",
    5: "Perfekt, Präteritum, dative, adjective declension, comparative, prepositions, reflexive verbs, subordinate clauses",
    6: "passive, relative clauses, Konjunktiv II, infinitive clauses, indirect speech, genitive, conditional sentences",
    7: "present tense, articles, sein/haben, modal verbs, imperative, plural, word order, prepositions",
    8: "Perfekt, Präteritum, dative, adjective endings, comparative, prepositions, reflexive, weil/dass clauses",
    9: "Konjunktiv I, indirect speech, passive alternatives, Nomen-Verb-Verbindungen, extended attributes, academic German",
    10: "nominalization, participial constructions, advanced passive, subjunctive nuances, stylistic devices, complex conjunctions",
}

TYPES = ["articles", "conjugation", "prepositions", "word-order", "declension",
         "passive", "relative-clauses", "subjunctive", "sentence-completion", "modal-verbs"]

def clean_ansi(text):
    text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)
    text = re.sub(r'\x1b\][0-9;]*[^\x1b]*\x1b\\', '', text)
    return text

def extract_json(text):
    text = clean_ansi(text)
    text = re.sub(r'```(?:json)?', '', text).strip()
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        return text[start:end+1]
    return None

def call_mistral(prompt, timeout=60):
    print(f"DEBUG call_mistral: Sending prompt to Mistral ({len(prompt)} chars)")
    print(f"DEBUG call_mistral: Prompt preview: {prompt[:300]}...")
    sys.stdout.flush()
    result = subprocess.run(['ollama', 'run', 'mistral'],
        input=prompt.encode(), capture_output=True, timeout=timeout)
    raw = result.stdout.decode('utf-8', errors='replace')
    print(f"DEBUG call_mistral: Raw response received ({len(raw)} chars)")
    print(f"DEBUG call_mistral: Response preview: {raw[:300]}...")
    sys.stdout.flush()
    return raw

def generate_one(cid, name, level, n):
    tipo = TYPES[n % len(TYPES)]
    print(f"DEBUG generate_one: Generating exercise {n} for course '{name}' (level={level}, type={tipo})")
    sys.stdout.flush()
    prompt = f"""Generate ONE German grammar exercise for level {level} ({name}).
Topic: {TOPICS[cid]}
Type: {tipo}

Output ONLY a JSON object with these keys:
  numero: {n}
  tipo: "{tipo}"
  titulo: short German title (max 60 chars)
  texto: the exercise in German — use ___ for blanks, [options] in brackets
  instrucciones: German instructions (max 100 chars)

No markdown, no extra text. Just the JSON object."""

    raw = call_mistral(prompt)
    print(f"DEBUG generate_one: Attempting to extract JSON from response")
    sys.stdout.flush()
    js = extract_json(raw)
    if not js:
        print(f"DEBUG generate_one: FAILED to extract JSON. Full raw response:")
        print(raw)
        sys.stdout.flush()
        return None
    try:
        parsed = json.loads(js, strict=False)
        print(f"DEBUG generate_one: Successfully parsed exercise: titulo={parsed.get('titulo','?')}")
        sys.stdout.flush()
        return parsed
    except json.JSONDecodeError as e:
        print(f"    JSON error: {e}")
        print(f"    Raw: {js[:200]}")
        print(f"DEBUG generate_one: JSONDecodeError traceback:")
        traceback.print_exc()
        sys.stdout.flush()
        return None

def generate_for_course(cid, name, level, count=6, progress_cb=None):
    """Generate N exercises for a course. Returns list of dicts."""
    results = []
    for n in range(1, count + 1):
        if progress_cb:
            progress_cb(f"Exercise {n}/{count}...")
        ex = generate_one(cid, name, level, n)
        if ex:
            results.append(ex)
            if progress_cb:
                progress_cb(f"  OK: {ex.get('titulo', '?')}")
        else:
            if progress_cb:
                progress_cb(f"  Failed, retrying...")
            time.sleep(2)
            ex = generate_one(cid, name, level, n)
            if ex:
                results.append(ex)
                if progress_cb:
                    progress_cb(f"  OK (retry): {ex.get('titulo', '?')}")
            elif progress_cb:
                progress_cb(f"  SKIP")
        time.sleep(1)
    return results

def insert_exercises(cur, conn, cid, exercises):
    count = 0
    print(f"DEBUG insert_exercises: Inserting {len(exercises)} exercises into 'ejercicios' table for curso_id={cid}")
    sys.stdout.flush()
    for ex in exercises:
        try:
            values = (
                cid,
                int(ex.get('numero', count + 1)),
                str(ex.get('tipo', 'grammar'))[:50],
                str(ex.get('titulo', ''))[:200],
                str(ex.get('texto', '')),
                str(ex.get('instrucciones', ''))[:100]
            )
            print(f"DEBUG insert_exercises: Inserting row: curso_id={values[0]}, numero={values[1]}, tipo={values[2]}, titulo={values[3][:60]}")
            sys.stdout.flush()
            cur.execute("""
                INSERT INTO ejercicios (curso_id, numero, tipo, titulo, texto, instrucciones)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, values)
            count += 1
        except Exception as e:
            print(f"    DB error: {e}")
            print(f"DEBUG insert_exercises: Full exception:")
            traceback.print_exc()
            sys.stdout.flush()
    conn.commit()
    print(f"DEBUG insert_exercises: Committed {count} rows to DB table 'ejercicios'")
    sys.stdout.flush()
    return count

# CLI entry point
if __name__ == '__main__':
    import psycopg2
    conn = psycopg2.connect(dbname='deutsch', user='f')
    cur = conn.cursor()
    total = 0

    # Parse args: can specify course_id, course_name, or "all"
    args = sys.argv[1:]
    if args:
        arg = ' '.join(args).strip().lower()
        if arg == 'all':
            courses = COURSES
        else:
            try:
                target_id = int(arg)
                courses = [c for c in COURSES if c[0] == target_id]
            except ValueError:
                courses = [c for c in COURSES if arg in c[1].lower() or c[1].lower().startswith(arg)]
    else:
        courses = COURSES

    for cid, name, level in courses:
        print(f"\n--- {name} ({level}) ---")
        exs = generate_for_course(cid, name, level, 6)
        n = insert_exercises(cur, conn, cid, exs)
        print(f"  Inserted: {n}")
        total += n

    print(f"\nTotal: {total} exercises")
    cur.execute("SELECT c.nivel, c.nombre, COUNT(e.id) FROM ejercicios e JOIN cursos c ON c.id=e.curso_id GROUP BY c.nivel,c.nombre ORDER BY c.nivel,c.nombre")
    for r in cur.fetchall():
        print(f"  [{r[0]}] {r[1]}: {r[2]}")
    cur.close()
    conn.close()
