import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Loader2, Check, X, ArrowRight, Trophy, Gamepad2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface VerbData {
  infinitive: string
  praesens_ich: string
  praesens_du: string
  praesens_er: string
  auxiliary_verb: string
  english: string
  spanish_translation: string
  french: string
}

interface AnswerRecord {
  verb: VerbData
  userAnswer: string
  correct: boolean
}

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

export function VerbCardFlip({ appState }: { appState?: any } = {}) {
  const [verbs, setVerbs] = useState<VerbData[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [input, setInput] = useState('')
  const [isFlipped, setIsFlipped] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/verbs/random?limit=10')
      .then(r => r.json())
      .then(data => { setVerbs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const current = verbs[currentIdx]

  const check = useCallback(() => {
    if (!input.trim() || !current || isFlipped) return
    const clean = input.trim().toLowerCase()
    const targets = [current.english, current.spanish_translation, current.french].filter(Boolean)
    const ok = targets.some(t => fuzzyMatch(clean, t))
    setFeedback(ok ? 'correct' : 'incorrect')
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }))
    setAnswers(a => [...a, { verb: current, userAnswer: input.trim(), correct: ok }])
    setIsFlipped(true)
  }, [input, current, isFlipped])

  const goBack = useCallback(() => {
    if (appState?.setCurrentGame) appState.setCurrentGame(null)
  }, [appState])

  const next = useCallback(() => {
    if (currentIdx + 1 >= verbs.length) { setDone(true); return }
    setCurrentIdx(i => i + 1)
    setInput('')
    setFeedback(null)
    setIsFlipped(false)
  }, [currentIdx, verbs.length])

  if (loading) {
    return (
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
  }

  if (!verbs.length) {
    return (
      <div className="p-6 space-y-4">
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Keine Verben gefunden.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((score.correct / Math.max(score.total, 1)) * 100)
    return (
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader><CardTitle>Verb Card Flip</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <Trophy className="size-12 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold">{score.correct}/{score.total}</p>
            <p className="text-muted-foreground">{pct}% correct</p>
            <div className="space-y-1.5 text-left max-h-60 overflow-y-auto">
              {answers.map((a, i) => (
                <div key={i} className={cn(
                  "flex items-center gap-2 p-2 rounded text-sm",
                  a.correct ? "bg-green-500/10" : "bg-red-500/10"
                )}>
                  {a.correct
                    ? <Check className="size-4 text-green-600 shrink-0" />
                    : <X className="size-4 text-red-600 shrink-0" />}
                  <span className="font-mono font-medium">{a.verb.infinitive}</span>
                  <span className="text-muted-foreground">→</span>
                  <span>{a.verb.english}</span>
                  {!a.correct && <span className="text-xs text-muted-foreground ml-auto">You: {a.userAnswer}</span>}
                </div>
              ))}
            </div>
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
          <div>
            <CardTitle className="text-lg">Verb Card Flip</CardTitle>
            <p className="text-xs text-muted-foreground">Translate the verb (EN/ES)</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{currentIdx + 1}/{verbs.length}</Badge>
            <Badge variant="secondary">{score.correct}/{score.total}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(currentIdx / verbs.length) * 100} />

          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
            >
              <div className="perspective-1000 min-h-[14rem]">
                <div
                  className={cn(
                    "relative w-full h-full transition-all duration-500 transform-style-3d",
                    isFlipped && "rotate-y-180"
                  )}
                >
                  {/* Front — German verb */}
                  <div className={cn("absolute inset-0 backface-hidden", isFlipped && "invisible")}>
                    <div className="h-full backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border border-white/30 dark:border-white/10 shadow-lg rounded-xl p-6 flex flex-col items-center justify-center gap-3">
                      <Badge variant="secondary" className="text-xs">Verb</Badge>
                      <p className="text-3xl font-bold">{current.infinitive}</p>
                      {current.auxiliary_verb && (
                        <span
                          className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: current.auxiliary_verb === 'sein' ? 'rgba(5,150,105,0.3)' : 'rgba(37,99,235,0.3)',
                            color: current.auxiliary_verb === 'sein' ? '#6EE7B7' : '#93C5FD',
                          }}
                        >
                          {current.auxiliary_verb}
                        </span>
                      )}
                      {current.praesens_ich && (
                        <p className="text-xs text-muted-foreground font-mono">
                          ich {current.praesens_ich} · er {current.praesens_er}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Back — English + Spanish + French translations */}
                  <div className={cn("absolute inset-0 backface-hidden rotate-y-180", !isFlipped && "invisible")}>
                    <div className="h-full backdrop-blur-xl bg-gradient-to-br from-white/90 to-white/70 dark:from-gray-800/90 dark:to-gray-800/70 border border-white/30 dark:border-white/10 shadow-lg rounded-xl p-6 flex flex-col items-center justify-center gap-2">
                      {current.english && (
                        <div className="text-center">
                          <p className="text-3xl font-bold">{current.english}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">EN</p>
                        </div>
                      )}
                      {current.spanish_translation && (
                        <div className="text-center">
                          <p className="text-xl text-muted-foreground">{current.spanish_translation}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">ES</p>
                        </div>
                      )}
                      {current.french && (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">{current.french}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">FR</p>
                        </div>
                      )}
                      <div className={cn(
                        "flex items-center gap-2 text-sm font-medium text-center",
                        feedback === 'correct' ? "text-green-600" : "text-red-600"
                      )}>
                        {feedback === 'correct'
                          ? <><Check className="size-5" /> Correct!</>
                          : <><X className="size-5" /> {current.english}{current.spanish_translation ? ` · ${current.spanish_translation}` : ''}{current.french ? ` · ${current.french}` : ''}</>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Translation (EN/ES/FR)..."
              onKeyDown={e => e.key === 'Enter' && (isFlipped ? next() : check())}
              disabled={isFlipped}
            />
            {!isFlipped ? (
              <Button onClick={check} disabled={!input.trim()}>
                <Check className="size-4 mr-1" /> Check
              </Button>
            ) : (
              <Button onClick={next}>
                <ArrowRight className="size-4 mr-1" /> Next
              </Button>
            )}
          </div>

          <AnimatePresence>
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "p-3 rounded-lg text-center text-sm font-medium",
                  feedback === 'correct'
                    ? "bg-green-500/20 text-green-600"
                    : "bg-red-500/20 text-red-600"
                )}
              >
                {feedback === 'correct'
                  ? '✓ Correct!'
                  : `✗ The answer is: ${current.english}${current.spanish_translation ? ` · ${current.spanish_translation}` : ''}${current.french ? ` · ${current.french}` : ''}`}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}
