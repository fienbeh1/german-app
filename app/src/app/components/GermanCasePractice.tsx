import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Check, X, RefreshCw, Trophy, Gamepad2 } from 'lucide-react'

interface CaseQuestion {
  id: number
  word: string
  artikel: string
  case: string
  correct: string
  options: string[]
  sentence: string
  traduccion: string
}

const CASE_COLORS: Record<string, string> = {
  Nominativ: 'bg-emerald-500',
  Akkusativ: 'bg-blue-500',
  Dativ: 'bg-purple-500',
  Genitiv: 'bg-amber-500',
}

export function GermanCasePractice({ appState }: { appState?: any } = {}) {
  const [questions, setQuestions] = useState<CaseQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)

  const loadQuestions = () => {
    setLoading(true)
    setIdx(0)
    setScore(0)
    setFeedback(null)
    setDone(false)
    fetch('/api/quiz/cases?limit=10')
      .then(r => r.json())
      .then(data => { setQuestions(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadQuestions() }, [])

  const current = questions[idx]

  const answer = (art: string) => {
    if (feedback || !current) return
    const correct = art === current.correct
    setFeedback(correct ? 'correct' : 'wrong')
    if (correct) setScore(s => s + 1)
  }

  const goBack = () => {
    if (appState?.setCurrentGame) appState.setCurrentGame(null)
  }

  const next = () => {
    if (idx + 1 >= questions.length) { setDone(true); return }
    setIdx(i => i + 1)
    setFeedback(null)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <Gamepad2 className="size-3.5" /> Zurück zu Spielen
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">Lade Fragen...</CardContent>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <Gamepad2 className="size-3.5" /> Zurück zu Spielen
        </Button>
        <Card>
          <CardHeader><CardTitle>German Cases</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <Trophy className="size-12 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold">{score}/{questions.length}</p>
            <p className="text-muted-foreground">{Math.round((score / Math.max(questions.length, 1)) * 100)}%</p>
            <Button onClick={loadQuestions}><RefreshCw className="size-4 mr-2" /> Erneut versuchen</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
        <Gamepad2 className="size-3.5" /> Zurück zu Spielen
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">🏛️</span> German Cases
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full text-white ${CASE_COLORS[current.case] || 'bg-gray-500'}`}>
              {current.case}
            </span>
            <span className="text-xs text-muted-foreground">{idx + 1}/{questions.length}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(idx / questions.length) * 100} />
          <AnimatePresence mode="wait">
            <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-muted-foreground">Wort:</span>
                  <span className="text-lg font-bold">{current.artikel} {current.word}</span>
                </div>
                <p className="text-base font-medium leading-relaxed">{current.sentence}</p>
                <p className="text-xs text-muted-foreground mt-1">{current.traduccion}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {current.options.map(art => (
                  <motion.button key={art} whileTap={{ scale: 0.98 }}
                    onClick={() => answer(art)}
                    disabled={!!feedback}
                    className={`p-3 rounded-lg border text-base font-bold transition-all ${
                      !feedback
                        ? 'hover:border-primary/50 bg-white/50 dark:bg-gray-800/50 border-white/20 dark:border-white/10 cursor-pointer'
                        : art === current.correct
                          ? 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300'
                          : art === (feedback === 'wrong' ? current.options.find(o => o !== current.correct && o !== art) : '')
                            ? ''
                            : 'opacity-50'
                    }`}
                  >
                    {art}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
          {feedback && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-center justify-between p-3 rounded-lg ${feedback === 'correct' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <span className={`text-sm font-medium flex items-center gap-1 ${feedback === 'correct' ? 'text-green-600' : 'text-red-600'}`}>
                {feedback === 'correct' ? <><Check className="size-4" /> Richtig!</> : <><X className="size-4" /> {current.correct}</>}
              </span>
              <Button onClick={next} size="sm">
                {idx + 1 >= questions.length ? 'Ergebnis' : 'Weiter'} →
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
