# Deutsch-Flex App — Implementation Summary

## Project Overview
German language learning application with React/TypeScript frontend, Node.js/Express backend, PostgreSQL database.

---

## Completed Implementations

### Database (PostgreSQL `deutsch`)
| Table | Count | Description |
|-------|-------|-------------|
| `dictionary` | 205,907 | Full German-English dictionary (de-en.txt re-imported) |
| `goethe_a1` | 1,047 | A1 vocabulary with plural rules (umlaut, suffix, plural_form) |
| `goethe_a2` | 1,601 | A2 vocabulary with plural rules |
| `goethe_b1` | 4,868 | B1 vocabulary with plural rules |
| `page_content_index` | 9,469 | OCR-parsed pages from 57 books (CD refs, grammar, sections, vocab) |
| `vocabulario` | 30,539 | Main vocabulary table |
| `german_verbs` | 2,897 | Verbs with full conjugations (EN/ES/FR) |
| `goethe_wortschatz` | 7,516 | Original combined Goethe table |

### Backend API (port 3456) — `/home/f/deutsch-app/backend/server.js`

**New Endpoints Added:**
- `GET /api/page/content-index?book=X&page=Y` — Per-page OCR analysis
- `GET /api/book/content-map?book=X` — Full book content map (all pages)
- `GET /api/book/cd-map?book=X` — All CD/track references from OCR
- `GET /api/book/section-jump?book=X&type=grammar|listening|answers|speaking|exercises|writing|vocabulary|reading` — Jump to first page of section type
- `GET /api/book/ocr-search?book=X&q=query` — Full-text OCR search with highlighted snippets
- `POST /api/writing/evaluate` — **SSE streaming** (avoids proxy timeout)
- `POST /api/speaking/evaluate-stream` — **SSE streaming** for speaking evaluation

