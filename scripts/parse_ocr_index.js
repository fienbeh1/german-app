#!/usr/bin/env node
/**
 * parse_ocr_index.js
 * Scans all OCR .txt files for every book page and builds the page_content_index table.
 * Run: node parse_ocr_index.js
 * Re-runnable: uses INSERT ... ON CONFLICT DO UPDATE
 */

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });
const COURSES_DIR = '/home/f/deutsch-app/de';

const PATTERNS = {
  cdRef: /(?:CD\s*(\d+)[,\s/]*(?:Track|T|Nr\.?)\s*(\d+))|(?:(\d)\s*\/\s*(\d{1,3}))|(?:\bTrack\s+(\d+)\b)/gi,
  grammar: /\b(Nominativ|Akkusativ|Dativ|Genitiv|Konjunktiv|Imperativ|Präteritum|Perfekt|Futur|trennbare\s+Verben?|untrennbare\s+Verben?|Modalverb(?:en)?|Relativsatz|Nebensatz|Adjektivdeklination|Komparativ|Superlativ|Passiv|Reflexivverb(?:en)?|Wortstellung|Kasus|Artikel)\b/gi,
  listening: /\b(Hören\s+Sie|Hörtext|Hörverstehen|Hörübung|Höraufgabe|Hör\s+zu|Hört\s+ihr|auf\s+der\s+CD|im\s+Radio|Ansage|Dialog\s+hören)\b/gi,
  speaking: /\b(Sprechen\s+Sie|Sprechtraining|Sprechübung|Rollenspiel|Gespräch\s+führen|diskutieren\s+Sie|erzählen\s+Sie|Fragen\s+Sie|Antworten\s+Sie|Partnergespräch|Präsentation)\b/gi,
  answers: /\b(Lösung(?:en)?|Lösungsschlüssel|Korrekte?\s+Antwort|Musterlösung|Richtig(?:e)?|Falsch(?:e)?|Antwort(?:en)?:)\b/gi,
  vocabList: /\b(der|die|das)\s+([A-ZÄÖÜ][a-zäöüß]+(?:,\s*-[a-zäöüß]+)?)/g,
  writing: /\b(Schreiben\s+Sie|Schreibaufgabe|Schreibtraining|Brief\s+schreiben|E-Mail\s+schreiben|Aufsatz|Bericht\s+schreiben|beschreiben\s+Sie)\b/gi,
  exercises: /\b(Übung\s*\d+|Aufgabe\s*\d+|Exercise\s*\d+|Nr\.\s*\d+[a-z]?)\b/gi,
  reading: /\b(Lesen\s+Sie|Lesetext|Leseverstehen|Leseübung|Text\s+lesen|lesen\s+und)\b/gi,
  sectionLabel: /^\s*([A-Z][A-ZÄÖÜ\s]{2,20})\s*$/gm,
};

function parseOcrText(text) {
  if (!text || text.trim().length < 10) return null;

  const result = {
    has_cd_refs: false,
    has_grammar: false,
    has_listening: false,
    has_speaking: false,
    has_answers: false,
    has_vocabulary_list: false,
    has_reading_text: false,
    has_writing_prompt: false,
    has_exercises: false,
    cd_refs: [],
    grammar_topics: [],
    section_labels: [],
    vocab_snippets: [],
    answer_snippets: [],
  };

  const cdMatches = [...text.matchAll(PATTERNS.cdRef)];
  if (cdMatches.length > 0) {
    result.has_cd_refs = true;
    result.cd_refs = cdMatches.map(m => {
      const start = Math.max(0, m.index - 60);
      const context = text.slice(start, m.index + m[0].length + 30).replace(/\n/g, ' ').trim();
      if (m[1] && m[2]) return { cd: parseInt(m[1]), track: parseInt(m[2]), raw: m[0], context };
      if (m[3] && m[4]) return { cd: parseInt(m[3]), track: parseInt(m[4]), raw: m[0], context };
      if (m[5])         return { cd: null, track: parseInt(m[5]), raw: m[0], context };
      return { raw: m[0], context };
    }).filter(Boolean);
  }

  const grammarMatches = [...new Set([...text.matchAll(PATTERNS.grammar)].map(m => m[0].trim()))];
  if (grammarMatches.length > 0) {
    result.has_grammar = true;
    result.grammar_topics = grammarMatches;
  }

  const labelMatches = [...new Set(
    [...text.matchAll(PATTERNS.sectionLabel)]
      .map(m => m[1].trim())
      .filter(l => l.length >= 4 && l.length <= 25)
  )];
  result.section_labels = labelMatches;

  result.has_listening       = PATTERNS.listening.test(text);
  result.has_speaking        = PATTERNS.speaking.test(text);
  result.has_answers         = PATTERNS.answers.test(text);
  result.has_writing_prompt  = PATTERNS.writing.test(text);
  result.has_exercises       = PATTERNS.exercises.test(text);
  result.has_reading_text    = PATTERNS.reading.test(text);

  Object.values(PATTERNS).forEach(p => { if (p.lastIndex !== undefined) p.lastIndex = 0; });

  const vocabHits = [...text.matchAll(PATTERNS.vocabList)].slice(0, 15);
  if (vocabHits.length >= 3) {
    result.has_vocabulary_list = true;
    result.vocab_snippets = vocabHits.map(m => ({ article: m[1], word: m[2] }));
  }

  return result;
}

