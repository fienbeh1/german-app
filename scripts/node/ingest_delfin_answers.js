const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });
const BOOK_NAME = 'delfin/Delfin_Antworten';
const PDF_PATH = '/home/f/deutsch-app/de/delfin/antworten/pdf/answers.pdf';
const TXT_DIR = '/home/f/deutsch-app/de/delfin/antworten/txt';
const PAGES_DIR = '/home/f/deutsch-app/pages/delfin_Delfin_Antworten';
const TOTAL_PAGES = 66;

// Lektion mapping: answer PDF page ranges → Lektion number
// From the OCR analysis:
// Page 4-5: Lektion 1, Page 6-7: Lektion 2, etc.
const LEKTION_MAP = [
  { pdfStart: 1, pdfEnd: 3, lektion: null },  // title pages
  { pdfStart: 4, pdfEnd: 5, lektion: 1 },
  { pdfStart: 6, pdfEnd: 7, lektion: 2 },
  { pdfStart: 8, pdfEnd: 10, lektion: 3 },
  { pdfStart: 11, pdfEnd: 12, lektion: 4 },
  { pdfStart: 13, pdfEnd: 15, lektion: 5 },
  { pdfStart: 16, pdfEnd: 19, lektion: 6 },
  { pdfStart: 20, pdfEnd: 22, lektion: 7 },
  { pdfStart: 23, pdfEnd: 24, lektion: 8 },
  { pdfStart: 25, pdfEnd: 27, lektion: 9 },
  { pdfStart: 28, pdfEnd: 32, lektion: 10 },
  { pdfStart: 33, pdfEnd: 35, lektion: 11 },
  { pdfStart: 36, pdfEnd: 39, lektion: 12 },
  { pdfStart: 40, pdfEnd: 42, lektion: 13 },
  { pdfStart: 43, pdfEnd: 46, lektion: 14 },
  { pdfStart: 47, pdfEnd: 49, lektion: 15 },
  { pdfStart: 50, pdfEnd: 53, lektion: 16 },
  { pdfStart: 54, pdfEnd: 55, lektion: 17 },
  { pdfStart: 56, pdfEnd: 59, lektion: 18 },
  { pdfStart: 60, pdfEnd: 62, lektion: 19 },
  { pdfStart: 63, pdfEnd: 65, lektion: 20 },
  { pdfStart: 66, pdfEnd: 66, lektion: null },  // end page
];

// Delfin Lehrbuch page ranges per Lektion (estimated from book structure)
// Delfin has 259 pages, 20 Lektionen.
// Lektion 1 starts around page 5 (pages 1-4 are title/intro)
const COURSEBOOK_RANGES = [
  { lektion: 1, start: 5, end: 17 },
  { lektion: 2, start: 18, end: 30 },
  { lektion: 3, start: 31, end: 43 },
  { lektion: 4, start: 44, end: 56 },
  { lektion: 5, start: 57, end: 69 },
  { lektion: 6, start: 70, end: 82 },
  { lektion: 7, start: 83, end: 95 },
  { lektion: 8, start: 96, end: 108 },
  { lektion: 9, start: 109, end: 121 },
  { lektion: 10, start: 122, end: 134 },
  { lektion: 11, start: 135, end: 147 },
  { lektion: 12, start: 148, end: 160 },
  { lektion: 13, start: 161, end: 173 },
  { lektion: 14, start: 174, end: 186 },
  { lektion: 15, start: 187, end: 199 },
  { lektion: 16, start: 200, end: 212 },
  { lektion: 17, start: 213, end: 225 },
  { lektion: 18, start: 226, end: 238 },
  { lektion: 19, start: 239, end: 251 },
  { lektion: 20, start: 252, end: 259 },
];

function getLektion(pdfPage) {
  for (const m of LEKTION_MAP) {
    if (pdfPage >= m.pdfStart && pdfPage <= m.pdfEnd) return m.lektion;
  }
  return null;
}

function getCoursebookRange(lektion) {
  return COURSEBOOK_RANGES.find(r => r.lektion === lektion);
}

