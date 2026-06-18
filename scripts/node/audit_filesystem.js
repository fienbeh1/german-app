const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DE_DIR = '/home/f/deutsch-app/de';

function scanFiles(baseDir) {
  const pdfs = [];
  const txts = [];
  const ais = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile()) {
        const parentDir = path.basename(path.dirname(full));
        const ext = path.extname(full).toLowerCase();
        if (ext === '.pdf') {
          pdfs.push(full);
        } else if (ext === '.txt') {
          if (parentDir === 'txt' && !full.includes('/txt/annotations/')) {
            txts.push(full);
          } else if (parentDir === 'ai') {
            ais.push(full);
          }
        }
      }
    }
  }

  walk(baseDir);
  return { pdfs, txts, ais };
}

function extractBookCategory(filePath) {
  const rel = path.relative(DE_DIR, filePath);
  const parts = rel.split(path.sep);
  return parts[0] || 'unknown';
}

(async () => {
  const client = new Client({
    host: '/var/run/postgresql',
    database: 'deutsch',
    user: 'f',
  });
  await client.connect();

  console.log('=== Scanning filesystem... ===');
  const { pdfs, txts, ais } = scanFiles(DE_DIR);
  console.log(`Found on disk: ${pdfs.length} PDFs, ${txts.length} TXTs, ${ais.length} AIs`);

  console.log('\n=== Loading DB registry paths... ===');
  const dbRes = await client.query(
    "SELECT pdf_path, txt_path, ai_path, book_name, page_num FROM materials_registry WHERE dead = false OR dead IS NULL"
  );
  console.log(`Total non-dead rows in materials_registry: ${dbRes.rows.length}`);

  const pdfDbSet = new Set();
  const txtDbSet = new Set();
  const aiDbSet = new Set();
  for (const row of dbRes.rows) {
    if (row.pdf_path) pdfDbSet.add(row.pdf_path);
    if (row.txt_path) txtDbSet.add(row.txt_path);
    if (row.ai_path) aiDbSet.add(row.ai_path);
  }
  console.log(`DB has: ${pdfDbSet.size} unique pdf_paths, ${txtDbSet.size} unique txt_paths, ${aiDbSet.size} unique ai_paths`);

  const pdfDiskSet = new Set(pdfs);
  const txtDiskSet = new Set(txts);
  const aiDiskSet = new Set(ais);

  const pdfRegistered = pdfs.filter(f => pdfDbSet.has(f)).length;
  const txtRegistered = txts.filter(f => txtDbSet.has(f)).length;
  const aiRegistered = ais.filter(f => aiDbSet.has(f)).length;

  const pdfOrphaned = pdfs.filter(f => !pdfDbSet.has(f));
  const txtOrphaned = txts.filter(f => !txtDbSet.has(f));
  const aiOrphaned = ais.filter(f => !aiDbSet.has(f));

  console.log('\n============================================');
  console.log('  REVERSE AUDIT SUMMARY');
  console.log('============================================');
  console.log(`  Type    | On Disk | Registered | Orphaned`);
  console.log(`  --------+---------+------------+----------`);
  console.log(`  PDF     | ${String(pdfs.length).padStart(7)} | ${String(pdfRegistered).padStart(10)} | ${String(pdfOrphaned.length).padStart(8)}`);
  console.log(`  TXT     | ${String(txts.length).padStart(7)} | ${String(txtRegistered).padStart(10)} | ${String(txtOrphaned.length).padStart(8)}`);
  console.log(`  AI      | ${String(ais.length).padStart(7)} | ${String(aiRegistered).padStart(10)} | ${String(aiOrphaned.length).padStart(8)}`);

  function groupByCategory(files) {
    const map = {};
    for (const f of files) {
      const cat = extractBookCategory(f);
      if (!map[cat]) map[cat] = [];
      map[cat].push(f);
    }
    return map;
  }

  if (pdfOrphaned.length > 0) {
    console.log('\n--- Unregistered PDFs ---');
    const byCat = groupByCategory(pdfOrphaned);
    for (const [cat, files] of Object.entries(byCat).sort()) {
      console.log(`  ${cat} (${files.length}):`);
      for (const f of files.sort()) {
        console.log(`    ${f}`);
      }
    }
  }
  if (txtOrphaned.length > 0) {
    console.log('\n--- Unregistered TXTs ---');
    const byCat = groupByCategory(txtOrphaned);
    for (const [cat, files] of Object.entries(byCat).sort()) {
      console.log(`  ${cat} (${files.length}):`);
      for (const f of files.sort()) {
        console.log(`    ${f}`);
      }
    }
  }
  if (aiOrphaned.length > 0) {
    console.log('\n--- Unregistered AIs ---');
    const byCat = groupByCategory(aiOrphaned);
    for (const [cat, files] of Object.entries(byCat).sort()) {
      console.log(`  ${cat} (${files.length}):`);
      for (const f of files.sort()) {
        console.log(`    ${f}`);
      }
    }
  }

  console.log('\n============================================');
  console.log('  NAMING/EXTENSION ANOMALY CHECK');
  console.log('============================================');
  let anomalyCount = 0;
  for (const row of dbRes.rows) {
    const checks = [
      { col: 'pdf_path', path: row.pdf_path, expectedExt: '.pdf' },
      { col: 'txt_path', path: row.txt_path, expectedExt: '.txt' },
      { col: 'ai_path', path: row.ai_path, expectedExt: '.txt' },
    ];
    for (const { col, path: p, expectedExt } of checks) {
      if (!p) continue;
      const ext = path.extname(p).toLowerCase();
      if (ext !== expectedExt) {
        console.log(`  Anomaly: ${col} has extension "${ext}" (expected "${expectedExt}") for "${p}"`);
        anomalyCount++;
        continue;
      }
      if (!fs.existsSync(p)) {
        console.log(`  Missing: ${col} points to nonexistent file: ${p}`);
        anomalyCount++;
      }
    }
  }
  if (anomalyCount === 0) {
    console.log('  No anomalies found — all DB paths exist with expected extensions.');
  } else {
    console.log(`  Total anomalies: ${anomalyCount}`);
  }

  console.log('\n============================================');
  console.log('  DB PATH CHECK (files registered but not on disk)');
  console.log('============================================');
  const pdfDbMissing = [...pdfDbSet].filter(p => !pdfDiskSet.has(p) && !fs.existsSync(p));
  const txtDbMissing = [...txtDbSet].filter(p => !txtDiskSet.has(p) && !fs.existsSync(p));
  const aiDbMissing = [...aiDbSet].filter(p => !aiDiskSet.has(p) && !fs.existsSync(p));
  console.log(`  PDF path in DB but file missing: ${pdfDbMissing.length}`);
  console.log(`  TXT path in DB but file missing: ${txtDbMissing.length}`);
  console.log(`  AI path in DB but file missing: ${aiDbMissing.length}`);
  if (pdfDbMissing.length > 0) {
    console.log('  Missing PDFs (first 20):');
    pdfDbMissing.slice(0, 20).sort().forEach(p => console.log(`    ${p}`));
  }
  if (txtDbMissing.length > 0) {
    console.log('  Missing TXTs (first 20):');
    txtDbMissing.slice(0, 20).sort().forEach(p => console.log(`    ${p}`));
  }
  if (aiDbMissing.length > 0) {
    console.log('  Missing AIs (first 20):');
    aiDbMissing.slice(0, 20).sort().forEach(p => console.log(`    ${p}`));
  }

  await client.end();
  console.log('\nAudit complete.');
})().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
