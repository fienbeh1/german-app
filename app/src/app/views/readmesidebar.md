# Sidebar — LessonsView Right-Side Panel

## Purpose
The right sidebar is the learner's primary access point for all book-related study tools. Every page of every course book displays a rich sidebar with vocabulary, audio, transcriptions, AI annotations, OCR text, dictionary, verbs, and lesson statistics — all filtered to the current page and lesson.

## Architecture

### Component
- **File**: `Views/LessonsView.tsx`
- **Rendering**: Animated via `motion.div` with `AnimatePresence`, resizable via mouse drag
- **State**: Controlled booleans in `sections` Record (`useState`) for collapsible panels
- **Resize**: `sidebarWidth` state (`380` default), `isDragging` for mouse resize handler

### Data Source (`pageDetail`)
Fetched from `GET /api/page/detail?book=<book_id>&page=<page_num>` — response shape:

```ts
interface PageDetail {
  jpg_path: string | null        // page image
  pdf_path: string | null        // source PDF
  txt_path: string | null        // OCR text file on disk
  ai_path: string | null         // AI annotation file on disk
  txt_content: string | null     // OCR text content (read from txt_path)
  ai_content: string | null      // AI annotation content (read from ai_path)
  vocabulary: VocabEntry[]       // vocabulario rows for this page+book
  audio_tracks: AudioTrack[]     // all audio tracks for this book
  audio_refs: AudioRef[]         // audio refs specific to this page
  transkriptionen: Transkription[] // dokument_segmente of type Transkription
  loesungen: Loesung[]           // dokument_segmente of type Loesung
}
```

### Fetch Trigger
```tsx
useEffect(() => {
  if (!selectedBook || !bookPages.length) return
  const page = bookPages[currentPageIdx]
  if (!page) return
  fetch(`${API_URL}/api/page/detail?book=...&page=${page.page}`)
    .then(r => r.json()).then(data => setPageDetail(data))
}, [selectedBook?.id, currentPageIdx, bookPages])
```

## Sidebar Sections (top to bottom)

### 1. Audio Player (`currentlyPlaying`)
- **Collapsible**: Yes (toggle with section)
- **Data**: Single active track selected from `audio_tracks` via `audio_refs`
- **Features**:
  - Play / Pause toggle
  - Stop (reset to 0, stop playback)
  - Loop toggle (`loop` attribute on audio element + visual indicator)
  - Speed control (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
  - Progress bar (`<input type="range">` synced with `timeupdate` / `loadedmetadata`)
  - Current time / duration display
  - Track name + CD/Track badge
- **Transcription** (expandable within player):
  - German text (`transcription_content`)
  - English translation (`translation_content`)
  - Layout matches `AudioView.tsx` pattern

### 2. TXT Content (OCR Text) — `pageDetail.txt_content`
- **Collapsible**: Yes
- **Purpose**: Shows raw OCR text extracted from the page scan, useful for copy-pasting and full-text search
- **Empty state**: Hidden if `txt_content` is null
- **Display**: Pre-wrapped text in `text-xs`, scrollable area

### 3. AI Content (Annotations) — `pageDetail.ai_content`
- **Collapsible**: Yes
- **Purpose**: Shows AI-generated annotations / analysis for the page
- **Empty state**: Hidden if `ai_content` is null
- **Display**: Same as TXT content

### 4. Quick Dictionary
- **Collapsible**: Yes
- **Purpose**: In-page word lookup (calls `GET /api/dictionary/search?q=<word>`)
- **Features**:
  - Small text input with search button
  - Results below: word type, translations (ES/EN/FR), examples
- **Empty state**: "Gib ein Wort ein, um es nachzuschlagen"

### 5. Quick Verbs
- **Collapsible**: Yes
- **Purpose**: Quick verb search within the sidebar (calls `GET /api/verbs/search?q=<verb>`)
- **Features**:
  - Search input
  - Results show `VerbCard`-style: infinitive, präsens, präteritum, perfekt, english/spanish/french
- **Empty state**: "Gib ein Verb ein"

### 6. Audio References (`pageDetail.audio_refs`)
- **Collapsible**: Yes (key: `audio`)
- **Purpose**: Audio tracks linked to this specific page
- **Features**:
  - CD / Track badges
  - Play button → sets `currentlyPlaying` and opens player section
  - Exercise text shown if available
  - Track count badge in header

### 7. Lesson Statistics (`lessonStats`)
- **Collapsible**: Yes (key: `lessonStats`)
- **Data**: from `api.getLessonStats()`
- **Display**: List of lessons with word counts, current lesson highlighted

### 8. Lesson Vocabulary (`lessonVocab`)
- **Collapsible**: Yes (key: `lessonVocab`)
- **Data**: from `api.getFilteredVocabulary(bookId, { lektion })`
- **Display**: Word list with article, translations (ES/EN), level badge, page badge
- **Filtered by**: `currentLektion` (computed from `lektionen.find` by page range)

### 9. Page Vocabulary (`vocab`)
- **Collapsible**: Yes (key: `vocab`)
- **Data**: from `pageDetail.vocabulary`
- **Display**: Word list with article + ES translation + level badge

### 10. Transcriptions (`transkription`)
- **Collapsible**: Yes (key: `transkription`)
- **Data**: from `pageDetail.transkriptionen`
- **Display**: Text content per fragment

### 11. Lösungen / Answers (`loesungen`)
- **Collapsible**: Yes (key: `loesungen`)
- **Data**: from `pageDetail.loesungen`
- **Display**: Green-tinted text cards

### 12. KI Analyse / Full Transcription (`ki`)
- **Collapsible**: Yes (key: `ki`)
- **Data**: `audio_tracks` with `transcription_content` from page detail
- **Display**: German text + English translation per track, matches AudioView style

## State
```tsx
const [sections, setSections] = useState({
  lessonVocab: true,   vocab: true,   audio: true,
  transkription: false, loesungen: false, hoerordner: false,
  ocr: false,          ki: false,     transkription_full: false,
  lessonStats: false,  txtContent: false, aiContent: false,
  dictionary: false,   verbs: false,
})
const toggleSection = (key: string) => setSections(prev => ({...prev, [key]: !prev[key]}))
const isOpen = (key: string) => sections[key] ?? false
```

## Audio Player State (inline in LessonsView)
```tsx
const audioRef = useRef<HTMLAudioElement>(null)
const [playingTrack, setPlayingTrack] = useState<any>(null)
const [isPlaying, setIsPlaying] = useState(false)
const [loop, setLoop] = useState(false)
const [speed, setSpeed] = useState(1)
const [currentTime, setCurrentTime] = useState(0)
const [duration, setDuration] = useState(0)
const [showPlayerTranscription, setShowPlayerTranscription] = useState(false)
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
```
