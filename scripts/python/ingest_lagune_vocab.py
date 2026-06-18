#!/usr/bin/env python3
"""Ingest vokabular from Lagune 2/3 annotation batch JSONs into vocabulario."""

import json
import os
import sys
import glob
import argparse

BASE = '/home/f/deutsch-app/de'
DB_DSN = "host='/var/run/postgresql' user='f' dbname='deutsch'"

BOOKS = {
    'Lagune 2': {
        'batch_pattern': 'Lagune_2/**/merged/annotations/batch_*.json',
        'curso_id': 2,
    },
    'Lagune 3': {
        'batch_pattern': 'Lagune_3/**/merged/annotations/batch_*.json',
        'curso_id': 3,
    },
}


def parse_batch_file(filepath):
    """Parse a multi-object JSON batch file using brace counting."""
    with open(filepath) as f:
        raw = f.read()
    lines = raw.strip().split('\n')
    combined = ''
    depth = 0
    objects = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        for ch in line:
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
        combined += line
        if depth == 0 and combined:
            try:
                objects.append(json.loads(combined))
            except json.JSONDecodeError:
                pass
            combined = ''
    return objects


def extract_vokabular(parsed_objects):
    """Extract vokabular entries from parsed batch objects, enriched with metadata."""
    entries = []
    for obj in parsed_objects:
        struktur = obj.get('struktur')
        seite = ''
        lektion = ''
        if isinstance(struktur, dict):
            seite = str(struktur.get('seite', '')) if struktur.get('seite') else ''
            lektion = str(struktur.get('lektion', '')) if struktur.get('lektion') else ''
        elif isinstance(struktur, str):
            seite = struktur
        vokabular = obj.get('vokabular', [])
        for v in vokabular:
            wort = (v.get('wort') or '').strip()
            if not wort:
                continue
            entries.append({
                'palabra': wort,
                'artikel': (v.get('artikel') or '').strip(),
                'plural': (v.get('plural') or '').strip(),
                'traduccion': (v.get('übersetzung_es') or v.get('ubersetzung_es') or '').strip(),
                'wortart': (v.get('wortart') or '').strip(),
                'kontext': (v.get('kontext') or '').strip(),
                'english': (v.get('english') or '').strip(),
                'french': (v.get('french') or '').strip(),
                'seite': seite,
                'lektion': lektion,
            })
    return entries


def find_batch_files(pattern):
    matches = glob.glob(os.path.join(BASE, pattern), recursive=True)
    return sorted(matches)


def load_existing_palabras(cur, curso_id):
    cur.execute("SELECT palabra FROM vocabulario WHERE curso_id = %s", (curso_id,))
    return {row[0].lower() for row in cur.fetchall()}


def run(args):
    book = BOOKS[args.book]
    batch_files = find_batch_files(book['batch_pattern'])
    if not batch_files:
        print(f"No batch files found for {args.book}")
        return

    all_entries = []
    source_map = {}
    for fpath in batch_files:
        parsed = parse_batch_file(fpath)
        entries = extract_vokabular(parsed)
        for e in entries:
            e['source_file'] = os.path.basename(fpath)
        all_entries.extend(entries)
        source_map[os.path.basename(fpath)] = len(entries)

    print(f"\n{'='*60}")
    print(f"  {args.book} (curso_id={book['curso_id']})")
    print(f"  Batch files: {len(batch_files)}")
    print(f"  Total vokabular entries: {len(all_entries)}")
    print(f"{'='*60}")

    for fname, cnt in sorted(source_map.items()):
        if cnt > 0:
            print(f"  {fname}: {cnt}")

    if args.dry_run:
        print(f"\n  DRY RUN — no rows inserted")
        if all_entries:
            print(f"\n  Sample entries:")
            for e in all_entries[:5]:
                print(f"    palabra={e['palabra']!r} artikel={e['artikel']!r} "
                      f"traduccion={e['traduccion']!r} wortart={e['wortart']!r}")
        return

    # Insert into DB
    import psycopg2
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    existing = load_existing_palabras(cur, book['curso_id'])
    print(f"\n  Existing in DB for this curso_id: {len(existing)}")

    inserted = 0
    skipped_existing = 0
    skipped_empty = 0

    for e in all_entries:
        if e['palabra'].lower() in existing:
            skipped_existing += 1
            continue
        try:
            cur.execute(
                """INSERT INTO vocabulario
                   (palabra, artikel, plural, traduccion, wortart, kontext, english, french,
                    seite, lektion, source_file, curso_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (e['palabra'], e['artikel'], e['plural'], e['traduccion'],
                 e['wortart'], e['kontext'], e['english'], e['french'],
                 e['seite'], e['lektion'], e['source_file'], book['curso_id'])
            )
            if cur.rowcount > 0:
                inserted += 1
                existing.add(e['palabra'].lower())
            else:
                skipped_existing += 1
        except Exception as ex:
            print(f"  Error inserting {e['palabra']}: {ex}")
            skipped_empty += 1

    conn.commit()
    cur.close()
    conn.close()

    print(f"  Inserted: {inserted}")
    print(f"  Skipped (already exists): {skipped_existing}")
    print(f"  Errors: {skipped_empty}")
    print(f"  Total now in DB for this curso_id: {len(existing)}")


def main():
    parser = argparse.ArgumentParser(description='Ingest Lagune vocabulary from annotation batch JSONs')
    parser.add_argument('book', choices=list(BOOKS.keys()), help='Which book to ingest')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be inserted without inserting')
    args = parser.parse_args()
    run(args)


if __name__ == '__main__':
    main()
