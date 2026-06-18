#!/usr/bin/env python3
"""
DaF Annotation Extractor v2 — Google-first, Ollama-fallback
============================================================
CPU-only audit, state-tracked batches, service account auth.
Usage:  python3 BigPickleIsTheBest.py [--batch N]
"""

import os, sys, json, re, time, argparse, random, glob, base64, hashlib
from pathlib import Path
from datetime import datetime
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleRequest
import urllib.request as urlreq

ROOT = "/home/f/deutsch-app/de"
OLLAMA_URL = "http://localhost:11434/api/generate"
DB = dict(dbname='deutsch', user='f')

# ── Config from env with defaults ────────────────────────────
GOOGLE_MAX_CHARS = int(os.getenv("GEMINI_MAX_CHARS", "15000"))
GOOGLE_MAX_OUTPUT_TOKENS = int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "4096"))
SERVICE_ACCOUNT_DIR = os.getenv("SA_DIR", "/home/f")
STATE_FILE = os.path.join(ROOT, ".batch_state.json")
WORK_LIST_FILE = os.path.join(ROOT, ".work_list.json")

# ── Extraction template (matches Modelfile4 schema) ──────────
EXTRACTION_TEMPLATE = """
Du bist ein KI-Extraktor für DaF-Lehrmaterialien. NUR JSON AUSGEBEN. KEIN TEXT.

Regeln:
- Kein Echo des Eingabetextes. Analysiere und fasse zusammen.
- Audio-Muster erkennen: '1|2', '1|25-27', 'CD 2 / 15', 'Track 4'
- Substantive mit Artikel und echter Pluralform. Plural unbekannt: null.
- zusammenfassung_es und übersetzung_es immer auf Spanisch.
- JSON null (ohne Anführungszeichen) für unbekannte Werte.

SCHEMA:
{
  "struktur": { "seite": "string|null", "lektion": "string|null", "abschnitt": "string|null" },
  "audio": [{ "anweisung": "string", "cd": "string|null", "track": "string", "typ": "string", "beschreibung_es": "string" }],
  "inhaltstyp": ["string"],
  "thema": { "de": "string", "es": "string" },
  "grammatik": [{ "name": "string", "beschreibung": "string", "beispiele": ["string"] }],
  "vokabular": [{ "wort": "string", "artikel": "string|null", "plural": "string|null", "übersetzung_es": "string", "wortart": "string" }],
  "übungen": [{ "typ": "string", "anweisung_de": "string", "anweisung_es": "string" }],
  "zusammenfassung_es": "string"
}
""".strip()

# ── Helpers ──────────────────────────────────────────────────
def log(msg, c=''):  print(f"{c}{msg}\033[0m")
def ok(m):  log(f"  \u2705 {m}", '\033[32m')
def warn(m): log(f"  \u26a0\ufe0f  {m}", '\033[33m')
def fail(m): log(f"  \u274c {m}", '\033[31m')
def info(m): log(f"\033[34m\u2501\u2501 {m}\033[0m")

def estimate_tokens(text): return len(text) // 2

class RateLimitError(Exception): pass

class OllamaClient:
    def __init__(self, model="daf-fast:latest"):
        self.model = model
    def generate(self, content, hint=""):
        prompt = (hint + "\n\n" + truncate_content(content, 3000) if hint else truncate_content(content, 3000))
        payload = json.dumps({"model": self.model, "prompt": prompt, "stream": False,
                              "options": {"temperature": 1.4, "top_p": 1.0, "top_k": 60, "num_predict": 16392, "num_ctx": 12392}})
        req = urlreq.Request(OLLAMA_URL, data=payload.encode(), headers={"Content-Type": "application/json"})
        for attempt in range(3):
            try:
                resp = urlreq.urlopen(req, timeout=300)
                return json.loads(resp.read()).get('response', '')
            except Exception as e:
                if attempt < 2: time.sleep(2**attempt)
                else: fail(f"Ollama: {e}")
        return ""

