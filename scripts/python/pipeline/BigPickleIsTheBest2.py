#!/usr/bin/env python3
"""
DaF Annotation Extractor
========================
Extracts structured JSON from German textbook OCR text using Ollama.

Usage:  python3 /tmp/extract_daf.py [--batch N] [--model NAME] [--dry-run]

Workflow:
  1. Scan /home/f/deutsch-app/de for txt folders WITHOUT annotations
  2. For each book, process up to N txt files
  3. Call Ollama model for JSON extraction
  4. Save annotation JSON to txt/annotations/<stem>.json
  5. Insert into PostgreSQL (deutsch.raw_data as type 'annotation')

Flags:
  --batch N     Number of files to process (default: 3)
  --model NAME  Ollama model name (default: daf-fast)
  --dry-run     Just scan and report, don't call model
  --book NAME   Only process specific book folder (e.g., "Lagune_1")
"""

import os, sys, json, re, time, argparse
from pathlib import Path
from datetime import datetime

ROOT = "/home/f/deutsch-app/de/Schritte plus neu A2.2/"
OLLAMA_URL = "http://localhost:11434/api/generate"
DB = dict(dbname='deutsch', user='f')

# ── Parse args ──────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--batch', type=int, default=3, help='Files to process')
parser.add_argument('--model', default='daf-fast:latest', help='Ollama model')
parser.add_argument('--dry-run', action='store_true', help='Scan only')
parser.add_argument('--book', default=None, help='Filter by book folder')
args = parser.parse_args()

BATCH = args.batch
MODEL = args.model
DRY_RUN = args.dry_run
FILTER_BOOK = args.book

# ── Helpers ─────────────────────────────────────────────────
def log(msg, color=''):
    print(f"{color}{msg}\033[0m")

def ok(msg):  log(f"  ✅ {msg}", '\033[32m')
def warn(msg): log(f"  ⚠️  {msg}", '\033[33m')
def fail(msg): log(f"  ❌ {msg}", '\033[31m')
def info(msg): log(f"\033[34m━━ {msg}\033[0m")

def scan_txt_folders():
    """Find all txt folders and their annotation status."""
    results = []
    for book in sorted(os.listdir(ROOT)):
        book_path = os.path.join(ROOT, book)
        if not os.path.isdir(book_path) or book.startswith('.'):
            continue
        if FILTER_BOOK and book != FILTER_BOOK:
            continue
        for dirpath, dirnames, filenames in os.walk(book_path):
            if os.path.basename(dirpath) != 'txt':
                continue
            
            annotations_dir = os.path.join(dirpath, 'annotations')
            existing_anns = set()
            if os.path.isdir(annotations_dir):
                existing_anns = {f.replace('.json', '') for f in os.listdir(annotations_dir) if f.endswith('.json')}
            
            txt_files = sorted([f for f in filenames if f.endswith('.txt')])
            needed = [f for f in txt_files if f.replace('.txt', '') not in existing_anns]
            
            parent = os.path.basename(os.path.dirname(dirpath))
            results.append({
                'book': book,
                'parent': parent,
                'txt_dir': dirpath,
                'ann_dir': annotations_dir,
                'total': len(txt_files),
                'done': len(existing_anns),
                'needed': needed,
                'pending': len(needed),
            })
    return results

def stats(folders):
    """Print statistics."""
    total_txt = sum(f['total'] for f in folders)
    total_ann = sum(f['done'] for f in folders)
    total_pending = sum(f['pending'] for f in folders)
    print(f"\n  Total txt files: {total_txt}")
    print(f"  Annotations done: {total_ann}")
    print(f"  Pending: {total_pending}")
    return total_pending > 0

