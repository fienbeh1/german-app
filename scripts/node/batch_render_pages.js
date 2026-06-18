const { Pool } = require('pg');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PAGES_DIR = '/home/f/deutsch-app/pages';
const COURSES_DIR = '/home/f/deutsch-app/de';
const CONCURRENCY = 4;

const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });

async function getPages() {
  const r = await pool.query(`
    SELECT book_name, page_num, pdf_path
    FROM materials_registry
    WHERE (dead IS NULL OR dead = false)
      AND pdf_path IS NOT NULL
    ORDER BY book_name, page_num
  `);
  return r.rows;
}

function shouldRender(book, pageNum) {
  const safeDir = book.replace(/[^a-zA-Z0-9_]/g, '_');
  const outFile = path.join(PAGES_DIR, safeDir, `page-${String(pageNum).padStart(4, '0')}.jpg`);
  if (fs.existsSync(outFile)) return false;
  return outFile;
}

function renderPage(row) {
  const { book_name: book, page_num: pageNum, pdf_path: pdfPath } = row;
  const safeDir = book.replace(/[^a-zA-Z0-9_]/g, '_');
  const outFile = path.join(PAGES_DIR, safeDir, `page-${String(pageNum).padStart(4, '0')}.jpg`);

  if (fs.existsSync(outFile)) {
    pool.query('UPDATE materials_registry SET jpg_path = $1 WHERE book_name = $2 AND page_num = $3 AND jpg_path IS NULL',
      [outFile, book, pageNum]).catch(() => {});
    return 'cached';
  }

  if (!pdfPath || !fs.existsSync(pdfPath)) return 'nopdf';

  try {
    const outDir = path.dirname(outFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    execSync(
      `pdftoppm -jpeg -jpegopt quality=100 -singlefile -r 150 "${pdfPath}" "${outFile.replace('.jpg', '')}"`,
      { stdio: 'ignore', timeout: 30000 }
    );
    pool.query('UPDATE materials_registry SET jpg_path = $1 WHERE book_name = $2 AND page_num = $3',
      [outFile, book, pageNum]).catch(() => {});
    return 'done';
  } catch (e) {
    return 'fail';
  }
}

async function main() {
  console.log('Fetching pages to render...');
  const pages = await getPages();
  console.log(`Total: ${pages.length} pages`);

  let done = 0, cached = 0, failed = 0, nopdf = 0;
  const total = pages.length;
  const start = Date.now();

  async function worker(queue) {
    for (const row of queue) {
      const result = renderPage(row);
      if (result === 'done') done++;
      else if (result === 'cached') cached++;
      else if (result === 'nopdf') nopdf++;
      else failed++;

      if ((done + cached + failed + nopdf) % 100 === 0 || done + cached + failed + nopdf === total) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const pct = ((done + cached + failed + nopdf) / total * 100).toFixed(1);
        console.log(`[${elapsed}s] ${done + cached + failed + nopdf}/${total} (${pct}%) — done:${done} cached:${cached} nopdf:${nopdf} fail:${failed}`);
      }
    }
  }

  const chunks = [];
  for (let i = 0; i < pages.length; i += Math.ceil(pages.length / CONCURRENCY)) {
    chunks.push(pages.slice(i, i + Math.ceil(pages.length / CONCURRENCY)));
  }

  await Promise.all(chunks.map(c => worker(c)));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
  console.log(`Rendered: ${done} | Cached: ${cached} | No PDF: ${nopdf} | Failed: ${failed}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
