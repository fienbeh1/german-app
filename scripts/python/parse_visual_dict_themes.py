#!/usr/bin/env python3
"""
Parse visual dictionary text files to extract themed spheres.
Handles the split-line format:
  'die Krankheit • illness'
  'die'
  'Kopfschmerzen'
  'headache'
"""

import os, re, sys
from psycopg2 import connect

DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"
VISUAL_DIRS = [
    "/mnt/storage/deutsch-app/de/goethe/German-English_Bilingual_Visual_Dictionary/txt",
    "/mnt/storage/deutsch-app/de/goethe/German_English_Visual_Bilingual_Dictionary/txt",
]


def get_db():
    return connect(DB_DSN)


def parse_theme_page(text):
    lines = text.split("\n")
    theme = None
    pairs = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        # Theme heading: ALL CAPS • ALL CAPS (or ALL CAPS • word)
        if re.match(r'^[A-Z][A-Z ./,-]+[•][A-Z ]', stripped):
            theme = stripped.strip()
            continue

        # Skip non-content lines
        if re.match(r'^[\d/]+$', stripped) or stripped in ('US', 'Page', 'AM', 'PM', ''):
            continue
        if stripped.startswith('(') or re.match(r'^[A-Z][a-z]+ \d+/\d+/\d+', stripped):
            continue
        if re.match(r'^(TEXT|DK|DTP|NASA|PIN|ISBN|EC-|GPS|DTV|CEO|ENT|IUD|MDF)', stripped):
            continue
        if re.match(r'^A\.T\.|^Penguin|^Dorling|^DORLING', stripped):
            continue

        # Line with • separator: complete pair
        if '•' in stripped:
            parts = stripped.split('•', 1)
            german = parts[0].strip().rstrip(',').strip()
            english = parts[1].strip().rstrip(',').strip()
            if german and english and not re.match(r'^[A-Z\s]+$', german):
                pairs.append((german, english))
        else:
            # Might be continuation — try to pair with next line
            stripped2 = stripped.rstrip(',').strip()
            if stripped2 and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                # Check if this looks like a German article + noun split
                if stripped2.lower() in ('der', 'die', 'das', 'ein', 'eine', 'einen', 'dem', 'den', 'des'):
                    # article on this line, noun on next
                    german_full = f"{stripped2} {next_line}"
                    # Check if line after that is English
                    if i + 2 < len(lines):
                        eng = lines[i + 2].strip().rstrip(',').strip()
                        if eng and not re.match(r'^[a-zäöüß•]', eng) or (eng and '•' not in eng and len(eng) < 60 and not eng.startswith('(')):
                            pairs.append((german_full, eng))
                elif stripped2 and not re.match(r'^[A-Z\s]+$', stripped2):
                    # Could be a German word whose article is on prev line
                    # or could be English translation of prev German
                    pass

    return theme, pairs


def extract_all():
    all_themes = {}
    for vd in VISUAL_DIRS:
        if not os.path.isdir(vd):
            continue
        book = os.path.basename(os.path.dirname(vd))
        for f in sorted(os.listdir(vd)):
            if not f.endswith('.txt'):
                continue
            text = open(os.path.join(vd, f)).read()
            theme, pairs = parse_theme_page(text)
            if theme and pairs:
                key = (theme, book)
                if key not in all_themes:
                    all_themes[key] = []
                all_themes[key].extend(pairs)
    return all_themes


def store_themes(all_themes):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            for (theme, book), pairs in sorted(all_themes.items()):
                cur.execute(
                    "INSERT INTO themed_spheres (theme, source) VALUES (%s, %s) RETURNING id",
                    (theme, book)
                )
                sphere_id = cur.fetchone()[0]
                for german, english in pairs:
                    article = ''
                    wtype = ''
                    m = re.match(r'^(der|die|das|ein|eine|einen|dem|den|des)\s+(.+)', german, re.I)
                    if m:
                        article = m.group(1)
                        german_word = m.group(2)
                    else:
                        german_word = german
                    cur.execute(
                        "INSERT INTO sphere_words (sphere_id, german, english, article, word_type) VALUES (%s, %s, %s, %s, %s)",
                        (sphere_id, german_word.strip(), english.strip(), article.strip(), wtype)
                    )
                print(f"  Stored {len(pairs)} pairs: {theme}")
            conn.commit()
        print(f"\nTotal: {len(all_themes)} themes stored")
    finally:
        conn.close()


if __name__ == "__main__":
    print("Extracting themes from visual dictionaries...")
    themes = extract_all()
    print(f"Found {len(themes)} themes")
    store_themes(themes)
