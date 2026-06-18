/**
 * Enhanced audio ref scanner — handles ALL known CD reference patterns:
 * 1. CD N|M       (B2, B1-Plus, Lagune)  — "CD 1 |4-7"
 * 2. CD N|M-R     (ranges)                — "CD 1|8-11"
 * 3. CDNNN        (Schritte Int 1)        — "CD212" = CD2 T12
 * 4. N)M          (Schritte Plus)         — "1)1-8" = Lektion1 Tracks1-8
 * 5. Also marks pages with "Hören" keywords but no CD refs
 */
const { Client } = require('pg')
const fs = require('fs')

const DB = { database: 'deutsch', user: 'f', host: '/var/run/postgresql' }

// Pattern 1: "CD 1 |4-7", "CD1|8", "CD 2|10", "CD 1|12-15"
const PATTERN_PIPE = /CD\s*(\d{1,2})\s*[|:\-]\s*([\d,\-\s]+)/gi

// Pattern 2: "CD212" (Schritte Int 1 — 3-digit, first digit = CD, rest = track)
const PATTERN_CDNNN = /\bCD(\d)(\d{2})\b/gi

// Audio-related keywords (for flagging pages that likely have audio but no ref)
const AUDIO_KEYWORDS = /\b(Hören Sie|Hörtext|Hörverstehen|Hör zu|Sprechen Sie nach|sprechen Sie nach|hören Sie|hören und|CD zum|Audio)\b/i

function parseTrackList(s) {
  const tracks = []
  const rangeMatch = s.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]), end = parseInt(rangeMatch[2])
    for (let i = start; i <= end; i++) tracks.push(i)
    return tracks
  }
  for (const p of s.split(',')) {
    const n = parseInt(p.trim())
    if (!isNaN(n)) tracks.push(n)
  }
  return tracks
}

async function main() {
  const client = new Client(DB)
  await client.connect()

  // 1) Get all pages with OCR text
  const reg = await client.query(`
    SELECT DISTINCT book_name, page_num, txt_path
    FROM materials_registry WHERE has_txt = true
    ORDER BY book_name, page_num
  `)

  // 2) Existing refs to avoid dupes
  const existing = await client.query(`
    SELECT DISTINCT book_name, page_num, cd_num, track_num
    FROM page_audio_refs WHERE cd_num IS NOT NULL AND track_num IS NOT NULL
  `)
  const existingSet = new Set()
  for (const r of existing.rows)
    existingSet.add(`${r.book_name}|${r.page_num}|${r.cd_num}|${r.track_num}`)

  // 3) Audio index for matching
  const ai = await client.query(`
    SELECT DISTINCT book_name, cd_num, track_num, file_path, id
    FROM audio_index WHERE cd_num IS NOT NULL AND track_num IS NOT NULL
  `)
  const audioByBook = {}
  for (const r of ai.rows) {
    const bn = r.book_name
    if (!audioByBook[bn]) audioByBook[bn] = {}
    audioByBook[bn][`${r.cd_num}|${r.track_num}`] = r
  }

  let totalInserted = 0
  let totalNewRefs = 0
  const pagesWithMissing = []
  const pagesWithAudioKeywords = []

  for (const { book_name, page_num, txt_path: txtPath } of reg.rows) {
    let txtContent = null
    if (txtPath && fs.existsSync(txtPath))
      txtContent = fs.readFileSync(txtPath, 'utf-8')
    else
      continue

    const foundRefs = []
    let match

    // Pattern 1: CD N|M
    PATTERN_PIPE.lastIndex = 0
    while ((match = PATTERN_PIPE.exec(txtContent)) !== null) {
      const cdNum = parseInt(match[1])
      if (cdNum > 20) continue // filter false positives (no book has >20 CDs)
      for (const tn of parseTrackList(match[2].trim()))
        foundRefs.push({ cd: cdNum, track: tn })
    }

    // Pattern 2: CDNNN (Schritte Int 1 style)
    PATTERN_CDNNN.lastIndex = 0
    while ((match = PATTERN_CDNNN.exec(txtContent)) !== null) {
      const cdNum = parseInt(match[1])
      const trackNum = parseInt(match[2])
      if (trackNum > 0 && trackNum < 200)
        foundRefs.push({ cd: cdNum, track: trackNum })
    }

    // Check for audio keywords (flag pages that likely have audio)
    if (AUDIO_KEYWORDS.test(txtContent)) {
      pagesWithAudioKeywords.push({ book_name, page_num })
    }

    if (foundRefs.length === 0) continue

    const missingRefs = foundRefs.filter(
      r => !existingSet.has(`${book_name}|${page_num}|${r.cd}|${r.track}`)
    )
    if (missingRefs.length === 0) continue

    // Extract exercise context
    const exerciseTexts = []
    for (const line of txtContent.split('\n')) {
      if (/(CD\s*\d+\s*[|:\-])|(\bCD\d{3}\b)/.test(line)) {
        const cleaned = line.replace(/^[\d\s.]+/, '').substring(0, 90).trim()
        if (cleaned) exerciseTexts.push(cleaned)
      }
    }

    pagesWithMissing.push({ book_name, page_num, missing: missingRefs, exerciseTexts })

    for (const ref of missingRefs) {
      await client.query(`
        INSERT INTO page_audio_refs (book_name, page_num, cd_num, track_num, exercise_text)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [book_name, page_num, ref.cd, ref.track, exerciseTexts[0] || ''])
      totalInserted++
      existingSet.add(`${book_name}|${page_num}|${ref.cd}|${ref.track}`)
    }
    totalNewRefs += missingRefs.length
  }

  console.log(`\n=== Results ===`)
  console.log(`Pages scanned: ${reg.rows.length}`)
  console.log(`Pages with missing audio refs: ${pagesWithMissing.length}`)
  console.log(`Total new refs inserted: ${totalInserted}`)
  console.log(`Pages with audio keywords (no CD ref found): ${pagesWithAudioKeywords.length}`)
  console.log(`\nPages with missing refs:`)
  for (const p of pagesWithMissing.slice(0, 40)) {
    const refStr = p.missing.map(r => `CD${r.cd}|T${r.track}`).join(', ')
    const ctx = p.exerciseTexts[0] || ''
    console.log(`  ${p.book_name} p.${p.page_num}: ${refStr} — "${ctx.substring(0, 70)}"`)
  }
  if (pagesWithAudioKeywords.length > 0) {
    console.log(`\nPages with audio keywords but no CD ref (first 20):`)
    for (const p of pagesWithAudioKeywords.slice(0, 20))
      console.log(`  ${p.book_name} p.${p.page_num}`)
  }

  await client.end()
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
