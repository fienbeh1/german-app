#!/usr/bin/env node
/* Ingest annotation data and verbs into PostgreSQL for the Deutsch Lern App */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });
const CSV_PATH = '/home/f/deutsch-app/app/public/verben.csv';

async function ingestVocabulary() {
  const client = await pool.connect();
  try {
    // Get curso_id mapping
    const cursos = await client.query('SELECT id, nombre FROM cursos');
    const cursoMap = {};
    for (const row of cursos.rows) {
      const name = (row.nombre || '').trim();
      if (name) cursoMap[name] = row.id;
    }

    // Get annotation rows
    const ann = await client.query(
      `SELECT id, book_name, page_num, content_json, file_name 
       FROM raw_data 
       WHERE content_type = 'annotation' 
       AND content_json IS NOT NULL
       ORDER BY id`
    );

    let total = 0;
    let skipped = 0;

    for (const row of ann.rows) {
      let data;
      try {
        data = typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json;
      } catch {
        skipped++;
        continue;
      }

      const vokabular = data.vokabular || data.vocabulary || [];
      const struktur = data.struktur || {};
      const lektion = (struktur.lektion || '').toString();
      const seite = (struktur.seite || row.page_num || '').toString();

      // Map book_name to curso_id
      let cursoId = null;
      const bn = (row.book_name || '');
      for (const [name, id] of Object.entries(cursoMap)) {
        if (bn.includes(name) || name.includes(bn)) {
          cursoId = id;
          break;
        }
      }

      for (const vocab of vokabular) {
        if (!vocab.wort) continue;

        const palabra = vocab.wort;
        const traduccion = vocab.übersetzung_es || vocab.traduccion || '';
        const wortart = vocab.wortart || '';
        const artikel = vocab.artikel || '';
        const plural = vocab.plural || '';
        const kontext = vocab.kontext || '';
        const english = vocab.english || '';
        const french = vocab.french || '';
        const audioUrl = vocab.audio_url || '';

        // Check exists
        const exists = await client.query(
          `SELECT id FROM vocabulario WHERE palabra = $1 AND traduccion = $2 AND COALESCE(lektion,'') = $3 LIMIT 1`,
          [palabra, traduccion, lektion || '']
        );
        if (exists.rows.length > 0) continue;

        await client.query(
          `INSERT INTO vocabulario 
            (palabra, traduccion, wortart, plural, kontext, english, french,
             audio_url, lektion, seite, source_file, curso_id, ejemplo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [palabra, traduccion, wortart, plural, kontext,
           english, french, audioUrl,
           lektion, seite, row.file_name || '',
           cursoId, kontext || '']
        );
        total++;
      }

      if (total % 500 === 0 && total > 0) {
        console.log(`  Ingested ${total} vocabulary items...`);
      }
    }

    console.log(`Vocabulary: ${total} items ingested, ${skipped} annotations skipped`);
  } finally {
    client.release();
  }
}

async function ingestVerbs() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log(`CSV not found: ${CSV_PATH}`);
    return;
  }

  const client = await pool.connect();
  try {
    const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '').trim();
    const lines = raw.split('\n');
    const headers = parseCSVLine(lines[0]);
    
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => { obj[h.trim()] = (vals[idx] || '').trim(); });

      const infinitive = obj['Infinitiv'] || '';
      if (!infinitive) continue;

      const exists = await client.query('SELECT id FROM german_verbs WHERE infinitive = $1', [infinitive]);
      if (exists.rows.length > 0) continue;

      const rank = obj['Rank'] ? parseInt(obj['Rank'], 10) : null;
      const freq = obj['Freq'] ? parseInt(obj['Freq'], 10) : null;

      await client.query(
        `INSERT INTO german_verbs 
          (infinitive, rank, freq, praeteritum, perfekt, auxiliary_verb,
           praesens_ich, praesens_du, praesens_er,
           konjunktiv_ii_ich, imperativ_singular, imperativ_plural,
           english, spanish_translation, french)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [infinitive, rank, freq,
         obj['Präteritum_ich'] || '', obj['Partizip II'] || '', obj['Hilfsverb'] || '',
         obj['Präsens_ich'] || '', obj['Präsens_du'] || '', obj['Präsens_er, sie, es'] || '',
         obj['Konjunktiv II_ich'] || '', obj['Imperativ Singular'] || '', obj['Imperativ Plural'] || '',
         obj['English'] || '', obj['Spanish'] || '', obj['French'] || '']
      );
      total++;
    }
    console.log(`Verbs: ${total} items ingested`);
  } finally {
    client.release();
  }
}

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

async function main() {
  console.log('=== Ingesting Vocabulary from Annotations ===');
  await ingestVocabulary();
  console.log();
  console.log('=== Ingesting Verbs from CSV ===');
  await ingestVerbs();
  console.log();
  console.log('All done!');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
