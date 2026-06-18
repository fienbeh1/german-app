# Deutsch App — CRITICAL WARNINGS (read before any change)

## 🚫 NEVER REMOVE WORKING FUNCTIONS
- If a function/feature already works, DO NOT remove, modify, or replace it
- Only ADD improvements, never delete or rewrite working code
- Always verify previous fixes are intact after ANY change
- Check `git diff` before committing to confirm only intended changes

## 🚫 NEVER generate summaries or session notes
- Do NOT output summaries of what was done at the end of a session
- Do NOT write "relevant files" or "key decisions" notes
- These consume excessive tokens with zero value
- Only answer what was asked, implement the changes, and stop
- Register this rule: NO session summaries, NO recap, NO notes. Period.

# Deutsch App — CRITICAL WARNINGS (read before any change)

## 🚫 NEVER use `sleep` for progress checking
- Do NOT use `sleep N && <command>` to wait and check progress
- Instead: just run the command directly without sleep; if needed, check the tmux session output or log file directly
- The `sleep` pattern is unreliable, slow, and user explicitly hates it

## 🚫 NEVER use `pkill` or `sleep` in commands
- Do NOT use `pkill` to kill processes — use `kill <PID>` found via `ps`/`ss`
- Do NOT use `sleep` — check directly or use tmux
- Exception: `kill` with specific PID from `ps` output is OK

## 🚫 NEVER run long commands without streaming output
- No long-running python scripts or batch jobs that sit idle with zero output
- If a script takes more than a few seconds, it MUST print progress lines
- If it can't print progress, break the work into smaller chunks with individual calls
- The user will abort if a command sits silent for >5 seconds with no visible progress

## 🚫 NEVER block yourself with a long command
- Always stay available to respond to the user
- Use tmux sessions for any task that takes more than a few seconds
- Never run a blocking command that keeps you from replying

## 🚫 NEVER save anything to /tmp
- /tmp is volatile — Linux clears it on every reboot
- Lost the M3U playlist file because of this
- Always save files in the project directory (e.g. /mnt/storage/iptv-player/) or in /home/f/
- Exception: log output redirects to /tmp/opencode/ (pre-created, persistent)

## ⚠️ REGRESSION PROBLEM — DO NOT REVERT PRIOR FIXES
- Every change or push has been accidentally reverting previous fixes by 2-3 versions back
- Vokabeln dedup was lost multiple times due to this
- Root cause suspected: edits inadvertently overwrite/rollback prior changes when git operations are involved
- **RULE**: Before ANY change, read this file. After ANY change, verify previous fixes are still intact.
- **RULE**: Never push without first checking `git diff` and `git status` to confirm only intended changes.
- **RULE**: If the app has a running ingest pipeline, check if it re-inserts data on restart (start.sh).

## 🔐 Credentials
- **sudo password**: `.` (dot / period)
- **10.42.0.15 SSH**: User `f`, password `.` (same as sudo)
- PostgreSQL user `f`, no password (peer auth via /var/run/postgresql)
  - `db` database: research project (gold_v2, events_unified, phone_intel, imss_cotizadas)
  - `deutsch` database: Deutsch Lern App

## 📦 Servers
- **10.42.0.15**: Secondary server (same password). Has its own /home/f/deutsch-app copy.
- **/mnt/storage**: Secondary local disk (475G xfs). Contains `PERSONAL_PROJECT_OPENCODE_DO_NOT_TOUCH` directory — DO NOT TOUCH.
  - Voice project at `/mnt/storage/data/voice_samples/` (marked as failure by user)
  - Audio samples at `/mnt/storage/data/verb_audio/`, `/mnt/storage/data/tangram3_audio/`

## 🎯 Current State (as of Wed May 27 2026)

### vocabulario (deutsch DB)
- **10,995 rows**, **6,356 unique words** (words appear across multiple coursebooks/pages = expected)
- 76 exact row-level duplicates removed (same palabra + source_file + seite + lektion)
- 1,604 words appear in multiple source files/pages — this is NORMAL, NOT bugs
- Columns: id, palabra, traduccion, english, french, wortart, artikel, plural, kontext, lektion, seite, source_file, audio_url, ejemplo, embedding

### german_verbs (deutsch DB)
- 2,897 verbs with EN/ES/FR + full conjugations

### raw_data (deutsch DB)
- 65,725+ rows from OCR + AI annotation JSONs

### ejercicios (deutsch DB)
- Contains fill-in-the-blank exercises by curso_id
- Columns: id, unidades_id, curso_id, numero, pagina, tipo, titulo, texto, instrucciones, audio_track, audio_path, embedding
- curso_id=18: 26 Mistral-generated phrase exercises

