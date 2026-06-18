import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Check, X, ArrowRight, Trophy } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Vocabulary } from '../../lib/api'

interface GrammarQuestProps { vocabulary: Vocabulary[]; exercises: any[]; verbs: any[] }

function extractQuestion(texto: string): string {
  return texto.split(/[.?!\n]/).filter(s => s.trim().length > 10)[0] || texto.slice(0, 120)
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function GrammarQuest({ vocabulary, exercises }: GrammarQuestProps) {
  const quiz = useMemo(() => {
    const filtered = exercises.filter(e => {
      if (!e.texto || e.texto.length < 20) return false
      if (/GrammarQuest\s*\d+\/\d+/i.test(e.texto)) return false
      if (/Seite\s+\d+/i.test(e.texto)) return false
      return true
    })
    return shuffleArray(filtered).slice(0, 10).map(e => {
      const question = extractQuestion(e.texto)
      const correct = e.titulo || e.texto.split(/[.?!\n]/).filter(s => s.trim().length > 5)[1] || e.texto.slice(0, 80)
      const wrong = shuffleArray(vocabulary.filter(v => v.wort !== correct)).slice(0, 3).map(v => v.wort)
      const options = shuffleArray([correct, ...wrong])
      return { question, correct, options }
    })
  }, [vocabulary, exercises])

  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [done, setDone] = useState(false)

  const current = quiz[idx]
  if (!current) return null

  const handleSelect = useCallback((opt: string) => {
    if (answered) return
    setSelected(opt)
    setAnswered(true)
    if (opt === current.correct) setScore(s => s + 1)
  }, [answered, current])

  const next = useCallback(() => {
    if (idx + 1 >= quiz.length) { setDone(true); return }
    setIdx(i => i + 1)
    setSelected(null)
    setAnswered(false)
  }, [idx, quiz.length])

  if (done) {
    return (
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader><CardTitle>GrammarQuest</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <Trophy className="size-12 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold">{score}/{quiz.length}</p>
            <p className="text-muted-foreground">{Math.round((score / quiz.length) * 100)}% correct</p>
            <Button onClick={() => window.location.reload()}>Play Again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>GrammarQuest</CardTitle>
          <Badge variant="secondary">{idx + 1}/{quiz.length}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(idx / quiz.length) * 100} />
          <AnimatePresence mode="wait">
            <motion.p key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-medium leading-relaxed">
              {current.question}
            </motion.p>
          </AnimatePresence>
          <div className="grid grid-cols-1 gap-2">
            {current.options.map((opt, i) => (
              <motion.button key={`${idx}-${i}`} whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(opt)}
                className={cn("text-left p-3 rounded-lg border text-sm transition-all cursor-pointer",
                  !answered && "hover:border-primary/50 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-white/20 dark:border-white/10",
                  answered && opt === current.correct && "bg-green-500/20 border-green-500 text-green-700 dark:text-green-300",
                  answered && opt === selected && opt !== current.correct && "bg-red-500/20 border-red-500 text-red-700 dark:text-red-300",
                  answered && opt !== current.correct && opt !== selected && "opacity-50"
                )}
              >
                {opt}
              </motion.button>
            ))}
          </div>
          {answered && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
              <span className={cn("text-sm font-medium flex items-center gap-1", selected === current.correct ? "text-green-600" : "text-red-600")}>
                {selected === current.correct ? <><Check className="size-4" /> Correct!</> : <><X className="size-4" /> {current.correct}</>}
              </span>
              <Button onClick={next} size="sm"><ArrowRight className="size-4" /> Next</Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
