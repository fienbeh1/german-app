import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Check, ArrowRight, Trophy, Gamepad2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Vocabulary } from '../../lib/api'

interface WordCastleProps { vocabulary: Vocabulary[]; exercises: any[]; verbs: any[]; appState?: any }

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function fuzzyMatch(input: string, target: string): boolean {
  const a = input.trim().toLowerCase(), b = target.trim().toLowerCase()
  if (a === b) return true
  return levenshtein(a, b) <= Math.max(2, Math.floor(b.length * 0.3))
}

export function WordCastle({ vocabulary, appState }: WordCastleProps) {
  const goBack = () => { if (appState?.setCurrentGame) appState.setCurrentGame(null) }
  const [shuffled] = useState(() => [...vocabulary].sort(() => Math.random() - 0.5).filter(v => v.übersetzung_es))
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [done, setDone] = useState(false)

  const current = shuffled[idx]

  const check = useCallback(() => {
    if (!input.trim()) return
    const ok = fuzzyMatch(input, current.übersetzung_es)
    setFeedback(ok ? 'correct' : 'incorrect')
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }))
  }, [input, current])

  const next = useCallback(() => {
    if (idx + 1 >= shuffled.length) { setDone(true); return }
    setIdx(i => i + 1)
    setInput('')
    setFeedback(null)
  }, [idx, shuffled.length])

  if (done) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <Gamepad2 className="size-3.5" /> Zurück zu Spielen
        </Button>
        <Card>
          <CardHeader><CardTitle>WordCastle</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <Trophy className="size-12 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold">{score.correct}/{score.total}</p>
            <p className="text-muted-foreground">{Math.round((score.correct / Math.max(score.total, 1)) * 100)}% correct</p>
            <Button onClick={() => { window.location.reload() }}>Play Again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
        <Gamepad2 className="size-3.5" /> Zurück zu Spielen
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>WordCastle</CardTitle>
          <Badge variant="secondary">{score.correct}/{score.total}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(idx / shuffled.length) * 100} />
          <AnimatePresence mode="wait">
            <motion.div key={idx} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">Translate to Spanish:</p>
              <p className="text-3xl font-bold">{current.artikel && <span className="text-primary mr-2">{current.artikel}</span>}{current.wort}</p>
              <Badge variant="outline">{current.wortart}</Badge>
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Spanish translation..." onKeyDown={e => e.key === 'Enter' && !feedback && check()} />
            {!feedback ? <Button onClick={check} disabled={!input.trim()}><Check /></Button> : <Button onClick={next}><ArrowRight /></Button>}
          </div>
          <AnimatePresence>
            {feedback && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className={cn("p-3 rounded-lg text-center text-sm font-medium", feedback === 'correct' ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600")}
              >
                {feedback === 'correct' ? '✓ Correct!' : `✗ ${current.übersetzung_es}`}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}