class GoogleClient:
    def __init__(self):
        self.sa_files = sorted(glob.glob(os.path.join(SERVICE_ACCOUNT_DIR, "gen-lang-client-*.json")))
        if not self.sa_files:
            raise RuntimeError("No service account JSON files found in " + SERVICE_ACCOUNT_DIR)
        self.models = ["gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
        self.idx = 0
        self.tokens = {}
        self.token_expiry = {}
        self.day = datetime.now().strftime("%Y-%m-%d")
        self.rpd_count = {f: 0 for f in self.sa_files}

    def _get_token(self, sa_file):
        now = time.time()
        if sa_file in self.token_expiry and now < self.token_expiry[sa_file]:
            return self.tokens[sa_file]
        creds = service_account.Credentials.from_service_account_file(
            sa_file, scopes=["https://www.googleapis.com/auth/generative-language"])
        creds.refresh(GoogleRequest())
        self.tokens[sa_file] = creds.token
        self.token_expiry[sa_file] = creds.expiry.timestamp() - 60
        return creds.token

    def generate(self, content, hint=""):
        if datetime.now().strftime("%Y-%m-%d") != self.day:
            self.day = datetime.now().strftime("%Y-%m-%d")
            self.rpd_count = {f: 0 for f in self.sa_files}

        sa_file = self.sa_files[self.idx % len(self.sa_files)]
        model = self.models[self.idx % len(self.models)]
        self.idx += 1

        if self.rpd_count.get(sa_file, 0) >= 1500:
            return None  # signal RPD exhaustion

        prompt = (hint + "\n\n" + truncate_content(content, GOOGLE_MAX_CHARS) if hint else truncate_content(content, GOOGLE_MAX_CHARS))
        final_prompt = EXTRACTION_TEMPLATE + "\n\n" + prompt

        token = self._get_token(sa_file)
        payload = json.dumps({
            "contents": [{"role": "user", "parts": [{"text": final_prompt}]}],
            "generationConfig": {"temperature": 0.5, "maxOutputTokens": GOOGLE_MAX_OUTPUT_TOKENS}
        })

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        req = urlreq.Request(url, data=payload.encode(), headers=headers)

        for attempt in range(2):
            try:
                resp = urlreq.urlopen(req, timeout=180)
                data = json.loads(resp.read())
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        self.rpd_count[sa_file] = self.rpd_count.get(sa_file, 0) + 1
                        return parts[0].get("text", "")
            except Exception as e:
                if attempt == 0:
                    warn(f"Google API error (will retry): {e}")
                    time.sleep(2)
                    # Get fresh token in case it expired
                    self.token_expiry.pop(sa_file, None)
                    token = self._get_token(sa_file)
                    headers["Authorization"] = f"Bearer {token}"
                    req = urlreq.Request(url, data=payload.encode(), headers=headers)
                else:
                    fail(f"Google API: {e}")
        return ""

def truncate_content(text, max_chars=5000):
    if len(text) <= max_chars: return text
    return text[:max_chars].rsplit('\n', 1)[0] + '\n[...]'

def clean_json(raw):
    if not raw: return None
    c = raw.strip()
    c = re.sub(r'^```json?\s*', '', c, flags=re.MULTILINE)
    c = re.sub(r'```\s*$', '', c).strip()
    if not c.startswith('{'): c = '{' + c
    if c.startswith('{'):
        try: json.loads(c); return c
        except: pass
    depth = 0; start = -1
    for i, ch in enumerate(c):
        if ch == '{':
            if start < 0: start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                cand = c[start:i+1]
                try: json.loads(cand); return cand
                except: start = -1
    return None

def extract_audio(text):
    res, seen = [], set()
    def add(cd, tr, ty, ctx=""):
        k = (cd or "", tr or "")
        if k not in seen and tr: seen.add(k); res.append({"cd": cd, "track": tr, "typ": ty, "context": ctx[:60]})
    for m in re.finditer(r'(\d+)\s*\|\s*(\d+(?:\s*-\s*\d+)?)(?!\s*\.)', text):
        add(m.group(1), m.group(2).replace(" ", ""), "audio_cd", text[max(0,m.start()-40):m.start()].strip())
    lines = text.split('\n')
    for i in range(len(lines)-1):
        if re.search(r'h[oö]ren\s+Sie', lines[i], re.IGNORECASE):
            n = lines[i+1].strip()
            if re.fullmatch(r'\d+', n): add(None, n, "audio_track", lines[i].strip())
    return res

def ingest_postgres(txt_path, stem, ann_data, book_name):
    try:
        import psycopg2
        conn = psycopg2.connect(**DB); cur = conn.cursor()
        cur.execute("""
            SELECT rd.id, rd.book_name, rd.page_num, mr.id, mr.book_name
            FROM raw_data rd LEFT JOIN materials_registry mr ON mr.raw_data_txt_id = rd.id
            WHERE rd.file_path = %s AND rd.content_type = 'txt' LIMIT 1
        """, (txt_path,))
        row = cur.fetchone()
        txt_id, txt_book, txt_page, mr_id, mr_book = row if row else (None, book_name, None, None, None)
        fb = mr_book or txt_book or book_name
        pv = ann_data.get('struktur', {}).get('seite', txt_page)
        try: pn = int(pv)
        except: pn = int(txt_page) if txt_page and str(txt_page).isdigit() else None
        aj = json.dumps(ann_data, ensure_ascii=False)
        ap = os.path.join(os.path.dirname(txt_path), 'annotations', stem + '.json')
        cur.execute("""
            INSERT INTO raw_data (file_name, file_path, book_name, content_type, content_json, page_num, parent_txt_id)
            VALUES (%s,%s,%s,'annotation',%s::jsonb,%s,%s) ON CONFLICT DO NOTHING RETURNING id
        """, (stem+'.json', ap, fb, aj, pn, txt_id))
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        pass

# ── CPU-ONLY AUDIT ──────────────────────────────────────────
def audit_pending(force=False, txt_dir=None):
    """CPU-only: compare txt files vs annotations dirs. No GPU/API calls."""
    cache_file = WORK_LIST_FILE
    if os.path.exists(cache_file) and not force and not txt_dir:
        with open(cache_file) as f: return json.load(f)
    pending = []
    dirs_to_scan = [txt_dir] if txt_dir else []
    if not dirs_to_scan:
        for book in sorted(os.listdir(ROOT)):
            bp = os.path.join(ROOT, book)
            if not os.path.isdir(bp) or book.startswith('.'): continue
            for dp, dn, fn in os.walk(bp):
                if os.path.basename(dp) == 'txt':
                    dirs_to_scan.append(dp)
    for dp in dirs_to_scan:
        if not os.path.isdir(dp): continue
        # Determine book and parent from path
        rel = os.path.relpath(dp, ROOT)
        parts = rel.split(os.sep)
        book = parts[0] if len(parts) > 0 else "unknown"
        parent = parts[1] if len(parts) > 1 else os.path.basename(os.path.dirname(dp))
        ad = os.path.join(dp, 'annotations')
        existing = set()
        if os.path.isdir(ad):
            existing = {f.replace('.json', '') for f in os.listdir(ad) if f.endswith('.json')}
        txt_files = sorted([f for f in os.listdir(dp) if f.endswith('.txt')])
        for tf in txt_files:
            stem = tf.replace('.txt', '')
            if stem not in existing:
                txt_path = os.path.join(dp, tf)
                try:
                    with open(txt_path, 'r', errors='replace') as fh: ct = fh.read()
                except: continue
                if len(ct) < 40: continue
                pending.append({
                    'txt_path': txt_path, 'stem': stem,
                    'ann_dir': ad, 'book': book, 'parent': parent,
                    'chars': len(ct), 'tokens': estimate_tokens(ct)
                })
    with open(cache_file, 'w') as f: json.dump(pending, f, indent=2)
    return pending

# ── STATE FILE ──────────────────────────────────────────────
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f: return json.load(f)
    return {"processed": 0, "last_stem": None, "backend": None, "date": None}

def save_state(state):
    with open(STATE_FILE, 'w') as f: json.dump(state, f, indent=2)

def save_context(txt):
    ctx_file = os.path.join(ROOT, ".CONTEXT.md")
    with open(ctx_file, 'w') as f: f.write(txt)

def token_stats(pending):
    sizes = {"small": 0, "medium": 0, "large": 0, "xlarge": 0}
    for p in pending:
        c = p['chars']
        if c < 1000: sizes["small"] += 1
        elif c < 5000: sizes["medium"] += 1
        elif c < 15000: sizes["large"] += 1
        else: sizes["xlarge"] += 1
    return sizes

# ── MAIN ────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', type=int, default=500, help='Files to process per run')
    parser.add_argument('--model', default='daf-fast:latest', help='Ollama model (fallback)')
    parser.add_argument('--backend', choices=['google', 'ollama', 'auto'], default='auto', help='Backend preference')
    parser.add_argument('--reaudit', action='store_true', help='Force re-audit')
    parser.add_argument('--resume', action='store_true', help='Resume from state file')
    parser.add_argument('--txt-dir', help='Scope to one txt/ directory only (full path)')
    args = parser.parse_args()

    BATCH = args.batch
    MODEL = args.model
    BACKEND = args.backend
    if args.txt_dir:
        folder_id = args.txt_dir.replace(ROOT+'/', '').replace('/', '_').replace(' ', '_')
        global STATE_FILE, WORK_LIST_FILE
        STATE_FILE = os.path.join(ROOT, f".batch_state_{folder_id}.json")
        WORK_LIST_FILE = os.path.join(ROOT, f".work_list_{folder_id}.json")
    state = load_state()

    # Phase 1: CPU audit (wastes no GPU/API)
    info("CPU audit: scanning txt vs annotations...")
    all_pending = audit_pending(force=args.reaudit, txt_dir=args.txt_dir)
    total = len(all_pending)
    info(f"Found {total} pending files")
    sizes = token_stats(all_pending)
    print(f"  small: {sizes['small']}  medium: {sizes['medium']}  large: {sizes['large']}  xlarge: {sizes['xlarge']}")

    # Save context for next session
    ctx = f"""# DaF Annotation Batch State
Last run: {datetime.now().isoformat()}
Pending: {total}
Backend: {BACKEND}
Batch size: {BATCH}
Sizes: small={sizes['small']} medium={sizes['medium']} large={sizes['large']} xlarge={sizes['xlarge']}
Processed this session: {state.get('processed', 0)}
"""
    save_context(ctx)

    if not all_pending:
        ok("Nothing to process!")
        return 0

    # Phase 2: init clients
    ollama = None
    google = None
    fallback_to_ollama = False

    if BACKEND == 'google' or BACKEND == 'auto':
        try:
            google = GoogleClient()
            ok(f"Google service accounts loaded: {len(google.sa_files)}")
        except Exception as e:
            warn(f"Google init failed: {e}")
            if BACKEND == 'google': fail("No Google available"); return 1
            warn("Falling back to Ollama")
            fallback_to_ollama = True

    if BACKEND == 'ollama' or fallback_to_ollama or BACKEND == 'auto':
        try:
            req = urlreq.Request("http://localhost:11434/api/tags")
            models = json.loads(urlreq.urlopen(req).read()).get('models', [])
            mnames = [m['name'] for m in models]
            if MODEL not in mnames:
                warn(f"Model '{MODEL}' not found. Available: {', '.join(mnames[:5] + (['...'] if len(mnames) > 5 else []))}")
                return 1
            ollama = OllamaClient(MODEL)
            ok(f"Ollama '{MODEL}' ready")
        except Exception as e:
            fail(f"Ollama not available: {e}")
            return 1

    # Phase 3: process
    processed = state.get('processed', 0)
    resume_from = state.get('last_stem')
    resumed = False
    google_fail_count = 0

    # If resume_from is already annotated (not in pending), clear it
    if resume_from:
        pending_stems = {p['stem'] for p in all_pending}
        if resume_from not in pending_stems:
            info(f"Resume point '{resume_from}' done — starting from first pending")
            resume_from = None
            state['last_stem'] = None
            save_state(state)

    for idx, item in enumerate(all_pending):
        if processed >= BATCH:
            warn(f"Batch limit ({BATCH}) reached")
            break

        txt_path = item['txt_path']
        stem = item['stem']
        ann_dir = item['ann_dir']
        book = item['book']
        content = None

        # Resume logic
        if resume_from and not resumed:
            if stem == resume_from:
                resumed = True
                continue  # skip the already-processed file
            continue  # keep looking (resume_from still in pending list)
        # If resume_from was already annotated (not in pending list),
        # resumed stays False and we fall through — start processing from here

        try:
            with open(txt_path, 'r', errors='replace') as fh: content = fh.read()
        except: continue
        if not content or len(content) < 40: continue

        tok_est = estimate_tokens(content)
        info(f"[{idx+1}/{total}] {book}/{stem} ({item['chars']}c, ~{tok_est}t)")

        hint = "Extrahiere die DaF-Strukturen aus diesem OCR-Text als JSON:"
        raw = None

        # Try Google first (up to 2 attempts per file)
        if google and not fallback_to_ollama:
            for attempt in range(2):
                raw = google.generate(content, hint)
                if raw is None:
                    fail("Google RPD exhausted for this key")
                    google_fail_count += 1
                    if google_fail_count >= len(google.sa_files) * 2:
                        fail("All Google keys exhausted RPD — falling back to Ollama")
                        fallback_to_ollama = True
                    break
                if raw: break
                if attempt == 0: warn("Google retry...")

        # Fallback to Ollama
        if not raw and ollama:
            raw = ollama.generate(content, hint)

        t_elapsed = 0

        if not raw:
            fail(f"{stem}: no response from any backend")
            state['last_stem'] = stem
            state['processed'] = processed
            save_state(state)
            continue

        json_str = clean_json(raw)
        if not json_str:
            warn(f"{stem}: bad JSON, saving raw")
            os.makedirs(ann_dir, exist_ok=True)
            with open(os.path.join(ann_dir, f"{stem}.raw.txt"), 'w') as fh: fh.write(raw)
            state['last_stem'] = stem
            state['processed'] = processed
            save_state(state)
            continue

        ann_data = json.loads(json_str)
        audio_detected = extract_audio(content)
        if audio_detected:
            existing = ann_data.get('audio', [])
            seen = {(a.get('cd'), a.get('track')) for a in existing}
            for a in audio_detected:
                if (a['cd'], a['track']) not in seen:
                    existing.append({"anweisung": a.get('context',''), "cd": a['cd'], "track": a['track'],
                                     "typ": "Audio ("+a.get('typ','auto')+")", "beschreibung_es": "Audio detectado automáticamente"})
            ann_data['audio'] = existing

        os.makedirs(ann_dir, exist_ok=True)
        with open(os.path.join(ann_dir, f"{stem}.json"), 'w', encoding='utf-8') as fh:
            json.dump(ann_data, fh, ensure_ascii=False, indent=2)

        ingest_postgres(txt_path, stem, ann_data, book)
        processed += 1
        ok(f"{stem}: saved")

        state['last_stem'] = stem
        state['processed'] = processed
        state['backend'] = 'google' if not fallback_to_ollama else 'ollama'
        state['date'] = datetime.now().isoformat()
        save_state(state)

        # Update context every 5 files
        if processed % 5 == 0:
            remaining = total - sum(1 for p in all_pending if p['stem'] == item['stem'])  # rough
            save_context(f"""# DaF Annotation Batch State
Last run: {datetime.now().isoformat()}
Processed this session: {processed}
Total pending: {total}
Backend: {BACKEND}
Google fail count: {google_fail_count}
Fallback: {fallback_to_ollama}
Last file: {stem}
""" + (f"Next: {all_pending[idx+1]['stem']} ({all_pending[idx+1]['book']})" if idx+1 < total else "Done!"))

    info(f"Session complete. Processed: {processed}")
    # Re-audit to show remaining
    remaining = audit_pending(force=True, txt_dir=args.txt_dir)
    print(f"\n  Remaining pending: {len(remaining)}")
    save_context(f"""# DaF Annotation Batch State
Completed: {datetime.now().isoformat()}
Processed this session: {processed}
Remaining total: {len(remaining)}
Backend used: {state.get('backend', 'unknown')}
To resume: python3 BigPickleIsTheBest.py --batch {BATCH} --resume
""")
    return 0

if __name__ == '__main__':
    sys.exit(main())
