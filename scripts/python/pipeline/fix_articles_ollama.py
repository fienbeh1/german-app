#!/usr/bin/env python3
"""Query Ollama to fill missing articles for German nouns in vocabulario."""
import json, sys, urllib.request, time, psycopg2

DB = dict(host='/var/run/postgresql', user='f', database='deutsch')
OLLAMA_URL = "http://localhost:11434/api/generate"
BATCH_SIZE = 20

SYSTEM = """Du gibst NUR ein JSON-Array zurück. KEIN anderer Text.
Für jedes Wort bestimmst du den Artikel (der/die/das) im Nominativ.
JSON: [{"wort": "...", "artikel": "der|die|das"}]
Wörter: {words}"""

def ask_ollama(words):
    prompt = SYSTEM.replace("{words}", ", ".join(words))
    payload = json.dumps({
        "model": "ger:latest",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 2000}
    })
    req = urllib.request.Request(OLLAMA_URL, data=payload.encode(),
                                 headers={"Content-Type": "application/json"})
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            text = json.loads(resp.read()).get("response", "")
            text = text.strip()
            if text.startswith("```json"):
                text = text.split("```json")[1]
            if text.startswith("```"):
                text = text.split("```")[1]
            if "```" in text:
                text = text.split("```")[0]
            text = text.strip()
            if not text.startswith("["):
                brace = text.find("[")
                if brace >= 0:
                    text = text[brace:]
            data = json.loads(text)
            if isinstance(data, list):
                return data
            return []
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
            else:
                print(f"  Error after 3 attempts: {e}", flush=True)
                return []

conn = psycopg2.connect(**DB)
cur = conn.cursor()

cur.execute("SELECT id, palabra FROM vocabulario WHERE wortart = 'Substantiv' AND (artikel IS NULL OR artikel = '') ORDER BY id")
rows = cur.fetchall()
print(f"Nouns missing articles: {len(rows)}")

if not rows:
    print("None to process.")
    sys.exit(0)

batches = [rows[i:i+BATCH_SIZE] for i in range(0, len(rows), BATCH_SIZE)]
updated = 0

for batch_idx, batch in enumerate(batches):
    words = [r[1] for r in batch]
    print(f"  Batch {batch_idx+1}/{len(batches)}: {words}", flush=True)
    results = ask_ollama(words)
    if results:
        for item in results:
            wort = item.get("wort", "")
            artikel = item.get("artikel", "")
            if artikel not in ("der", "die", "das"):
                continue
            matching = [r for r in batch if r[1].lower() == wort.lower()]
            if matching:
                rid = matching[0][0]
                cur.execute("UPDATE vocabulario SET artikel = %s WHERE id = %s", (artikel, rid))
                updated += 1
        conn.commit()
    time.sleep(0.5)

print(f"\nUpdated {updated}/{len(rows)} nouns with articles")
cur.close()
conn.close()