async function ingest() {
  console.log('=== Delfin Antworten Ingestion ===');
  
  // Step 1: Register in materials_registry
  console.log('\n[1/5] Registering in materials_registry...');
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const txtPath = `${TXT_DIR}/Delfin_Antworten-${String(p).padStart(3, '0')}.txt`;
    const jpgName = `page-${String(p).padStart(4, '0')}.jpg`;
    const jpgPath = `${PAGES_DIR}/${jpgName}`;
    const pdfPagePath = `/home/f/deutsch-app/de/delfin/antworten/pdf/answers.pdf`;
    
    // Check if page already exists
    const existing = await pool.query(
      `SELECT id FROM materials_registry WHERE book_name = $1 AND page_num = $2 AND (dead IS NULL OR dead = false)`,
      [BOOK_NAME, p]
    );
    
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO materials_registry (book_name, page_num, pdf_path, txt_path, jpg_path)
         VALUES ($1, $2, $3, $4, $5)`,
        [BOOK_NAME, p, pdfPagePath, txtPath, jpgPath]
      );
    }
  }
  console.log(`  Registered ${TOTAL_PAGES} pages`);
  
  // Step 2: Generate page images from PDF
  console.log('\n[2/5] Generating page images...');
  if (!fs.existsSync(PAGES_DIR)) {
    fs.mkdirSync(PAGES_DIR, { recursive: true });
  }
  const count = fs.readdirSync(PAGES_DIR).length;
  if (count < TOTAL_PAGES) {
    try {
      execSync(`pdftoppm -jpeg -r 200 "${PDF_PATH}" "${PAGES_DIR}/page"`, { stdio: 'pipe' });
      // Rename to zero-padded format
      const files = fs.readdirSync(PAGES_DIR).filter(f => f.startsWith('page-'));
      files.sort().forEach((f, i) => {
        const ext = path.extname(f);
        const newName = `page-${String(i + 1).padStart(4, '0')}${ext}`;
        if (f !== newName) {
          fs.renameSync(`${PAGES_DIR}/${f}`, `${PAGES_DIR}/${newName}`);
        }
      });
      console.log('  Images generated');
    } catch (e) {
      console.error('  pdftoppm error:', e.message);
    }
  } else {
    console.log('  Images already exist');
  }
  
  // Step 3: Verify OCR text exists
  console.log('\n[3/5] Verifying OCR text...');
  let txtCount = 0;
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const txtPath = `${TXT_DIR}/Delfin_Antworten-${String(p).padStart(3, '0')}.txt`;
    if (fs.existsSync(txtPath) && fs.statSync(txtPath).size > 10) txtCount++;
  }
  console.log(`  ${txtCount}/${TOTAL_PAGES} pages have valid OCR text`);
  
  // Step 4: Ingest into dokument_segmente (as Lösungen for the answer key book)
  console.log('\n[4/5] Inserting into dokument_segmente (answer key book)...');
  let inserted = 0;
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const txtPath = `${TXT_DIR}/Delfin_Antworten-${String(p).padStart(3, '0')}.txt`;
    if (!fs.existsSync(txtPath)) continue;
    const content = fs.readFileSync(txtPath, 'utf-8').trim();
    if (content.length < 20) continue;
    
    const lektion = getLektion(p);
    
    const existing = await pool.query(
      `SELECT id FROM dokument_segmente WHERE book_name = $1 AND typ = 'Loesung' AND seite_von = $2 AND seite_bis = $2`,
      [BOOK_NAME, p]
    );
    
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO dokument_segmente (book_name, typ, ziel, lektion, seite_von, seite_bis, inhalt)
         VALUES ($1, 'Loesung', $2, $3, $4, $4, $5)`,
        [BOOK_NAME, `Seite ${p}`, lektion, p, content]
      );
      inserted++;
    }
  }
  console.log(`  Inserted ${inserted} new entries`);
  
  // Step 5: Also map answers to Delfin Lehrbuch pages
  console.log('\n[5/5] Mapping answers to Delfin Lehrbuch pages...');
  let mapped = 0;
  for (const entry of LEKTION_MAP) {
    if (!entry.lektion) continue;
    const cbRange = getCoursebookRange(entry.lektion);
    if (!cbRange) continue;
    
    // Concatenate OCR text from all answer pages for this Lektion
    let combinedContent = '';
    for (let p = entry.pdfStart; p <= entry.pdfEnd; p++) {
      const txtPath = `${TXT_DIR}/Delfin_Antworten-${String(p).padStart(3, '0')}.txt`;
      if (fs.existsSync(txtPath)) {
        combinedContent += fs.readFileSync(txtPath, 'utf-8').trim() + '\n';
      }
    }
    if (!combinedContent.trim()) continue;
    
    const existing = await pool.query(
      `SELECT id FROM dokument_segmente WHERE book_name = 'delfin/Delfin_Lehrbuch' AND typ = 'Loesung' AND lektion = $1 AND seite_von = $2`,
      [entry.lektion, cbRange.start]
    );
    
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO dokument_segmente (book_name, typ, ziel, lektion, seite_von, seite_bis, inhalt)
         VALUES ('delfin/Delfin_Lehrbuch', 'Loesung', $1, $2, $3, $4, $5)`,
        [`Lektion ${entry.lektion}`, entry.lektion, cbRange.start, cbRange.end, combinedContent.trim()]
      );
      mapped++;
    }
  }
  console.log(`  Mapped ${mapped} Lektionen to Delfin Lehrbuch`);
  
  console.log('\n=== Done ===');
  await pool.end();
}

ingest().catch(e => { console.error(e); process.exit(1); });
