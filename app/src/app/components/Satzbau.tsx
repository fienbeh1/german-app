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

interface SatzbauProps { vocabulary: Vocabulary[]; exercises: any[]; verbs: any[]; appState?: any }

export function Satzbau({ vocabulary, appState }: SatzbauProps) {
  const goBack = () => { if (appState?.setCurrentGame) appState.setCurrentGame(null) }
  const [shuffled] = useState(() => [...vocabulary].sort(() => Math.random() - 0.5).filter(v => v.wort && v.übersetzung_es))
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [done, setDone] = useState(false)

  const current = shuffled[idx]

  const check = useCallback(() => {
    const word = current.wort.toLowerCase()
    const words = input.toLowerCase().split(/\s+/)
    const found = words.some(w => w === word || w.replace(/[.,!?;:]$/, '') === word)
    setFeedback(found ? 'correct' : 'incorrect')
    setScore(s => ({ correct: s.correct + (found ? 1 : 0), total: s.total + 1 }))
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
          <CardHeader><CardTitle>Satzbau</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <Trophy className="size-12 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold">{score.correct}/{score.total}</p>
            <p className="text-muted-foreground">{Math.round((score.correct / Math.max(score.total, 1)) * 100)}% correct</p>
            <Button onClick={() => window.location.reload()}>Play Again</Button>
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
          <CardTitle>Satzbau</CardTitle>
          <Badge variant="secondary">{score.correct}/{score.total}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(idx / shuffled.length) * 100} />
          <AnimatePresence mode="wait">
            <motion.div key={idx} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">Write a German sentence using:</p>
              <p className="text-2xl font-bold">{current.wort}</p>
              <p className="text-sm text-muted-foreground italic">{current.übersetzung_es}</p>
              {current.artikel && <Badge variant="outline">{current.artikel}</Badge>}
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type your German sentence..." onKeyDown={e => e.key === 'Enter' && !feedback && check()} />
            {!feedback ? <Button onClick={check} disabled={!input.trim()}><Check /></Button> : <Button onClick={next}><ArrowRight /></Button>}
          </div>
          <AnimatePresence>
            {feedback && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className={cn("p-3 rounded-lg text-center text-sm font-medium", feedback === 'correct' ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600")}
              >
                {feedback === 'correct' ? '✓ Great sentence!' : `✗ Make sure to include "${current.wort}" in your sentence`}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}
