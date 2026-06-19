import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

const NIVEL_BG: Record<string, string> = {
  A1: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  A2: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  B1: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  B2: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  C1: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
}

export function InteractiveText({ text }: { text: string }) {
  const [hoveredWord, setHoveredWord] = useState('')
  const [translations, setTranslations] = useState<any[]>([])
  const [clickedWord, setClickedWord] = useState('')
  const [clickedTranslations, setClickedTranslations] = useState<any[]>([])
  const [clickedPos, setClickedPos] = useState<{ x: number; y: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const cacheRef = useRef<Map<string, any[]>>(new Map())
  const popupRef = useRef<HTMLDivElement>(null)

  const lookup = useCallback(async (word: string): Promise<any[]> => {
    if (cacheRef.current.has(word)) return cacheRef.current.get(word)!
    try {
      const [vocabRes, dictRes] = await Promise.all([
        fetch(`${API_URL}/api/vocab/search?q=${encodeURIComponent(word)}`),
        fetch(`${API_URL}/api/dictionary/search?q=${encodeURIComponent(word)}`),
      ])
      const vocabData = vocabRes.ok ? (await vocabRes.json()).data || [] : []
      const dictData = dictRes.ok ? (await dictRes.json()).data || [] : []
      const combined = [...vocabData, ...dictData]
      const seen = new Set()
      const deduped = combined.filter((e: any) => {
        const key = e.palabra || e.german_word || ''
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 5)
      cacheRef.current.set(word, deduped)
      return deduped
    } catch { return [] }
  }, [])

  const handleMouseEnter = useCallback(async (word: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const clean = word.replace(/[.,!?;:()"']/g, '').toLowerCase()
    if (clean.length < 2) return
    setHoveredWord(clean)
    const results = await lookup(clean)
    setTranslations(results)
  }, [lookup])

  const handleMouseLeave = useCallback(() => {
    timerRef.current = setTimeout(() => { setHoveredWord(''); setTranslations([]) }, 250)
  }, [])

  const handleWordClick = useCallback(async (word: string, e: React.MouseEvent) => {
    const clean = word.replace(/[.,!?;:()"']/g, '').toLowerCase()
    if (clean.length < 2) return
    if (clickedWord === clean) { setClickedWord(''); setClickedTranslations([]); setClickedPos(null); return }
    setClickedWord(clean)
    const results = await lookup(clean)
    setClickedTranslations(results)
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setClickedPos({ x: rect.left, y: rect.bottom + 4 })
  }, [lookup, clickedWord])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setClickedWord(''); setClickedTranslations([]); setClickedPos(null)
      }
    }
    if (clickedWord) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [clickedWord])

  const segments = useMemo(() => {
    const lines = text.split('\n')
    const segs: Array<{ type: 'header' | 'text'; content: string }> = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) { segs.push({ type: 'text', content: '\n' }); continue }
      const isHeader =
        (trimmed.length < 100 && trimmed === trimmed.toUpperCase() && /[A-ZÄÖÜ]{3,}/.test(trimmed)) ||
        /^(Lektion|Kapitel|Übung|Unit|Thema|Modul|Abschnitt|Teil|Lesson|Exercise|Fall|Präsens|Präteritum|Perfekt|Plusquamperfekt|Futur|Konjunktiv|Imperativ|Passiv|Akkusativ|Dativ|Genitiv|Nominativ|Adjektiv|Nomen|Verb|Artikel|Pronomen|Präposition|Konjunktion|Numerale|Interjektion)/i.test(trimmed)
      segs.push({ type: isHeader ? 'header' : 'text', content: trimmed })
    }
    return segs
  }, [text])

  const tokenize = (segment: string) => {
    return segment.split(/(\s+)/).map((part, i) => {
      if (!part.trim() || part === '\n') return part
      const isWord = /^[A-Za-zäöüßÄÖÜ]+[.,!?;:()"']*$/.test(part)
      if (!isWord) return part
      const clean = part.replace(/[.,!?;:()"']/g, '')
      return { word: part, clean, key: i }
    })
  }

  return (
    <div className="text-[11px] leading-relaxed whitespace-pre-wrap relative">
      {segments.map((seg, sIdx) => {
        if (seg.type === 'header') {
          return (
            <div key={sIdx} className="font-bold text-xs mt-2 mb-1 px-1 py-0.5 rounded bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-l-2 border-emerald-400">
              {seg.content}
            </div>
          )
        }
        if (seg.content === '\n') return <div key={sIdx} className="h-1" />
        const tokens = tokenize(seg.content)
        return (
          <span key={sIdx}>
            {tokens.map((w: any) =>
              typeof w === 'string' ? (
                <span key={w}>{w}</span>
              ) : (
                <span key={w.key} className="relative inline cursor-pointer hover:bg-yellow-200/50 dark:hover:bg-yellow-600/30 rounded px-0.5 transition-colors"
                  onMouseEnter={() => handleMouseEnter(w.word)}
                  onMouseLeave={handleMouseLeave}
                  onClick={(e) => handleWordClick(w.word, e)}
                >
                  {w.word}
                  {hoveredWord === w.clean && translations.length > 0 && clickedWord !== w.clean && (
                    <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-popover border shadow-lg text-[10px] whitespace-nowrap pointer-events-none">
                      {translations.map((t: any, i: number) => (
                        <span key={i} className="block">{t.traduccion || t.spanish || t.english || ''}</span>
                      ))}
                    </span>
                  )}
                </span>
              )
            )}
          </span>
        )
      })}
      {clickedWord && clickedPos && clickedTranslations.length > 0 && (
        <div ref={popupRef}
          className="fixed z-[100] w-72 p-2 rounded-lg bg-popover border shadow-xl text-xs space-y-1"
          style={{ left: Math.min(clickedPos.x, window.innerWidth - 300), top: clickedPos.y }}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-emerald-700 dark:text-emerald-300">{clickedWord}</span>
            <button className="text-muted-foreground hover:text-foreground size-4 flex items-center justify-center rounded-full hover:bg-muted"
              onClick={() => { setClickedWord(''); setClickedTranslations([]); setClickedPos(null) }}>✕</button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {clickedTranslations.map((t: any, i: number) => (
              <div key={i} className="p-1.5 rounded bg-muted/30 space-y-0.5">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium">{t.artikel ? `${t.artikel} ` : ''}{t.palabra || t.wort || t.german_word || ''}</span>
                  {t.wortart && <span className="text-[9px] px-1 rounded bg-muted-foreground/20">{t.wortart}</span>}
                  {t.nivel && <span className={`text-[8px] px-1 rounded ${NIVEL_BG[t.nivel] || ''}`}>{t.nivel}</span>}
                </div>
                <span className="text-muted-foreground">{t.traduccion || t.spanish || '—'}</span>
                {t.english && <span className="text-[10px] text-muted-foreground">EN: {t.english}</span>}
                {t.kontext && <span className="text-[10px] text-muted-foreground italic">"{t.kontext}"</span>}
                {t.plural && <span className="text-[10px] text-muted-foreground">Pl.: {t.plural}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