**Timeout Fixes:**
- Writing evaluation endpoint converted to Server-Sent Events (SSE)
- Speaking evaluation streaming endpoint added
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`

### OCR Intelligence Pipeline — `/home/f/deutsch-app/scripts/parse_ocr_index.js`
- Parses all 57 books from `materials_registry` table
- Extracts from each page's `.txt` file:
  - CD/Track references (regex: `CD 1 | 4-7`, `1/05`, etc.)
  - Grammar topics (Nominativ, Akkusativ, Konjunktiv, etc.)
  - Section labels (HÖREN, SPRECHEN, LESEN, SCHREIBEN, LÖSUNGEN)
  - Vocabulary snippets (article + noun patterns)
  - Content type flags (has_cd_refs, has_grammar, has_listening, etc.)
- Stores in `page_content_index` with JSONB columns for structured data
- Full-text search index on `ocr_text` column (German tsvector)

### Frontend — `/home/f/deutsch-app/app/src/app/views/LessonsView.tsx`

**New Sidebar Sections (collapsible):**
1. **Content Badges** — Always visible row showing page content types (CD, Grammar, Listening, Speaking, Answers, Exercises) with clickable CD refs that play audio
2. **Section Jump** — 8 buttons (Hören, Grammatik, Lösungen, Sprechen, Schreiben, Übungen, Vokabeln, Lesen) that navigate to first page of that section type
3. **Book Minimap** — Visual dot strip for all pages (color-coded: blue=CD, green=Answers, purple=Grammar, sky=Listening, pink=Speaking, amber=Exercises). Click any dot to navigate.
4. **OCR Search** — In-book full-text search with highlighted snippets, click to jump to page

**Zoom Control (fixed):**
- Floating vertical orange panel on right side
- Draggable (mouse down on empty area)
- Always visible, never disappears on scroll
- +/- / percentage display / Reset buttons
- Semi-transparent orange (95% opacity) with border

### Scripts
- `/home/f/deutsch-app/scripts/parse_ocr_index.js` — OCR parsing pipeline
- `/home/f/deutsch-app/scripts/python/plural_engine.py` — German plural formation engine
- `/home/f/deutsch-app/scripts/python/writing_eval.py` — Writing evaluation (MERLIN corpus)
- `/home/f/deutsch-app/scripts/python/speaking_eval.py` — Speaking evaluation (faster-whisper + librosa)
- `/home/f/deutsch-app/scripts/python/fast_gpu_translate.py` — Helsinki-NLP opus-mt-de-en batch translation

---

## Files Modified

| File | Changes |
|------|---------|
| `/home/f/deutsch-app/backend/server.js` | +5 new API endpoints, SSE streaming for writing/speaking evaluation |
| `/home/f/deutsch-app/scripts/parse_ocr_index.js` | New OCR parsing script |
| `/home/f/deutsch-app/app/src/app/views/LessonsView.tsx` | New sidebar sections, floating zoom control, contentMap/pageIndex state |
| `/home/f/deutsch-app/app/src/app/views/GoetheView.tsx` | Already existed — Goethe vocabulary display |
| `/home/f/deutsch-app/app/src/app/views/SpeakingView.tsx` | Uses browser SpeechRecognition (needs upgrade) |

---

## Missing / To Do

### 1. Page Navigation Bar (Bottom of Lesson View)
- **Current:** Numbered buttons (1, 2, 3...) take too much space, not working well as carousel
- **Need:** Compact working page navigator — maybe just prev/next + page input + lektion dropdown

### 2. Sidebar Auto-Hide
- **Current:** Sidebar always open or manually toggled
- **Need:** Auto-hide on mouse leave, show thin tab/handle on edge to expand on hover

### 3. Text File Display in Sidebar (HTML/CSS/JS Enhancement)
- **Current:** Plain text in `<pre>` tags (OCR Text, AI Annotations, Transcriptions, Answers)
- **Need:**
  - Render as HTML with proper typography (font, colors, spacing)
  - Section headers styled (HÖREN, GRAMMATIK, etc.)
  - **Word-level dictionary links:** Every German word clickable → floating globe tooltip with translation from `dictionary` table
  - Syntax highlighting for grammar terms, CD refs, exercise numbers

### 4. Speaking Training Recording
- **Current:** Uses `webkitSpeechRecognition` (browser built-in, limited)
- **Need:** 
  - MediaRecorder API for actual audio capture (WAV/Opus, 16kHz mono)
  - Record/Stop/Pause/Resume buttons
  - Visual waveform during recording
  - Send to `/api/speaking/evaluate-stream` (SSE) for evaluation
  - Proper format for faster-whisper (16-bit PCM, 16kHz)

### 5. OCR Text Cleanup
- **Issue:** Page markers like `========================= START PAGE 024 =========================` appear in sidebar
- **Fix:** Strip these markers in parse script or frontend display

### 6. GoetheView Enhancements
- **Current:** Shows word, plural rule badge, plural form, example
- **Need:** Add translation column (ES/EN/FR from dictionary table), audio playback for words

### 7. Frontend Build
```bash
cd /home/f/deutsch-app/app && npm run build
```

### 8. Backend Restart Required
```bash
pkill -f "node server.js"
cd /home/f/deutsch-app/backend && nohup node server.js > server.log 2>&1 &
```

---

## Key Commands

```bash
# Start everything (backend + frontend dev)
./scripts/shell/start.sh

# Build frontend for production
cd app && npm run build

# Run OCR parsing (re-runnable)
node scripts/parse_ocr_index.js

# Re-import dictionary
cd scripts/python && /mnt/storage/venv/bin/python import_dictionary.py

# Translate all .txt files to English
cd scripts/python && /mnt/storage/venv/bin/python fast_gpu_translate.py

# Test endpoints
curl http://localhost:3456/api/book/content-map?book=B2%2FHauptKurs%2FB2-Hauptkurs
curl http://localhost:3456/api/page/content-index?book=B2%2FHauptKurs%2FB2-Hauptkurs&page=24
curl -N -X POST http://localhost:3456/api/writing/evaluate -H "Content-Type: application/json" -d '{"text":"Ich wohne in Berlin","level":"A1","prompt":"apartment"}'
```

---

## Architecture Notes

- **Database:** PostgreSQL on `/var/run/postgresql`, user `f`, database `deutsch`
- **Courses:** 57 books in `/home/f/deutsch-app/de/` with PDFs, MP3s, OCR `.txt` files
- **Materials Registry:** Single source of truth for book/page paths (`materials_registry` table)
- **Audio:** Served via `/pages/` static route, CD/track mapping in `page_audio_refs` and `audio_index`
- **Transcriptions:** Stored in `dokument_segmente` (typ=Transkription) and `_translated.txt` files
- **Proxy:** Likely nginx/Caddy in front of port 3456 — SSE endpoints need `proxy_read_timeout 120s;`