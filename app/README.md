# Deutsch Lern App — Frontend

React 19 + TypeScript + Tailwind CSS v4 + Vite frontend for the Deutsch learning platform.

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript, Tailwind CSS v4 |
| Build | Vite 6 |
| Charts | Recharts |
| Animations | Motion (framer-motion) |
| UI Components | Radix UI primitives + shadcn/ui |
| Audio | HTML5 Audio API |
| PDF | react-pdf (pdfjs-dist) |
| Backend | Express (port 3456), PostgreSQL |
| DnD | react-dnd |

## Structure

```
app/
├── src/
│   ├── app/
│   │   ├── App.tsx                   # Main app shell with routing
│   │   └── components/
│   │       ├── VocabularyCard.tsx     # Flip-card with wortart-colored borders
│   │       ├── VerbCard.tsx           # Verb conjugation card with pronoun-colored rows
│   │       ├── GlassCard.tsx          # Glassmorphism card wrapper
│   │       ├── AudioPlayer.tsx        # Full audio player with controls
│   │       ├── PDFViewer.tsx          # PDF page viewer with zoom
│   │       ├── DashboardStats.tsx     # Dashboard metrics
│   │       ├── DialogTrainer.tsx      # Conversation practice
│   │       ├── GrammarQuest.tsx       # Grammar quiz game
│   │       ├── Satzbau.tsx            # Sentence builder game
│   │       ├── VerbConjugator.tsx     # Verb conjugation tool
│   │       ├── WordCastle.tsx         # Vocabulary game
│   │       ├── Wortsuche.tsx          # Word search game
│   │       └── ui/                    # shadcn/ui components
│   ├── lib/
│   │   ├── api.ts                     # API client
│   │   └── utils.ts                   # cn() utility
│   └── main.tsx                       # Entry point
├── public/
│   ├── icons/
│   └── verben.csv
├── server/                            # Express API server
│   └── index.js
├── dist/                              # Build output
├── package.json
└── vite.config.ts
```

## Quick Start

```bash
# Install
pnpm install

# Dev (frontend only, needs backend on 3456)
pnpm dev

# Build
pnpm build
```

## Backend API

The backend runs on **port 3456** (Express + PostgreSQL `deutsch` db):

- `GET /api/books` — List all course books
- `GET /api/books/:id/lessons` — PDFs & annotations
- `GET /api/books/:id/vocabulary` — Vocabulary list (10k+ words)
- `GET /api/books/:id/audio` — Audio track index
- `GET /api/verbs` — 2.8k verbs with full conjugations
- `GET /api/rag/query` — AI chat (POST)

## Key Features

- **Dashboard** — Stats, weekly engagement chart, skill radar, flashcard spintrix
- **Vocabulary** — 3D flip cards with color-coded wortart (green=Substantiv, blue=Verb, orange=Adjektiv, etc.)
- **Verbs** — Conjugation cards with pronoun-colored rows, EN/ES pills
- **Audio** — Full player with speed control, CD grouping
- **PDF Viewer** — Page navigation, sidebar with per-page vocab/audio/transcripts
- **Games** — Satzbau, GrammarQuest, Wortsuche, WordCastle, DialogTrainer
- **AI Chat** — RAG-powered assistant over course material
- **Dark Mode** — next-themes with system/light/dark toggle

## Build & Deploy

```bash
pnpm build          # outputs to dist/
cd ../backend
node server.js      # serves dist/ + API on port 3456
```

The desktop launcher (`python3 launcher.py`) starts both backend and frontend.