### db database (research project)
- events_unified: 11,796 rows
- gold_v2: 7,447 rows (rebuilt from events_unified, 83 web rows unmatched vs original gold)
- gold: 7,530 rows (original, preserved for comparison)
- phone_intel: 7 records
- imss_cotizadas: hand-ingested IMSS data

### Roulette tracker
- `/home/f/.roulette.db` — SQLite, 87 spins recorded, table `spins`

### System
- **GPU**: NVIDIA GeForce RTX 3050 Laptop GPU, driver 580.142, CUDA 13.0
- **CUDA toolkit**: /usr/local/cuda-13.1/ and /usr/local/cuda-13/ both installed
- **Miniconda3**: /home/f/miniconda3/, Python 3.13.13
- **PyTorch**: NOT installed in conda or system pip (needs install for CUDA work)
- **nvcc**: Available via CUDA toolkit

## 🚨 CRITICAL GPU RULES — NEVER VIOLATE

### Whisper Transcription (ASR)
- **NEVER run Whisper on CPU** — it will be 10-50x slower and may timeout
- **MUST use GPU**: `device="cuda:0"` and `torch_dtype=torch.float16`
- **Model**: Use `openai/whisper-large-v3` for best German transcription quality
- **Language**: Always set `generate_kwargs={"language": "german"}` for German audio
- **Chunking**: Use `chunk_length_s=30, batch_size=16` for long audio files
- **Verification**: Before running, check GPU is available: `torch.cuda.is_available()` must return `True`
- **If GPU not available**: STOP and alert user, do NOT fall back to CPU

### OCR (Optical Character Recognition)
- **NEVER run OCR on CPU** for production/high-quality work
- **MUST use GPU-accelerated OCR**: EasyOCR with `gpu=True` or Tesseract with GPU support
- **Quality**: Use 300 DPI minimum, prefer 600 DPI for scanned documents
- **Language**: Always specify `deu` (German) for German text
- **Verification**: Check GPU availability before starting OCR pipeline
- **If GPU not available**: STOP and alert user, do NOT run CPU-only OCR for large batches

### General GPU Rules
- **Always verify GPU before heavy ML tasks**: `nvidia-smi` or `torch.cuda.is_available()`
- **Monitor GPU memory**: Use `torch.cuda.memory_allocated()` to avoid OOM
- **Batch processing**: Use batching to maximize GPU utilization
- **Mixed precision**: Use `torch.float16` or `torch.bfloat16` when possible for speed

---

# Deutsch App — Structure

```
/home/f/deutsch-app/
├── app/           → Unified frontend (Vite + React 19 + TS + Tailwind v4)
│   ├── src/       → Components, hooks, types
│   ├── public/    → Static assets (verben.csv)
│   ├── server/    → Express API server (optional, separate from backend/)
│   ├── dist/      → Build output (served by backend/server.js)
│   ├── package.json, vite.config.ts
│   └── pnpm-lock.yaml
├── backend/       → API server (Express + PostgreSQL, port 3456)
│   └── server.js  → Main server (was server2.js)
├── scripts/       → Processing scripts and tooling
│   ├── python/    → pipeline/, processing/, rag/, audio/
│   ├── shell/     → start.sh, ai_runner.sh, etc.
│   ├── node/      → batch_ingest.js, etc.
│   └── docs/      → Original READMEs
├── data/          → CSV/Excel data files, deutsch DB dump
├── de/            → Course materials (Lagune, Tangram, Menschen, etc.)
├── pages/         → Rendered page PNGs (pdftoppm cache)
└── archive/       → Old repos and backups (jekyll, nextjs, figma, etc.)
```

## Key Commands

```bash
./scripts/shell/start.sh           # Start backend + frontend
cd app && npx vite build           # Build frontend
cd backend && node server.js       # Start API server only (no auto-ingest on start)
```

- Backend `FRONTEND_DIR` = `/home/f/deutsch-app/app/dist`
- Courses dir = `/home/f/deutsch-app/de`
- PostgreSQL user `f`, db `deutsch`
- Desktop launcher: `python3 /home/f/deutsch-app/launcher.py` or click "Deutsch Lern App" in app menu
- App icon: `app/public/icons/icon-256.png`

## Database State (deutsch)

```
deutsch (PostgreSQL @ /var/run/postgresql)
├── raw_data           → 65,725 rows (OCR + AI annotation JSONs)
├── materials_registry → 10,232 pages across 59 books
├── vocabulario        → 10,995 rows, 6,356 unique words (dedup applied 2026-05-18)
├── german_verbs       → 2,897 verbs with EN/ES/FR + conjugations
├── audio_index        → 7,448 audio tracks
├── cursos/themenkreise/lerneinheiten → Course structure
└── user_progress      → Progress tracking
```

To re-ingest (CAUTION: re-ingesting will re-add all words from annotation JSONs, creating duplicates):
```bash
cd backend && node ../scripts/node/ingest_db.js
```

## Delivery Checklist

