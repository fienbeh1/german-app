const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const COURSES_DIR = '/home/f/deutsch-app/de';
const DRY_RUN = process.argv.includes('--dry-run');
const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });

function parseFileInfo(filePath, typeHint) {
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);
  const ext = path.extname(basename);
  let name = basename.slice(0, -ext.length);

  let type = typeHint;
  if (!type) {
    if (dir.endsWith('/pdf')) type = 'pdf';
    else if (dir.endsWith('/txt')) type = 'txt';
    else if (dir.endsWith('/ai')) type = 'ai';
    else return null;
  }

  const isAI = type === 'ai' && name.startsWith('AI_');
  if (isAI) name = name.slice(3);

  if (name.endsWith('_ocr_%%')) name = name.slice(0, -7);

  let m = name.match(/^(.+)-page-(\d+)$/);
  if (m) return { type, prefix: m[1], pageNum: parseInt(m[2], 10), ext, wasAI: isAI };

  m = name.match(/^(.+?)-(\d+)$/);
  if (m) return { type, prefix: m[1], pageNum: parseInt(m[2], 10), ext, wasAI: isAI };

  return { type, prefix: name, pageNum: null, ext, wasAI: isAI };
}

function newFilename(type, prefix, pageNum) {
  const padded = String(pageNum).padStart(3, '0');
  const basePrefix = (type === 'ai' && !prefix.startsWith('AI_')) ? 'AI_' + prefix : prefix;
  if (type === 'pdf') return `${prefix}-${padded}.pdf`;
  if (type === 'txt') return `${prefix}-${padded}.txt`;
  if (type === 'ai') return `${basePrefix}-${padded}.txt`;
  return `${prefix}-${padded}.${type === 'pdf' ? 'pdf' : 'txt'}`;
}

function getNewPath(oldPath, parsed, pageNum) {
  const dir = path.dirname(oldPath);
  const newName = newFilename(parsed.type, parsed.prefix, pageNum);
  return path.join(dir, newName);
}

