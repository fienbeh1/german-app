#!/home/f/deutsch-app/venv/bin/python3
"""Parse Delfin Lehrbuch Wortliste (pages 234-259) and ingest into vocabulario.
Then fill missing EN/FR/PT translations using Helsinki-NLP/opus-mt models."""

import re
import os
import sys
import psycopg2
from transformers import MarianTokenizer, MarianMTModel
import torch

DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"
DELFIN_TXT_DIR = "/home/f/deutsch-app/de/delfin/txt"

# Article mapping
ART_MAP = {"r": "der", "e": "die", "s": "das"}

# Translation models
MODEL_CACHE = {}

def get_translator(src_lang, tgt_lang):
    key = f"{src_lang}-{tgt_lang}"
    if key not in MODEL_CACHE:
        model_name = f"Helsinki-NLP/opus-mt-{src_lang}-{tgt_lang}"
        print(f"  Loading {model_name}...", file=sys.stderr)
        sys.stderr.flush()
        tok = MarianTokenizer.from_pretrained(model_name)
        model = MarianMTModel.from_pretrained(model_name)
        MODEL_CACHE[key] = (tok, model)
    return MODEL_CACHE[key]

def translate(text, src_lang, tgt_lang):
    if not text or not text.strip():
        return ""
    tok, model = get_translator(src_lang, tgt_lang)
    inputs = tok(text, return_tensors="pt", truncation=True, max_length=128)
    with torch.no_grad():
        outputs = model.generate(**inputs, max_length=128)
    return tok.decode(outputs[0], skip_special_tokens=True)

def parse_plural(plural_str):
    if not plural_str or plural_str == "pl":
        return plural_str if plural_str == "pl" else None
    if plural_str.startswith("="):
        return plural_str
    if plural_str.startswith("-"):
        return plural_str
    return plural_str

def determine_wortart(entry_line, has_article):
    if has_article:
        return "Nomen"
    if "," in entry_line:
        parts = entry_line.split(",")
        if len(parts) >= 3 and any(v in entry_line for v in ["hat ", "ist ", "hat ", "sein ", "haben "]):
            return "Verb"
    # Check if it looks like a verb based on common patterns
    if re.search(r'\b(hat|ist|sein|haben)\b', entry_line):
        return "Verb"
    return "Anderes"

def parse_word_list():
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    # Get existing words from Delfin source files
    cur.execute("SELECT palabra, artikel, plural, wortart, source_file, seite FROM vocabulario WHERE source_file LIKE '%Delfin_Lehrbuch%'")
    existing = set()
    existing_detail = {}
    for row in cur.fetchall():
        key = (row[0], row[4], str(row[5]) if row[5] else "")
        existing.add(key)
        existing_detail[key] = {"artikel": row[1], "plural": row[2], "wortart": row[3]}

    print(f"Found {len(existing)} existing Delfin vocab entries", file=sys.stderr)

    entries = []
    seen_lines = set()

    for page in range(234, 260):
        fpath = os.path.join(DELFIN_TXT_DIR, f"Delfin_Lehrbuch-{page:03d}.txt")
        if not os.path.exists(fpath):
            continue
        with open(fpath, "r") as f:
            lines = f.readlines()

        start = 0
        if page == 234:
            for i, line in enumerate(lines):
                if line.strip() == "ab 32, 56, 70" or line.strip().startswith("ab "):
                    start = i
                    break

        source = f"Delfin_Lehrbuch-{page:03d}.txt"
        seite = str(page)

        for line in lines[start:]:
            line = line.strip()
            if not line or line == "Wortliste":
                continue
            if line in seen_lines:
                continue
            seen_lines.add(line)

            # Skip header comments and continuation markers
            if line.startswith("Alphabetische") or line.startswith("Die alphabetische"):
                continue

            # Determine if it has article prefix
            has_article = False
            article = None
            plural = None
            word = line

            m = re.match(r'^([res]) (\S[^,]*?)(?:, (.+?))?(?: \d[\d, ]*)?$', line)
            if m and m.group(1) in ART_MAP:
                has_article = True
                article = ART_MAP[m.group(1)]
                word = m.group(2).strip()
                rest = m.group(3).strip() if m.group(3) else ""

                # Parse plural from rest
                if rest:
                    plur_m = re.match(r'^([-=][a-zäöüß]+|pl|-[a-z]*|=e\d*)', rest)
                    if plur_m:
                        plural = plur_m.group(1)
                        word = word.rstrip(",")
                    else:
                        word = word.rstrip(",")

            wortart = determine_wortart(line, has_article)
            key = (word, source, seite)
            if key not in existing:
                entries.append((word, article, plural, wortart, source, seite, line))
                existing.add(key)

    print(f"New Delfin entries to add: {len(entries)}", file=sys.stderr)
    return conn, entries

