import os
import json
import urllib.request
import psycopg2
import sys
import time
from deep_translator import GoogleTranslator

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "mistral:latest"
DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"

def extract_german_forms(text, page_num):
    """Uses Mistral to parse the messy OCR text into structured German forms."""
    prompt = f"""
    Extract German vocabulary from the following OCR text from page {page_num} of the Delfin Lehrbuch word list.
    Focus on resolving the definite article and the full plural form.
    Text:
    {text}

    For each entry, provide:
    1. palabra: The German word (e.g., "Haus").
    2. artikel: The definite article (der, die, das) or null.
    3. full_palabra: Article + Word (e.g., "das Haus").
    4. plural: The full plural form (e.g., "Häuser").
    5. wortart: Nomen, Verb, Adjektiv, etc.

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
        # Long timeout for local AI response
        with urllib.request.urlopen(req, timeout=600) as resp:
            resp_data = json.loads(resp.read())
            return json.loads(resp_data.get("response", "[]"))
    except Exception as e:
        print(f"\nMistral Error page {page_num}: {e}")
        return []

def translate_word(word, target_lang):
    """Uses deep-translator for the translations."""
    try:
        return GoogleTranslator(source='de', target=target_lang).translate(word)
    except Exception as e:
        return None

def main():
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    
    cur.execute("SELECT id FROM cursos WHERE nombre = 'Delfin'")
    row = cur.fetchone()
    if not row:
        print("Delfin course not found.")
        return
    curso_id = row[0]

    # Target languages for deep-translator
    langs = {
        'english': 'en',
        'traduccion': 'es',
        'french': 'fr',
        'portuguese': 'pt'
    }

    pages = list(range(235, 257))
    for page in pages:
        fp = f"/home/f/deutsch-app/de/delfin/txt/Delfin_Lehrbuch-{page}.txt"
        if not os.path.exists(fp):
            fp = f"/home/f/deutsch-app/de/delfin/txt/Delfin_Lehrbuch-{page:03}.txt"
            if not os.path.exists(fp):
                print(f"Skipping page {page}")
                continue

        print(f"Processing Page {page}...", flush=True)
        with open(fp, "r") as f:
            lines = f.readlines()
        
        chunk_size = 30
        for i in range(0, len(lines), chunk_size):
            chunk_text = "".join(lines[i:i+chunk_size])
            if len(chunk_text.strip()) < 10: continue
            
            sys.stdout.write(f"  Extracting chunk {i//chunk_size + 1}...")
            sys.stdout.flush()
            
            results = extract_german_forms(chunk_text, page)
            if not isinstance(results, list): continue
            print(f" Found {len(results)} words. Translating...", end="", flush=True)
            
            for item in results:
                palabra = item.get('palabra')
                if not palabra: continue
                
                # Use full_palabra for better translation context if it's a noun
                trans_source = item.get('full_palabra') or palabra
                
                translations = {}
                for col, code in langs.items():
                    translations[col] = translate_word(trans_source, code)
                    time.sleep(0.05) # Avoid rate limits
                
                cur.execute(
                    """INSERT INTO vocabulario 
                    (curso_id, palabra, artikel, plural, wortart, english, traduccion, french, portuguese, seite, source_file) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (curso_id, item.get('full_palabra') or palabra, item.get('artikel'), item.get('plural'), 
                     item.get('wortart'), translations['english'], translations['traduccion'], 
                     translations['french'], translations['portuguese'], str(page), os.path.basename(fp))
                )
            conn.commit()
            print(" Done.")
    
    conn.close()

if __name__ == "__main__":
    main()
