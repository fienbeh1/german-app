import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Check, X, RefreshCw, Loader2, ChevronLeft, ChevronRight, BookText, Sparkles } from 'lucide-react'


interface Question {
  id: number; question: string; options: string[]; correct: number; order_num: number
}

interface Reader {
  id: number; title: string; level: string; content: string; word_count: number; vocabulary_count: number; source: string; created_at: string; questions: Question[]
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const SPHERES = [
  { value: 'Das Haus • Home', label: 'Das Haus • Home' },
  { value: 'Die Nahrungsmittel • Food', label: 'Die Nahrungsmittel • Food' },
  { value: 'Der Sport • Sports', label: 'Der Sport • Sports' },
  { value: 'Die Freizeit • Leisure', label: 'Die Freizeit • Leisure' },
  { value: 'Der Verkehr • Transportation', label: 'Der Verkehr • Transportation' },
  { value: 'Die Arbeit • Work', label: 'Die Arbeit • Work' },
  { value: 'Die Gesundheit • Health', label: 'Die Gesundheit • Health' },
  { value: 'Die Menschen • People', label: 'Die Menschen • People' },
  { value: 'Die Umwelt • Environment', label: 'Die Umwelt • Environment' },
  { value: 'Der Einkauf • Shopping', label: 'Der Einkauf • Shopping' },
  { value: 'Das Lernen • Study', label: 'Das Lernen • Study' },
]

const tooltipStyles = `
.reader-story { line-height: 2.2; }
.reader-story .reader-vocab {
  position: relative;
  cursor: help;
  border-bottom: 1px dotted #60a5fa;
  color: #1d4ed8;
}
.dark .reader-story .reader-vocab { color: #93c5fd; }
.reader-story .reader-vocab:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  background: #1e293b;
  color: #f1f5f9;
  font-size: 12px;
  border-radius: 6px;
  white-space: nowrap;
  z-index: 50;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.reader-story .reader-vocab:hover::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1e293b;
  margin-bottom: -5px;
  z-index: 50;
}
`

export function GradedReaderView({ onBack }: { onBack?: () => void }) {
  const [readers, setReaders] = useState<Reader[]>([])
  const [selected, setSelected] = useState<Reader | null>(null)
  const [level, setLevel] = useState('A1')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizScore, setQuizScore] = useState(0)
  const [quizFeedback, setQuizFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [quizDone, setQuizDone] = useState(false)
  const [error, setError] = useState('')

  const fetchReaders = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/readers?level=${level}`)
      const data = await r.json()
      setReaders(data)
      setSelected(null)
    } catch { setError('Failed to load readers') }
    setLoading(false)
  }

  useEffect(() => { fetchReaders() }, [level])

  const loadReader = async (id: number) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/readers/${id}`)
      const data = await r.json()
      setSelected(data)
      setQuizIdx(0)
      setQuizScore(0)
      setQuizFeedback(null)
      setQuizDone(false)
    } catch { setError('Failed to load reader') }
    setLoading(false)
  }

  const generate = async (sphere: string) => {
    setGenerating(true)
    setError('')
    try {
      const r = await fetch('/api/readers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, sphere, title: `${level}: ${sphere.split(' • ')[0]}` })
      })
      const data = await r.json()
      if (data.error) { setError(data.error); return }
      await fetchReaders()
    } catch { setError('Generation failed') }
    setGenerating(false)
  }

  const answerQuiz = (idx: number) => {
    if (quizFeedback || !selected) return
    const correct = idx === selected.questions[quizIdx].correct
    setQuizFeedback(correct ? 'correct' : 'wrong')
    if (correct) setQuizScore(s => s + 1)
  }

  const nextQuiz = () => {
    if (!selected) return
    if (quizIdx + 1 >= selected.questions.length) { setQuizDone(true); return }
    setQuizIdx(i => i + 1)
    setQuizFeedback(null)
  }

  if (selected && quizDone) {
    const qs = selected.questions
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Button variant="outline" size="sm" onClick={() => setSelected(null)} className="gap-1.5">
          <ChevronLeft className="size-3.5" /> Zurück zur Liste
        </Button>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BookText className="size-5" /> {selected.title}</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-4xl">{Math.round((quizScore / Math.max(qs.length, 1)) * 100)}%</div>
            <p className="text-xl font-bold">{quizScore}/{qs.length} richtig</p>
            <Button onClick={() => { setQuizDone(false); setQuizIdx(0); setQuizScore(0); setQuizFeedback(null) }}>
              <RefreshCw className="size-4 mr-2" /> Quiz wiederholen
            </Button>
            <Button variant="outline" onClick={() => setSelected(null)} className="ml-2">
              <ChevronLeft className="size-4 mr-1" /> Zur Geschichte
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (selected) {
    const q = selected.questions[quizIdx]
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <style>{tooltipStyles}</style>
        <Button variant="outline" size="sm" onClick={() => setSelected(null)} className="gap-1.5">
          <ChevronLeft className="size-3.5" /> Zurück zur Liste
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookText className="size-5" /> {selected.title}
            </CardTitle>
            <span className="text-xs text-muted-foreground">{selected.level} · {selected.word_count} Wörter · {selected.vocabulary_count} Vokabeln</span>
          </CardHeader>
          <CardContent>
            <div className="reader-story"
              dangerouslySetInnerHTML={{ __html: selected.content }}
            />
          </CardContent>
        </Card>

        {q && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Verständnisfrage {quizIdx + 1}/{selected.questions.length}</CardTitle>
              <span className="text-xs text-muted-foreground">{quizScore} richtig</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={(quizIdx / selected.questions.length) * 100} />
              <p className="font-medium">{q.question}</p>
              <div className="grid grid-cols-1 gap-2">
                {q.options.map((opt, i) => (
                  <motion.button key={i} whileTap={{ scale: 0.98 }}
                    onClick={() => answerQuiz(i)}
                    disabled={!!quizFeedback}
                    className={`p-3 rounded-lg border text-sm text-left transition-all ${
                      !quizFeedback
                        ? 'hover:border-primary/50 bg-white/50 dark:bg-gray-800/50 border-white/20 dark:border-white/10 cursor-pointer'
                        : i === q.correct
                          ? 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300'
                          : i === quizIdx
                            ? 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-300'
                            : 'opacity-50'
                    }`}
                  >
                    {opt}
                  </motion.button>
                ))}
              </div>
              {quizFeedback && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
                  <span className={`text-sm font-medium flex items-center gap-1 ${quizFeedback === 'correct' ? 'text-green-600' : 'text-red-600'}`}>
                    {quizFeedback === 'correct' ? <><Check className="size-4" /> Richtig!</> : <><X className="size-4" /> Falsch</>}
                  </span>
                  <Button onClick={nextQuiz} size="sm">
                    {quizIdx + 1 >= selected.questions.length ? 'Ergebnis' : 'Weiter'} →
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookText className="size-5 text-emerald-600" />
          <h2 className="text-lg font-bold">Graded Reader</h2>
        </div>
        <div className="flex items-center gap-2">
          {LEVELS.map(l => (
            <Button key={l} variant={level === l ? 'default' : 'outline'} size="sm" className="px-2 text-xs" onClick={() => setLevel(l)}>
              {l}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SPHERES.map(s => (
          <Button key={s.value} variant="outline" size="sm" className="text-xs gap-1" onClick={() => generate(s.value)} disabled={generating}>
            {generating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            {s.label.split(' • ')[0]}
          </Button>
        ))}
      </div>
      {generating && <p className="text-xs text-muted-foreground animate-pulse">Erstelle Geschichte mit KI...</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>
      ) : readers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookText className="size-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Keine Geschichten für {level}. Klicke auf ein Thema oben, um eine zu erstellen!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {readers.map(r => (
            <motion.div key={r.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              className="p-4 rounded-lg border border-white/20 dark:border-white/10 bg-white/50 dark:bg-gray-800/50 backdrop-blur cursor-pointer hover:border-emerald-400/50 transition-all"
              onClick={() => loadReader(r.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">{r.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.level} · {r.word_count} Wörter · {r.vocabulary_count} Vokabeln
                    {r.source && ` · ${r.source.replace('goethe_', '')}`}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
