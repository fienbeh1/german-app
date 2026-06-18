# Audio Tracking & Answer Keys System

## Audio Architecture

### Tables
- **`audio_index`**: 5,870+ tracks across 16 books. Columns: book_name, cd_num, track_num, file_path, transcription_path, translation_path
- **`page_audio_refs`**: 4,073+ entries linking pages to CD tracks. Columns: book_name, page_num, cd_num, track_num, exercise_text
- **`materials_registry`**: 10,232 pages across 59 books. Each page has txt_path (OCR), ai_path, pdf_path, jpg_path

### How Audio Gets to the Sidebar
1. `/api/page/detail?book=X&page=N` endpoint (server.js:1586)
2. Returns: `audio_tracks` (from `audio_index`) + `audio_refs` (from `page_audio_refs`)
3. `audio_tracks` matched by `book_name` (derived as `book.split('/')[0]`, e.g. `B2/HauptKurs/...` → `B2`)
4. `audio_refs` matched by exact `book_name` + `page_num`
5. Sidebar matches refs to tracks by (cd_num, track_num) pair

### Audio Track Counts by Book
| Book Name (audio_index) | Tracks | Pages w/ refs | Status |
|---|---|---|---|
| B2 | 106 | 17 (B2-Hauptkurs) | Good |
| delfin | 518 | 0 | Missing refs |
| Lagune_1 | 406 | 106 | Good |
| Lagune_2 | 324 | 81 | Good |
| Lagune_3 | 320 | 71 | Good |
| Neu-B1-Plus | 134 | 19 | Partial |
| Schritte International 1 | 322 | 2 | Missing refs |
| Schritte Plus Neu A1.1 | 564 | 8 | Missing refs |
| Schritte plus neu A1.2 | 406 | 5 | Missing refs |
| Schritte plus neu A2.1 | 714 | 7 | Missing refs |
| Schritte plus neu A2.2 | 694 | 9 | Missing refs |
| Schritte plus neu B1.1 | 314 | 8 | Missing refs |
| Schritte plus neu B1.2 | 350 | 7 | Missing refs |
| Tangram_1 | 334 | 0 | Missing refs |
| Tangram_2 | 84 | 0 | Missing refs |
| Tangram_3 | 280 | 0 | Missing refs |

### CD Reference Patterns in OCR Text (by book)
Each book uses a different format. See scripts/node/rescan_audio_refs.js for the regex patterns.

| Book | Pattern | Example | Notes |
|---|---|---|---|
| B2 Hauptkurs | `CD N\|M` | `CD 1 \|4-7` | Clean pipe-separated |
| B1-Plus Kursbuch | `CD N\|M` | `CD 1\|8-11` | Pipe, optional space |
| Schritte Plus Neu A1.1 | `N)M` / `N M` | `1)1-8` / `1 13-14C1` | Leading digit = Lektion, not CD |
| Schritte International 1 | `CDNNN` | `CD212` = CD2 T12 | Concatenated 3-digit |
| Tangram | Implicit only | No CD refs in OCR | Can't auto-detect |
| Delfin | Metadata only | `2 CDs im Buch!` | OCR too corrupted |

### Rescan Script
```
NODE_PATH=/home/f/deutsch-app/backend/node_modules node scripts/node/rescan_audio_refs.js
```
- Scans ALL book OCR txt files for CD patterns
- Inserts missing entries into `page_audio_refs` (uses ON CONFLICT DO NOTHING)
- Also updates B2 transcription paths

### Duplicate audio_index entries (known issue)
The `/api/page/detail` query uses `WHERE book_name = $1 OR book_name ILIKE $2` which can match rows with `book_name = 'B2'` AND `book_name LIKE '%B2%'`, causing duplicates. The sidebar should deduplicate by `audio_track.id`.

---

## Answer Keys / Lösungen

### In Database (`dokument_segmente WHERE typ = 'Loesung'`)
255 total entries as of last check.

| Book | Count | Source |
|---|---|---|
| Schritte Plus Neu A1.1 | 141 | Lehrerhandbuch |
| Schritte plus neu A2.1 | 27 | answers folder |
| Schritte plus neu A1.2 | 23 | Answers folder |
| Schritte plus neu B1.1 | 20 | Lehrerhandbuch |
| Schritte plus neu B1.2 | 19 | lehrerhandbuch |
| Tangram 1-3 (various) | 1-5 each | Lehrerhandbücher, Übungshefte |
| Lagune 2-3 | 1-2 each | Kursbuch |

