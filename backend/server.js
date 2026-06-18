const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const crypto = require('crypto');
process.on('uncaughtException', e => console.error('UNCAUGHT:', e.message));
process.on('unhandledRejection', e => console.error('UNHANDLED:', e));

// Load .env if present (optional — all vars have fallbacks)
try { require('dotenv').config({ path: __dirname + '/.env' }); } catch {}

const app = express();
const PORT = 3456;

const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });

// ── Paths (overridable via .env) ──────────────────────────────
const APP_ROOT      = process.env.APP_ROOT           || '/mnt/storage/deutsch-app';
const COURSES_DIR   = process.env.COURSES_DIR         || APP_ROOT + '/de';
const PAGES_DIR     = process.env.PAGES_DIR           || APP_ROOT + '/pages';
const FRONTEND_DIR  = process.env.FRONTEND_DIR        || APP_ROOT + '/app/dist';
const PIPER_PATH    = process.env.PIPER_PATH          || '/home/f/piper/piper/piper';
const PIPER_VOICES  = process.env.PIPER_VOICES_DIR    || '/home/f/piper-voices';
app.use(cors());
app.use(express.json());

// ── Auth ─────────────────────────────────────────────────────
const authPool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
  try {
    await authPool.query('INSERT INTO app_users (username, password_hash, salt) VALUES ($1, $2, $3)', [username, hash, salt]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  const r = await authPool.query('SELECT * FROM app_users WHERE username = $1', [username]);
  if (r.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
  const user = r.rows[0];
  const hash = crypto.createHash('sha256').update(password + user.salt).digest('hex');
  if (hash !== user.password_hash) return res.status(401).json({ error: 'Contraseña incorrecta' });
  res.json({ ok: true, user: { id: user.id, username: user.username } });
});
app.get('/api/auth/users', async (req, res) => {
  const r = await authPool.query('SELECT id, username, app, created_at FROM app_users ORDER BY id');
  res.json(r.rows);
});

app.use(express.static(FRONTEND_DIR));
app.use('/files', express.static(COURSES_DIR));
app.use('/audio', express.static(COURSES_DIR));
app.use('/de', express.static(COURSES_DIR));
app.use('/pages', express.static(PAGES_DIR));

function walk(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const node = { name: path.basename(dir), path: dir, type: 'folder', folders: 0, pdfs: 0, audios: 0, children: [] };
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const child = walk(full);
        if (child) { node.children.push(child); node.folders++; node.pdfs += child.pdfs; node.audios += child.audios; }
      } else if (e.isFile()) {
        const n = e.name.toLowerCase();
        if (n.endsWith('.pdf')) node.pdfs++;
        if (n.endsWith('.mp3') || n.endsWith('.m4a') || n.endsWith('.wav')) node.audios++;
      }
    }
  } catch {}
  return node;
}

function safeCourseRelativePath(input) {
  if (!input) return '';
  let decoded = '';
  try {
    decoded = decodeURIComponent(String(input));
  } catch {
    return null;
  }

  let rel = decoded;
  if (rel.startsWith(COURSES_DIR)) {
    rel = path.relative(COURSES_DIR, rel);
  }

  rel = rel.replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part.includes('\\'))) return null;
  return parts.join('/');
}

function toCourseRelativePath(inputPath) {
  if (!inputPath) return '';
  let rel = inputPath;
  if (rel.startsWith(COURSES_DIR)) {
    rel = path.relative(COURSES_DIR, rel);
  }
  rel = rel.replace(/\\/g, '/');
  return rel.split('/').filter(Boolean).join('/');
}

function readTextPreview(filePath, maxChars = 2000) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const trimmed = data.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return trimmed.slice(0, maxChars) + '\n…';
  } catch {
    return '';
  }
}

function listMediaFiles(dir) {
  const pdfs = [];
  const audios = [];
  const videos = [];
  const texts = [];
  const aiTexts = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { pdfs, audios, videos, texts, aiTexts };

  const fileEntries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile());
  for (const entry of fileEntries) {
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.pdf') pdfs.push(entry.name);
    if (['.mp3', '.m4a', '.wav', '.ogg', '.flac'].includes(ext)) audios.push(entry.name);
    if (['.mp4', '.webm', '.mov', '.m4v'].includes(ext)) videos.push(entry.name);
    if (ext === '.txt') texts.push(entry.name);
  }

  if (path.basename(dir).toLowerCase() === 'pdf') {
    const baseDir = path.dirname(dir);
    const txtDir = path.join(baseDir, 'txt');
    const aiDir = path.join(baseDir, 'ai');

    if (fs.existsSync(txtDir) && fs.statSync(txtDir).isDirectory()) {
      for (const entry of fs.readdirSync(txtDir, { withFileTypes: true })) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.txt') continue;
        const abs = path.join(txtDir, entry.name);
        texts.push({
          name: entry.name,
          path: abs,
          relPath: path.relative(COURSES_DIR, abs).replace(/\\/g, '/'),
          baseName: entry.name.replace(/\.txt$/i, ''),
          preview: readTextPreview(abs)
        });
      }
    }

    if (fs.existsSync(aiDir) && fs.statSync(aiDir).isDirectory()) {
      for (const entry of fs.readdirSync(aiDir, { withFileTypes: true })) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.txt') continue;
        const abs = path.join(aiDir, entry.name);
        aiTexts.push({
          name: entry.name,
          path: abs,
          relPath: path.relative(COURSES_DIR, abs).replace(/\\/g, '/'),
          baseName: entry.name.replace(/\.txt$/i, ''),
          preview: readTextPreview(abs)
        });
      }
    }
  } else {
    for (const entry of fileEntries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.txt') continue;
      const abs = path.join(dir, entry.name);
      texts.push({
        name: entry.name,
        path: abs,
        relPath: path.relative(COURSES_DIR, abs).replace(/\\/g, '/'),
        baseName: entry.name.replace(/\.txt$/i, ''),
        preview: readTextPreview(abs)
      });
    }
  }

  return { pdfs, audios, videos, texts, aiTexts };
}

function parseJsonObjects(raw) {
  const objs = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        const slice = raw.slice(start, i + 1);
        try {
          objs.push(JSON.parse(slice));
        } catch {}
        start = -1;
      }
    }
  }
  return objs;
}

function parseAnnotationFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const items = parseJsonObjects(raw);
    if (items.length === 0) return null;
    const merged = {
      struktur: items[0]?.struktur || {},
      inhaltstyp: items[0]?.inhaltstyp || [],
      thema: items[0]?.thema || null,
      audio: [],
      vokabular: []
    };
    for (const item of items) {
      if (Array.isArray(item?.audio)) merged.audio.push(...item.audio);
      if (Array.isArray(item?.vokabular)) merged.vokabular.push(...item.vokabular);
    }
    return merged;
  } catch {
    return null;
  }
}

function getAnnotationPageFromFile(fileName) {
  const match = fileName.match(/(\d+)(?:_ocr_%%)?\.json$/i);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function countMediaFiles(rootDir, extensions) {
  let count = 0;
  if (!fs.existsSync(rootDir)) return count;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) count += 1;
      }
    }
  }
  return count;
}

function listMediaFilesDetailed(rootDir, extensions, basePath) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          const rel = path.relative(basePath, full).replace(/\\/g, '/');
          results.push({
            name: entry.name,
            path: rel,
            size: fs.statSync(full).size
          });
        }
      }
    }
  }
  return results;
}

function normalizeCourseRelativePath(filePath) {
  if (!filePath) return '';
  let rel = filePath;
  if (path.isAbsolute(rel)) {
    rel = path.relative(COURSES_DIR, rel);
  }
  rel = rel.replace(/\\/g, '/');
  if (rel.startsWith('..')) return '';
  return rel.split('/').filter(Boolean).join('/');
}

function inferCdLabel(filePath) {
  if (!filePath) return '';
  const s = String(filePath);
  let m = s.match(/(?:CD|Disk|Disc)[ _-]?(\d+)/i);
  if (m) return String(m[1]);
  m = s.match(/CD\s+([^\/]+)/i);
  if (m) return m[1].trim();
  m = s.match(/\/(\d+)_/);
  if (m) return String(m[1]);
  return '';
}

async function getBookRecords(bookName) {
  const r = await pool.query(`
    SELECT book_name, page_num, pdf_path, txt_path, ai_path, jpg_path, has_ai, has_txt
    FROM materials_registry
    WHERE book_name = $1 AND (dead IS NULL OR dead = false)
    ORDER BY page_num
  `, [bookName]);
  return r.rows;
}

app.get('/api/library/tree', (req, res) => {
  res.json([walk(COURSES_DIR)].filter(Boolean));
});