function getBookNameFromPath(filePath) {
  const rel = path.relative(COURSES_DIR, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split('/');
  if (parts.length < 2) return null;
  const typeDir = parts[parts.length - 2];
  if (!['pdf', 'txt', 'ai'].includes(typeDir)) return null;
  return parts.slice(0, -2).join('/');
}

async function normalizeRegistered() {
  console.log('\n=== PHASE 1: Registered files ===');
  const r = await pool.query(`
    SELECT id, book_name, page_num, pdf_path, txt_path, ai_path, directory, has_pdf, has_txt, has_ai
    FROM materials_registry
    WHERE (dead IS NULL OR dead = false)
    ORDER BY book_name, page_num
  `);

  const seenOldPaths = new Set();
  let renameCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let conflictCount = 0;

  for (const row of r.rows) {
    for (const [type, col] of [['pdf', 'pdf_path'], ['txt', 'txt_path'], ['ai', 'ai_path']]) {
      const oldPath = row[col];
      if (!oldPath) continue;

      const parsed = parseFileInfo(oldPath, type);
      if (!parsed || parsed.pageNum === null) {
        console.log(`  SKIP ${oldPath} — could not parse`);
        skipCount++;
        continue;
      }

      if (seenOldPaths.has(oldPath)) {
        if (DRY_RUN) console.log(`  CONFLICT ${oldPath} shared by multiple rows`);
        conflictCount++;
        continue;
      }
      seenOldPaths.add(oldPath);

      const newPath = getNewPath(oldPath, parsed, row.page_num);

      if (oldPath === newPath) continue;

      if (fs.existsSync(newPath)) {
        if (DRY_RUN) console.log(`  SKIP ${oldPath} → target exists: ${newPath}`);
        skipCount++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  WOULD RENAME: ${oldPath} → ${path.basename(newPath)}`);
      } else {
        try {
          fs.renameSync(oldPath, newPath);
          await pool.query(
            `UPDATE materials_registry SET ${col} = $1 WHERE id = $2`,
            [newPath, row.id]
          );
          renameCount++;
          if (renameCount % 500 === 0) console.log(`  ... ${renameCount} renamed`);
        } catch (e) {
          console.log(`  ERROR ${oldPath}: ${e.message}`);
          errorCount++;
        }
      }
    }
  }

  if (conflictCount > 0) console.log(`  CONFLICTS: ${conflictCount} rows shared source paths (DB updated, file not re-renamed)`);

  console.log(`\nPhase 1 results: renamed=${renameCount} skipped=${skipCount} errors=${errorCount}`);
  return { renameCount, skipCount, errorCount };
}

async function normalizeOrphans() {
  console.log('\n=== PHASE 2: Orphaned files ===');

  const r = await pool.query(`SELECT pdf_path, txt_path, ai_path FROM materials_registry`);
  const registeredPaths = new Set();
  for (const row of r.rows) {
    for (const col of ['pdf_path', 'txt_path', 'ai_path']) {
      if (row[col]) registeredPaths.add(row[col]);
    }
  }

  let found = 0, renamed = 0, inserted = 0, skipped = 0, errors = 0;

  async function scanDir(dirPath) {
    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
    catch { return; }

    const pdfFiles = [], txtFiles = [], aiFiles = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'annotations' && entry.name !== 'node_modules') {
          await scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.pdf')) pdfFiles.push(fullPath);
        else if (lower.endsWith('.txt') && dirPath.endsWith('/txt')) txtFiles.push(fullPath);
        else if (lower.endsWith('.txt') && dirPath.endsWith('/ai')) aiFiles.push(fullPath);
      }
    }

    for (const files of [pdfFiles, txtFiles, aiFiles]) {
      for (const fp of files) {
        if (registeredPaths.has(fp)) continue;
        found++;

        const type = fp.includes('/pdf/') ? 'pdf' : fp.includes('/ai/') ? 'ai' : 'txt';
        const parsed = parseFileInfo(fp, type);
        if (!parsed || parsed.pageNum === null) {
          skipped++;
          continue;
        }

        const newPath = getNewPath(fp, parsed, parsed.pageNum);
        const bookName = getBookNameFromPath(fp);
        if (!bookName) { skipped++; continue; }

        if (fp === newPath) { skipped++; continue; }
        if (fs.existsSync(newPath)) { skipped++; continue; }

        const dirPath2 = path.dirname(fp);

        if (DRY_RUN) {
          console.log(`  WOULD RENAME ORPHAN: ${fp} → ${path.basename(newPath)}`);
          console.log(`    book=${bookName} page=${parsed.pageNum} type=${type}`);
        } else {
          try {
            fs.renameSync(fp, newPath);

            const existing = await pool.query(
              'SELECT id FROM materials_registry WHERE book_name = $1 AND page_num = $2',
              [bookName, parsed.pageNum]
            );

            if (existing.rows.length === 0) {
              const directory = path.join(COURSES_DIR, bookName);
              const col = type + '_path';
              const hasCol = 'has_' + type;
              await pool.query(`
                INSERT INTO materials_registry (book_name, page_num, directory, ${col}, ${hasCol})
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (book_name, page_num) DO UPDATE SET ${col} = EXCLUDED.${col}, ${hasCol} = true
              `, [bookName, parsed.pageNum, directory, newPath]);
              inserted++;
            } else {
              const col = type + '_path';
              const hasCol = 'has_' + type;
              await pool.query(
                `UPDATE materials_registry SET ${col} = $1, ${hasCol} = true WHERE id = $2`,
                [newPath, existing.rows[0].id]
              );
              renamed++;
            }
          } catch (e) {
            console.log(`  ERROR ${fp}: ${e.message}`);
            errors++;
          }
        }
      }
    }
  }

  await scanDir(COURSES_DIR);
  console.log(`\nPhase 2 results: found=${found} renamed/inserted=${renamed + inserted} skipped=${skipped} errors=${errors}`);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN MODE ===\n' : '=== LIVE MODE ===\n');
  const start = Date.now();

  await normalizeRegistered();
  await normalizeOrphans();

  console.log(`\nTotal time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
