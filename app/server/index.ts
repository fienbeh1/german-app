import express from 'express';
import cors from 'cors';
import { join, extname } from 'path';
import { promises as fs, existsSync, statSync, readdirSync } from 'fs';

const app = express();
const PORT = 3001;
const BASE_DIR = process.env.DEUTSCH_APP_DIR || '/home/f/deutsch-app/de';

app.use(cors());
app.use(express.json());

const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.wma']);
const VIDEO_EXT = new Set(['.mp4', '.avi', '.mkv', '.mov', '.webm']);

interface Book {
  id: string; name: string; path: string;
  pdfCount: number; annotationCount: number; aiCount: number;
  audioFileCount: number; videoFileCount: number;
  hasAnnotations: boolean; hasAI: boolean;
}

function findMediaFiles(dir: string, exts: Set<string>, maxDepth = 5): string[] {
  const results: string[] = [];
  function walk(d: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const fp = join(d, entry.name);
        if (entry.isDirectory()) walk(fp, depth + 1);
        else if (exts.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase())) results.push(fp);
      }
    } catch {}
  }
  walk(dir, 0);
  return results;
}

function stripOcrSuffix(name: string): string {
  return name.replace(/_ocr_%%\.(txt|json)$/, '');
}

app.use('/pdfs', express.static(BASE_DIR, {
  setHeaders: (res, path) => {
    if (path.endsWith('.pdf')) res.set('Content-Type', 'application/pdf');
    if (path.endsWith('.mp3')) res.set('Content-Type', 'audio/mpeg');
    if (path.endsWith('.mp4')) res.set('Content-Type', 'video/mp4');
  }
}));