### Answer Key Files on Disk (NOT in database)

| File | Size | Status |
|---|---|---|
| `/home/f/deutsch-app/de/delfin/answers.pdf` | 14 MB | **UNPROCESSED** — needs OCR + ingestion |
| `/home/f/deutsch-app/de/Schritte plus neu A1.2/Answers/` | 44 pages | Fully processed |
| `/home/f/deutsch-app/de/Schritte plus neu A2.1/answers/` | 53 pages | Fully processed |

### All Lehrerhandbücher (fully processed into registry + dokument_segmente)
- Lagune_1/Lagune 1/1Lehrerhandbuch (228 pages)
- Lagune_2/Lagune 2/Lehrerhandbuch_Lagune2 (209 pages)
- Lagune_3/Lagune 3/Lehrerhandbuch (209 pages)
- Schritte International 1/Schritte_1_Lehrerhandbuch (153 pages)
- Schritte Plus Neu A1.1/Lehrerhandbuch (286 pages)
- Schritte plus neu B1.1/Lehrerhandbuch (82 pages)
- Schritte plus neu B1.2/lehrerhandbuch-B1-2 (65 pages)
- Tangram_1/Tangram Aktuell 1/Lehrerhandbuch 1-4 (108 pages)
- Tangram_1/Tangram Aktuell 1/Lehrerhandbuch 5-8 (110 pages)
- Tangram_2/Tangram Aktuell 2/Lehrerhandbuch 1-4 (100 pages)
- Tangram_2/Tangram Aktuell 2/Lehrerhandbuch 5-8 (96 pages)
- Tangram_3/Tangram Aktuell 3/Lehrerhandbuch 1-4 (93 pages)
- Tangram_3/Tangram Aktuell 3/Lehrerhandbuch 5-8 (96 pages)

### Books Missing Lösungen
- B2/EM_Neu_AB (152 pages — has a Lösungen section?)
- B2/HauptKurs (160 pages)
- Neu-B1-Plus/B1-plus-Arbeitsbuch (136 pages)
- Neu-B1-Plus/B1-plus-Kursbuch (128 pages)
- delfin/Delfin_Lehrbuch (259 pages)
- Varied_Books (all ~1,400 pages combined)

### How Solutions Are Served
- `/api/page/detail` returns `loesungen` array from `dokument_segmente WHERE typ = 'Loesung' AND book_name = $1 AND seite_von <= $page AND seite_bis >= $page`
- Sidebar shows them in a collapsible "Lösungen" section (CheckCircle2 icon)
- API endpoint: `GET /api/books/:bookId/loesungen`
- Frontend: `api.ts` → `getLoesungen()`

---

## Speech Recognition (Browser Support)

| Browser | Web Speech API | Status | Notes |
|---|---|---|---|
| Chrome | ✅ webkitSpeechRecognition | Works | |
| Edge | ✅ webkitSpeechRecognition | Works | |
| Brave | ✅ webkitSpeechRecognition | Works* | Requires mic permission + may need shields down |
| Firefox | ❌ No support | Fails | Need server-side Whisper fallback |
| Opera | ✅ webkitSpeechRecognition | Works | |
| Safari | ✅ webkitSpeechRecognition | Works | |

\* Brave: If shields are up, SpeechRecognition may fail silently. `navigator.mediaDevices.getUserMedia()` must resolve first.

### Speech Fix Applied (Jun 2026)
- Checks for `SpeechRecognition` (standard) then `webkitSpeechRecognition` then `mozSpeechRecognition`
- Requests `navigator.mediaDevices.getUserMedia({ audio: true })` BEFORE starting recognition
- Logs errors to console for debugging
- Error messages tell user which browsers work

---

## Sidebar Architecture

File: `/home/f/deutsch-app/app/src/app/views/LessonsView.tsx`

### Collapsible Sections
State managed by `sections` Record in useState with keys:
- `player`, `vocab`, `audio`, `ocr`, `ki`, `transkription`, `loesungen`, `lessonStats`, `hoerordner`

### Scroll Issue (Fixed Jun 2026)
- ScrollArea uses Radix ScrollArea which hides scrollbar by default
- Fixed: Added `showScrollbar` prop to ScrollArea component
- Sidebar passes `showScrollbar={true}` so scrollbar is always visible
- Also fixed pre-existing bug: `</motion.div>` was incorrectly used where `</div>` was needed