def main():
    conn, entries = parse_word_list()
    if not entries:
        print("No new entries to add!", file=sys.stderr)
        conn.close()
        return

    cur = conn.cursor()

    # Load translation models (DE→PT model doesn't exist on HF, skip)
    print("Loading Helsinki DE→EN model...", file=sys.stderr); sys.stderr.flush()
    get_translator("de", "en")
    print("Loading Helsinki DE→FR model...", file=sys.stderr); sys.stderr.flush()
    get_translator("de", "fr")
    print("Loading Helsinki DE→ES model...", file=sys.stderr); sys.stderr.flush()
    get_translator("de", "es")

    total = len(entries)
    for i, (word, article, plural, wortart, source, seite, raw_line) in enumerate(entries, 1):
        if (i % 20) == 0:
            print(f"[{i}/{total}] Processing...", file=sys.stderr)
            sys.stderr.flush()

        # Translate to EN, FR, ES using Helsinki
        en = translate(word, "de", "en") if wortart != "Verb" else ""
        fr = translate(word, "de", "fr") if wortart != "Verb" else ""
        es = translate(word, "de", "es") if wortart != "Verb" else ""

        # For verbs, try translating without hyphen
        if not en and wortart == "Verb":
            en = translate(word.replace("-", ""), "de", "en")
        if not fr and wortart == "Verb":
            fr = translate(word.replace("-", ""), "de", "fr")
        if not es and wortart == "Verb":
            es = translate(word.replace("-", ""), "de", "es")

        # No DE→PT model on HF, leave portuguese null for now
        pt = None

        cur.execute(
            """INSERT INTO vocabulario
               (palabra, artikel, plural, wortart, english, french, traduccion, portuguese,
                source_file, seite, kontext)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (word, article, plural, wortart, en, fr, es, pt, source, seite, raw_line)
        )

    conn.commit()
    print(f"Inserted {len(entries)} new Delfin vocabulary entries", file=sys.stderr)
    sys.stderr.flush()

    # Now fill missing translations for ALL vocabulario entries
    print("\nFilling missing translations for all vocabulario...", file=sys.stderr)
    sys.stderr.flush()

    # Get entries missing EN, FR, or ES translations (skip PT — no DE→PT model)
    cur.execute("""
        SELECT id, palabra, english, french, traduccion
        FROM vocabulario
        WHERE english IS NULL OR french IS NULL OR traduccion IS NULL
        ORDER BY id
    """)
    missing = cur.fetchall()
    print(f"Entries with missing translations: {len(missing)}", file=sys.stderr)
    sys.stderr.flush()

    batch_size = 50
    for i in range(0, len(missing), batch_size):
        batch = missing[i:i+batch_size]
        if (i % 200) == 0:
            print(f"  Translating batch {i}/{len(missing)}...", file=sys.stderr)
            sys.stderr.flush()

        for row in batch:
            vid, palabra, en, fr, es = row
            needs_en = en is None
            needs_fr = fr is None
            needs_es = es is None

            if not any([needs_en, needs_fr, needs_es]):
                continue

            updates = []
            params = []

            if needs_en:
                try:
                    en_t = translate(palabra, "de", "en")
                    updates.append("english = %s")
                    params.append(en_t)
                except Exception as e:
                    print(f"  EN fail for '{palabra}': {e}", file=sys.stderr)
            if needs_fr:
                try:
                    fr_t = translate(palabra, "de", "fr")
                    updates.append("french = %s")
                    params.append(fr_t)
                except Exception as e:
                    print(f"  FR fail for '{palabra}': {e}", file=sys.stderr)
            if needs_es:
                try:
                    es_t = translate(palabra, "de", "es")
                    updates.append("traduccion = %s")
                    params.append(es_t)
                except Exception as e:
                    print(f"  ES fail for '{palabra}': {e}", file=sys.stderr)

            if updates:
                params.append(vid)
                cur.execute(
                    f"UPDATE vocabulario SET {', '.join(updates)} WHERE id = %s",
                    params
                )

        conn.commit()

    conn.close()
    print(f"\nDone! Total processed: {len(entries)} new Delfin entries + {len(missing)} translation fills", file=sys.stderr)

if __name__ == "__main__":
    main()
