const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const axios = require('axios');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const FOLDERS_TO_INGEST = [
  '/home/f/deutsch-app/de/B2/EM_Neu_AB/EM_Neu_AB_B2_pdf_split',
  '/home/f/deutsch-app/de/B2/HauptKurs/B2-Hauptkurs_pdf_split',
  '/home/f/deutsch-app/de/German-Verbs/The-Big-Yellow-Book-of-German-Verbs_pdf_split',
  '/home/f/deutsch-app/de/Lagune_1/Lagune 1/Arbeitsbuch + CD/Lagune_1_Arbeitsbuch',
  '/home/f/deutsch-app/de/Lagune_1/Lagune 1/Kursbuch + CD',
  '/home/f/deutsch-app/de/Lagune_1/Lagune 1/1Lehrerhandbuch',
  '/home/f/deutsch-app/de/Lagune_2/Lagune 2/Lagune-2-Arbeitsbuch/Lagune_2_Arbeitsbuch_pdf_split',
  '/home/f/deutsch-app/de/Lagune_2/Lagune 2/Lagune-2-Arbeitsbuch/Lagune_2_Arbeitsbuch_txt_split',
  '/home/f/deutsch-app/de/Lagune_2/Lagune 2/Lehrerhandbuch/Lehrerhandbuch_Lagune2_pdf_split',
  '/home/f/deutsch-app/de/Lagune_3',
  '/home/f/deutsch-app/de/Neu-B1-Plus',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte International 1',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte plus neu A1.2',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte plus neu A2.1',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte plus neu A2.2',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte plus neu A2.2/Schritte International neu 4_Unterichtsplan',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte Plus Neu A1.1',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte plus neu B1.1',
  '/home/f/deutsch-app/de/Schritte_Neu/Schritte plus neu B1.2',
  '/home/f/deutsch-app/de/Tangram_1/Tangram Aktuell 1/1-4-Kursbuch',
  '/home/f/deutsch-app/de/Tangram_1/Tangram Aktuell 1/Kursbuch 5-8',
  '/home/f/deutsch-app/de/Tangram_1/Tangram Aktuell 1/Lehrerhandbuch 1-4',
  '/home/f/deutsch-app/de/Tangram_1/Tangram Aktuell 1/Lehrerhandbuch 5-8',
  '/home/f/deutsch-app/de/Tangram_1/Tangram Aktuell 1/Tangram Z, Zertifikat Deutsch, Kursbuch und Arbeitsbuch by Rosa-Maria Dallapiazza, Eduard von Jan, Beate Blüggel, Anja Schümann (z-lib.org)',
  '/home/f/deutsch-app/de/Tangram_1/Tangram Aktuell 1/Ubungsheft',
  '/home/f/deutsch-app/de/Tangram_2/Tangram Aktuell 2/Lehrerhandbuch 1-4',
  '/home/f/deutsch-app/de/Tangram_2/Tangram Aktuell 2/Lehrerhandbuch 5-8',
  '/home/f/deutsch-app/de/Tangram_2/Tangram Aktuell 2/TAK-2-1-4',
  '/home/f/deutsch-app/de/Tangram_2/Tangram Aktuell 2/TAK-2-5-8',
  '/home/f/deutsch-app/de/Tangram_2/Tangram Aktuell 2/Ubungsheft-2',
  '/home/f/deutsch-app/de/Tangram_3/Tangram Aktuell 3/Kursbuch 1-4',
  '/home/f/deutsch-app/de/Tangram_3/Tangram Aktuell 3/Kursbuch 5-8',
  '/home/f/deutsch-app/de/Tangram_3/Tangram Aktuell 3/Lehrerhandbuch 1-4',
  '/home/f/deutsch-app/de/Tangram_3/Tangram Aktuell 3/Lehrerhandbuch 5-8',
  '/home/f/deutsch-app/de/Tangram_3/Tangram Aktuell 3/Tangram Z, Zertifikat Deutsch, Kursbuch und Arbeitsbuch by Rosa-Maria Dallapiazza, Eduard von Jan, Beate Blüggel, Anja Schümann (z-lib.org)',
  '/home/f/deutsch-app/de/Tangram_3/Tangram Aktuell 3/Ubungsheft'
];

const DB_CONFIG = {
  user: 'f',
  host: 'localhost',
  database: 'deutsch',
  password: '187.190.78.100', // Ensure this is your actual DB password
  port: 5432,
};

const OLLAMA_CONFIG = {
  url: 'http://localhost:11434/api/generate',
  model: 'qwen_linguist:latest',
  timeout: 300000 // 5-minute timeout per page for reliability
};

// ─── AI ANNOTATION ────────────────────────────────────────────────────────────
async function annotateWithAI(pageText, book, page) {
  try {
    const res = await axios.post(
      OLLAMA_CONFIG.url,
      {
        model: OLLAMA_CONFIG.model,
        format: 'json',
        stream: false,
        prompt: `Analyze this German textbook page. Return ONLY valid JSON with: grammar (list), audios (list), verbs (list), vocab (list). Text: """${pageText.substring(0, 4000)}"""`
      },
      { timeout: OLLAMA_CONFIG.timeout }
    );
    return JSON.parse(res.data.response);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error(`\n❌ TIMEOUT FAILURE: ${book} | Page ${page}`);
      console.error(`Ollama failed to respond within ${OLLAMA_CONFIG.timeout / 1000}s. stopping to save time.`);
      process.exit(1); 
    }
    throw error;
  }
}

// ─── FOLDER PROCESSING ────────────────────────────────────────────────────────
async function ingestFolder(pg, folderPath) {
  if (!fs.existsSync(folderPath)) return;

  const bookTitle = folderPath.split('/').pop().replace(/\s+/g, '_');
  const ocrFiles = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.txt')) // Broadened to catch any text files in those paths
    .sort();

  console.log(`\n📂 Ingesting: ${bookTitle} (${ocrFiles.length} files)`);

  for (const file of ocrFiles) {
    const filePath = path.join(folderPath, file);
    const pageText = fs.readFileSync(filePath, 'utf8').trim();
    if (!pageText) continue;

    // Extract page number or use index
    const pageNum = parseInt(file.match(/\d+/) || 0);

    // Skip if already in DB
    const exists = await pg.query('SELECT 1 FROM german_library WHERE book_title=$1 AND page_number=$2', [bookTitle, pageNum]);
    if (exists.rowCount > 0) continue;

    process.stdout.write(`  -> Processing page ${pageNum}... `);
    const structured = await annotateWithAI(pageText, bookTitle, pageNum);

    await pg.query(
      `INSERT INTO german_library (book_title, page_number, ocr_text, structured_data, pdf_path)
       VALUES ($1, $2, $3, $4, $5)`,
      [bookTitle, pageNum, pageText, JSON.stringify(structured), folderPath]
    );
    console.log('Done.');
  }
}

async function main() {
  const pg = new Client(DB_CONFIG);
  await pg.connect();
  
  // Ensure table exists
  await pg.query(`
    CREATE TABLE IF NOT EXISTS german_library (
      id SERIAL PRIMARY KEY,
      book_title TEXT,
      page_number INTEGER,
      ocr_text TEXT,
      structured_data JSONB,
      pdf_path TEXT,
      UNIQUE(book_title, page_number)
    );
  `);

  for (const folder of FOLDERS_TO_INGEST) {
    await ingestFolder(pg, folder);
  }

  await pg.end();
  console.log('\n🏁 Ingest Complete.');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});