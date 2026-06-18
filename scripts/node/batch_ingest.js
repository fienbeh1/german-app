const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const axios = require('axios');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const BASE_DIR = '/home/f/deutsch-app/de';
const ENABLE_AI = false;

const DB_CONFIG = {
  user: 'f',
  host: 'localhost',
  database: 'deutsch',
  password: '187.190.78.100',
  port: 5432,
};

const OLLAMA_CONFIG = {
  url: 'http://localhost:11434/api/generate',
  model: 'qwen_linguist:latest',
  timeout: 60000 // 1 minute per page timeout
};

// ─── SCHEMA SETUP ──────────────────────────────────────────────────────────────
async function ensureSchema(pg) {
  await pg.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS german_library (
      id               SERIAL PRIMARY KEY,
      book_title       VARCHAR(255),
      page_number      INTEGER,
      ocr_text         TEXT,
      ocr_path         VARCHAR(512),
      structured_data  JSONB,
      pdf_path         VARCHAR(512),
      audio_paths      JSONB,
      UNIQUE(book_title, page_number)
    );
  `);
  await pg.query(`ALTER TABLE german_library ADD COLUMN IF NOT EXISTS ocr_path VARCHAR(512);`);
  await pg.query(`ALTER TABLE german_library ADD COLUMN IF NOT EXISTS audio_paths JSONB;`);
  await pg.query(`CREATE INDEX IF NOT EXISTS idx_ocr_trgm ON german_library USING gin (ocr_text gin_trgm_ops);`);
  console.log('✅ Schema ready');
}

// ─── AI ANNOTATION (QWEN) ─────────────────────────────────────────────────────
async function annotateWithAI(pageText) {
  if (!ENABLE_AI) {
    return { grammar: [], audios: [], verbs: [], vocab: [] };
  }
  try {
    const res = await axios.post(
      OLLAMA_CONFIG.url,
      {
        model: OLLAMA_CONFIG.model,
        format: 'json',
        stream: false,
        prompt: `You are a German language expert. Analyze this textbook page and return ONLY valid JSON with: grammar (list), audios (list), verbs (list), vocab (list). Page text: """${pageText.substring(0, 2000)}"""`
      },
      { timeout: OLLAMA_CONFIG.timeout }
    );
    return JSON.parse(res.data.response);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error(`❌ TIMEOUT ERROR: Qwen timed out after ${OLLAMA_CONFIG.timeout}ms. Exiting script.`);
      process.exit(1); // Exit immediately on timeout, no retries
    }
    return { grammar: [], audios: [], verbs: [], vocab: [] };
  }
}

// ─── DISCOVERY ────────────────────────────────────────────────────────────────
async function discoverBookFolders(baseDir) {
  const folders = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    const hasOcr = entries.some((entry) => entry.isFile() && entry.name.endsWith('_ocr_%%.txt'));
    if (hasOcr) {
      folders.push(dir);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(dir + '/' + entry.name);
      }
    }
  }
  await walk(baseDir);
  return folders;
}

async function listAudioPaths(folderPath) {
  const audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac']);
  const matches = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const entryPath = dir + '/' + entry.name;
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase().includes('cd')) {
          await walk(entryPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (audioExtensions.has(ext)) {
          matches.push(entryPath);
        }
      }
    }
  }

  await walk(folderPath);
  return matches;
}

// ─── INGEST SINGLE BOOK FOLDER ────────────────────────────────────────────────
async function ingestFolder(pg, folderPath) {
  if (!fs.existsSync(folderPath)) {
    console.log(`⚠️  Folder not found, skipping: ${folderPath}`);
    return;
  }

  // Generate book title from folder path
  const bookTitle = folderPath
    .replace(BASE_DIR + '/', '')
    .replace(/\//g, '_')
    .replace(/\s+/g, '_');

  // Find all OCR files
  const ocrFiles = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('_ocr_%%.txt'))
    .sort();

  if (ocrFiles.length === 0) {
    console.log(`⚠️  No OCR files in ${folderPath}, skipping`);
    return;
  }

  console.log(`\n📚 Processing: ${bookTitle} (${ocrFiles.length} pages)`);

  const audioPaths = await listAudioPaths(folderPath);
  let stored = 0;
  for (const file of ocrFiles) {
    const pageMatch = file.match(/(\d+)_ocr_%%.txt$/);
    if (!pageMatch) continue;
    const pageNum = parseInt(pageMatch[1], 10);
    const filePath = path.join(folderPath, file);
    const pageText = fs.readFileSync(filePath, 'utf8').trim();

    const pdfMatch = file.replace('_ocr_%%.txt', '.pdf');
    const pdfPath = path.join(folderPath, pdfMatch);

    if (!pageText) continue;

    // Skip existing pages
    const existing = await pg.query(
      `SELECT 1 FROM german_library WHERE book_title = $1 AND page_number = $2`,
      [bookTitle, pageNum]
    );
    if (existing.rowCount > 0) continue;

    // Annotate with Qwen (exits on timeout)
    const structured = await annotateWithAI(pageText);

    // Store in DB
    await pg.query(
      `INSERT INTO german_library (book_title, page_number, ocr_text, ocr_path, structured_data, pdf_path, audio_paths)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (book_title, page_number) DO NOTHING`,
      [
        bookTitle,
        pageNum,
        pageText,
        filePath,
        JSON.stringify(structured),
        pdfPath,
        JSON.stringify(audioPaths)
      ]
    );

    stored++;
    if (stored % 10 === 0) console.log(`  Stored ${stored} pages so far...`);
  }
  console.log(`✅ Finished ${bookTitle}: ${stored} new pages stored`);
}

// ─── MAIN EXECUTION ───────────────────────────────────────────────────────────
async function main() {
  const pg = new Client(DB_CONFIG);
  await pg.connect();
  await ensureSchema(pg);

  const folders = await discoverBookFolders(BASE_DIR);
  console.log(`📦 Found ${folders.length} folders with OCR files`);

  for (const folder of folders) {
    await ingestFolder(pg, folder);
  }

  await pg.end();
  console.log('\n🏁 All folders processed');
}

main().catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