def truncate_content(text, max_chars=3000):
    """Truncate to max_chars, keeping complete lines."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit('\n', 1)[0] + '\n[...]'

def call_model(content, hint=""):
    """Call Ollama model and return JSON response."""
    prompt = hint + "\n\n" + truncate_content(content, 3000) if hint else truncate_content(content, 3000)
    
    payload = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 16392,
            "num_ctx": 8192,
            "repeat_penalty": 1.1,
        }
    })
    
    import urllib.request
    req = urllib.request.Request(OLLAMA_URL, data=payload.encode(), 
                                  headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=300)
        data = json.loads(resp.read())
        return data.get('response', '')
    except Exception as e:
        fail(f"Ollama error: {e}")
        return ""

def clean_json(raw):
    """Extract valid JSON from model response."""
    if not raw:
        return None
    
    cleaned = raw.strip()
    
    # Model template prepends '{' — if response starts without it, add it
    if not cleaned.startswith('{'):
        cleaned = '{' + cleaned
    
    # Strip markdown fences
    cleaned = re.sub(r'^```json?\s*', '', cleaned.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r'```\s*$', '', cleaned, flags=re.MULTILINE).strip()
    if not cleaned.startswith('{'):
        cleaned = '{' + cleaned
    
    # If response starts with {, good
    if cleaned.startswith('{'):
        try:
            json.loads(cleaned)
            return cleaned
        except:
            pass
    
    # Find first complete JSON object (handle double output)
    depth = 0
    start = -1
    for i, c in enumerate(cleaned):
        if c == '{':
            if start == -1:
                start = i
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                candidate = cleaned[start:i+1]
                try:
                    json.loads(candidate)
                    return candidate
                except:
                    start = -1
    
    return None

def extract_audio(text):
    """Regex-based audio detection."""
    results = []
    seen = set()
    
    def add(cd, track, typ, ctx=""):
        key = (cd or "", track or "")
        if key not in seen and track:
            seen.add(key)
            results.append({"cd": cd, "track": track, "typ": typ, "context": ctx[:60]})
    
    # Lagune/Schritte: X|Y or X|Y-Z — but NOT shorthand like "AB S." or "S."
    for m in re.finditer(r'(\d+)\s*\|\s*(\d+(?:\s*-\s*\d+)?)(?!\s*\.)', text):
        add(m.group(1), m.group(2).replace(" ", ""), "audio_cd", 
            text[max(0,m.start()-40):m.start()].strip())
    
    # Hören ... number on next line
    lines = text.split('\n')
    for i in range(len(lines)-1):
        if re.search(r'h[oö]ren\s+Sie', lines[i], re.IGNORECASE):
            nxt = lines[i+1].strip()
            if re.fullmatch(r'\d+', nxt):
                add(None, nxt, "audio_track", lines[i].strip())
    
    return results

def ingest_postgres(txt_path, stem, ann_data, book_name):
    """Insert annotation into PostgreSQL with proper links."""
    try:
        import psycopg2
        conn = psycopg2.connect(**DB)
        cur = conn.cursor()
        
        # Find matching txt raw_data entry and its materials_registry
        cur.execute("""
            SELECT rd.id, rd.book_name, rd.page_num, mr.id as mr_id, mr.book_name as mr_book
            FROM raw_data rd
            LEFT JOIN materials_registry mr ON mr.raw_data_txt_id = rd.id
            WHERE rd.file_path = %s AND rd.content_type = 'txt'
            LIMIT 1
        """, (txt_path,))
        row = cur.fetchone()
        
        if row:
            txt_id, txt_book, txt_page, mr_id, mr_book = row
        else:
            txt_id, txt_book, txt_page, mr_id, mr_book = None, book_name, None, None, None
        
        # Use registry book_name if available (full path), else fallback
        final_book = mr_book or txt_book or book_name
        # Get page from annotation JSON, fallback to txt page
        page_val = ann_data.get('struktur', {}).get('seite', txt_page)
        try:
            page_num = int(page_val)
        except (ValueError, TypeError):
            page_num = int(txt_page) if txt_page and str(txt_page).isdigit() else None
        
        ann_json = json.dumps(ann_data, ensure_ascii=False)
        ann_path = os.path.join(os.path.dirname(txt_path), 'annotations', stem + '.json')
        
        cur.execute("""
            INSERT INTO raw_data (file_name, file_path, book_name, content_type, 
                                  content_json, page_num, parent_txt_id)
            VALUES (%s, %s, %s, 'annotation', %s::jsonb, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id
        """, (stem + '.json', ann_path, final_book, ann_json, page_num, txt_id))
        
        inserted_id = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return inserted_id
    except Exception as e:
        warn(f"Postgres insert failed: {e}")
        return None

def estimate_tokens(text):
    """Rough token count."""
    return len(text) // 2

# ── Main ────────────────────────────────────────────────────
def main():
    info("Scanning txt folders...")
    folders = scan_txt_folders()
    
    pending_folders = [f for f in folders if f['pending'] > 0]
    
    print(f"\n  Found {len(folders)} txt folders total")
    print(f"  {len(pending_folders)} have pending files")
    stats(folders)
    
    if not pending_folders:
        print("\n  Nothing to process!")
        return
    
    if DRY_RUN:
        print("\n  --dry-run: stopping before model calls")
        return
    
    # Verify model
    import urllib.request
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags")
        resp = urllib.request.urlopen(req)
        models = json.loads(resp.read()).get('models', [])
        model_names = [m['name'] for m in models]
        if MODEL not in model_names:
            fail(f"Model '{MODEL}' not found. Available: {', '.join(model_names)}")
            return
        ok(f"Model '{MODEL}' ready")
    except Exception as e:
        fail(f"Ollama not responding: {e}")
        return
    
    # Sort: books with 0 annotations first (prioritize untouched books)
    pending_folders.sort(key=lambda f: (f['done'] > 0, f['book'], f['parent']))
    
    # Process books
    processed_total = 0
    for folder in pending_folders:
        if processed_total >= BATCH:
            warn(f"Batch limit ({BATCH}) reached")
            break
        
        book = folder['book']
        parent = folder['parent']
        txt_dir = folder['txt_dir']
        ann_dir = folder['ann_dir']
        needed = folder['needed'][:BATCH - processed_total]
        
        info(f"{book}/{parent} — {len(needed)} files this batch")
        
        for txt_file in needed:
            txt_path = os.path.join(txt_dir, txt_file)
            stem = txt_file.replace('.txt', '')
            
            # Read content
            try:
                with open(txt_path, 'r', errors='replace') as f:
                    content = f.read()
            except Exception as e:
                warn(f"Cannot read {txt_file}: {e}")
                continue
            
            if len(content) < 40:
                warn(f"{txt_file}: too short ({len(content)} chars)")
                continue
            
            tok_est = estimate_tokens(content)
            info(f"{txt_file} ({len(content)} chars, ~{tok_est} tok)")
            
            # Build hint
            hint = "Extrahiere die DaF-Strukturen aus diesem OCR-Text als JSON:"
            
            # Call model
            t0 = time.time()
            raw = call_model(content, hint)
            elapsed = time.time() - t0
            
            if not raw:
                fail(f"{txt_file}: no response ({elapsed:.0f}s)")
                continue
            
            # Clean JSON
            json_str = clean_json(raw)
            if not json_str:
                warn(f"{txt_file}: bad JSON, saving raw ({elapsed:.0f}s)")
                os.makedirs(ann_dir, exist_ok=True)
                with open(os.path.join(ann_dir, f"{stem}.raw.txt"), 'w') as f:
                    f.write(raw)
                continue
            
            ann_data = json.loads(json_str)
            
            # Merge audio detection
            audio_detected = extract_audio(content)
            if audio_detected:
                existing = ann_data.get('audio', [])
                seen = {(a.get('cd'), a.get('track')) for a in existing}
                for a in audio_detected:
                    if (a['cd'], a['track']) not in seen:
                        existing.append({
                            "anweisung": a.get('context', 'autodetect'),
                            "cd": a['cd'],
                            "track": a['track'],
                            "typ": "Audio (" + a.get('typ', 'auto') + ")",
                            "beschreibung_es": "Audio detectado automáticamente"
                        })
                ann_data['audio'] = existing
            
            # Save annotation
            os.makedirs(ann_dir, exist_ok=True)
            ann_path = os.path.join(ann_dir, f"{stem}.json")
            with open(ann_path, 'w', encoding='utf-8') as f:
                json.dump(ann_data, f, ensure_ascii=False, indent=2)
            
            # Ingest to PostgreSQL
            ingest_postgres(txt_path, stem, ann_data, book)
            
            ok(f"{txt_file}: saved ({elapsed:.0f}s)")
            processed_total += 1
            
            if processed_total >= BATCH:
                break
    
    print(f"\n{'='*50}")
    ok(f"Done. Processed {processed_total} files this batch.")
    stats(scan_txt_folders())

if __name__ == '__main__':
    main()
