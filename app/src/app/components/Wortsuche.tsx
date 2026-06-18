import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Loader2, Gamepad2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Vocabulary } from '../../lib/api'

interface WortsucheProps { vocabulary: Vocabulary[]; exercises: any[]; verbs: any[]; appState?: any }

const GRID = 10
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ'

function randLetter() { return LETTERS[Math.floor(Math.random() * LETTERS.length)] }

interface Placement { word: string; cells: [number, number][]; found: boolean }

function build(words: string[]): { grid: string[][]; placements: Placement[] } {
  const g: string[][] = Array.from({ length: GRID }, () => Array(GRID).fill(''))
  const p: Placement[] = []
  for (const raw of words) {
    const w = raw.toUpperCase().replace(/[^A-ZÄÖÜ]/g, '')
    if (w.length < 2) continue
    const horiz = Math.random() > 0.5
    let placed = false
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const cells: [number, number][] = []
      const row = horiz ? Math.floor(Math.random() * GRID) : Math.floor(Math.random() * (GRID - w.length))
      const col = horiz ? Math.floor(Math.random() * (GRID - w.length)) : Math.floor(Math.random() * GRID)
      let ok = true
      for (let i = 0; i < w.length; i++) {
        const r = horiz ? row : row + i, c = horiz ? col + i : col
        if (g[r]?.[c] && g[r][c] !== w[i]) { ok = false; break }
        cells.push([r, c])
      }
      if (ok) {
        cells.forEach(([r, c], i) => { g[r][c] = w[i] })
        p.push({ word: w, cells, found: false })
        placed = true
      }
    }
  }
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (!g[r][c]) g[r][c] = randLetter()
  return { grid: g, placements: p }
}

export function Wortsuche({ vocabulary, appState }: WortsucheProps) {
  const goBack = () => { if (appState?.setCurrentGame) appState.setCurrentGame(null) }
  const [fetchedWords, setFetchedWords] = useState<Vocabulary[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (vocabulary.length > 0) return
    setLoading(true)
    fetch('/api/vocabulary/random?limit=50')
      .then(r => r.json())
      .then(data => setFetchedWords(data as Vocabulary[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [vocabulary])
  const words = useMemo(() => {
    const src = vocabulary.length > 0 ? vocabulary : fetchedWords
    return [...src].sort(() => Math.random() - 0.5).slice(0, 5).map(v => v.wort)
  }, [vocabulary, fetchedWords])
  const { grid, placements } = useMemo(() => build(words), [words])
  const [found, setFound] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const cellKey = (r: number, c: number) => `${r}-${c}`

  const isCellInFound = useCallback((r: number, c: number) => {
    for (const i of found)
      if (placements[i].cells.some(([pr, pc]) => pr === r && pc === c)) return true
    return false
  }, [found, placements])

  const handleCellClick = useCallback((r: number, c: number) => {
    const key = cellKey(r, c)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      placements.forEach((pl, i) => {
        if (!found.has(i) && pl.cells.every(([pr, pc]) => next.has(cellKey(pr, pc)))) {
          setFound(f => new Set(f).add(i))
        }
      })
      return next
    })
  }, [found, placements])

  if (loading) return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
        <Gamepad2 className="size-3.5" /> Zurück zu Spielen
      </Button>
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5 mb-2">
        <Gamepad2 className="size-3.5" /> Zurück zu Spielen
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Wortsuche</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{found.size}/{placements.length}</Badge>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => window.location.reload()}>Neustart</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {placements.map((pl, i) => (
              <Badge key={i} variant={found.has(i) ? "default" : "outline"} className={cn("text-xs", found.has(i) && "line-through")}>
                {pl.word}
              </Badge>
            ))}
          </div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0,1fr))` }}>
            {grid.map((row, r) => row.map((letter, c) => {
              const key = cellKey(r, c)
              const isSelected = selected.has(key)
              const isFound = isCellInFound(r, c)
              return (
                <motion.button key={key} whileTap={{ scale: 0.9 }}
                  onClick={() => handleCellClick(r, c)}
                  className={cn("size-8 flex items-center justify-center text-sm font-mono rounded transition-all cursor-pointer",
                    isFound && "bg-green-500/30 text-green-700 dark:text-green-300",
                    !isFound && isSelected && "bg-primary/30",
                    !isFound && !isSelected && "bg-white/40 dark:bg-gray-800/40 hover:bg-white/60 dark:hover:bg-gray-700/60"
                  )}
                >
                  {letter}
                </motion.button>
              )
            }))}
          </div>
          {found.size === placements.length && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center text-green-600 font-medium">
              Alle Wörter gefunden!
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
