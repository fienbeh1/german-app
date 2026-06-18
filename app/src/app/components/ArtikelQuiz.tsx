import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Check, X, RefreshCw, ArrowLeft, Gamepad2 } from 'lucide-react'

interface Question {
  id: number
  palabra: string
  artikel: string
  traduccion: string
  english?: string
}

const ARTICLES = ['der', 'die', 'das'] as const
const ARTICLE_COLORS: Record<string, string> = { der: 'bg-blue-500 hover:bg-blue-600', die: 'bg-red-500 hover:bg-red-600', das: 'bg-green-500 hover:bg-green-600' }

// Words ending in -ung are always feminine (die)
const isFeminineUng = (word: string) => word.toLowerCase().endsWith('ung')

interface ArtikelQuizProps {
  appState?: any
}

export function ArtikelQuiz({ appState }: ArtikelQuizProps = {}) {
  const [questions, setQuestions] = useState<Question[]>([])
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
    // Fetch more than needed, then filter client-side
    fetch('/api/quiz/artikel?limit=5')
      .then(r => r.json())
      .then(data => {
        // Filter out fake words and words with missing articles
        const filtered = (data || []).filter((q: Question) => {
          if (!q.artikel || !['der','die','das'].includes(q.artikel)) return false
          if (!q.palabra || q.palabra.length < 2) return false
          // Filter known fake words
          const fakes = ['copstam', 'kalendar', 'mooos', 'kantin', 'kallender', 'koopstam']
          if (fakes.includes(q.palabra.toLowerCase())) return false
          // Filter words with numbers or weird caps
          if (/[0-9]/.test(q.palabra)) return false
          if (/[A-Z]{2,}/.test(q.palabra.replace(/^./, ''))) return false
          return true
        })
        // Shuffle and take 5
        const shuffled = filtered.sort(() => Math.random() - 0.5).slice(0, 5)
        setQuestions(shuffled)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadQuestions() }, [])

  const current = questions[idx]

  const answer = (art: string) => {
    if (feedback || !current) return
    const ca = getCorrectArticle(current.palabra, current.artikel)
    const correct = art === ca
    setFeedback(correct ? 'correct' : 'wrong')
    if (correct) setScore(s => s + 1)
  }

  const next = () => {
    if (idx + 1 >= questions.length) { setDone(true); return }
    setIdx(i => i + 1)
    setFeedback(null)
  }

  const restart = () => loadQuestions()
  const goBack = () => {
    if (appState?.setCurrentGame) appState.setCurrentGame(null)
    else restart()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin text-4xl">🧠</div>
      </div>
    )
  }

  if (done) {
    const pct = Math.round((score / Math.max(questions.length, 1)) * 100)
    const emoji = pct === 100 ? '🏆' : pct >= 80 ? '🌟' : pct >= 60 ? '👍' : pct >= 40 ? '💪' : '📚'
    const label = pct === 100 ? 'Perfekt!' : pct >= 80 ? 'Sehr gut!' : pct >= 60 ? 'Gut gemacht!' : pct >= 40 ? 'Weiter üben!' : 'Nochmal versuchen!'
    return (
      <div className="max-w-md mx-auto mt-8 space-y-2">
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <Gamepad2 className="size-3.5" /> Zurück zu Spielen
        </Button>
        <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="text-6xl">{emoji}</div>
          <h2 className="text-2xl font-bold">{label}</h2>
          <p className="text-4xl font-mono font-bold">{score}/{questions.length}</p>
          <Progress value={pct} className="h-3" />
          <Button onClick={restart} className="gap-2">
            <RefreshCw className="size-4" /> Nochmal spielen
          </Button>
        </CardContent>
      </Card>
      </div>
    )
  }

  if (!current) return <p className="text-center text-muted-foreground py-8">Keine Fragen verfügbar</p>

  // Override article based on known patterns
  function getCorrectArticle(word: string, dbArtikel: string): string {
    const w = word.toLowerCase().trim()
    if (isFeminineUng(w)) return 'die'
    if (w.endsWith('heit') || w.endsWith('keit') || w.endsWith('schaft') || w.endsWith('ion') || w.endsWith('tät') || w.endsWith('ur')) return 'die'
    if (w.endsWith('ismus') || w.endsWith('ling')) return 'der'
    if (w.endsWith('chen') || w.endsWith('lein') || w.endsWith('ment') || w.endsWith('nis')) return 'das'
    if (w.endsWith('e') && dbArtikel === 'der') {
      const fem = ['liebe', 'gabe', 'bitte', 'frage', 'antwort', 'zeit', 'arbeit', 'schule', 'straße', 'brücke', 'tür', 'wand', 'hand']
      if (fem.some(f => w.endsWith(f))) return 'die'
    }
    return dbArtikel
  }

  const isUngWord = isFeminineUng(current.palabra)
  const correctArticle = getCorrectArticle(current.palabra, current.artikel)
  const showHint = isUngWord || correctArticle !== current.artikel

  return (
    <div className="max-w-md mx-auto mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goBack} className="text-xs h-7 gap-1">
          <Gamepad2 className="size-3" /> Zurück zu Spielen
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{idx + 1}/{questions.length}</span>
          <span className="text-xs font-medium">Richtig: {score}</span>
        </div>
      </div>
      <Progress value={((idx + (feedback ? 1 : 0)) / Math.max(questions.length, 1)) * 100} className="h-2" />

      <AnimatePresence mode="wait">
        <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center space-y-2">
          {showHint && (
            <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">💡 <strong>{correctArticle}</strong> für dieses Wort</p>
          )}
          <p className="text-sm text-muted-foreground">{current.traduccion}</p>
          <p className="text-5xl font-bold py-6">{current.palabra}</p>
          {current.english && <p className="text-sm text-muted-foreground">{current.english}</p>}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-3 justify-center">
        {ARTICLES.map(art => {
          const ca = getCorrectArticle(current.palabra, current.artikel)
          const isCorrect = feedback === 'correct' && art === ca
          const isWrong = feedback === 'wrong' && art === ca
          const wasClicked = feedback === 'wrong'
          return (
            <Button key={art} disabled={!!feedback} onClick={() => answer(art)}
              className={`text-lg font-bold px-8 py-6 rounded-xl transition-all ${feedback ? (isCorrect || (wasClicked && art === ca) ? 'ring-4 ring-green-400 scale-110' : 'opacity-50') : ARTICLE_COLORS[art]} ${feedback === 'wrong' && art !== ca ? 'opacity-30' : ''}`}>
              {art === 'der' ? '🟦' : art === 'die' ? '🟥' : '🟩'} {art}
            </Button>
          )
        })}
      </div>

      {feedback && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${feedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {feedback === 'correct' ? <><Check className="size-4" /> Richtig! {showHint && <span className="text-xs">({correctArticle})</span>}</> : <><X className="size-4" /> Richtig: <strong>{correctArticle}</strong> {current.palabra}</>}
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={goBack} className="gap-1">
              <Gamepad2 className="size-3" /> Spiele
            </Button>
            <Button onClick={next} variant="default" size="lg" className="rounded-full px-8">
              {idx + 1 >= questions.length ? 'Ergebnisse' : 'Weiter →'}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