app.get('/api/library/files', (req, res) => {
  const rel = safeCourseRelativePath(req.query.path || '');
  if (rel === null) return res.status(400).json({ error: 'Invalid path' });

  const abs = path.join(COURSES_DIR, rel);
  if (!abs.startsWith(COURSES_DIR)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const { pdfs, audios, videos, texts, aiTexts } = listMediaFiles(abs);
  res.json({
    path: rel,
    pdfs: pdfs.map((name) => ({ name, path: path.posix.join(rel, name) })),
    audios: audios.map((name) => ({ name, path: path.posix.join(rel, name) })),
    videos: videos.map((name) => ({ name, path: path.posix.join(rel, name) })),
    texts: texts.map((entry) => ({
      name: entry.name,
      path: entry.relPath || '',
      baseName: entry.baseName || '',
      preview: entry.preview || ''
    })),
    aiTexts: aiTexts.map((entry) => ({
      name: entry.name,
      path: entry.relPath || '',
      baseName: entry.baseName || '',
      preview: entry.preview || ''
    }))
  });
});

app.get('/api/materials/books', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT book_name,
             COUNT(*) AS pages,
             MAX(CASE WHEN has_ai THEN 1 ELSE 0 END) AS has_ai,
             MAX(CASE WHEN has_txt THEN 1 ELSE 0 END) AS has_txt
      FROM materials_registry
      WHERE (dead IS NULL OR dead = false)
      GROUP BY book_name
      ORDER BY book_name
    `);
    res.json(r.rows.map(row => ({
      book_name: row.book_name,
      pages: Number(row.pages || 0),
      has_ai: Number(row.has_ai || 0) === 1,
      has_txt: Number(row.has_txt || 0) === 1
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/materials/pages', async (req, res) => {
  const book = req.query.book;
  if (!book) return res.status(400).json({ error: 'book query param required' });
  try {
    const r = await pool.query(`
      SELECT book_name, page_num, pdf_path, txt_path, ai_path, transcription_path, audio_path, has_audio, has_ai, has_txt
      FROM materials_registry
      WHERE book_name = $1 AND (dead IS NULL OR dead = false)
      ORDER BY page_num
    `, [book]);
    
    res.json(r.rows.map(row => ({
      book_name: row.book_name,
      page_num: row.page_num,
      pdf_path: row.pdf_path,
      txt_path: row.txt_path,
      ai_path: row.ai_path,
      transcription_path: row.transcription_path, // Added
      audio_path: row.audio_path,                 // Added
      has_audio: row.has_audio,                   // Added
      has_ai: row.has_ai,
      has_txt: row.has_txt,
      pdf_rel_path: toCourseRelativePath(row.pdf_path),
      txt_rel_path: toCourseRelativePath(row.txt_path || ''),
      ai_rel_path: toCourseRelativePath(row.ai_path || ''),
      transcription_rel_path: toCourseRelativePath(row.transcription_path || ''), // Added
      audio_rel_path: toCourseRelativePath(row.audio_path || '')                   // Added
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/materials/page', async (req, res) => {
  const book = req.query.book;
  const pageNum = parseInt(req.query.page, 10);
  if (!book || !pageNum) return res.status(400).json({ error: 'book and page query params required' });
  try {
    const r = await pool.query(`
      SELECT mr.book_name, mr.page_num, mr.pdf_path, mr.txt_path, mr.ai_path,
             mr.transcription_path, mr.audio_path, mr.has_audio,
             rt.content_txt AS txt_content,
             ra.content_txt AS ai_content
      FROM materials_registry mr
      LEFT JOIN raw_data rt ON rt.id = mr.raw_data_txt_id
      LEFT JOIN raw_data ra ON ra.id = mr.raw_data_ai_id
      WHERE mr.book_name = $1 AND mr.page_num = $2 AND (mr.dead IS NULL OR mr.dead = false)
      LIMIT 1
    `, [book, pageNum]);
    
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Page not found' });
    
    res.json({
      book_name: row.book_name,
      page_num: row.page_num,
      pdf_path: row.pdf_path,
      txt_path: row.txt_path,
      ai_path: row.ai_path,
      // Here is the data for your transcriptions:
      transcription_path: row.transcription_path,
      transcription_rel_path: toCourseRelativePath(row.transcription_path || ''),
      // Audio is included too:
      audio_path: row.audio_path,
      has_audio: row.has_audio,
      // Existing fields preserved:
      pdf_rel_path: toCourseRelativePath(row.pdf_path),
      txt_rel_path: toCourseRelativePath(row.txt_path || ''),
      ai_rel_path: toCourseRelativePath(row.ai_path || ''),
      txt_content: row.txt_content || '',
      ai_content: row.ai_content || ''
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/materials/search', async (req, res) => {
  const q = (req.query.q || '').toString();
  if (!q) return res.json([]);
  try {
    const r = await pool.query(`
      SELECT mr.book_name, mr.page_num, rt.content_txt
      FROM materials_registry mr
      JOIN raw_data rt ON rt.id = mr.raw_data_txt_id
      WHERE (mr.dead IS NULL OR mr.dead = false) AND rt.content_txt ILIKE $1
      ORDER BY mr.book_name, mr.page_num
      LIMIT 50
    `, [`%${q}%`]);
    res.json(r.rows.map(row => {
      const idx = row.content_txt.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, idx - 80);
      const end = Math.min(row.content_txt.length, idx + 120);
      const snippet = idx >= 0 ? row.content_txt.slice(start, end).trim() : row.content_txt.slice(0, 200).trim();
      return {
        book_name: row.book_name,
        page_num: row.page_num,
        snippet
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT m.book_name,
             COUNT(*) AS pages,
             MAX(CASE WHEN m.has_ai THEN 1 ELSE 0 END) AS has_ai,
             MAX(CASE WHEN m.has_txt THEN 1 ELSE 0 END) AS has_txt,
             (SELECT m2.jpg_path FROM materials_registry m2
              WHERE m2.book_name = m.book_name AND m2.jpg_path IS NOT NULL
              ORDER BY m2.page_num LIMIT 1) AS cover_path
      FROM materials_registry m
      WHERE (m.dead IS NULL OR m.dead = false)
      GROUP BY m.book_name
      ORDER BY m.book_name
    `);

    // Pre-fetch audio counts from audio_index by base book name
    const audioCounts = {};
    const ac = await pool.query(`SELECT book_name, COUNT(*) as cnt FROM audio_index GROUP BY book_name`);
    for (const row of ac.rows) {
      audioCounts[row.book_name] = parseInt(row.cnt);
    }

    function categorizeBook(name) {
      const lower = name.toLowerCase();
      if (lower.includes('lehrerhandbuch') || lower.includes('lehrerbuch') || lower.includes('lehrer')) return 'lehrer';
      if (lower.includes('antworten') || lower.includes('loesung') || lower.includes('solution') || lower.includes('answer') || lower.includes('_ab')) return 'answers';
      return 'book';
    }

    function cleanBookName(raw) {
      const parts = raw.split('/').filter(Boolean)
      if (parts[0] === 'Varied_Books') {
        const rest = parts.slice(1).map(s => s.replace(/[_]/g, ' ').trim()).filter(Boolean).join(' / ')
        return humanizeBookName(rest, raw)
      }
      if (parts[0] === 'Verbs') {
        return 'German Verbs'
      }

      const bookPrefix = parts[0].replace(/[_]/g, ' ').trim()

      if (parts.length === 1) {
        return humanizeBookName(bookPrefix, raw)
      }

      // Find the most meaningful part to use as the name
      let best = null, bestIdx = -1
      const skipWords = ['audio', 'answers', 'cd']
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i].replace(/[_]/g, ' ').trim()
        if (!p) continue
        const pl = p.toLowerCase()
        const bl = bookPrefix.toLowerCase()
        if (pl === bl) continue
        if (skipWords.some(w => pl === w || pl.startsWith(w))) continue
        if (/^\d/.test(p)) continue
        best = p
        bestIdx = i
        break
      }
      if (!best) {
        // fall back to last part, strip leading digit
        best = parts[parts.length - 1].replace(/[_]/g, ' ').trim().replace(/^\d+/, '')
      }

      // Check if best part already starts with book identifier (e.g. "Lagune 2 Arbeitsbuch")
      const bl = bookPrefix.toLowerCase()
      const blLower = best.toLowerCase()
      if (blLower.startsWith(bl) || blLower.startsWith(bl.replace(/ .*$/, ''))) {
        return humanizeBookName(best, raw)
      }
      // Add missing prefix words that aren't already in the best part
      const bestWords = best.toLowerCase().split(/[\s-]+/)
      const prefixWordsRaw = bookPrefix.split(/[\s-]+/)
      const prefixWordsLower = bookPrefix.toLowerCase().split(/[\s-]+/)
      const missing = prefixWordsLower.map((w, i) => !bestWords.includes(w) ? prefixWordsRaw[i] : null).filter(Boolean)
      if (missing.length > 0) {
        return humanizeBookName(missing.join(' ') + ' ' + best.replace(/^\d+/, '').trim(), raw)
      }
      return humanizeBookName(best, raw)
    }

    function humanizeBookName(name, raw) {
      return name
        .replace(/\(z-lib\.org\)/gi, '')
        .replace(/by Rosa-Maria Dallapiazza.*$/i, '')
        .replace(/by .*? (and|&) .*$/i, '')
        .replace(/by .*$/i, '')
        .replace(/\s*\/\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        // Normalize known book types
        .replace(/\bArbeitsbuch\b/gi, 'Arbeitsbuch')
        .replace(/\bKursbuch\b/gi, 'Kursbuch')
        .replace(/\bLehrerhandbuch\b/gi, 'Lehrerhandbuch')
        .replace(/\bUbungsheft\b/g, 'Übungsheft')
        .replace(/\bAntworten\b/gi, 'Antworten')
        .replace(/\bHauptKurs\b/g, 'Hauptkurs')
        .replace(/\bHauptkurs\b/gi, 'Hauptkurs')
        .replace(/\bDelfin\b/gi, 'Delfin')
        .replace(/\bTAK\b/gi, 'TAK')
        .replace(/\bta[kK]\b/g, 'TAK')
        // Normalize known book series
        .replace(/\bSchritte plus neu\b/gi, 'Schritte Plus Neu')
        .replace(/\bSchritte International neu\b/gi, 'Schritte International Neu')
        .replace(/\bSchritte International\b/gi, 'Schritte International')
        .replace(/\bSchritte (\d+)\b/gi, 'Schritte $1')
        .replace(/\bTangram Aktuell\b/gi, 'Tangram Aktuell')
        .replace(/\bTangram Z,? Zertifikat Deutsch\b/gi, 'Tangram Z')
        .replace(/\bNeu-B1-Plus\b/gi, 'Neu B1 Plus')
        .replace(/\bB1-plus\b/gi, 'B1 Plus')
        .replace(/\bB1-Plus\b/gi, 'B1 Plus')
        .replace(/\bEM Neu\b/gi, 'EM Neu')
        .replace(/\bDymistified[ _]edited\b/gi, 'German Demystified')
        // Menschen variants
        .replace(/\bMenschen[ _]A1[._\s-]2[ _-]?[Kk]ursbuch\b/gi, 'Menschen A1.2 Kursbuch')
        .replace(/\bMenschen[ _]A2[._\s-]2[ _-]?[Aa]rbeitsbuch\b/gi, 'Menschen A2.2 Arbeitsbuch')
        .replace(/\bMenschen[ _]A2[._\s-]2[ _-]?[Kk]ursbuch\b/gi, 'Menschen A2.2 Kursbuch')
        .replace(/\bMenschen[ _]A2\.1[ _-]?[Kk]ursbuch\b/gi, 'Menschen A2.1 Kursbuch')
        .replace(/\bCortina Conversational German\b/gi, 'Cortina Conversational German')
        .replace(/\bFurther[ _]German[ _]Teach[ _]Yourself\b/gi, 'Further German (Teach Yourself)')
        .replace(/\bLearn[ _]German[ _]the[ _]Fast[ _]and[ _]Fun[ _]Way\b/gi, 'Learn German the Fast and Fun Way')
        // Hyphens between word characters → space (lookaround to avoid overlap)
        .replace(/(?<=\w)-(?=\w)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s,]+$/, '')
        // Remove consecutive duplicate word sequences (e.g. "B1 Plus B1 Plus" → "B1 Plus")
        .replace(/(\b\w+\b)(?:\s+\1)+/gi, '$1')
        || raw.split('/').pop().replace(/_/g, ' ').trim()
    }

    const catOrder = { book: 0, lehrer: 1, answers: 2 };
    const books = r.rows
      .filter(row => Number(row.pages || 0) > 0) // remove empty books
      .map(row => {
      const bookName = row.book_name;
      const baseBook = bookName.split('/')[0];
      const bookDir = path.join(COURSES_DIR, bookName);
      const annotationRoot = path.join(bookDir, 'txt', 'annotations');
      const annotationCount = fs.existsSync(annotationRoot)
        ? fs.readdirSync(annotationRoot).filter(f => f.endsWith('.json')).length
        : 0;
      const audioFileCount = audioCounts[baseBook] || 0;
      const videoFileCount = countMediaFiles(bookDir, ['.mp4', '.webm', '.mov', '.m4v']);
      const aiCount = fs.existsSync(path.join(bookDir, 'ai'))
        ? fs.readdirSync(path.join(bookDir, 'ai')).filter(f => f.endsWith('.txt') || f.endsWith('.json')).length
        : 0;
      const pagesPrefix = '/home/f/deutsch-app/pages/';
      let coverUrl = null;
      if (row.cover_path) {
        if (row.cover_path.startsWith(pagesPrefix)) {
          coverUrl = '/pages/' + row.cover_path.slice(pagesPrefix.length);
        } else if (row.cover_path.startsWith(COURSES_DIR)) {
          coverUrl = '/files/' + path.relative(COURSES_DIR, row.cover_path);
        } else {
          coverUrl = '/files/' + row.cover_path;
        }
      }
      return {
        id: bookName,
        name: cleanBookName(bookName),
        path: `/files/${encodeURIComponent(bookName)}`,
        pdfCount: Number(row.pages || 0),
        annotationCount,
        aiCount,
        audioFileCount,
        videoFileCount,
        hasAnnotations: annotationCount > 0,
        hasAI: Number(row.has_ai || 0) === 1,
        coverUrl,
        category: categorizeBook(bookName),
      };
    }).sort((a, b) => {
      const catDiff = catOrder[a.category] - catOrder[b.category];
      if (catDiff !== 0) return catDiff;
      return a.name.localeCompare(b.name);
    });

    res.json(books);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/lessons', async (req, res) => {
  const bookName = req.params.bookId;
  try {
    const rows = await getBookRecords(bookName);
    const pdfs = rows.map(row => {
      let jpgPath = null;
      if (row.jpg_path) {
        const pagesPrefix = '/home/f/deutsch-app/pages/';
        if (row.jpg_path.startsWith(pagesPrefix)) {
          jpgPath = '/pages/' + row.jpg_path.slice(pagesPrefix.length);
        } else if (row.jpg_path.startsWith(COURSES_DIR)) {
          jpgPath = '/files/' + path.relative(COURSES_DIR, row.jpg_path);
        } else {
          jpgPath = '/files/' + row.jpg_path;
        }
      }
      return {
        name: path.basename(row.pdf_path),
        path: `/files/${toCourseRelativePath(row.pdf_path).split('/').map(encodeURIComponent).join('/')}`,
        page: String(row.page_num),
        jpg: jpgPath
      };
    });

    const annotationRoot = path.join(COURSES_DIR, bookName, 'txt', 'annotations');
    const annotations = [];
    if (fs.existsSync(annotationRoot)) {
      const files = fs.readdirSync(annotationRoot).filter(f => f.endsWith('.json')).sort();
      for (const file of files) {
        const filePath = path.join(annotationRoot, file);
        const parsed = parseAnnotationFile(filePath);
        if (!parsed) continue;
        const page = getAnnotationPageFromFile(file);
        const audioCount = Array.isArray(parsed.audio) ? parsed.audio.length : 0;
        const vocabCount = Array.isArray(parsed.vokabular) ? parsed.vokabular.length : 0;
        annotations.push({
          file: file,
          page: page ? String(page) : parsed?.struktur?.seite || '',
          struktur: parsed.struktur || {},
          inhaltstyp: parsed.inhaltstyp || [],
          thema: parsed.thema || null,
          audioCount,
          vocabCount
        });
      }
    }

    const aiFiles = rows
      .filter(row => row.ai_path)
      .map(row => ({ file: path.basename(row.ai_path), page: String(row.page_num) }));
    const txtFiles = rows
      .filter(row => row.txt_path)
      .map(row => ({ file: path.basename(row.txt_path), page: String(row.page_num) }));

    res.json({
      id: bookName,
      name: bookName,
      pdfs,
      annotations,
      aiFiles,
      txtFiles
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/ai/:page', async (req, res) => {
  const bookName = req.params.bookId;
  const page = parseInt(req.params.page, 10);
  if (!page) return res.status(400).json({ error: 'page required' });
  try {
    const r = await pool.query(`
      SELECT ai_path, raw_data_ai_id
      FROM materials_registry
      WHERE book_name = $1 AND page_num = $2 AND (dead IS NULL OR dead = false)
      LIMIT 1
    `, [bookName, page]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'AI not found' });
    if (row.raw_data_ai_id) {
      const txt = await pool.query('SELECT content_txt FROM raw_data WHERE id = $1', [row.raw_data_ai_id]);
      const content = txt.rows[0]?.content_txt || '';
      return res.json({ file: row.ai_path, content });
    }
    if (row.ai_path && fs.existsSync(row.ai_path)) {
      const content = fs.readFileSync(row.ai_path, 'utf8');
      return res.json({ file: row.ai_path, content });
    }
    return res.json({ file: row.ai_path || '', content: '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/annotations/:page', async (req, res) => {
  const bookName = req.params.bookId;
  const page = parseInt(req.params.page, 10);
  if (!page) return res.status(400).json({ error: 'page required' });
  try {
    const annotationRoot = path.join(COURSES_DIR, bookName, 'txt', 'annotations');
    if (!fs.existsSync(annotationRoot)) return res.status(404).json({ error: 'annotations not found' });
    const files = fs.readdirSync(annotationRoot).filter(f => f.endsWith('.json'));
    const match = files.find(f => getAnnotationPageFromFile(f) === page);
    if (!match) return res.status(404).json({ error: 'annotation not found' });
    const parsed = parseAnnotationFile(path.join(annotationRoot, match));
    if (!parsed) return res.status(404).json({ error: 'annotation invalid' });
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/vocabulary', async (req, res) => {
  const bookName = req.params.bookId;
  try {
    // Try 1: match by curso nombre
    const r = await pool.query(`
      SELECT DISTINCT ON (v.palabra)
        CASE
          WHEN v.palabra ~ '^(der|die|das) ' THEN split_part(v.palabra, ' ', 1)
          ELSE ''
        END as artikel,
        CASE
          WHEN v.palabra ~ '^(der|die|das) ' THEN substring(v.palabra from 5)
          ELSE v.palabra
        END as wort,
        v.palabra,
        v.plural, v.traduccion as "übersetzung_es", v.traduccion,
        v.wortart, v.kontext, v.english, v.french,
        v.source_file as source, v.source_file, v.lektion, v.seite,
        v.audio_url
      FROM vocabulario v
      JOIN cursos c ON c.id = v.curso_id
      WHERE $1 LIKE '%' || c.nombre || '%' OR c.nombre LIKE '%' || $1 || '%'
      ORDER BY v.palabra
    `, [bookName]);
    if (r.rows.length > 0) {
      return res.json({ vocabulary: r.rows });
    }
    // Try 2: match via raw_data.book_name (for vocab with NULL curso_id)
    const r2 = await pool.query(`
      SELECT DISTINCT ON (v.palabra)
        v.artikel, v.palabra as wort, v.palabra, v.plural, v.traduccion as "übersetzung_es", v.traduccion,
        v.wortart, v.kontext, v.english, v.french,
        v.source_file as source, v.source_file, v.lektion, v.seite, v.audio_url
      FROM vocabulario v
      JOIN raw_data rd ON rd.file_name = v.source_file AND rd.content_type = 'annotation'
      WHERE rd.book_name = $1 OR rd.book_name LIKE '%' || $1 || '%' OR $1 LIKE '%' || rd.book_name || '%'
      ORDER BY v.palabra
    `, [bookName]);
    if (r2.rows.length > 0) {
      return res.json({ vocabulary: r2.rows });
    }
    // Try 3: match by base book name
    const baseBook = bookName.split('/')[0];
    const r3 = await pool.query(`
      SELECT DISTINCT ON (v.palabra)
        v.artikel, v.palabra as wort, v.palabra, v.plural, v.traduccion as "übersetzung_es", v.traduccion,
        v.wortart, v.kontext, v.english, v.french,
        v.source_file as source, v.source_file, v.lektion, v.seite, v.audio_url
      FROM vocabulario v
      JOIN raw_data rd ON rd.file_name = v.source_file AND rd.content_type = 'annotation'
      WHERE rd.book_name = $1 OR rd.book_name LIKE '%' || $1 || '%'
      ORDER BY v.palabra
    `, [baseBook]);
    if (r3.rows.length > 0) {
      return res.json({ vocabulary: r3.rows });
    }
    // Try 4: match by source_file pattern (for vocab extracted directly from OCR)
    const r4 = await pool.query(`
      SELECT DISTINCT ON (v.palabra)
        v.artikel, v.palabra as wort, v.palabra, v.plural, v.traduccion as "übersetzung_es", v.traduccion,
        v.wortart, v.kontext, v.english, v.french,
        v.source_file as source, v.source_file, v.lektion, v.seite, v.audio_url
      FROM vocabulario v
      WHERE v.source_file ILIKE $1
      ORDER BY v.palabra
    `, [`%${baseBook}%`]);
    if (r4.rows.length > 0) {
      return res.json({ vocabulary: r4.rows });
    }
    // Fallback: filesystem
    const annotationRoot = path.join(COURSES_DIR, bookName, 'txt', 'annotations');
    if (!fs.existsSync(annotationRoot)) return res.json({ vocabulary: [] });
    const files = fs.readdirSync(annotationRoot).filter(f => f.endsWith('.json'));
    const vocabulary = [];
    for (const file of files) {
      const parsed = parseAnnotationFile(path.join(annotationRoot, file));
      if (!parsed?.vokabular) continue;
      const page = getAnnotationPageFromFile(file);
      for (const v of parsed.vokabular) {
        vocabulary.push({
          wort: v.wort || '',
          palabra: v.wort || '',
          artikel: v.artikel || '',
          plural: v.plural || '',
          übersetzung_es: v['übersetzung_es'] || v.uebersetzung_es || '',
          traduccion: v['übersetzung_es'] || v.uebersetzung_es || '',
          wortart: v.wortart || '',
          kontext: v.kontext || '',
          english: v.english || '',
          french: v.french || '',
          source: file,
          source_file: file,
          lektion: parsed?.struktur?.lektion || '',
          seite: page ? String(page) : parsed?.struktur?.seite || ''
        });
      }
    }
    res.json({ vocabulary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Vocabulary by book + optional lesson/page/level filter
app.get('/books/:bookId/vocabulary/filter', async (req, res) => {
  const bookName = req.params.bookId;
  const { lektion, page, nivel, search } = req.query;
  try {
    let conditions = [];
    let params = [];
    let idx = 1;

    const baseBook = bookName.split('/')[0];
    conditions.push(`(v.source_file ILIKE $${idx} OR v.source_file ILIKE $${idx+1})`);
    params.push(`%${baseBook}%`, `%${bookName}%`);
    idx += 2;

    if (lektion) {
      conditions.push(`v.lektion = $${idx}`);
      params.push(lektion);
      idx++;
    }
    if (page) {
      conditions.push(`v.seite = $${idx}`);
      params.push(String(page));
      idx++;
    }
    if (nivel && ['A1','A2','B1','B2','C1'].includes(nivel)) {
      conditions.push(`v.nivel = $${idx}`);
      params.push(nivel);
      idx++;
    }
    if (search) {
      conditions.push(`(v.palabra ILIKE $${idx} OR v.traduccion ILIKE $${idx} OR v.english ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const r = await pool.query(`
      SELECT DISTINCT ON (v.palabra)
        v.artikel,
        CASE WHEN v.palabra ~ '^(der|die|das) ' THEN substring(v.palabra from 5) ELSE v.palabra END as wort,
        v.palabra, v.plural, v.traduccion as "übersetzung_es", v.traduccion,
        v.wortart, v.kontext, v.english, v.french, v.nivel,
        v.source_file as source, v.source_file, v.lektion, v.seite, v.audio_url
      FROM vocabulario v
      ${where}
      ORDER BY v.palabra
    `, params);
    res.json({ vocabulary: r.rows, total: r.rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Page audio mapping for a book - EXACT MATCH ONLY (no fuzzy matching)
app.get('/books/:bookId/page-audio', async (req, res) => {
  const bookName = req.params.bookId;
  try {
    const r = await pool.query(`
      SELECT par.page_num, par.cd_num, par.track_num, par.exercise_text,
             par.has_transcription, par.has_answers, par.section_type,
             ai.file_name, ai.file_path
      FROM page_audio_refs par
      LEFT JOIN audio_index ai ON ai.book_name = par.book_name
        AND ai.linked_page = par.page_num::text
      WHERE par.book_name = $1
      ORDER BY par.page_num, par.track_num
    `, [bookName]);
    res.json({ pageAudio: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lesson-level stats for a book (vocab count, audio count per lesson)
app.get('/books/:bookId/lesson-stats', async (req, res) => {
  const bookName = req.params.bookId;
  const baseBook = bookName.split('/')[0];
  try {
    const r = await pool.query(`
      SELECT
        COALESCE(v.lektion, 'unknown') as lektion,
        COUNT(DISTINCT v.palabra) as vocab_count,
        COUNT(DISTINCT v.id) as vocab_entries
      FROM vocabulario v
      WHERE (v.source_file ILIKE $1 OR v.source_file ILIKE $2)
        AND v.lektion IS NOT NULL
      GROUP BY v.lektion
      ORDER BY v.lektion
    `, [`%${baseBook}%`, `%${bookName}%`]);
    res.json({ lessons: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/audio', async (req, res) => {
  const bookName = req.params.bookId;
  try {
    // Map humanized book name to audio_index book_name via materials_registry
    const mapResult = await pool.query(`
      SELECT DISTINCT SPLIT_PART(m.book_name, '/', 1) as audio_book_name
      FROM materials_registry m
      WHERE m.book_name ILIKE '%' || $1 || '%'
         OR $1 ILIKE '%' || m.book_name || '%'
      LIMIT 1
    `, [bookName]);
    
    const audioBookName = mapResult.rows[0]?.audio_book_name || bookName.split('/')[0];
    
    const r = await pool.query(
      `SELECT id, file_name, file_path, cd_num, track_num, book_name, linked_page,
              transcription_path, translation_path
       FROM audio_index
       WHERE book_name = $1
       ORDER BY cd_num NULLS FIRST, track_num NULLS FIRST, file_name`,
      [audioBookName]
    );

    const isKursbuch = bookName.toLowerCase().includes('kursbuch');
    const isArbeitsbuch = bookName.toLowerCase().includes('arbeitsbuch');
    let filtered = r.rows;
    if (isKursbuch) {
      filtered = filtered.filter(row => !row.file_name.includes('_AB_'));
    } else if (isArbeitsbuch) {
      filtered = filtered.filter(row => !row.file_name.includes('_KB_'));
    }

    const seen = new Set();
    const unique = [];
    for (const row of filtered) {
      const key = `${row.cd_num || 'null'}-${row.track_num || 'null'}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(row);
      }
    }

    const audio = unique.map(row => {
      const rel = normalizeCourseRelativePath(row.file_path);
      let transcriptionContent = null;
      let translationContent = null;
      if (row.transcription_path && fs.existsSync(row.transcription_path)) {
        const fullContent = fs.readFileSync(row.transcription_path, 'utf-8');
        const marker = '---ENGLISH---';
        const idx = fullContent.indexOf(marker);
        if (idx !== -1) {
          transcriptionContent = fullContent.substring(0, idx).trim();
          translationContent = fullContent.substring(idx + marker.length).trim();
        } else {
          transcriptionContent = fullContent.trim();
        }
      } else if (row.translation_path && row.translation_path !== row.transcription_path && fs.existsSync(row.translation_path)) {
        const fullContent = fs.readFileSync(row.translation_path, 'utf-8');
        const marker = '---ENGLISH---';
        const idx = fullContent.indexOf(marker);
        if (idx !== -1) {
          transcriptionContent = fullContent.substring(0, idx).trim();
          translationContent = fullContent.substring(idx + marker.length).trim();
        } else {
          transcriptionContent = fullContent.trim();
        }
      }
      return {
        id: row.id,
        name: row.file_name,
        audio_url: rel ? '/audio/' + rel : '',
        cd: row.cd_num ? String(row.cd_num) : '',
        track: row.track_num ? String(row.track_num) : '',
        book_name: row.book_name,
        linked_page: row.linked_page,
        transcription_content: transcriptionContent,
        translation_content: translationContent,
      };
    });
    res.json({ audio });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/audio-files', async (req, res) => {
  const bookName = req.params.bookId;
  const bookDir = path.join(COURSES_DIR, bookName);
  try {
    const audioFiles = listMediaFilesDetailed(bookDir, ['.mp3', '.m4a', '.wav', '.ogg', '.flac'], COURSES_DIR).map(item => ({
      name: item.name,
      path: `/audio/${item.path}`,
      lesson: null,
      size: item.size
    }));
    res.json({ audioFiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clean DB-only audio endpoint (audio_index)
app.get('/api/audio/by-book', async (req, res) => {
  const bookName = req.query.book;
  if (!bookName) return res.status(400).json({ error: 'book query param required' });
  try {
    const r = await pool.query(`
      SELECT id, file_name, file_path, cd_num, track_num, book_name
      FROM audio_index
      WHERE book_name = $1
      ORDER BY cd_num NULLS LAST, track_num NULLS LAST, file_name
    `, [bookName]);
    const audio = r.rows
      .map(row => {
        const rel = normalizeCourseRelativePath(row.file_path);
        if (!rel) return null;
        return {
          id: row.id,
          name: row.file_name,
          path: `/audio/${rel}`,
          cd: row.cd_num ? String(row.cd_num) : '',
          track: row.track_num ? String(row.track_num) : '',
          book: row.book_name
        };
      })
      .filter(Boolean);
    res.json({ audio });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clean DB-only audio endpoint — queries audio_index directly
app.get('/api/audio/by-book', async (req, res) => {
  const bookName = req.query.book;
  if (!bookName) return res.status(400).json({ error: 'book query param required' });
  try {
    const r = await pool.query(
      `SELECT id, file_name, file_path, cd_num, track_num, book_name, linked_page
       FROM audio_index
       WHERE book_name = $1
       ORDER BY cd_num NULLS FIRST, track_num NULLS FIRST, file_name`,
      [bookName]
    );
    const audio = r.rows.map(row => ({
      id: row.id,
      name: row.file_name,
      path: row.file_path,
      cd_num: row.cd_num,
      track_num: row.track_num,
      book_name: row.book_name,
      linked_page: row.linked_page,
    }));
    res.json({ audio });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/books/:bookId/video-files', async (req, res) => {
  const bookName = req.params.bookId;
  const bookDir = path.join(COURSES_DIR, bookName);
  try {
    const videoFiles = listMediaFilesDetailed(bookDir, ['.mp4', '.webm', '.mov', '.m4v'], COURSES_DIR).map(item => ({
      name: item.name,
      path: `/files/${item.path}`,
      size: item.size
    }));
    res.json({ videoFiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// TXT/OCR content for a specific page
app.get('/books/:bookId/text/:page', async (req, res) => {
  const bookName = req.params.bookId;
  const page = parseInt(req.params.page, 10);
  if (!page) return res.status(400).json({ error: 'page required' });
  try {
    const r = await pool.query(`
      SELECT txt_path, raw_data_txt_id
      FROM materials_registry
      WHERE book_name = $1 AND page_num = $2 AND (dead IS NULL OR dead = false)
      LIMIT 1
    `, [bookName, page]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Text not found' });
    if (row.raw_data_txt_id) {
      const txt = await pool.query('SELECT content_txt FROM raw_data WHERE id = $1', [row.raw_data_txt_id]);
      const content = txt.rows[0]?.content_txt || '';
      return res.json({ file: row.txt_path, content });
    }
    if (row.txt_path && fs.existsSync(row.txt_path)) {
      const content = fs.readFileSync(row.txt_path, 'utf8');
      return res.json({ file: row.txt_path, content });
    }
    return res.json({ file: row.txt_path || '', content: '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Grammar exercises endpoint (ejercicios table — DROPPED, returns empty)
app.get('/books/:bookId/exercises', async (req, res) => {
  res.json({ exercises: [] });
});

// POST: insert exercises (ejercicios table — DROPPED, no-op)
app.post('/books/:bookId/exercises/batch', async (req, res) => {
  res.json({ inserted: 0 });
});
app.use(express.static(FRONTEND_DIR));
app.use('/files', express.static(COURSES_DIR));
app.use('/audio', express.static(COURSES_DIR));

const pdfMap = {
  1: { kb: 'Lagune_1/Lagune 1/Kursbuch + CD/Lagune-1-Kursbuch/pdf/Lagune-1-Kursbuch-001.pdf', ab: 'Lagune_1/Lagune 1/Arbeitsbuch + CD/pdf/Lagune_1_Arbeitsbuch-001.pdf', lehrer: 'Lagune_1/Lagune 1/1Lehrerhandbuch/pdf/1Lehrerhandbuch-001.pdf' },
  2: { kb: 'Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch/pdf/Lagune_2_Kursbuch-001.pdf', ab: 'Lagune_2/Lagune 2/Lagune-2-Arbeitsbuch/Lagune_2_Arbeitsbuch/pdf/Lagune_2_Arbeitsbuch-001.pdf', lehrer: 'Lagune_2/Lagune 2/Lehrerhandbuch_Lagune2/pdf/Lehrerhandbuch_Lagune2-001.pdf' },
  3: { kb: 'Lagune_3/Lagune 3/Kursbuch +CD/Lagune-3-Kursbuch/pdf/Lagune-3-Kursbuch-001.pdf', ab: 'Lagune_3/Lagune 3/Arbeitsbuch + CD/Lagune-3-Arbeitsbuch/pdf/Lagune-3-Arbeitsbuch-001.pdf', lehrer: 'Lagune_3/Lagune 3/Lehrerhandbuch/pdf/Lehrerhandbuch-001.pdf' },
  4: { kb1: 'Tangram_1/Tangram Aktuell 1/1-4-Kursbuch/pdf/1-4-Kursbuch-001.pdf', kb2: 'Tangram_1/Tangram Aktuell 1/Kursbuch 5-8/pdf/Kursbuch 5-8-001.pdf', ab: 'Tangram_1/Tangram Aktuell 1/Ubungsheft/pdf/Ubungsheft-001.pdf' },
  5: { kb1: 'Tangram_2/Tangram Aktuell 2/TAK-2-1-4/pdf/TAK-2-1-4-001.pdf', kb2: 'Tangram_2/Tangram Aktuell 2/TAK-2-5-8/pdf/TAK-2-5-8-001.pdf', ab: 'Tangram_2/Tangram Aktuell 2/Ubungsheft-2/pdf/Ubungsheft-2-001.pdf' },
  6: { kb: 'Tangram_3/Tangram Aktuell 3/Kursbuch 1-4/pdf/Kursbuch 1-4-001.pdf', kb2: 'Tangram_3/Tangram Aktuell 3/Kursbuch 5-8/pdf/Kursbuch 5-8-001.pdf', ab: 'Tangram_3/Tangram Aktuell 3/Ubungsheft/pdf/Ubungsheft-001.pdf' },
  7: { kb: 'Varied_Books/Menschen-A1-2-kursbuch/pdf/Menschen-A1-2-kursbuch-001.pdf', ab: '' },
  8: { kb: 'Varied_Books/Menschen A2.1 Kursbuch/pdf/Menschen A2.1 Kursbuch-001.pdf', ab: 'Varied_Books/Menschen-A2.2-Arbeitsbuch/pdf/Menschen-A2.2-Arbeitsbuch-001.pdf' },
  9: { kb: 'B2/HauptKurs/B2-Hauptkurs/pdf/HauptKurs-001.pdf', ab: 'B2/EM_Neu_AB/EM_Neu_AB_B2/pdf/EM_Neu_AB-001.pdf' },
  10: { kb: 'Neu-B1-Plus/B1-plus-Kursbuch/pdf/Kursbuch-001.pdf', ab: 'Neu-B1-Plus/B1-plus-Arbeitsbuch/pdf/Arbeitsbuch-001.pdf' },
  11: { kb: 'Verbs/pdf/The-Big-Yellow-Book-of-German-Verbs-001.pdf', ab: '', esVerbos: true }
};

// PAGES_DIR is defined at the top of this file

const audioMap = {
  1: {
    name: 'Lagune 1',
    dirs: [
      { path: 'Lagune_1/Lagune 1/Arbeitsbuch + CD/Arbeitsbuch-CD', label: 'Arbeitsbuch-CD' },
      { path: 'Lagune_1/Lagune 1/Kursbuch + CD/Kursbuch-CD1', label: 'Kursbuch-CD1' },
      { path: 'Lagune_1/Lagune 1/Kursbuch + CD/Kursbuch-CD2', label: 'Kursbuch-CD2' },
      { path: 'Lagune_1/Lagune 1/Kursbuch + CD/Kursbuch-CD3', label: 'Kursbuch-CD3' }
    ]
  },
  2: {
    name: 'Lagune 2',
    dirs: [
      { path: 'Lagune_2/Lagune 2/Lagune-2-Arbeitsbuch/Lagune_2_Arbeitsbuch/Arbeitsbuch-2-Lagune-CD', label: 'Arbeitsbuch-CD' },
      { path: 'Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch/Kursbuch-CD1', label: 'Kursbuch-CD1' },
      { path: 'Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch/Kursbuch-CD2', label: 'Kursbuch-CD2' },
      { path: 'Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch/Kursbuch-CD3', label: 'Kursbuch-CD3' }
    ]
  },
  3: {
    name: 'Lagune 3', 
    dirs: [
      { path: 'Lagune_3/Lagune 3/Arbeitsbuch + CD/Lagune-3-Arbeitsbuch/Arbeitsbuch-3-Lagune-CD', label: 'Arbeitsbuch-CD' },
      { path: 'Lagune_3/Lagune 3/Kursbuch +CD/Lagune-3-Kursbuch/AudioCD/CDKursbuch3/Kursbuch-Lagune-3-AudioCD/CD1/MP3', label: 'Kursbuch-CD1' },
      { path: 'Lagune_3/Lagune 3/Kursbuch +CD/Lagune-3-Kursbuch/AudioCD/CDKursbuch3/Kursbuch-Lagune-3-AudioCD/CD2/MP3', label: 'Kursbuch-CD2' },
      { path: 'Lagune_3/Lagune 3/Kursbuch +CD/Lagune-3-Kursbuch/AudioCD/CDKursbuch3/Kursbuch-Lagune-3-AudioCD/CD3/MP3', label: 'Kursbuch-CD3' }
    ]
  },
  4: {
    name: 'Tangram 1',
    dirs: [
      { path: 'Tangram_1/Tangram Aktuell 1/1-4-Kursbuch/CD Arbeitsbuch 1-4', label: 'AB 1-4' },
      { path: 'Tangram_1/Tangram Aktuell 1/Kursbuch 5-8/CD Arbeitsbuch 5-8', label: 'AB 5-8' },
      { path: 'Tangram_1/Tangram Aktuell 1/1-4-Kursbuch/CD Kursbuch 1-4', label: 'KB 1-4' },
      { path: 'Tangram_1/Tangram Aktuell 1/Kursbuch 5-8/CD Kursbuch 5-8', label: 'KB 5-8' }
    ]
  },
  5: {
    name: 'Tangram 2',
    dirs: [
      { path: 'Tangram_2/Tangram Aktuell 2/TAK-2-1-4/CD Kursbuch 1-4', label: 'KB 1-4' },
      { path: 'Tangram_2/Tangram Aktuell 2/TAK-2-5-8/CD Kursbuch 5-8', label: 'KB 5-8' }
    ]
  },
  6: {
    name: 'Tangram 3',
    dirs: [
      { path: 'Tangram_3/Tangram Aktuell 3/Kursbuch 1-4/CD Kursbuch 1-4/Kursbuch 1-4 MP3', label: 'KB 1-4' },
      { path: 'Tangram_3/Tangram Aktuell 3/Kursbuch 5-8/CD Kursbuch 5-8', label: 'KB 5-8' }
    ]
  },
  7: {
    name: 'Menschen A1.2',
    dirs: [
      { path: 'Varied_Books/Menschen-A1-2-kursbuch/MP3s', label: 'MP3s' }
    ]
  },
  9: {
    name: 'B2',
    dirs: [
      { path: 'B2/Kursbuch Hoertexte/B2 EM neu - Hauptkurs cd 1', label: 'CD 1' },
      { path: 'B2/Kursbuch Hoertexte/B2 EM neu - Hauptkurs cd 2', label: 'CD 2' }
    ]
  },
  10: {
    name: 'B1+',
    dirs: [
      { path: 'Neu-B1-Plus/B1-plus-Kursbuch/B1-plus-Kursbuch Hoertexte und Lehrerhandbuch Tests/Em neu B1+ Disk 1', label: 'Disk 1' },
      { path: 'Neu-B1-Plus/B1-plus-Kursbuch/B1-plus-Kursbuch Hoertexte und Lehrerhandbuch Tests/Em neu B1+ Disk 2', label: 'Disk 2' }
    ]
  }
};

const { spawn, execSync } = require('child_process');

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Verb list from DB (fallback to CSV)
app.get('/api/verbs', async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const level = req.query.level || 'all';
    const offset = page * limit;

    let where = 'WHERE infinitive IS NOT NULL';
    if (level === 'basic') where += ' AND rank <= 50';
    else if (level === 'advanced') where += ' AND (rank > 50 OR rank IS NULL)';
    else if (['A1','A2','B1','B2','C1'].includes(level)) where += ` AND nivel = '${level}'`;

    const countR = await pool.query(`SELECT COUNT(*) FROM german_verbs ${where}`);
    const total = parseInt(countR.rows[0].count);

    const r = await pool.query(`
      SELECT infinitive as infinitiv, rank, freq,
             praesens_ich as "präsensIch", praesens_du as "präsensDu",
             praesens_er as "präsensEr",
             praeteritum as "präteritumIch", perfekt as "partizipIi",
             auxiliary_verb as "hilfsverb",
             konjunktiv_ii_ich as "konjunktivIiIch",
             imperativ_singular as "imperativSingular",
             imperativ_plural as "imperativPlural",
             english, spanish_translation as spanish,
             french
       FROM german_verbs
       ${where}
       ORDER BY rank NULLS LAST, infinitive ASC
       LIMIT $1 OFFSET $2
     `, [limit, offset]);
    if (r.rows.length > 0 || page === 0) {
      return res.json({ verbs: r.rows, total, page, limit });
    }
    // Fallback to CSV
    const csvPath = path.join(__dirname, '..', 'app', 'public', 'verben.csv');
    const translationsPath = path.join(__dirname, '..', 'data', 'verben_uebersetzt.csv');
    if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'Verben CSV not found' });
    const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trim();
    const lines = raw.split('\n');
    const headers = parseCSVLine(lines[0]);
    const translationMap = {};
    if (fs.existsSync(translationsPath)) {
      const tRaw = fs.readFileSync(translationsPath, 'utf8').replace(/^\uFEFF/, '').trim();
      const tLines = tRaw.split('\n');
      const tHeader = parseCSVLine(tLines[0] || '');
      for (const line of tLines.slice(1)) {
        const vals = parseCSVLine(line);
        const entry = {};
        tHeader.forEach((h, i) => { entry[normalizeKey(h)] = (vals[i] || '').trim(); });
        if (entry.german) translationMap[entry.german] = entry;
      }
    }
    const verbs = lines.slice(1).map(line => {
      const vals = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[normalizeKey(h)] = (vals[i] || '').trim(); });
      const german = obj.infinitiv || obj.german || '';
      const t = translationMap[german] || {};
      obj.english = obj.english || t.english || '';
      obj.spanish = obj.spanish || t.spanish || '';
      obj.french = obj.french || t.french || '';
      return obj;
    });
    res.json(verbs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/verbs/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ verbs: [] });
    const r = await pool.query(`
      SELECT infinitive as infinitiv, rank, freq,
             praesens_ich, praesens_du, praesens_er,
             praeteritum as praeteritum,
             perfekt as partizip_ii,
             auxiliary_verb as hilfsverb,
             konjunktiv_ii_ich,
             imperativ_singular, imperativ_plural,
             english, spanish_translation as spanish, french
      FROM german_verbs
      WHERE infinitive ILIKE $1
         OR praesens_ich ILIKE $1
         OR praesens_er ILIKE $1
         OR praeteritum ILIKE $1
         OR perfekt ILIKE $1
         OR english ILIKE $2
      ORDER BY rank NULLS LAST, infinitive ASC
      LIMIT 30
    `, [`${q}%`, `%${q}%`]);
    res.json({ verbs: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function normalizeKey(h) {
  return h.trim().toLowerCase().replace(/[\s,;]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// Verb conjugation endpoint using german-verbs library
const GermanVerbsLib = require('german-verbs');
const GermanVerbsDict = require('german-verbs-dict/dist/verbs.json');

const TENSES = ['PRASENS', 'PRATERITUM', 'FUTUR1', 'FUTUR2', 'PERFEKT', 'PLUSQUAMPERFEKT',
  'KONJUNKTIV1_PRASENS', 'KONJUNKTIV1_FUTUR1', 'KONJUNKTIV1_PERFEKT',
  'KONJUNKTIV2_PRATERITUM', 'KONJUNKTIV2_FUTUR1', 'KONJUNKTIV2_FUTUR2'];

app.get('/api/verbs/conjugate', (req, res) => {
  const verb = req.query.verb;
  if (!verb) return res.status(400).json({ error: 'verb query param required' });
  try {
    const result = {};
    for (const tense of TENSES) {
      const conj = {};
      for (const [person, number] of [[1,'S'],[2,'S'],[3,'S'],[1,'P'],[2,'P'],[3,'P']]) {
        try {
          conj[`S${person}`] = GermanVerbsLib.getConjugation(GermanVerbsDict, verb, tense, person, number);
        } catch { conj[`S${person}`] = null; }
      }
      result[tense] = conj;
    }
    res.json({ verb, conjugations: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// RAG query endpoint
app.post('/api/rag/query', express.json(), async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });
  try {
    const { execSync } = require('child_process');
    const python = '/home/f/miniforge3/bin/python3';
    const script = '/home/f/deutsch-app/de/rag_engine.py';
    const result = execSync(`${python} "${script}" query ${JSON.stringify(question).slice(1,-1)}`, {
      encoding: 'utf8', timeout: 30000
    });
    res.json({ answer: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// OCR endpoint - processes PDF pages
app.post('/api/pdf/ocr', async (req, res) => {
  const { pdf, curso, startPage = 1, endPage = null } = req.body;
  if (!pdf) return res.status(400).json({ error: 'PDF path required' });
  
  const pdfPath = path.join(COURSES_DIR, pdf);
  if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'PDF not found' });
  
  try {
    const pageCount = parseInt(execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep Pages | awk '{print $2}'`, { encoding: 'utf8' })) || 0;
    const end = endPage || pageCount;
    
    res.json({ status: 'started', pdf, pages: pageCount, processing: `${startPage}-${end}` });
    
    for (let p = startPage; p <= end; p++) {
      const outFile = `/tmp/ocr_${curso}_${p}.txt`;
      try {
        execSync(`pdftotext -f ${p} -l ${p} "${pdfPath}" "${outFile}" 2>/dev/null`, { stdio: 'ignore' });
        if (fs.existsSync(outFile)) {
          const text = fs.readFileSync(outFile, 'utf8').trim();
          if (text.length > 50) {
            await pool.query(`
              INSERT INTO archivos (curso_id, pagina, tipo, texto_extraido)
              VALUES ($1, $2, 'ocr', $3)
            `, [curso, p, text]);
          }
          fs.unlinkSync(outFile);
        }
      } catch (e) { /* skip failed pages */ }
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get exercises for a course
app.get('/api/ejercicios/:curso', async (req, res) => {
  const r = await pool.query(`
    SELECT ejercicio as numero, pregunta as pregunta, respuesta, 'text' as tipo
    FROM parsed_exercises 
    WHERE curso_id = $1 
    AND pregunta IS NOT NULL
    ORDER BY unidad, ejercicio
    LIMIT 300
  `, [req.params.curso]);
  res.json(r.rows);
});

// Add exercise (ejercicios table — DROPPED, no-op)
app.post('/api/ejercicios', async (req, res) => {
  res.json({ error: 'ejercicios table dropped' });
});
app.get('/api/cursos', async (req, res) => { const r = await pool.query('SELECT * FROM cursos ORDER BY id'); res.json(r.rows); });
app.get('/api/file/:curso/:tipo/:pg', async (req, res) => {
  const { curso, tipo, pg } = req.params;
  const c = pdfMap[curso];
  if (!c) return res.json({ exists: false });
  
  let rel;
  // Check if there's a kb2 (second book) and use pg param to decide which one
  const useSecond = pg === '2';
  
  if (tipo === 'kursbuch') {
    rel = useSecond && c.kb2 ? c.kb2 : (c.kb1 || c.kb);
  } else if (tipo === 'arbeitsbuch') {
    rel = c.ab;
  } else {
    rel = c.lehrer;
  }
  
  if (!rel) return res.json({ exists: false });
  const pdfPath = path.join(COURSES_DIR, rel);
  const exists = fs.existsSync(pdfPath);
  const relativePath = rel.replace(/\\/g, '/');
  res.json({ path: exists ? pdfPath : null, relativePath, exists, tipo });
});
app.get('/api/audio/list/:curso', async (req, res) => {
  const { curso } = req.params;
  const audioInfo = audioMap[curso];
  if (!audioInfo) return res.json([]);
  
  let allFiles = [];
  for (const dir of audioInfo.dirs) {
    const fullPath = path.join(COURSES_DIR, dir.path);
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.mp3')).sort();
      allFiles = allFiles.concat(files.map(f => ({ 
        file: f, 
        cd: dir.label, 
        path: `/audio/${dir.path}/${f}` 
      })));
    }
  }
  res.json(allFiles);
});
app.get('/api/audio/cds/:curso', async (req, res) => {
  const { curso } = req.params;
  const audioInfo = audioMap[curso];
  if (!audioInfo) return res.json([]);
  
  const cds = [];
  for (const dir of audioInfo.dirs) {
    const fullPath = path.join(COURSES_DIR, dir.path);
    if (fs.existsSync(fullPath)) {
      const count = fs.readdirSync(fullPath).filter(f => f.endsWith('.mp3')).length;
      cds.push({ label: dir.label, count, path: dir.path });
    }
  }
  res.json(cds);
});
app.get('/api/themenkreise/:curso', async (req, res) => {
  const r = await pool.query(`
    SELECT t.*, json_agg(json_build_object('numero', l.numero, 'titulo', l.titulo, 'fokus', l.fokus, 'paginas', l.paginas, 'es_anker', l.es_anker) ORDER BY l.numero) as einheiten
    FROM themenkreise t
    LEFT JOIN lerneinheiten l ON l.themenkreis_id = t.id
    WHERE t.curso_id = $1
    GROUP BY t.id
    ORDER BY t.numero
  `, [req.params.curso]);
  res.json(r.rows);
});

// Get unit audio (audio linked to specific units)
app.get('/api/audio/unidad/:curso/:unidad', async (req, res) => {
  const r = await pool.query(`
    SELECT * FROM audios 
    WHERE curso_id = $1 AND unidad = $2
    ORDER BY id
  `, [req.params.curso, req.params.unidad]);
  res.json(r.rows);
});

// Get exercises by unit
app.get('/api/ejercicios/:curso/:unidad', async (req, res) => {
  const r = await pool.query(`
    SELECT ejercicio as numero, pregunta as pregunta, respuesta, 'text' as tipo
    FROM parsed_exercises 
    WHERE curso_id = $1 AND unidad = $2
    AND pregunta IS NOT NULL
    ORDER BY ejercicio
  `, [req.params.curso, req.params.unidad]);
  res.json(r.rows);
});

// Get unit pages from themenkreise/lerneinheiten
app.get('/api/pages/:curso/:unidad', async (req, res) => {
  const r = await pool.query(`
    SELECT l.paginas, t.numero as themenkreis_numero
    FROM lerneinheiten l
    JOIN themenkreise t ON t.id = l.themenkreis_id
    WHERE t.curso_id = $1 AND l.numero = $2
    LIMIT 1
  `, [req.params.curso, req.params.unidad]);
  res.json(r.rows[0] || { paginas: null });
});

// Progress endpoints
app.get('/api/progress/:curso', async (req, res) => {
  const r = await pool.query('SELECT * FROM user_progress WHERE curso_id = $1', [req.params.curso]);
  res.json(r.rows);
});

app.post('/api/progress', async (req, res) => {
  const { curso_id, lektion, page, completed } = req.body;
  const r = await pool.query(`
    INSERT INTO user_progress (curso_id, lektion, page, completed)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (curso_id, lektion, page) DO UPDATE SET completed = $4
    RETURNING *
  `, [curso_id, lektion, page, completed]);
  res.json(r.rows[0]);
});

// Bookmarks endpoints
app.get('/api/bookmarks/:curso', async (req, res) => {
  const r = await pool.query('SELECT * FROM bookmarks WHERE curso_id = $1 ORDER BY created_at DESC', [req.params.curso]);
  res.json(r.rows);
});

app.post('/api/bookmarks', async (req, res) => {
  const { curso_id, lektion, page, note } = req.body;
  const r = await pool.query(`
    INSERT INTO bookmarks (curso_id, lektion, page, note)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (curso_id, lektion, page) DO UPDATE SET note = $4
    RETURNING *
  `, [curso_id, lektion, page, note]);
  res.json(r.rows[0]);
});

app.delete('/api/bookmarks/:id', async (req, res) => {
  await pool.query('DELETE FROM bookmarks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Exercise answers / scores
app.get('/api/answers/:ejercicioId', async (req, res) => {
  const r = await pool.query('SELECT * FROM user_answers WHERE ejercicio_id = $1 ORDER BY created_at DESC', [req.params.ejercicioId]);
  res.json(r.rows);
});

app.post('/api/answers', async (req, res) => {
  const { ejercicio_id, user_answer, correct } = req.body;
  const r = await pool.query(`
    INSERT INTO user_answers (ejercicio_id, user_answer, correct)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [ejercicio_id, user_answer, correct]);
  res.json(r.rows[0]);
});

app.get('/api/scores/:curso', async (req, res) => {
  const r = await pool.query(`
    SELECT ua.correct, COUNT(*) as count, MAX(ua.created_at) as last_answer
    FROM user_answers ua
    JOIN parsed_exercises pe ON pe.id = ua.ejercicio_id
    WHERE pe.curso_id = $1
    GROUP BY ua.correct
  `, [req.params.curso]);
  res.json(r.rows);
});

// Serve page images (pre-converted PNGs)
app.get('/api/page/:curso/:type/:num', async (req, res) => {
  const { curso, type, num } = req.params;
  const pageNum = parseInt(num);
  
  const c = pdfMap[curso];
  if (!c) return res.status(404).json({ error: 'Course not found' });
  
  let pdfFile = type === 'kursbuch' ? (c.kb2 && pageNum > 50 ? c.kb2 : (c.kb1 || c.kb)) : c.ab;
  if (!pdfFile) return res.status(404).json({ error: 'PDF not found' });
  
  const pdfPath = path.join(COURSES_DIR, pdfFile);
  if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'PDF file not found' });
  
const outFile = path.join(PAGES_DIR, `${curso}_${type}`, `page-${String(pageNum).padStart(4, '0')}.png`);
  
  if (!fs.existsSync(path.dirname(outFile))) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
  }
  
  if (!fs.existsSync(outFile)) {
    try {
      execSync(`pdftoppm -png -singlefile -f ${pageNum} -l ${pageNum} -r 150 "${pdfPath}" "${outFile.replace('.png', '')}"`, { stdio: 'ignore' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  
  res.sendFile(outFile);
});

// Convert PDF page on demand
app.post('/api/page/convert', async (req, res) => {
  const { curso, type, pageNum } = req.body;
  
  const c = pdfMap[curso];
  if (!c) return res.status(404).json({ error: 'Course not found' });
  
  let pdfFile = type === 'kursbuch' ? (c.kb2 ? c.kb2 : (c.kb1 || c.kb)) : c.ab;
  if (!pdfFile) return res.status(404).json({ error: 'PDF not found' });
  
  const pdfPath = path.join(COURSES_DIR, pdfFile);
  const outDir = path.join(PAGES_DIR, `${curso}_${type}`);
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const outFile = path.join(outDir, `page-${String(pageNum).padStart(4, '0')}.png`);
  
  try {
    execSync(`pdftoppm -png -singlefile -f ${pageNum} -l ${pageNum} -r 150 "${pdfPath}" "${outFile.replace('.png', '')}"`, { stdio: 'ignore' });
    res.json({ ok: true, path: outFile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generic PDF page image endpoint (works for ANY book in materials_registry)
app.get('/api/page/image', async (req, res) => {
  const book = req.query.book;
  const pageNum = parseInt(req.query.page, 10);
  if (!book || !pageNum) return res.status(400).json({ error: 'book and page query params required' });

  try {
    const r = await pool.query(
      'SELECT pdf_path FROM materials_registry WHERE book_name = $1 AND page_num = $2 AND (dead IS NULL OR dead = false) LIMIT 1',
      [book, pageNum]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Page not found in materials_registry' });

    const pdfPath = r.rows[0].pdf_path;
    if (!pdfPath || !fs.existsSync(pdfPath)) return res.status(404).json({ error: 'PDF file not found' });

    const safeDir = book.replace(/[^a-zA-Z0-9_]/g, '_');
    const outDir = path.join(PAGES_DIR, safeDir);
    const outFile = path.join(outDir, `page-${String(pageNum).padStart(4, '0')}.jpg`);

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    if (!fs.existsSync(outFile)) {
      execSync(`pdftoppm -jpeg -jpegopt quality=100 -singlefile -r 150 "${pdfPath}" "${outFile.replace('.jpg', '')}"`, { stdio: 'ignore' });
    }

    const jpegBuf = fs.readFileSync(outFile);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': jpegBuf.length });
    res.end(jpegBuf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === Page detail endpoint — cross-references everything for a single page ===
app.get('/api/page/detail', async (req, res) => {
  const book = req.query.book;
  const page = parseInt(req.query.page, 10);
  if (!book || !page) return res.status(400).json({ error: 'book and page query params required' });

  try {
    // 1) materials_registry entry
    const reg = await pool.query(
      `SELECT pdf_path, txt_path, ai_path, jpg_path, has_txt, has_ai
       FROM materials_registry WHERE book_name = $1 AND page_num = $2 LIMIT 1`,
      [book, page]
    );
    const row = reg.rows[0];
    if (!row) return res.status(404).json({ error: 'Page not found' });

    // Extract base book name for audio_index matching (e.g. "Lagune-1-Kursbuch" from "Lagune_1/Lagune 1/Kursbuch...")
    const baseBook = book.split('/')[0];
    // Also extract book title from the full path for more specific matching
    // e.g. "Lagune 1/Kursbuch" from "Lagune_1/Lagune 1/Kursbuch/..."
    const bookPathParts = book.split('/');
    const bookTitleSegment = bookPathParts.length > 2 ? bookPathParts.slice(1, 3).join('/') : '';
    // Remove the leading directory prefix for audio_index book_name matching
    // audio_index stores book_name like "Lagune_1_AB" or "Lagune_1" or "Lagune-1-Kursbuch"
    // Build a more specific search pattern from the full path
    const fullBookSegment = book.split('/').slice(1).join('/').replace(/\//g, '_').replace(/\s+/g, '_');

    // 2) OCR text content
    let txtContent = null;
    if (row.txt_path && fs.existsSync(row.txt_path)) {
      txtContent = fs.readFileSync(row.txt_path, 'utf-8');
    }

    // 3) AI content
    let aiContent = null;
    if (row.ai_path && fs.existsSync(row.ai_path)) {
      aiContent = fs.readFileSync(row.ai_path, 'utf-8');
    }

    // 4) Vocabulary for this page
    const vocab = await pool.query(
      `SELECT palabra, artikel, plural, traduccion, wortart, kontext, english, french, audio_url
       FROM vocabulario WHERE source_file ILIKE $1 AND seite = $2`,
      [`%${book}%`, page]
    );

    // 5) Audio tracks for this book (from audio_index, match by full book path)
    // Determine if this is Kursbuch (KB) or Arbeitsbuch (AB) to filter tracks
    const isKursbuch = book.toLowerCase().includes('kursbuch');
    const isArbeitsbuch = book.toLowerCase().includes('arbeitsbuch');
    const audio = await pool.query(
      `SELECT id, file_name, file_path, cd_num, track_num, transcription_path, translation_path
       FROM audio_index
       WHERE (book_name ILIKE $1
          OR (book_name ILIKE $2 AND book_name NOT ILIKE $3)
          OR book_name ILIKE $4)
       ORDER BY cd_num, track_num`,
      [`%${fullBookSegment}%`, `%${baseBook}%`, `%${baseBook}_AB%`, `%${bookTitleSegment}%`]
    );
    // Post-filter: exclude AB tracks when showing Kursbuch, exclude KB tracks when showing Arbeitsbuch
    if (isKursbuch) {
      audio.rows = audio.rows.filter(r => !r.file_name.includes('_AB_'));
    } else if (isArbeitsbuch) {
      audio.rows = audio.rows.filter(r => !r.file_name.includes('_KB_'));
    }
    const audioTracks = audio.rows.map(r => {
      const rel = normalizeCourseRelativePath(r.file_path);
      let transcriptionContent = null;
      let translationContent = null;
      if (r.transcription_path && fs.existsSync(r.transcription_path)) {
        const fullContent = fs.readFileSync(r.transcription_path, 'utf-8');
        const marker = '---ENGLISH---';
        const idx = fullContent.indexOf(marker);
        if (idx !== -1) {
          transcriptionContent = fullContent.substring(0, idx).trim();
          translationContent = fullContent.substring(idx + marker.length).trim();
        } else {
          transcriptionContent = fullContent.trim();
        }
      } else if (r.translation_path && r.translation_path !== r.transcription_path && fs.existsSync(r.translation_path)) {
        const fullContent = fs.readFileSync(r.translation_path, 'utf-8');
        const marker = '---ENGLISH---';
        const idx = fullContent.indexOf(marker);
        if (idx !== -1) {
          transcriptionContent = fullContent.substring(0, idx).trim();
          translationContent = fullContent.substring(idx + marker.length).trim();
        } else {
          transcriptionContent = fullContent.trim();
        }
      }
      return {
        id: r.id,
        name: r.file_name,
        url: rel ? '/audio/' + rel : '',
        cd: r.cd_num || null,
        track: r.track_num || null,
        transcription_path: r.transcription_path || null,
        translation_path: r.translation_path || null,
        transcription_content: transcriptionContent,
        translation_content: translationContent,
      };
    });

    // 6) Audio references for THIS specific page (from scan results)
    const pageAudioRefs = await pool.query(
      `SELECT cd_num, track_num, exercise_text, has_transcription, has_answers, section_type
       FROM page_audio_refs WHERE book_name = $1 AND page_num = $2`,
      [book, page]
    );
    const audioRefs = pageAudioRefs.rows.filter(r => r.cd_num !== null);

    // 7) Transcriptions for this page (from dokument_segmente)
    const trans = await pool.query(
      `SELECT id, typ, ziel, lektion, inhalt
       FROM dokument_segmente
       WHERE book_name = $1 AND seite_von <= $2 AND seite_bis >= $2
       ORDER BY typ, id`,
      [book, page]
    );
    const transkriptionen = trans.rows.filter(r => r.typ === 'Transkription' || r.typ === 'mixed');
    const loesungen = trans.rows.filter(r => r.typ === 'Loesung');

    // 8) Answers from page_audio_refs
    const pageAnswers = pageAudioRefs.rows.filter(r => r.has_answers);

    // Convert jpg_path to a URL-ready path
    let jpgUrl = null;
    const jp = row.jpg_path;
    if (jp) {
      const pagesPrefix = '/home/f/deutsch-app/pages/';
      if (jp.startsWith(pagesPrefix)) {
        jpgUrl = '/pages/' + jp.slice(pagesPrefix.length);
      } else if (jp.startsWith(COURSES_DIR)) {
        jpgUrl = '/files/' + path.relative(COURSES_DIR, jp);
      } else {
        jpgUrl = '/files/' + jp;
      }
    }

    res.json({
      book,
      page,
      jpg_path: jpgUrl,
      pdf_path: row.pdf_path,
      txt_path: row.txt_path,
      ai_path: row.ai_path,
      txt_content: txtContent,
      ai_content: aiContent,
      vocabulary: vocab.rows,
      audio_tracks: audioTracks,
      audio_refs: audioRefs,
      transkriptionen: transkriptionen.map(r => ({
        lektion: r.lektion,
        ziel: r.ziel,
        inhalt: r.inhalt,
      })),
      loesungen: loesungen.map(r => ({
        lektion: r.lektion,
        ziel: r.ziel,
        inhalt: r.inhalt,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === dokument_segmente endpoints ===

// GET /books/:bookId/transkriptionen — Transkription segments for a book
app.get('/books/:bookId/transkriptionen', async (req, res) => {
  try {
    const { bookId } = req.params;
    const { lektion, ziel } = req.query;
    let sql = `SELECT id, lektion, ziel, source_book, source_page, inhalt 
               FROM dokument_segmente 
               WHERE book_name = $1 AND typ = 'Transkription'`;
    const params = [bookId];
    if (lektion) { sql += ` AND lektion = $2`; params.push(String(lektion)); }
    if (ziel) { sql += ` AND ziel = $3`; params.push(String(ziel)); }
    sql += ` ORDER BY source_page`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error('transkriptionen error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /books/:bookId/loesungen — Loesung segments for a book
app.get('/books/:bookId/loesungen', async (req, res) => {
  try {
    const { bookId } = req.params;
    const { lektion, ziel } = req.query;
    let sql = `SELECT id, lektion, ziel, source_book, source_page, inhalt 
               FROM dokument_segmente 
               WHERE book_name = $1 AND typ = 'Loesung'`;
    const params = [bookId];
    if (lektion) { sql += ` AND lektion = $2`; params.push(String(lektion)); }
    if (ziel) { sql += ` AND ziel = $3`; params.push(String(ziel)); }
    sql += ` ORDER BY source_page`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error('loesungen error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /segments/search — Full text search across segment content
app.get('/segments/search', async (req, res) => {
  try {
    const { q, book } = req.query;
    if (!q || String(q).trim().length === 0) {
      return res.status(400).json({ error: 'query parameter q is required' });
    }
    let sql = `SELECT id, book_name, typ, ziel, lektion, source_page, 
                      SUBSTRING(inhalt, GREATEST(POSITION($1 IN LOWER(inhalt)) - 100, 1), 200) AS snippet
               FROM dokument_segmente 
               WHERE LOWER(inhalt) LIKE $1`;
    const params = [`%${String(q).toLowerCase()}%`];
    if (book) { sql += ` AND book_name = $2`; params.push(String(book)); }
    sql += ` LIMIT 20`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error('segments search error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /books/:bookId/lektionen — map pages to Lektionen for a book
app.get('/books/:bookId/lektionen', async (req, res) => {
  try {
    const { bookId } = req.params;
    const r = await pool.query(`
      SELECT lektion, MIN(source_page)::int as page_min, MAX(source_page)::int as page_max
      FROM dokument_segmente
      WHERE book_name = $1 AND lektion IS NOT NULL AND lektion != ''
      GROUP BY lektion
      ORDER BY page_min
    `, [bookId]);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/grammar — grammar points for a book, optionally filtered by page
app.get('/api/grammar', async (req, res) => {
  try {
    const { book, page } = req.query;
    if (!book) return res.status(400).json({ error: 'book query param required' });

    const results = [];
    
    if (page) {
      // Single page grammar — read that page's AI file via materials_registry
      const pageNum = parseInt(page, 10);
      const reg = await pool.query(
        `SELECT ai_path FROM materials_registry WHERE book_name = $1 AND page_num = $2 AND (dead IS NULL OR dead = false) LIMIT 1`,
        [book, pageNum]
      );
      const aiPath = reg.rows[0]?.ai_path;
      if (aiPath && fs.existsSync(aiPath)) {
        const content = fs.readFileSync(aiPath, 'utf-8');
        const grammarMatch = content.match(/^GRAMMAR:\n([\s\S]*?)(?:\n\n|\nSUMMARY:|$)/m);
        if (grammarMatch) {
          results.push({ page: pageNum, grammar: grammarMatch[1].trim() });
        }
      }
    } else {
      // All pages — query materials_registry for all ai_paths
      const pages = await pool.query(
        `SELECT page_num, ai_path FROM materials_registry WHERE book_name = $1 AND (dead IS NULL OR dead = false) AND ai_path IS NOT NULL ORDER BY page_num LIMIT 500`,
        [book]
      );
      for (const row of pages.rows) {
        if (row.ai_path && fs.existsSync(row.ai_path)) {
          try {
            const content = fs.readFileSync(row.ai_path, 'utf-8');
            const grammarMatch = content.match(/^GRAMMAR:\n([\s\S]*?)(?:\n\n|\nSUMMARY:|$)/m);
            if (grammarMatch) {
              results.push({
                page: row.page_num,
                grammar: grammarMatch[1].trim(),
              });
            }
          } catch {}
        }
      }
    }

    res.json({ pages: results.length, grammar: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/phrases/random', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 1, 10);
    const fallback = [
      { pregunta: 'Ich ___ (gehen) nach Hause.', respuesta: 'gehe' },
      { pregunta: 'Er ___ (lesen) ein Buch.', respuesta: 'liest' },
      { pregunta: 'Wir ___ (spielen) Fußball.', respuesta: 'spielen' },
    ];
    res.json(fallback.slice(0, limit));
  } catch (e) {
    console.error('phrases/random error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/vocabulary/random — random words for Wortsuche game
app.get('/api/vocabulary/random', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const wortart = req.query.wortart;
    let sql = `SELECT wort, artikel, wortart, übersetzung_es, english
               FROM vocabulario
               WHERE wort IS NOT NULL AND LENGTH(wort) >= 3 AND LENGTH(wort) <= 12`;
    const params = [];
    if (wortart) { sql += ` AND wortart = $2`; params.push(String(wortart)); }
    sql += ` ORDER BY RANDOM() LIMIT $1`;
    const r = await pool.query(sql, [limit, ...params]);
    res.json(r.rows);
  } catch (e) {
    console.error('vocabulary/random error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/verbs/random — random verb for Verb Conjugator
app.get('/api/verbs/random', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 1, 20);
    const r = await pool.query(`
      SELECT infinitive, praesens_ich, praesens_du, praesens_er,
             auxiliary_verb, english, spanish_translation, french,
             praeteritum, perfekt, konjunktiv_ii_ich,
             imperativ_singular, imperativ_plural
      FROM german_verbs
      WHERE infinitive IS NOT NULL
      ORDER BY RANDOM() LIMIT $1
    `, [limit]);
    res.json(r.rows);
  } catch (e) {
    console.error('verbs/random error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quiz/artikel — random noun article quiz
app.get('/api/quiz/artikel', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    // Use vocabulario for real words with translations, fallback to goethe_wortschatz
    const r = await pool.query(`
      SELECT DISTINCT ON (v.palabra)
        v.id, v.palabra, v.artikel, v.traduccion, v.english,
        CASE WHEN v.palabra ~ '^(der|die|das) ' THEN substring(v.palabra from 5) ELSE v.palabra END as wort
      FROM vocabulario v
      WHERE v.artikel IN ('der','die','das')
        AND v.palabra IS NOT NULL
        AND LENGTH(v.palabra) > 2
        AND v.palabra ~ '^[A-ZÄÖÜ][a-zäöüß]+$'
        AND NOT v.palabra ~ '^(der|die|das) '
      ORDER BY v.palabra, RANDOM()
      LIMIT $1
    `, [limit]);
    // Fallback to goethe_wortschatz if vocabulario returns too few
    if (r.rows.length < limit) {
      const g = await pool.query(`
        SELECT id, wort AS palabra, artikel, '' AS traduccion, '' AS english
        FROM goethe_wortschatz
        WHERE artikel IN ('der','die','das')
          AND wort IS NOT NULL
          AND LENGTH(wort) > 2
          AND wort ~ '^[A-ZÄÖÜ][a-zäöüß]+$'
        ORDER BY RANDOM()
        LIMIT $1
      `, [limit - r.rows.length]);
      res.json([...r.rows, ...g.rows]);
    } else {
      res.json(r.rows);
    }
  } catch (e) {
    console.error('quiz/artikel error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quiz/cases — case practice (Nominativ/Akkusativ/Dativ/Genitiv)
app.get('/api/quiz/cases', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const r = await pool.query(`
      SELECT id, palabra, artikel, traduccion, english
      FROM vocabulario
      WHERE wortart = 'Substantiv'
        AND artikel IN ('der','die','das')
        AND palabra IS NOT NULL
        AND LENGTH(palabra) > 2
      ORDER BY RANDOM()
      LIMIT $1
    `, [limit]);

    const CASE_MAP = {
      'der': { Nominativ: 'der', Akkusativ: 'den', Dativ: 'dem', Genitiv: 'des' },
      'die': { Nominativ: 'die', Akkusativ: 'die', Dativ: 'der', Genitiv: 'der' },
      'das': { Nominativ: 'das', Akkusativ: 'das', Dativ: 'dem', Genitiv: 'des' },
    };

    const CASE_SENTENCES = {
      Nominativ: [
        '___ ist ein neues Wort.', '___ steht auf dem Tisch.', '___ gefällt mir sehr gut.',
        '___ ist schon wieder weg.', '___ war gestern in der Schule.',
        'Hier liegt ___.', '___ ist mein Lieblingswort.', '___ schmeckt ausgezeichnet.',
        '___ klingt interessant.', '___ ist teuer.',
        '___ ist heute besonders wichtig.', '___ steht vor der Tür.',
        '___ fällt mir gerade ein.', '___ gehört dazu.',
        '___ wird morgen geliefert.', '___ liegt auf dem Boden.',
        '___ ist schon lange fertig.', '___ schaut schön aus.',
        '___ funktioniert nicht mehr.', '___ ist endlich da.',
      ],
      Akkusativ: [
        'Ich kenne ___ schon lange.', 'Ich sehe ___ jeden Tag.', 'Hast du ___ gesehen?',
        'Er kauft ___ im Laden.', 'Wir besuchen ___ nächste Woche.',
        'Kannst du ___ finden?', 'Sie hat ___ vergessen.', 'Ich mag ___ sehr.',
        'Er isst ___ gern.', 'Wir lesen ___ gerade.',
        'Sie kocht ___ für uns.', 'Ich brauche ___ unbedingt.',
        'Wir haben ___ bestellt.', 'Er trägt ___ in der Hand.',
        'Kannst du ___ öffnen?', 'Ich habe ___ gefunden.',
        'Sie nimmt ___ mit.', 'Wir sehen ___ im Fernsehen.',
        'Er stellt ___ auf den Tisch.', 'Ich schreibe ___ auf.',
      ],
      Dativ: [
        'Ich muss ___ etwas geben.', 'Er hilft ___ bei der Arbeit.', 'Wir danken ___ für alles.',
        'Kannst du ___ antworten?', 'Sie gehört ___ schon seit Jahren.',
        'Er stimmt ___ zu.', 'Wir vertrauen ___.', 'Ich begegne ___ jeden Tag.',
        'Das gehört ___.', 'Er widerspricht ___ selten.',
        'Sie hilft ___ immer.', 'Ich folge ___ bis zum Ende.',
        'Wir gratulieren ___ herzlich.', 'Er begegnet ___ mit Respekt.',
        'Das schadet ___ nicht.', 'Ich danke ___ für die Hilfe.',
        'Sie steht ___ nahe.', 'Wir wünschen ___ alles Gute.',
        'Er erzählt ___ eine Geschichte.', 'Das passt ___ gut.',
      ],
      Genitiv: [
        'Das ist die Bedeutung ___.', 'Wegen ___ bin ich hier.', 'Die Farbe ___ ist schön.',
        'Das ist der Anfang ___.', 'Trotz ___ machen wir weiter.',
        'Während ___ war ich still.', 'Statt ___ nehme ich das andere.',
        'Die Größe ___ ist beeindruckend.', 'Außerhalb ___ gibt es nichts.',
        'Innerhalb ___ gibt es Regeln.',
        'Die Mitte ___ ist markiert.', 'Wegen ___ müssen wir warten.',
        'Die Geschichte ___ ist bekannt.', 'Die Ergebnisse ___ sind gut.',
        'Die Zukunft ___ ist ungewiss.', 'Die Rolle ___ ist wichtig.',
        'Die Entwicklung ___ dauert an.', 'Der Wert ___ wird steigen.',
        'Die Kraft ___ ist beeindruckend.', 'Die Bedeutung ___ ist klar.',
      ],
    };

    function shuffleArray(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const ALL_ARTICLE_FORMS = ['der', 'die', 'das', 'den', 'dem', 'des'];
    const CASES = ['Nominativ', 'Akkusativ', 'Dativ', 'Genitiv'];

    const questions = r.rows.map((row) => {
      const c = CASES[Math.floor(Math.random() * CASES.length)];
      const correctArticle = CASE_MAP[row.artikel][c];
      const wrongArticles = ALL_ARTICLE_FORMS.filter(a => a !== correctArticle);
      const options = shuffleArray([correctArticle, ...shuffleArray(wrongArticles).slice(0, 3)]);
      const templates = CASE_SENTENCES[c];
      const sentence = templates[Math.floor(Math.random() * templates.length)].replace('___', '___');
      return {
        id: row.id,
        word: row.palabra,
        artikel: row.artikel,
        case: c,
        correct: correctArticle,
        options,
        sentence,
        traduccion: row.traduccion,
      };
    });

    res.json(questions);
  } catch (e) {
    console.error('quiz/cases error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [vocabCount, verbCount, audioCount, bookCount, pageCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM vocabulario'),
      pool.query('SELECT COUNT(*) FROM german_verbs'),
      pool.query('SELECT COUNT(*) FROM audio_index'),
      pool.query("SELECT COUNT(*) FROM materials_registry WHERE (dead IS NULL OR dead = false)"),
      pool.query("SELECT COUNT(*) FROM materials_registry WHERE (dead IS NULL OR dead = false) AND jpg_path IS NOT NULL"),
    ]);
    res.json({
      totalVocabulary: parseInt(vocabCount.rows[0].count),
      totalVerbs: parseInt(verbCount.rows[0].count),
      totalAudio: parseInt(audioCount.rows[0].count),
      totalBooks: parseInt(bookCount.rows[0].count),
      totalPagesWithImages: parseInt(pageCount.rows[0].count),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Speaking Evaluation ────────────────────────────────────────
const SPEAKING_EVAL_PY = '/home/f/deutsch-app/scripts/python/speaking_eval.py';
const UPLOAD_DIR = '/tmp/deutsch_speaking';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.post('/api/speaking/evaluate', upload.single('audio'), async (req, res) => {
  try {
    const { expected_text, ref_audio } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const audioFile = req.file;
    const tmpPath = path.join(UPLOAD_DIR, Date.now() + '_' + audioFile.originalname.replace(/[^a-zA-Z0-9_.]/g, '_'));
    await fs.promises.writeFile(tmpPath, audioFile.buffer);
    const args = [SPEAKING_EVAL_PY, tmpPath, expected_text || ''];
    if (ref_audio) args.push(ref_audio);
    const env = { ...process.env, LD_LIBRARY_PATH: '/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cublas/lib:/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cudnn/lib' };
    const proc = spawn('/mnt/storage/venv/bin/python', args, { env });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', (code) => {
      fs.promises.unlink(tmpPath).catch(() => {});
      if (code !== 0) return res.status(500).json({ error: stderr });
      try { res.json(JSON.parse(stdout)); }
      catch (e) { res.status(500).json({ error: 'Parse error', raw: stdout }); }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE version for speaking evaluation
app.post('/api/speaking/evaluate-stream', upload.single('audio'), async (req, res) => {
  try {
    const { expected_text, ref_audio } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const audioFile = req.file;
    const tmpPath = path.join(UPLOAD_DIR, Date.now() + '_' + audioFile.originalname.replace(/[^a-zA-Z0-9_.]/g, '_'));
    await fs.promises.writeFile(tmpPath, audioFile.buffer);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ status: 'started' });
    
    const env = { ...process.env, LD_LIBRARY_PATH: '/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cublas/lib:/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cudnn/lib' };
    const args = [SPEAKING_EVAL_PY, tmpPath, expected_text || ''];
    if (ref_audio) args.push(ref_audio);
    const proc = spawn('/mnt/storage/venv/bin/python', args, { env });
    
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    
    proc.on('close', (code) => {
      fs.promises.unlink(tmpPath).catch(() => {});
      if (code !== 0) {
        send({ error: stderr });
        res.end();
        return;
      }
      try { 
        const result = JSON.parse(stdout.trim());
        send({ status: 'done', result });
      } catch (e) { 
        send({ error: 'Parse error: ' + stdout }); 
      }
      res.end();
    });
  } catch (e) { 
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

app.post('/api/speaking/evaluate-base64', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { audio_base64, expected_text, ref_audio } = req.body;
    if (!audio_base64) return res.status(400).json({ error: 'No audio data' });
    const buf = Buffer.from(audio_base64, 'base64');
    const tmpPath = path.join(UPLOAD_DIR, Date.now() + '_speaking.wav');
    await fs.promises.writeFile(tmpPath, buf);
    const env = { ...process.env, LD_LIBRARY_PATH: '/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cublas/lib:/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cudnn/lib' };
    const args = [SPEAKING_EVAL_PY, tmpPath, expected_text || ''];
    if (ref_audio) args.push(ref_audio);
    const proc = spawn('/mnt/storage/venv/bin/python', args, { env });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', (code) => {
      fs.promises.unlink(tmpPath).catch(() => {});
      if (code !== 0) return res.status(500).json({ error: stderr });
      try { res.json(JSON.parse(stdout)); }
      catch (e) { res.status(500).json({ error: 'Parse error', raw: stdout }); }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Speaking Analyze (DTW/MFCC-based audio comparison) ────────
const AUDIO_EVAL_PY = '/home/f/deutsch-app/scripts/python/audio_eval.py';

app.post('/api/speaking/analyze', upload.single('audio'), async (req, res) => {
  try {
    const { expected_text, ref_audio } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const audioFile = req.file;
    const tmpPath = path.join(UPLOAD_DIR, Date.now() + '_analyze_' + audioFile.originalname.replace(/[^a-zA-Z0-9_.]/g, '_'));
    await fs.promises.writeFile(tmpPath, audioFile.buffer);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ status: 'started' });

    const args = [AUDIO_EVAL_PY, tmpPath, expected_text || ''];
    if (ref_audio) {
      const refPath = path.resolve(COURSES_DIR, ref_audio.replace(/^\/audio\//, ''));
      if (fs.existsSync(refPath)) {
        args.push(refPath);
      } else {
        send({ status: 'warning', message: `Reference audio not found at ${refPath}, falling back to text comparison` });
      }
    }

    const env = { ...process.env, LD_LIBRARY_PATH: '/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cublas/lib:/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cudnn/lib' };
    const proc = spawn('/mnt/storage/venv/bin/python', args, { env });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', async (code) => {
      await fs.promises.unlink(tmpPath).catch(() => {});
      if (code !== 0) {
        send({ error: stderr + '\n' + stdout.slice(0, 500) });
        res.end();
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        send({ status: 'done', result });
      } catch (e) {
        send({ error: 'Parse error: ' + stdout.slice(0, 500) });
      }
      res.end();
    });
  } catch (e) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

// ── Speaking Test MP3s ─────────────────────────────────────────
const TEST_MP3_DIR = '/home/f/deutsch-app/test-mp3';

app.get('/api/speaking/test-manifest', async (req, res) => {
  try {
    const manifestPath = path.join(TEST_MP3_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return res.json({ files: [] });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    // Add file URL for each entry
    const files = manifest.map((entry) => ({
      ...entry,
      url: `/test-mp3/${encodeURIComponent(entry.file)}`,
    }));
    res.json({ files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/test-mp3', express.static(TEST_MP3_DIR));

// GET /api/audio/find — look up original audio by book/CD/track
app.get('/api/audio/find', async (req, res) => {
  try {
    const { book, cd, track } = req.query;
    if (!book) return res.json({ url: null });
    const trackNum = parseInt(track) || null;
    const cdNum = parseInt(cd) || null;
    const { rows } = await pool.query(`
      SELECT file_name, file_path FROM audio_index
      WHERE book_name ILIKE $1
        AND ($2::int IS NULL OR cd_num = $2::int)
        AND ($3::int IS NULL OR track_num = $3::int)
      LIMIT 1
    `, [`%${book}%`, cdNum, trackNum]);
    if (rows.length > 0 && rows[0].file_path) {
      res.json({ url: `/audio/${encodeURIComponent(rows[0].file_path.replace(/^\/+/, ''))}` });
    } else {
      res.json({ url: null });
    }
  } catch (e) { res.status(500).json({ url: null, error: e.message }); }
});

// ── Dictionary API ─────────────────────────────────────────────
app.get('/api/dictionary/search', async (req, res) => {
  try {
    const { q, type, limit = '50', offset = '0' } = req.query;
    if (!q) return res.json({ count: 0, data: [] });
    let sql = "SELECT id, german_word, artikel, english, domains, word_type FROM dictionary WHERE german_word ILIKE $1";
    const params = [`${q}%`];
    if (type) { sql += ` AND word_type = $${params.length+1}`; params.push(type); }
    sql += ' ORDER BY LENGTH(german_word) LIMIT ' + parseInt(limit) + ' OFFSET ' + parseInt(offset);
    const r = await pool.query(sql, params);
    res.json({ count: r.rows.length, total: 205907, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/vocab/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [] });
    const r = await pool.query(`
      SELECT palabra, artikel, plural, traduccion, english, french,
             wortart, kontext, nivel, lektion, seite, source_file, audio_url
      FROM vocabulario
      WHERE palabra ILIKE $1
         OR traduccion ILIKE $2
         OR english ILIKE $2
      ORDER BY LENGTH(palabra)
      LIMIT 30
    `, [`${q}%`, `%${q}%`]);
    res.json({ count: r.rows.length, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dictionary/random', async (req, res) => {
  try {
    const { type, limit = '10' } = req.query;
    let sql = "SELECT id, german_word, artikel, english, domains, word_type FROM dictionary";
    const params = [];
    if (type) { sql += ' WHERE word_type = $1'; params.push(type); }
    sql += ' ORDER BY RANDOM() LIMIT ' + parseInt(limit);
    const r = await pool.query(sql, params);
    res.json({ count: r.rows.length, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Leipzig corpus sentence examples ──────────────────────────
app.get('/api/sentence-examples', async (req, res) => {
  try {
    const word = (req.query.word || '').trim()
    const max = Math.min(parseInt(req.query.max) || 3, 10)
    if (!word) return res.status(400).json({ error: 'word query param required' })
    const r = await pool.query('SELECT sentence, source_name FROM get_example_sentences($1, $2)', [word, max])
    res.json({ word, examples: r.rows.map(row => ({ sentence: row.sentence, source: row.source_name })) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Collocations API (case-insensitive lookup) ────────────────
app.get('/api/collocations', async (req, res) => {
  try {
    const word = (req.query.word || '').trim().toLowerCase()
    if (!word) return res.status(400).json({ error: 'word query param required' })
    const limit = Math.min(parseInt(req.query.max) || 10, 50)
    const r = await pool.query(`
      SELECT word_1, word_2, frequency FROM collocations
      WHERE LOWER(word_1) = $1 OR LOWER(word_2) = $1
      ORDER BY frequency DESC LIMIT $2
    `, [word, limit])
    const partners = r.rows.map(row => {
      const partner = row.word_1.toLowerCase() === word ? row.word_2 : row.word_1
      return { word: partner, frequency: row.frequency }
    })
    const enriched = []
    for (const p of partners.slice(0, 5)) {
      const ex = await pool.query('SELECT sentence, source_name FROM get_collocation_sentences($1, $2, 1)', [word, p.word])
      const examples = ex.rows.map(row => ({ sentence: row.sentence, source: row.source_name }))
      enriched.push({ ...p, examples })
    }
    res.json({ word, collocations: enriched })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Goethe plural stats (placed before generic :level route) ──
app.get('/api/goethe/plural-stats', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM goethe_plural_stats ORDER BY level, cnt DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Goethe Level Views API ─────────────────────────────────────
app.get('/api/goethe-view/:level', async (req, res) => {
  try {
    const level = req.params.level.toUpperCase();
    if (!['A1','A2','B1'].includes(level)) return res.status(400).json({ error: 'Invalid level' });
    const { type, search, rule, limit = '500', offset = '0' } = req.query;
    let sql = `SELECT * FROM goethe_${level.toLowerCase()} WHERE 1=1`;
    const params = [];
    if (type) { sql += ` AND wortart = $${params.length+1}`; params.push(type); }
    if (search) { sql += ` AND (wort ILIKE $${params.length+1} OR beispiel ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    if (rule) { sql += ` AND plural_rule = $${params.length+1}`; params.push(rule); }
    sql += ' ORDER BY wort LIMIT ' + parseInt(limit) + ' OFFSET ' + parseInt(offset);
    const r = await pool.query(sql, params);
    res.json({ count: r.rows.length, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Plural Engine API (build plural from pattern) ──────────────
app.post('/api/plural/build', express.json(), async (req, res) => {
  try {
    const { word, article, umlaut, suffix } = req.body;
    if (!word) return res.status(400).json({ error: 'word required' });
    const { spawnSync } = require('child_process');
    const py = '/mnt/storage/venv/bin/python';
    const script = '/home/f/deutsch-app/scripts/python/plural_engine.py';
    const proc = spawnSync(py, [script, 'build', word, article || '', umlaut || '', suffix || '']);
    if (proc.error) return res.status(500).json({ error: proc.error.message });
    const out = proc.stdout.toString().trim();
    try { res.json(JSON.parse(out)); }
    catch (e) { res.status(500).json({ error: 'Parse error', raw: out }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dictionary enriched API ────────────────────────────────────
app.get('/api/dictionary/domains', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT domains, COUNT(*) as cnt FROM dictionary 
      WHERE domains IS NOT NULL AND domains != '' 
      GROUP BY domains ORDER BY cnt DESC LIMIT 100
    `);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dictionary/word-types', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT word_type, COUNT(*) as cnt FROM dictionary 
      WHERE word_type IS NOT NULL AND word_type != '' 
      GROUP BY word_type ORDER BY cnt DESC
    `);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Writing Evaluation (SSE streaming to avoid timeout) ─────────
const WRITING_EVAL_PY = '/home/f/deutsch-app/scripts/python/writing_eval.py';

app.post('/api/writing/evaluate', express.json(), async (req, res) => {
  try {
    const { text, level, prompt } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const sendError = (err) => { send({ error: err }); res.end(); };
    
    send({ status: 'started' });
    
    const { spawn } = require('child_process');
    const py = '/mnt/storage/venv/bin/python';
    const proc = spawn(py, [WRITING_EVAL_PY, 'evaluate', text, level || 'A1', prompt]);
    
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    
    proc.on('close', (code) => {
      if (code !== 0) {
        sendError(stderr || 'Evaluation failed');
        return;
      }
      try { 
        const result = JSON.parse(stdout.trim());
        send({ status: 'done', result });
      } catch (e) { 
        sendError('Parse error: ' + stdout); 
      }
      res.end();
    });
  } catch (e) { 
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

app.get('/api/writing/prompts', async (req, res) => {
  try {
    const level = (req.query.level || 'A1').toUpperCase();
    const { spawnSync } = require('child_process');
    const py = '/mnt/storage/venv/bin/python';
    const proc = spawnSync(py, [WRITING_EVAL_PY, 'prompts', level]);
    const out = proc.stdout.toString().trim();
    try { res.json(JSON.parse(out)); }
    catch (e) { res.status(500).json({ error: 'Parse error', raw: out }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Writing Model Text Generation (Ollama) ────────────────────
app.post('/api/writing/model', express.json(), async (req, res) => {
  try {
    const { level, prompt } = req.body;
    if (!level) return res.status(400).json({ error: 'level required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const sendError = (err) => { send({ error: err }); res.end(); };

    send({ status: 'started' });

    const { spawn } = require('child_process');
    const py = '/mnt/storage/venv/bin/python';
    const proc = spawn(py, [WRITING_EVAL_PY, 'model', level, prompt || 'allgemein']);

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', (code) => {
      if (code !== 0) {
        sendError(stderr || 'Model generation failed');
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        send({ status: 'done', result });
      } catch (e) {
        sendError('Parse error: ' + stdout);
      }
      res.end();
    });
  } catch (e) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

// ── Speaking level-appropriate phrases ─────────────────────────
app.get('/api/speaking/phrases', async (req, res) => {
  try {
    const level = (req.query.level || 'A1').toUpperCase();
    const limit = Math.min(parseInt(req.query.limit) || 10, 30);

    const levelConditions = {
      A1: `(book_name ILIKE '%A1%' OR book_name ILIKE 'Tangram_1%' OR book_name ILIKE 'Lagune_1%')`,
      A2: `(book_name ILIKE '%A2%' OR book_name ILIKE 'Tangram_2%' OR book_name ILIKE 'Lagune_2%')`,
      B1: `(book_name ILIKE '%B1%' OR book_name ILIKE 'Tangram_3%' OR book_name ILIKE 'Lagune_3%')`,
      B2: `(book_name ILIKE '%B2%')`,
    };
    const levelFilter = levelConditions[level] || 'TRUE';

    const r = await pool.query(`
      SELECT id, inhalt, lektion, ziel, book_name
      FROM dokument_segmente
      WHERE typ = 'Transkription' AND inhalt IS NOT NULL
        AND ${levelFilter}
      ORDER BY RANDOM() LIMIT $1
    `, [Math.max(limit, 3)]);
    const phrases = [];
    for (const row of r.rows) {
      const sentences = row.inhalt
        .split(/[.!?]+/g)
        .map(s => s.replace(/[\n\r]+/g, ' ').trim())
        .filter(s => {
          const len = s.length;
          if (level === 'A1') return len >= 10 && len <= 100;
          if (level === 'A2') return len >= 15 && len <= 150;
          if (level === 'B1') return len >= 20 && len <= 250;
          return len >= 30 && len <= 400;
        })
        .slice(0, 5);
      for (const s of sentences) {
        phrases.push({ text: s, text_de: s, lektion: row.lektion, ziel: row.ziel, book_name: row.book_name });
        if (phrases.length >= limit) break;
      }
      if (phrases.length >= limit) break;
    }
    res.json(phrases.slice(0, limit));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Generic Goethe Wortschatz (keep after specific goethe routes) ──
app.get('/api/goethe/:level', async (req, res) => {
  try {
    const { level } = req.params;
    const { type, search, limit = '500', offset = '0' } = req.query;
    let sql = 'SELECT * FROM goethe_wortschatz WHERE level = $1';
    const params = [level.toUpperCase()];
    if (type) { sql += ' AND wortart = $2'; params.push(type); }
    if (search) { sql += ` AND (wort ILIKE $${params.length+1} OR beispiel ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    sql += ' ORDER BY wort LIMIT ' + parseInt(limit) + ' OFFSET ' + parseInt(offset);
    const r = await pool.query(sql, params);
    res.json({ count: r.rows.length, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/goethe/:level/plural', async (req, res) => {
  try {
    const { level } = req.params;
    const r = await pool.query(`
      SELECT DISTINCT ON (gw.wort)
        gw.*,
        COALESCE(v.traduccion, v2.traduccion, '') as traduccion,
        COALESCE(v.english, v2.english, '') as english,
        COALESCE(v.french, v2.french, '') as french
      FROM goethe_wortschatz gw
      LEFT JOIN vocabulario v ON LOWER(v.palabra) = LOWER(gw.wort) AND v.wortart = 'Substantiv'
      LEFT JOIN vocabulario v2 ON LOWER(v2.palabra) = LOWER(gw.wort)
      WHERE gw.level = $1 AND (gw.plural_suffix != '' OR gw.umlaut != '') AND gw.plural_form != ''
      ORDER BY gw.wort, v.traduccion NULLS LAST, v2.traduccion NULLS LAST
    `, [level.toUpperCase()]);
    res.json({ count: r.rows.length, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/goethe/stats', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT level, wortart, COUNT(*) as cnt FROM goethe_wortschatz GROUP BY level, wortart ORDER BY level, cnt DESC
    `);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Page Content Index API ──────────────────────────────────────
// GET /api/page/content-index?book=<name>&page=<num>
app.get('/api/page/content-index', async (req, res) => {
  const { book, page } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM page_content_index WHERE book_name = $1 AND page_num = $2`,
      [book, parseInt(page)]
    );
    res.json({ data: rows[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/book/content-map?book=<name>  — full map of content types by page
app.get('/api/book/content-map', async (req, res) => {
  const { book } = req.query;
  try {
    const { rows } = await pool.query(`
      SELECT page_num,
             has_cd_refs, has_grammar, has_listening, has_speaking,
             has_answers, has_vocabulary_list, has_reading_text,
             has_writing_prompt, has_exercises,
             cd_refs, grammar_topics, section_labels
      FROM page_content_index
      WHERE book_name = $1
      ORDER BY page_num
    `, [book]);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/book/cd-map?book=<name>  — all CD track references found in OCR
app.get('/api/book/cd-map', async (req, res) => {
  const { book } = req.query;
  try {
    const { rows } = await pool.query(`
      SELECT page_num, cd_refs
      FROM page_content_index
      WHERE book_name = $1 AND has_cd_refs = true
      ORDER BY page_num
    `, [book]);
    const flat = rows.flatMap(r =>
      (r.cd_refs || []).map(ref => ({ page: r.page_num, ...ref }))
    );
    res.json({ data: flat });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/book/section-jump?book=<name>&type=grammar|listening|answers|speaking
app.get('/api/book/section-jump', async (req, res) => {
  const { book, type } = req.query;
  const colMap = {
    grammar: 'has_grammar', listening: 'has_listening',
    speaking: 'has_speaking', answers: 'has_answers',
    exercises: 'has_exercises', writing: 'has_writing_prompt',
    vocabulary: 'has_vocabulary_list', reading: 'has_reading_text',
  };
  const col = colMap[type];
  if (!col) return res.status(400).json({ error: 'Unknown section type' });
  try {
    const { rows } = await pool.query(
      `SELECT page_num, grammar_topics, section_labels, cd_refs
       FROM page_content_index WHERE book_name = $1 AND ${col} = true ORDER BY page_num`,
      [book]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/book/ocr-search?book=<name>&q=<query>  — full-text search in OCR
app.get('/api/book/ocr-search', async (req, res) => {
  const { book, q } = req.query;
  if (!q) return res.json({ data: [] });
  try {
    const { rows } = await pool.query(`
      SELECT page_num,
             ts_headline('german', ocr_text, plainto_tsquery('german', $2),
               'MaxWords=20, MinWords=5, ShortWord=3, HighlightAll=false') AS snippet
      FROM page_content_index
      WHERE book_name = $1
        AND to_tsvector('german', coalesce(ocr_text,'')) @@ plainto_tsquery('german', $2)
      ORDER BY page_num
      LIMIT 30
    `, [book, q]);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/debug/error', express.json(), (req, res) => {
  const { message, stack, componentStack } = req.body || {};
  console.error('=== FRONTEND ERROR ===');
  console.error('Message:', message);
  console.error('Stack:', stack?.substring(0, 2000));
  console.error('Component Stack:', componentStack?.substring(0, 2000));
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok', port: PORT }));

// ── Piper TTS ────────────────────────────────────────────────
const TTS_VOICES = {
  thorsten: PIPER_VOICES + '/de_DE-thorsten-high.onnx',
  eva: PIPER_VOICES + '/de_DE-eva_k-x_low.onnx',
};

app.get('/api/tts', async (req, res) => {
  const text = (req.query.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text query parameter required' });

  const voice = req.query.voice || 'thorsten';
  const modelPath = TTS_VOICES[voice];
  if (!modelPath) return res.status(400).json({ error: `Unknown voice: ${voice}. Use thorsten or eva.` });

  const tmpFile = `/tmp/tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(PIPER_PATH, ['--model', modelPath, '--output-file', tmpFile], {
        stdio: ['pipe', 'inherit', 'pipe'],
      });
      proc.stdin.write(text);
      proc.stdin.end();
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`Piper exited with code ${code}`));
        else resolve();
      });
    });

    if (!fs.existsSync(tmpFile)) {
      return res.status(500).json({ error: 'TTS generation failed - no output file' });
    }

    const stat = fs.statSync(tmpFile);
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': stat.size,
    });
    const readStream = fs.createReadStream(tmpFile);
    readStream.pipe(res);
    readStream.on('end', () => { fs.unlink(tmpFile, () => {}); });
  } catch (e) {
    fs.unlink(tmpFile, () => {});
    res.status(500).json({ error: e.message });
  }
});

// ── Dictionary search (local 205k-entry DE↔EN dictionary) ────
app.get('/api/dict/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const from = (req.query.from || 'de').toLowerCase();
  const to = (req.query.to || 'en').toLowerCase();
  if (!q) return res.status(400).json({ error: 'q query parameter required' });

  try {
    let results = [];
    if (from === 'de' && to === 'en') {
      // German → English: search dictionary table
      const dict = await pool.query(
        `SELECT german_word, english, artikel, word_type
         FROM dictionary
         WHERE german_word % $1 OR german_word ILIKE $2
         ORDER BY similarity(german_word, $1) DESC, LENGTH(german_word) ASC
         LIMIT 20`,
        [q, '%' + q + '%']
      );
      results = dict.rows.map(r => ({
        source: r.german_word,
        target: r.english,
        artikel: r.artikel || null,
        type: r.word_type || null,
        dict: 'dictionary'
      }));
    } else if (from === 'en' && to === 'de') {
      // English → German: reverse search dictionary.english
      // Use ILIKE only (not % similarity) — english column is verbose multi-def text,
      // so trigram similarity has too many false positives and is slow
      const dict = await pool.query(
        `SELECT german_word, english, artikel, word_type
         FROM dictionary
         WHERE english ILIKE $1
         ORDER BY LENGTH(english) ASC
         LIMIT 20`,
        ['%' + q + '%']
      );
      results = dict.rows.map(r => ({
        source: r.english,
        target: r.german_word,
        artikel: r.artikel || null,
        type: r.word_type || null,
        dict: 'dictionary'
      }));
    }

    // Also search vocabulario for word pairs
    const vocabPattern = '%' + q + '%';
    const vocab = await pool.query(
      `SELECT palabra, english, traduccion, french, artikel, wortart
       FROM vocabulario
       WHERE palabra ILIKE $1 OR english ILIKE $1
       LIMIT 10`,
      [vocabPattern]
    );
    for (const r of vocab.rows) {
      const matchedDe = r.palabra && r.palabra.toLowerCase().includes(q.toLowerCase());
      const matchedEn = r.english && r.english.toLowerCase().includes(q.toLowerCase());
      if (from === 'de' && matchedDe) {
        results.push({
          source: r.palabra,
          target: r.english || r.traduccion || r.french || null,
          artikel: r.artikel || null,
          type: r.wortart || null,
          dict: 'vocabulario'
        });
      } else if (from === 'en' && matchedEn) {
        results.push({
          source: r.english,
          target: r.palabra,
          artikel: r.artikel || null,
          type: r.wortart || null,
          dict: 'vocabulario'
        });
      }
    }

    // Deduplicate by source+target
    const seen = new Set();
    results = results.filter(r => {
      const k = r.source + '|' + r.target;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    res.json({ query: q, from, to, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Graded Readers API ─────────────────────────────────────────
app.get('/api/readers', async (req, res) => {
  try {
    const level = (req.query.level || '').toUpperCase();
    let sql = 'SELECT id, title, level, word_count, vocabulary_count, source, created_at FROM graded_readers';
    const params = [];
    if (['A1','A2','B1','B2','C1','C2'].includes(level)) {
      sql += ' WHERE level = $1';
      params.push(level);
    }
    sql += ' ORDER BY created_at DESC';
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/readers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reader = await pool.query('SELECT * FROM graded_readers WHERE id = $1', [id]);
    if (!reader.rows.length) return res.status(404).json({ error: 'Reader not found' });
    const questions = await pool.query(
      'SELECT id, question, options, correct, order_num FROM reader_questions WHERE reader_id = $1 ORDER BY order_num',
      [id]
    );
    res.json({ ...reader.rows[0], questions: questions.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/readers/generate', express.json(), async (req, res) => {
  try {
    const { level, sphere, title } = req.body;
    if (!level) return res.status(400).json({ error: 'level required' });
    const py = 'python3';
    const script = '/mnt/storage/deutsch-app/scripts/python/generate_reader.py';
    const args = [script, '--level', level];
    if (title) { args.push('--title', title); }
    if (sphere) { args.push('--sphere', sphere); }
    args.push('--words', '20');
    const { spawnSync } = require('child_process');
    const proc = spawnSync(py, args, { encoding: 'utf8', timeout: 180000 });
    if (proc.error) return res.status(500).json({ error: proc.error.message, stderr: proc.stderr });
    const lastId = await pool.query('SELECT MAX(id) as id FROM graded_readers');
    res.json({ id: lastId.rows[0]?.id, output: proc.stdout, stderr: proc.stderr });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server: http://localhost:${PORT}`));
