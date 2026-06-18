import os
import json
import urllib.request
import psycopg2
import sys

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "mistral:latest"
DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"

def extract_vocab(text, page_num):
    prompt = f"""
    Extract German vocabulary from the following OCR text from page {page_num} of the Delfin Lehrbuch word list.
    Text:
    {text}

    For each word, provide:
    1. palabra: Full German word with definite article (der, die, das).
    2. singular: Singular form.
    3. plural: Full resolved plural form (e.g. if text says "r Anzug, =e", plural is "Anzüge").
    4. english, traduccion (Spanish), french, portuguese translations.
    5. wortart (e.g., Nomen, Verb, Adjektiv), artikel (der, die, das, or null).

    Return ONLY a valid JSON list of objects.
    """
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.0}
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            resp_data = json.loads(resp.read())
            words = json.loads(resp_data.get("response", "[]"))
            if isinstance(words, dict):
                for key in ["vocabulary", "words", "items", "data"]:
                    if key in words: return words[key]
                return []
            return words
    except Exception as e:
        print(f"\nError on page {page_num}: {e}")
        return []

def main():
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    
    cur.execute("SELECT id FROM cursos WHERE nombre = 'Delfin'")
    row = cur.fetchone()
    if not row:
        print("Delfin course not found in database.")
        return
    curso_id = row[0]

    pages = list(range(235, 257))
    for page in pages:
        fp = f"/home/f/deutsch-app/de/delfin/txt/Delfin_Lehrbuch-{page:03}.txt"
        if not os.path.exists(fp):
            fp = f"/home/f/deutsch-app/de/delfin/txt/Delfin_Lehrbuch-{page}.txt"
            if not os.path.exists(fp):
                print(f"Skipping page {page}: File not found")
                continue

        print(f"Processing Page {page}...", flush=True)
        with open(fp, "r") as f:
            lines = f.readlines()
        
        chunk_size = 30
        for i in range(0, len(lines), chunk_size):
            chunk_text = "".join(lines[i:i+chunk_size])
            if len(chunk_text.strip()) < 10: continue
            
            sys.stdout.write(f".")
            sys.stdout.flush()
            
            words = extract_vocab(chunk_text, page)
            if not isinstance(words, list): continue
            
            for w in words:
                if not w.get('palabra'): continue
                cur.execute(
                    "INSERT INTO vocabulario (curso_id, palabra, english, traduccion, french, portuguese, wortart, artikel, plural, seite, source_file) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (curso_id, w.get('palabra'), w.get('english'), w.get('traduccion'), w.get('french'), w.get('portuguese'),
                     w.get('wortart'), w.get('artikel'), w.get('plural'), str(page), os.path.basename(fp))
                )
            conn.commit()
        print(f" Done.")
    
    conn.close()

if __name__ == "__main__":
    main()
