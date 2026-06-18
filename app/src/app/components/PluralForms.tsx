import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Shuffle, CheckCircle2, XCircle, HelpCircle, Gamepad2, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

interface PluralEntry {
  artikel: string
  wort: string
  plural_form: string
  umlaut: string
  plural_suffix: string
  level: string
  traduccion?: string
  english?: string
  french?: string
}

export function PluralForms({ appState }: { appState?: any } = {}) {
  const [entries, setEntries] = useState<PluralEntry[]>([])
  const [current, setCurrent] = useState<number>(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [level, setLevel] = useState('A1')
  const [loading, setLoading] = useState(true)
  const [shuffled, setShuffled] = useState<PluralEntry[]>([])

  useEffect(() => {
    loadEntries()
  }, [level])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/goethe/${level}/plural`)
      if (resp.ok) {
        const data = await resp.json()
        const filtered = (data.data || []).filter((e: PluralEntry) =>
          e.plural_form && e.plural_form !== e.wort && !e.plural_form.includes('/')
        )
        setEntries(filtered)
        shuffleArray(filtered)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const shuffleArray = (arr: PluralEntry[]) => {
    const copy = [...arr].sort(() => Math.random() - 0.5)
    setShuffled(copy)
    setCurrent(0)
    setShowAnswer(false)
    setScore({ correct: 0, total: 0 })
  }

  const handleAnswer = (correct: boolean) => {
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
    setShowAnswer(false)
    setTimeout(() => setCurrent(c => {
      if (c + 1 >= shuffled.length) shuffleArray(entries)
      return (c + 1) % shuffled.length
    }), 500)
  }

  const goBack = () => {
    if (appState?.setCurrentGame) appState.setCurrentGame(null)
  }

  const entry = shuffled[current]

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5 h-8 text-xs">
            <Gamepad2 className="size-3" /> Spiele
          </Button>
          <Shuffle className="size-6 text-cyan-600" />
          <h2 className="text-lg font-bold">Plural Forms</h2>
          <Badge variant="secondary">{level}</Badge>
          <Badge variant="outline" className="ml-auto">{score.correct}/{score.total}</Badge>
        </div>

        <div className="flex gap-2">
          {['A1', 'A2', 'B1'].map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                level === l ? 'bg-cyan-600 text-white' : 'bg-muted hover:bg-muted/80'
              }`}>{l}</button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => shuffleArray(entries)} className="ml-auto h-8 text-xs">
            <Shuffle className="size-3 mr-1" /> Mischen
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Lade...</div>
        ) : shuffled.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">Keine Pluralformen gefunden</div>
        ) : entry ? (
          <Card className="border-cyan-200 dark:border-cyan-800">
            <CardHeader>
              <CardTitle className="text-base">Wie ist der Plural von:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <span className="text-3xl font-bold">
                  {entry.artikel && <span className="text-base mr-2 opacity-70">{entry.artikel}</span>}
                  {entry.wort}
                </span>
              </div>

              {!showAnswer ? (
                <div className="flex justify-center">
                  <Button onClick={() => setShowAnswer(true)} size="lg" variant="outline" className="gap-2">
                    <HelpCircle className="size-5" /> Antwort zeigen
                  </Button>
                </div>
              ) : (
                  <>
                    <div className="text-center">
                      <span className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                        die {entry.plural_form}
                      </span>
                      {entry.traduccion && (
                        <p className="text-sm text-muted-foreground mt-1">{entry.traduccion}</p>
                      )}
                      {entry.english && (
                        <p className="text-xs text-muted-foreground">EN: {entry.english}</p>
                      )}
                      <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                        {entry.umlaut && <Badge variant="outline">Umlaut: {entry.umlaut}</Badge>}
                        {entry.plural_suffix && <Badge variant="outline">Suffix: {entry.plural_suffix}</Badge>}
                      </div>
                    </div>
                  <div className="flex justify-center gap-4">
                    <Button onClick={() => handleAnswer(true)} className="bg-green-600 hover:bg-green-700 gap-2">
                      <CheckCircle2 className="size-4" /> Richtig
                    </Button>
                    <Button onClick={() => handleAnswer(false)} variant="destructive" className="gap-2">
                      <XCircle className="size-4" /> Falsch
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ScrollArea>
  )
}
