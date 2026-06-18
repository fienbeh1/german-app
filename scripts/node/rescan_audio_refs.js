/**
 * Re-scan OCR txt files to extract CD references missing from page_audio_refs.
 *
 * The original scan-only caught audio refs from PDF layout analysis.
 * Many pages have "CD X |Y-Z" embedded in exercise instructions (OCR text).
 * This script finds those, cross-references with audio_index, and inserts them.
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DB = { database: 'deutsch', user: 'f', host: '/var/run/postgresql' }


// Regex patterns for CD references in OCR text
// Matches: "CD 1 |4-7", "CD1|8", "CD 2 |10", "CD 1|12-15", "CD1|4,5,6"
const CD_PATTERN = /CD\s*(\d{1,2})\s*[|:\-]\s*([\d,\-\s]+)/gi
const TRACK_PATTERN = /\d+/g

function parseTrackList(s) {
  const tracks = []
  // Handle ranges like "4-7" or "12-15"
  const rangeMatch = s.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1])
    const end = parseInt(rangeMatch[2])
    for (let i = start; i <= end; i++) tracks.push(i)
    return tracks
  }
  // Handle comma-separated: "4,5,6"
  const parts = s.split(',')
  for (const p of parts) {
    const trimmed = p.trim()
    const n = parseInt(trimmed)
    if (!isNaN(n)) tracks.push(n)
  }
  return tracks
}

async function main() {
  const client = new Client(DB)
  await client.connect()

  // Get all book_name + page_num combinations from materials_registry
  const reg = await client.query(`
    SELECT DISTINCT book_name, page_num, txt_path
    FROM materials_registry
    WHERE has_txt = true
    ORDER BY book_name, page_num
  `)

  // Get all existing page_audio_refs to avoid duplicates
  const existing = await client.query(`
    SELECT DISTINCT book_name, page_num, cd_num, track_num
    FROM page_audio_refs
    WHERE cd_num IS NOT NULL AND track_num IS NOT NULL
  `)
  const existingSet = new Set()
  for (const r of existing.rows) {
    existingSet.add(`${r.book_name}|${r.page_num}|${r.cd_num}|${r.track_num}`)
  }

  // Get audio_index for cross-reference
  const ai = await client.query(`
    SELECT DISTINCT book_name, cd_num, track_num, file_path, id
    FROM audio_index
    WHERE cd_num IS NOT NULL AND track_num IS NOT NULL
  `)
  // Group by book_name -> { cd_num -> [track_num] }
  const audioByBook = {}
  for (const r of ai.rows) {
    const bn = r.book_name
    if (!audioByBook[bn]) audioByBook[bn] = {}
    const key = `${r.cd_num}|${r.track_num}`
    audioByBook[bn][key] = r
  }

  let totalInserted = 0
  let totalNewRefs = 0
  const pagesWithMissing = []

  for (const { book_name, page_num, txt_path: txtPath } of reg.rows) {
    let txtContent = null
    if (txtPath && fs.existsSync(txtPath)) {
      txtContent = fs.readFileSync(txtPath, 'utf-8')
    } else {
      continue
    }

    // Extract CD references from OCR text
    let match
    const foundRefs = []
    while ((match = CD_PATTERN.exec(txtContent)) !== null) {
      const cdNum = parseInt(match[1])
      const trackStr = match[2].trim()
      const trackNums = parseTrackList(trackStr)
      for (const tn of trackNums) {
        foundRefs.push({ cd: cdNum, track: tn })
      }
    }

    if (foundRefs.length === 0) continue

    // Check which are missing from page_audio_refs
    const missingRefs = foundRefs.filter(
      r => !existingSet.has(`${book_name}|${page_num}|${r.cd}|${r.track}`)
    )

    if (missingRefs.length === 0) continue

    // Extract exercise context from the line containing the CD ref
    const lines = txtContent.split('\n')
    const exerciseTexts = []
    for (const line of lines) {
      if (/CD\s*\d+\s*[|:\-]/.test(line)) {
        const cleaned = line.replace(/^[\d\s.]+/, '').substring(0, 80).trim()
        if (cleaned) exerciseTexts.push(cleaned)
      }
    }

    pagesWithMissing.push({ book_name, page_num, missing: missingRefs, exerciseTexts })

    // Insert missing refs
    for (const ref of missingRefs) {
      const exerciseText = exerciseTexts[0] || ''
      await client.query(`
        INSERT INTO page_audio_refs (book_name, page_num, cd_num, track_num, exercise_text)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [book_name, page_num, ref.cd, ref.track, exerciseText])
      totalInserted++
      existingSet.add(`${book_name}|${page_num}|${ref.cd}|${ref.track}`)
    }

    totalNewRefs += missingRefs.length
  }

  console.log(`\n=== Results ===`)
  console.log(`Pages scanned: ${reg.rows.length}`)
  console.log(`Pages with missing audio refs: ${pagesWithMissing.length}`)
  console.log(`Total new refs inserted: ${totalInserted}`)
  console.log(`\nPages with missing refs (first 30):`)
  for (const p of pagesWithMissing.slice(0, 30)) {
    const refStr = p.missing.map(r => `CD${r.cd}|T${r.track}`).join(', ')
    const ctx = p.exerciseTexts[0] || ''
    console.log(`  ${p.book_name} p.${p.page_num}: ${refStr} — "${ctx.substring(0, 60)}"`)
  }

  // Also update audio_index transcription paths for B2
  // Map B2 tracks to their transcription files
  const transcriptionsBase1 = '/home/f/deutsch-app/de/B2/Kursbuch Hoertexte/B2 EM neu - Hauptkurs cd 1/transcriptions_de'
  const transcriptionsBase2 = '/home/f/deutsch-app/de/B2/Kursbuch Hoertexte/B2 EM neu - Hauptkurs cd 2/transcriptions_de'
  const audioBase = '/home/f/deutsch-app/de/B2/Audio'

  // Find audio_index entries for B2 that are missing transcription_path
  const missingTrans = await client.query(`
    SELECT id, file_name, cd_num, track_num
    FROM audio_index
    WHERE book_name = 'B2'
      AND (transcription_path IS NULL OR translation_path IS NULL)
      AND cd_num IS NOT NULL AND track_num IS NOT NULL
  `)

  let transUpdated = 0
  for (const row of missingTrans.rows) {
    const baseDir = row.cd_num === 1 ? transcriptionsBase1 : transcriptionsBase2
    const fileName = row.file_name.replace(/\.mp3$/, '')
    const translatedPath = path.join(baseDir, `${fileName}_translated.txt`)
    const simplePath = path.join(baseDir, `${fileName}.txt`)

    // Prefer translated, fall back to simple
    const transcriptionPath = fs.existsSync(translatedPath) ? translatedPath :
                             fs.existsSync(simplePath) ? simplePath : null
    const translationPath = fs.existsSync(translatedPath) ? translatedPath : null

    if (transcriptionPath) {
      await client.query(`
        UPDATE audio_index
        SET transcription_path = $1,
            translation_path = $2
        WHERE id = $3
      `, [transcriptionPath, translationPath, row.id])
      transUpdated++
    }
  }
  console.log(`\nAudio transcription paths updated: ${transUpdated}`)

  await client.end()
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