async function findTxtFileForPage(bookDir, pageNum) {
  const padded = String(pageNum).padStart(3, '0');
  const candidates = [
    `${padded}.txt`,
    `page_${padded}.txt`,
    `page${padded}.txt`,
    `p${padded}.txt`,
    `${pageNum}.txt`,
  ];
  for (const name of candidates) {
    const full = path.join(bookDir, name);
    if (fs.existsSync(full)) return full;
  }
  for (const sub of ['txt', 'ocr', 'text']) {
    const subDir = path.join(bookDir, sub);
    if (fs.existsSync(subDir)) {
      for (const name of candidates) {
        const full = path.join(subDir, name);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  return null;
}

async function run() {
  const client = await pool.connect();
  try {
    // Get all books with pages from materials_registry
    const { rows: books } = await client.query(`
      SELECT DISTINCT book_name, MAX(page_num) as max_page
      FROM materials_registry
      WHERE has_txt = true
      GROUP BY book_name
      ORDER BY book_name
    `);
    console.log(`Processing ${books.length} books from materials_registry...`);

    let totalPages = 0, totalIndexed = 0, totalWithCd = 0;

    for (const book of books) {
      const bookDir = path.join(COURSES_DIR, book.book_name);
      if (!fs.existsSync(bookDir)) {
        console.warn(`  [SKIP] Directory not found: ${bookDir}`);
        continue;
      }

      // Get all page numbers for this book
      const { rows: pages } = await client.query(`
        SELECT page_num, txt_path FROM materials_registry
        WHERE book_name = $1 AND has_txt = true
        ORDER BY page_num
      `, [book.book_name]);
      
      const pageNums = pages.map(p => p.page_num);
      const txtPaths = Object.fromEntries(pages.map(p => [p.page_num, p.txt_path]));

      let bookIndexed = 0;
      for (const pageNum of pageNums) {
        totalPages++;
        const txtPath = txtPaths[pageNum] || await findTxtFileForPage(bookDir, pageNum);
        let ocrText = null;
        let parsed = null;

        if (txtPath && fs.existsSync(txtPath)) {
          try {
            ocrText = fs.readFileSync(txtPath, 'utf8');
            parsed = parseOcrText(ocrText);
          } catch (e) {
            console.warn(`  [WARN] Could not read ${txtPath}: ${e.message}`);
          }
        }

        if (!parsed && !ocrText) {
          parsed = {
            has_cd_refs: false, has_grammar: false, has_listening: false,
            has_speaking: false, has_answers: false, has_vocabulary_list: false,
            has_reading_text: false, has_writing_prompt: false, has_exercises: false,
            cd_refs: [], grammar_topics: [], section_labels: [],
            vocab_snippets: [], answer_snippets: [],
          };
        }

        await client.query(`
          INSERT INTO page_content_index
            (book_name, page_num, txt_path,
             has_cd_refs, has_grammar, has_listening, has_speaking,
             has_answers, has_vocabulary_list, has_reading_text,
             has_writing_prompt, has_exercises,
             cd_refs, grammar_topics, section_labels, vocab_snippets, answer_snippets,
             ocr_text, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
          ON CONFLICT (book_name, page_num) DO UPDATE SET
            txt_path           = EXCLUDED.txt_path,
            has_cd_refs        = EXCLUDED.has_cd_refs,
            has_grammar        = EXCLUDED.has_grammar,
            has_listening      = EXCLUDED.has_listening,
            has_speaking       = EXCLUDED.has_speaking,
            has_answers        = EXCLUDED.has_answers,
            has_vocabulary_list= EXCLUDED.has_vocabulary_list,
            has_reading_text   = EXCLUDED.has_reading_text,
            has_writing_prompt = EXCLUDED.has_writing_prompt,
            has_exercises      = EXCLUDED.has_exercises,
            cd_refs            = EXCLUDED.cd_refs,
            grammar_topics     = EXCLUDED.grammar_topics,
            section_labels     = EXCLUDED.section_labels,
            vocab_snippets     = EXCLUDED.vocab_snippets,
            answer_snippets    = EXCLUDED.answer_snippets,
            ocr_text           = EXCLUDED.ocr_text,
            updated_at         = NOW()
        `, [
          book.book_name, pageNum, txtPath,
          parsed.has_cd_refs, parsed.has_grammar, parsed.has_listening,
          parsed.has_speaking, parsed.has_answers, parsed.has_vocabulary_list,
          parsed.has_reading_text, parsed.has_writing_prompt, parsed.has_exercises,
          JSON.stringify(parsed.cd_refs),
          JSON.stringify(parsed.grammar_topics),
          JSON.stringify(parsed.section_labels),
          JSON.stringify(parsed.vocab_snippets),
          JSON.stringify(parsed.answer_snippets),
          ocrText,
        ]);

        bookIndexed++;
        if (parsed.has_cd_refs) totalWithCd++;
      }

      totalIndexed += bookIndexed;
      console.log(`  ✓ ${book.book_name}: ${bookIndexed} pages indexed (max page: ${book.max_page})`);
    }

    console.log(`\n✅ Done. ${totalIndexed}/${totalPages} pages indexed. ${totalWithCd} pages with CD refs.`);

    const { rows: summary } = await client.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN has_cd_refs THEN 1 ELSE 0 END) AS cd_pages,
        SUM(CASE WHEN has_grammar THEN 1 ELSE 0 END) AS grammar_pages,
        SUM(CASE WHEN has_listening THEN 1 ELSE 0 END) AS listening_pages,
        SUM(CASE WHEN has_answers THEN 1 ELSE 0 END) AS answer_pages,
        SUM(CASE WHEN has_exercises THEN 1 ELSE 0 END) AS exercise_pages,
        SUM(CASE WHEN has_vocabulary_list THEN 1 ELSE 0 END) AS vocab_pages
      FROM page_content_index
    `);
    console.table(summary[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);