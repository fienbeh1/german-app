const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
  const pool = new Pool({ host: '/var/run/postgresql', database: 'deutsch', user: 'f' });
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (file_path) id, file_name, file_path, cd_num, track_num, book_name
     FROM audio_index
     WHERE file_path IS NOT NULL AND file_path != ''
     ORDER BY file_path`
  );
  console.log(`Found ${rows.length} unique tracks`);
  let ok = 0, skip = 0, err = 0;
  for (const row of rows) {
    const fp = row.file_path;
    if (!fp || !fs.existsSync(fp)) { skip++; continue; }
    const book = row.book_name || 'Unknown';
    const cd = row.cd_num || 1;
    const track = row.track_num || 1;
    const cleanBook = book.split('/').pop().replace(/_/g, ' ');
    let title = path.basename(fp, path.extname(fp))
      .replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (title.length > 60) title = title.slice(0, 60);
    try {
      execSync(
        `mid3v2 --TPOS="${cd}" --TRCK="${track}" --TALB="${cleanBook}" --TPE1="${cleanBook}" --TIT2="${title}" "${fp}"`,
        { stdio: 'ignore', timeout: 5000 }
      );
      ok++;
    } catch (e) {
      err++;
    }
    if ((ok + skip + err) % 200 === 0)
      console.log(`Progress: ${ok} ok, ${skip} skip, ${err} err`);
  }
  console.log(`Done: ${ok} updated, ${skip} skipped, ${err} errors`);
  await pool.end();
}
main().catch(e => console.error(e.message));
