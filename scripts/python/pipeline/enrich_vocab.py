"""Enrich vocabulario table: translate missing english/french, lookup articles, tag POS."""
import csv, time, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2

WORKDIR = '/home/f/deutsch-app/de/vokabeln'
DB = dict(host='/var/run/postgresql', user='f', database='deutsch')
BATCH = 500

conn = psycopg2.connect(**DB)
cur = conn.cursor()

# --- Step 1: Export missing translations ---
cur.execute("SELECT id, palabra FROM vocabulario WHERE (english IS NULL OR english = '') AND (french IS NULL OR french = '')")
rows = cur.fetchall()
print(f"Step 1: {len(rows)} rows missing english/french")

with open(f'{WORKDIR}/missing_translations.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['id', 'palabra'])
    w.writerows(rows)

# --- already translated? resume check ---
done_file = f'{WORKDIR}/translations_done.csv'
already_done = set()
if os.path.exists(done_file):
    with open(done_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            already_done.add(int(r['id']))
    print(f"  resuming: {len(already_done)} already translated")

remaining = [(rid, w) for rid, w in rows if rid not in already_done]
print(f"  remaining: {len(remaining)}")

# translate in parallel
from deep_translator import GoogleTranslator

def translate_one(pair):
    rid, word = pair
    try:
        en = GoogleTranslator(source='de', target='en').translate(word)
        fr = GoogleTranslator(source='de', target='fr').translate(word)
        return (rid, en, fr)
    except:
        return (rid, '', '')

results = []
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = {pool.submit(translate_one, p): p for p in remaining}
    for i, f in enumerate(as_completed(futures)):
        rid, en, fr = f.result()
        results.append((en, fr, rid))
        if (i+1) % 100 == 0:
            print(f"  progress: {i+1}/{len(remaining)}", flush=True)
            # incremental save
            with open(done_file, 'a', newline='', encoding='utf-8') as f:
                w = csv.writer(f)
                if i+1 == 100:
                    w.writerow(['english', 'french', 'id'])
                for r in results[-100:]:
                    w.writerow(r)

# write all remaining
with open(done_file, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['english', 'french', 'id'])
    w.writerows(results)

# batch update DB
for i in range(0, len(results), BATCH):
    batch = results[i:i+BATCH]
    cur.executemany("UPDATE vocabulario SET english = %s, french = %s WHERE id = %s", batch)
    conn.commit()
print(f"Step 2/3: {len(results)} translations written to DB")

# --- Step 4: Noun articles via german-nouns ---
try:
    from german_nouns.lookup import Nouns
    gn = Nouns()
    cur.execute("SELECT id, palabra FROM vocabulario WHERE wortart = 'Substantiv' AND (artikel IS NULL OR artikel = '')")
    nouns = cur.fetchall()
    print(f"Step 4: {len(nouns)} nouns missing articles")
    updates = []
    for i, (rid, word) in enumerate(nouns):
        try:
            res = gn[word]
            if res and len(res) > 0:
                artikel = res[0].get('der', '')
                if artikel:
                    updates.append((artikel, rid))
        except:
            pass
        if len(updates) >= BATCH:
            cur.executemany("UPDATE vocabulario SET artikel = %s WHERE id = %s", updates)
            conn.commit()
            updates = []
    if updates:
        cur.executemany("UPDATE vocabulario SET artikel = %s WHERE id = %s", updates)
        conn.commit()
    print(f"  updated articles")
except Exception as e:
    print(f"  german-nouns step failed: {e}")

# --- Step 5: spaCy POS tagging ---
try:
    import spacy
    nlp = spacy.load('de_core_news_sm')
    cur.execute("SELECT id, palabra FROM vocabulario WHERE wortart IS NULL OR wortart = ''")
    missing_pos = cur.fetchall()
    print(f"Step 5: {len(missing_pos)} rows missing wortart")
    updates = []
    for rid, word in missing_pos:
        doc = nlp(word)
        tag = doc[0].pos_ if doc else ''
        map = {'NOUN': 'Substantiv', 'VERB': 'Verb', 'ADJ': 'Adjektiv', 'ADV': 'Adverb',
               'PRON': 'Pronomen', 'ADP': 'Präposition', 'CCONJ': 'Konjunktion',
               'DET': 'Artikel', 'PROPN': 'Substantiv', 'NUM': 'Zahlwort'}
        mapped = map.get(tag, tag)
        if mapped:
            updates.append((mapped, rid))
    if updates:
        cur.executemany("UPDATE vocabulario SET wortart = %s WHERE id = %s", updates)
        conn.commit()
    print(f"  updated {len(updates)} POS tags")
except Exception as e:
    print(f"  spacy step failed: {e}")

cur.close()
conn.close()

# --- Final summary ---
conn2 = psycopg2.connect(**DB)
cur2 = conn2.cursor()
cur2.execute("""
    SELECT
      COUNT(*) as total,
      COUNT(english) FILTER(WHERE english IS NOT NULL AND english != '') as has_english,
      COUNT(french) FILTER(WHERE french IS NOT NULL AND french != '') as has_french,
      COUNT(artikel) FILTER(WHERE artikel IS NOT NULL AND artikel != '') as has_artikel,
      COUNT(wortart) FILTER(WHERE wortart IS NOT NULL AND wortart != '') as has_wortart
    FROM vocabulario
""")
r = cur2.fetchone()
print(f"\nFinal: total={r[0]} english={r[1]} french={r[2]} artikel={r[3]} wortart={r[4]}")
cur2.close()
conn2.close()
print("Done")
