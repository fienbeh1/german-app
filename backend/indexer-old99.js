#!/usr/bin/env node
/**
 * Content Indexer: builds a filesystem-based index of Deutsch material
 * - Walks the ROOT folder
 * - For PDFs, ensures TXT exists (via OCR; uses existing batch OCR if possible)
 * - Writes an index.json with entries: {path, level, course, type, pages, txt}
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/f/deutsch-app/de';
/* const OCR_SCRIPT = '/home/f/batch_ocr.py'; // assumes batch OCR script exists */ 
const TXT_EXT = '.txt';
const INDEX_FILE = '/home/f/deutsch-app/index/index.json';

function ensureIndexDir() {
  const d = path.dirname(INDEX_FILE);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function buildTree(dir, base = ROOT) {
  const stat = fs.statSync(dir);
  const rel = path.relative(base, dir);
  const node = {
    path: dir,
    rel: rel || '.',
    type: stat.isDirectory() ? 'folder' : 'file',
    name: path.basename(dir),
  };
  if (stat.isDirectory()) {
    const items = fs.readdirSync(dir).filter(n => !n.startsWith('.'));
    node.children = items.map(n => buildTree(path.join(dir, n), base));
  }
  return node;
}

/* function indexPdf(pdfPath) {
  const pdf = pdfPath;
  // Simple heuristic: if TXT exists, skip
  const txt = pdfPath.replace(/\\.pdf$/i, TXT_EXT);
  let hasTxt = fs.existsSync(txt);
  if (!hasTxt) {
    // Run OCR for this single page-like approach: use the batch OCR on the file as a whole (if supported)
    try {
      // Fall back to a batch OCR process (OC for whole PDF as a single TXT)
      execSync(`python3 ${OCR_SCRIPT} 0 1`);
    } catch (e) {
      // if OCR fails, skip gracefully
    }
  }
  return { pdfPath: pdf, hasTxt: hasTxt, txtPath: hasTxt ? txt : null };
} */
function indexPdf(pdfPath) {
  const pdfFileName = path.basename(pdfPath);
  const pdfDir = path.dirname(pdfPath); // This is the new .../pdf/ folder
  const bookRoot = path.dirname(pdfDir); // This is the parent folder (e.g., Lagune_1)
  
  // Look in the triaged /txt folder instead of the /pdf folder
  const expectedTxtPath = path.join(bookRoot, 'txt', pdfFileName.replace(/\.pdf$/i, '.txt'));
  
  let hasTxt = fs.existsSync(expectedTxtPath);
  
  return { 
    pdfPath: pdfPath, 
    hasTxt: hasTxt, 
    txtPath: hasTxt ? expectedTxtPath : null 
  };
}
function main() {
  ensureIndexDir();
  const rootTree = buildTree(ROOT);
  // Simple index with path-based entry per PDF
  const indexEntries = [];
  const walk = (node) => {
    if (node && node.type === 'folder' && node.children) {
      node.children.forEach(c => walk(c));
    } else if (node && node.path) {
      const ext = path.extname(node.path).toLowerCase();
      if (ext === '.pdf') {
        const res = indexPdf(node.path);
        indexEntries.push({ path: res.pdfPath, txt: res.txtPath, hasTxt: res.hasTxt });
      }
    }
  }
  walk(rootTree);
  fs.writeFileSync(INDEX_FILE, JSON.stringify({ generated: new Date(), root: ROOT, entries: indexEntries }, null, 2));
  console.log(`Indexed ${indexEntries.length} PDFs`);
}

main();