app.get('/api/books', async (req, res) => {
  try {
    const books: Book[] = [];
    const dirs = await fs.readdir(BASE_DIR);
    for (const dir of dirs) {
      const bookPath = join(BASE_DIR, dir);
      const stat = await fs.stat(bookPath);
      if (stat.isDirectory()) {
        const subDirs = await findBooksRecursive(bookPath, dir);
        books.push(...subDirs);
      }
    }
    res.json(books);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/lessons', async (req, res) => {
  try {
    const { bookId } = req.params;
    const bookPath = join(BASE_DIR, bookId);
    if (!existsSync(bookPath)) return res.status(404).json({ error: 'Book not found' });

    const pdfDir = join(bookPath, 'pdf');
    const annotationsDir = join(bookPath, 'txt', 'annotations');
    const aiDir = join(bookPath, 'ai');
    const txtDir = join(bookPath, 'txt');

    const pdfs: string[] = [];
    if (existsSync(pdfDir)) {
      const files = await fs.readdir(pdfDir);
      for (const f of files.filter(f => f.endsWith('.pdf')).sort()) {
        pdfs.push({ name: f, path: `/pdfs/${bookId}/pdf/${f}`, page: stripOcrSuffix(f.replace('.pdf', '')) });
      }
    }

    const annotations: any[] = [];
    if (existsSync(annotationsDir)) {
      const files = await fs.readdir(annotationsDir);
      for (const f of files.filter(f => f.endsWith('.json')).sort()) {
        try {
          const data = JSON.parse(await fs.readFile(join(annotationsDir, f), 'utf-8'));
          annotations.push({
            file: f,
            page: stripOcrSuffix(f.replace('.json', '')),
            struktur: data.struktur || {},
            inhaltstyp: data.inhaltstyp || [],
            thema: data.thema || null,
            audioCount: (data.audio || []).length,
            vocabCount: (data.vokabular || []).length,
          });
        } catch {}
      }
    }

    const aiFiles: string[] = [];
    if (existsSync(aiDir)) {
      for (const f of (await fs.readdir(aiDir)).filter(f => f.endsWith('.txt')).sort()) {
        aiFiles.push({ file: f, page: stripOcrSuffix(f.replace(/^AI_/, '').replace('.txt', '')) });
      }
    }

    const txtFiles: string[] = [];
    if (existsSync(txtDir)) {
      for (const f of (await fs.readdir(txtDir)).filter(f => f.endsWith('.txt') && !f.startsWith('AI_')).sort()) {
        txtFiles.push({ file: f, page: stripOcrSuffix(f.replace('.txt', '')) });
      }
    }

    res.json({ id: bookId, name: bookId.split('/').pop() || bookId, pdfs, annotations, aiFiles, txtFiles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/annotations/:page', async (req, res) => {
  try {
    const { bookId, page } = req.params;
    const dirsToTry = [
      join(BASE_DIR, bookId, 'txt', 'annotations'),
    ];
    for (const annDir of dirsToTry) {
      if (!existsSync(annDir)) continue;
      const files = await fs.readdir(annDir);
      const match = files.find(f => f.startsWith(page) && f.endsWith('.json'));
      if (match) {
        const data = JSON.parse(await fs.readFile(join(annDir, match), 'utf-8'));
        return res.json(data);
      }
    }
    res.status(404).json({ error: 'Annotation not found' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/ai/:page', async (req, res) => {
  try {
    const { bookId, page } = req.params;
    const aiDir = join(BASE_DIR, bookId, 'ai');
    if (!existsSync(aiDir)) return res.status(404).json({ error: 'No AI content' });
    const files = await fs.readdir(aiDir);
    const match = files.find(f => f.includes(page) && f.endsWith('.txt'));
    if (!match) return res.status(404).json({ error: 'AI content not found' });
    const content = await fs.readFile(join(aiDir, match), 'utf-8');
    res.json({ file: match, content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/txt/:page', async (req, res) => {
  try {
    const { bookId, page } = req.params;
    const txtDir = join(BASE_DIR, bookId, 'txt');
    if (!existsSync(txtDir)) return res.status(404).json({ error: 'No txt content' });
    const files = await fs.readdir(txtDir);
    const match = files.find(f => f.startsWith(page) && f.endsWith('.txt') && !f.startsWith('AI_'));
    if (!match) return res.status(404).json({ error: 'Txt not found' });
    const content = await fs.readFile(join(txtDir, match), 'utf-8');
    res.json({ file: match, content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/vocabulary', async (req, res) => {
  try {
    const { bookId } = req.params;
    const annotationsDir = join(BASE_DIR, bookId, 'txt', 'annotations');
    if (!existsSync(annotationsDir)) return res.json({ vocabulary: [] });

    const jsonFiles = (await fs.readdir(annotationsDir)).filter(f => f.endsWith('.json'));
    const allVocabulary: any[] = [];

    for (const file of jsonFiles) {
      try {
        const data = JSON.parse(await fs.readFile(join(annotationsDir, file), 'utf-8'));
        if (data.vokabular && Array.isArray(data.vokabular)) {
          for (const v of data.vokabular) {
            allVocabulary.push({ ...v, source: file, lektion: data.struktur?.lektion, seite: data.struktur?.seite });
          }
        }
      } catch {}
    }
    res.json({ vocabulary: allVocabulary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/audio', async (req, res) => {
  try {
    const { bookId } = req.params;
    const annotationsDir = join(BASE_DIR, bookId, 'txt', 'annotations');
    const allAudio: any[] = [];

    if (existsSync(annotationsDir)) {
      const jsonFiles = (await fs.readdir(annotationsDir)).filter(f => f.endsWith('.json'));
      for (const file of jsonFiles) {
        try {
          const data = JSON.parse(await fs.readFile(join(annotationsDir, file), 'utf-8'));
          if (data.audio && Array.isArray(data.audio)) {
            for (const a of data.audio) {
              allAudio.push({ ...a, source: file, lektion: data.struktur?.lektion, seite: data.struktur?.seite });
            }
          }
        } catch {}
      }
    }
    res.json({ audio: allAudio });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/audio-files', async (req, res) => {
  try {
    const { bookId } = req.params;
    const bookPath = join(BASE_DIR, bookId);
    if (!existsSync(bookPath)) return res.json({ audioFiles: [] });

    // Prefer the normalized Audio/ directory + index
    const audioDir = join(bookPath, 'Audio');
    const indexFile = join(audioDir, 'audio_index.json');

    if (existsSync(indexFile)) {
      const index = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
      const mapped = (index.files || []).map((f: any) => ({
        name: f.new_name,
        path: `/audio/${bookId}/Audio/${f.new_name}`,
        cd: f.cd,
        track: f.track,
        lesson: f.new_name.match(/[Ll](\d+)/)?.[1] || null,
        description: f.description,
        original: f.original_filename,
      }));
      return res.json({ audioFiles: mapped, source: 'index' });
    }

    // Fallback: scan filesystem
    const audioFiles = findMediaFiles(bookPath, AUDIO_EXT);
    const mapped = audioFiles.map(fp => {
      const rel = fp.replace(BASE_DIR, '');
      const name = fp.split('/').pop() || '';
      const lesson = (name.match(/[Ll](\d+)/) || [])[1] || null;
      return { name, path: `/audio${rel}`, lesson, size: statSync(fp).size };
    });
    res.json({ audioFiles: mapped, source: 'scan' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books/:bookId(*)/video-files', async (req, res) => {
  try {
    const { bookId } = req.params;
    const bookPath = join(BASE_DIR, bookId);
    if (!existsSync(bookPath)) return res.json({ videoFiles: [] });

    const videoFiles = findMediaFiles(bookPath, VIDEO_EXT);
    const mapped = videoFiles.map(fp => {
      const rel = fp.replace(BASE_DIR, '');
      const name = fp.split('/').pop() || '';
      const lesson = (name.match(/[Ll](\d+)/) || [])[1] || null;
      return { name, path: `/video${rel}`, lesson, size: statSync(fp).size };
    });
    res.json({ videoFiles: mapped });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/audio', express.static(BASE_DIR));
app.use('/video', express.static(BASE_DIR));

async function findBooksRecursive(dirPath: string, relativePath: string): Promise<Book[]> {
  const books: Book[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const hasTxt = entries.some(e => e.isDirectory() && e.name === 'txt');

    if (hasTxt) {
      const pdfDir = join(dirPath, 'pdf');
      const annotationsDir = join(dirPath, 'txt', 'annotations');
      const aiDir = join(dirPath, 'ai');

      let pdfCount = 0, annotationCount = 0, aiCount = 0;
      let audioFileCount = 0, videoFileCount = 0;

      if (existsSync(pdfDir)) pdfCount = (await fs.readdir(pdfDir)).filter(f => f.endsWith('.pdf')).length;
      if (existsSync(annotationsDir)) annotationCount = (await fs.readdir(annotationsDir)).filter(f => f.endsWith('.json')).length;
      if (existsSync(aiDir)) aiCount = (await fs.readdir(aiDir)).filter(f => f.endsWith('.txt')).length;

      const audioDir = join(dirPath, 'Audio');
      if (existsSync(audioDir)) {
        const indexFile = join(audioDir, 'audio_index.json');
        if (existsSync(indexFile)) {
          const idx = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
          audioFileCount = (idx.files || []).length;
        } else {
          audioFileCount = (await fs.readdir(audioDir)).filter(f => AUDIO_EXT.has(extname(f))).length;
        }
      } else {
        audioFileCount = findMediaFiles(dirPath, AUDIO_EXT).length;
      }
      videoFileCount = findMediaFiles(dirPath, VIDEO_EXT).length;

      books.push({
        id: relativePath, name: relativePath.split('/').pop() || relativePath, path: relativePath,
        pdfCount, annotationCount, aiCount, audioFileCount, videoFileCount,
        hasAnnotations: annotationCount > 0, hasAI: aiCount > 0,
      });
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !['txt', 'pdf', 'ai', 'Audio'].includes(entry.name)) {
        const subPath = join(dirPath, entry.name);
        const subBooks = await findBooksRecursive(subPath, join(relativePath, entry.name));
        books.push(...subBooks);
      }
    }
  } catch {}
  return books;
}

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Serving files from: ${BASE_DIR}`);
});
