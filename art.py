#!/usr/bin/env python3
import json, sys, urllib.request, time, psycopg2

# Database connection settings
DB = dict(host='/var/run/postgresql', user='f', database='deutsch')
OLLAMA_URL = "http://localhost:11434/api/generate"
BATCH_SIZE = 5  # Reduced to 5 to prevent Ollama 500 errors

SYSTEM = """Du gibst NUR ein JSON-Array zurück. KEIN anderer Text.
Für jedes Wort bestimmst du den Artikel (der/die/das) im Nominativ.
Wenn kein Artikel möglich ist (z.B. Verb), lass das Feld leer.
JSON: [{"wort": "...", "artikel": "der|die|das"}]
Wörter: {words}"""

def is_valid_word(word):
    # Filter out junk: empty strings, multi-word phrases, or OCR-fragmented hyphens
    if not word or ' ' in word or '-' in word or len(word) > 20:
        return False
    return True

def ask_ollama(words):
    prompt = SYSTEM.replace("{words}", ", ".join(words))
    payload = json.dumps({
        "model": "mistral:latest", # Changed to standard mistral
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 2000}
    })
    req = urllib.request.Request(OLLAMA_URL, data=payload.encode(),
                                 headers={"Content-Type": "application/json"})
    
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            text = json.loads(resp.read()).get("response", "").strip()
            # Clean JSON markdown wrappers
            text = text.replace("```json", "").replace("```", "").strip()
            
            # Find the first '[' to isolate the array
            start = text.find("[")
            end = text.rfind("]") + 1
            if start != -1 and end != -1:
                data = json.loads(text[start:end])
                if isinstance(data, list):
                    return data
            return []
        except Exception as e:
            if attempt < 2:
                time.sleep(5)
            else:
                print(f"  Error after 3 attempts: {e}", flush=True)
                return []

# Main Execution
conn = psycopg2.connect(**DB)
cur = conn.cursor()

# Get only valid nouns
cur.execute("SELECT id, palabra FROM vocabulario WHERE wortart = 'Substantiv' AND (artikel IS NULL OR artikel = '') ORDER BY id")
rows = cur.fetchall()
print(f"Nouns missing articles: {len(rows)}")

batches = [rows[i:i+BATCH_SIZE] for i in range(0, len(rows), BATCH_SIZE)]
updated = 0

for batch in batches:
    # Pre-filter for valid words only
    valid_batch = [r for r in batch if is_valid_word(r[1])]
    if not valid_batch:
        continue
        
    words = [r[1] for r in valid_batch]
    results = ask_ollama(words)
    
    if results:
        for item in results:
            wort = item.get("wort", "")
            artikel = item.get("artikel", "")
            if artikel not in ("der", "die", "das"):
                continue
            
            # Find matching record
            matching = [r for r in valid_batch if r[1].lower() == wort.lower()]
            if matching:
                rid = matching[0][0]
                cur.execute("UPDATE vocabulario SET artikel = %s WHERE id = %s", (artikel, rid))
                updated += 1
        conn.commit()
        print(f"Processed batch, updated {updated} total.")
    time.sleep(1)

cur.close()
conn.close()
print(f"\nFinished. Updated {updated} nouns.")