- [x] Folder structure reorganized (app/, scripts/, data/, archive/)
- [x] Server renamed to server.js (cleaned)
- [x] VerbCard: EN/ES/FR + all past forms (Präsens, Präteritum, Perfekt, KII, Imperativ)
- [x] VocabularyCard: EN/ES/FR labels, plural, audio, context
- [x] DB ingestion: 10,251 vocabulary + 2,897 verbs ingested from annotation JSONs
- [x] API serves from DB instead of parsing files on each request
- [x] Desktop launcher (tkinter GUI) with Start/Stop/Open Browser
- [x] Desktop icon in app menu + desktop
- [x] Build succeeds (npx vite build)
- [x] VerbCardFlip game created (10-round verb→English card flip)
- [x] VerbConjugator: Präsens/Präteritum/Perfekt/Phrase modes
- [x] PDFViewer: multi-CDN worker fallback, image fallback, download fallback
- [x] Delfin PDF OCR fix (pdftoppm + tesseract-deu for scanned images)
- [x] Delfin audio renamed (185 tracks → `Delfin_DelphinX_Y_CDN_TNN.mp3`)
- [x] 50 Mistral pedagogical recommendations saved
- [x] Backend error handlers added (uncaughtException, unhandledRejection)
- [x] `/api/phrases/random` endpoint fixed (texto/instrucciones not pregunta/respuesta)

## Pending

- [ ] Delfin Arbeitsbuch PDF processing (504 pages) — **OCR in progress** (page ~270/504 as of 13:13)
- [ ] Delfin AI analysis re-run with mistral:latest — will run automatically after OCR via process_arbeitsbuch.sh
- [x] Audio rename for non-Delfin books — **5,388/5,870 renamed** (92%), 464 Tangram_1 files skipped (permission denied in read-only dir)
  - Lagune 1-3, Tangram 2-3, Schritte Int 1, Schritte Plus Neu A1.1-B1.2, B2, B1-Plus, Varied_Books → all renamed
  - Naming: `{Book}_{Source}_CD{N}_T{NN}_{Desc}.mp3`
- [x] German Case Practice component (cases endpoint + frontend UI)
- [x] Preposition Drills component (20 drills for in/auf/mit/nach/zu/aus/bei...)
- [x] Frontend build regenerated (vite build OK)

## Answer Key / Lösungen Locations

### Processed (in `dokument_segmente` with `typ = 'Loesung'`)
| Book | Count | Source |
|---|---|---|
| Schritte Plus Neu A1.1 | 141 | Lehrerhandbuch |
| Schritte plus neu A2.1 | 27 | answers/ folder (53 pages) |
| Schritte plus neu A1.2 | 23 | Answers/ folder (44 pages) |
| Schritte plus neu B1.1 | 20 | Lehrerhandbuch |
| Schritte plus neu B1.2 | 19 | lehrerhandbuch-B1-2 |
| Tangram/Lagune (various) | 1-5 each | Lehrerhandbücher, Übungshefte |

### Unprocessed Answer Key Files on Disk
- `/home/f/deutsch-app/de/delfin/answers.pdf` (14 MB) — **NEEDS: registry + OCR + AI + ingestion**
- `/home/f/deutsch-app/de/Schritte plus neu A1.2/Answers/` — already done
- `/home/f/deutsch-app/de/Schritte plus neu A2.1/answers/` — already done

### Books WITHOUT Lösungen (gap to fill)
- B2 HauptKurs (160 pages)
- B2 EM_Neu_AB (152 pages)
- B1-Plus Kursbuch (128 pages)
- B1-Plus Arbeitsbuch (136 pages)
- Delfin Lehrbuch (259 pages)

## Audio Tracking Status
- **audio_index**: 5,870 tracks across 16 books
- **page_audio_refs**: 4,073 entries (many books have 0 refs — see README-AUDIO-ANSWERS.md)
- **Key gap**: Delfin (518 tracks, 0 refs), Schritte books (few refs), Tangram (0 refs)
- **Patterns vary by book**: See backend/README-AUDIO-ANSWERS.md for per-book regex patterns

## Speech Recognition Fix (Jun 2026)
- Now uses `SpeechRecognition || webkitSpeechRecognition || mozSpeechRecognition`
- Requests mic permission explicitly via `navigator.mediaDevices.getUserMedia()` first
- Brave requires shields to be down; Firefox has no Web Speech API support
- Files: SpeakingView.tsx:40-72, WritingView.tsx:68-86

## Sidebar Scroll Fix (Jun 2026)
- ScrollArea now has `showScrollbar={true}` prop that forces scrollbar always visible
- Also fixed pre-existing JSX tag mismatch (motion.div vs div) in LessonsView.tsx

## Key Docs
- `backend/README-AUDIO-ANSWERS.md` — Full audio tracking + answer key reference
