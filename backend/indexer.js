#!/usr/bin/env node
/**
 * Content Indexer: builds a filesystem-based index of Deutsch material
 * - Only reads and indexes. No file deletion or movement logic.
 */
const fs = require('fs');
const path = require('path');

const ROOT = '/home/f/deutsch-app/de'; 
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

function indexPdf(pdfPath) {
  const pdfFileName = path.basename(pdfPath);
  const pdfDir = path.dirname(pdfPath); 
  const bookRoot = path.dirname(pdfDir); 
  const baseName = pdfFileName.replace(/\.pdf$/i, '');
  
  // Look into the triaged /txt folder for companion files
  const txtDir = path.join(bookRoot, 'txt');
  let hasTxt = false;
  let txtPath = null;
  if (fs.existsSync(txtDir)) {
    const txtFiles = fs.readdirSync(txtDir);
    const matchingTxt = txtFiles.find(file => 
      file.startsWith(baseName) && file.endsWith(TXT_EXT)
    );
    if (matchingTxt) {
      hasTxt = true;
      txtPath = path.join(txtDir, matchingTxt);
    }
  }

  // Look into the triaged /ai folder for AI_ prefixed comments
  const aiDir = path.join(bookRoot, 'ai');
  let hasAi = false;
  let aiPath = null;
  if (fs.existsSync(aiDir)) {
    const aiFiles = fs.readdirSync(aiDir);
    const matchingAi = aiFiles.find(file => 
      file.startsWith('AI_' + baseName) && file.endsWith(TXT_EXT)
    );
    if (matchingAi) {
      hasAi = true;
      aiPath = path.join(aiDir, matchingAi);
    }
  }

  return { 
    pdfPath: pdfPath, 
    hasTxt: hasTxt, 
    txtPath: txtPath,
    hasAi: hasAi,
    aiPath: aiPath
  };
}

function main() {
  console.log(`Starting index of ${ROOT}...`);
  ensureIndexDir();
  
  if (!fs.existsSync(ROOT)) {
    console.error(`Error: Root directory ${ROOT} does not exist.`);
    process.exit(1);
  }

  const rootTree = buildTree(ROOT);
  const indexEntries = [];

  const walk = (node) => {
    if (node && node.type === 'folder' && node.children) {
      node.children.forEach(c => walk(c));
    } else if (node && node.path) {
      const ext = path.extname(node.path).toLowerCase();
      // Ensure we only index PDFs that are inside a 'pdf' subdirectory
      if (ext === '.pdf' && path.basename(path.dirname(node.path)) === 'pdf') {
        const res = indexPdf(node.path);
        indexEntries.push({ ...res, name: node.name, rel: node.rel });
      }
    }
  };

  walk(rootTree);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexEntries, null, 2));
  console.log(`Index complete. Saved to ${INDEX_FILE}`);
  process.exit(0);
}

main();