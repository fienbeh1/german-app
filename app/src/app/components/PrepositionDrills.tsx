import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Check, X, RefreshCw, Trophy, Gamepad2 } from 'lucide-react'

interface Question {
  sentence: string
  blank: string
  options: string[]
  correct: string
  hint: string
}

const DRILLS: Question[] = [
  { sentence: 'Ich wohne ___ Berlin.', blank: 'in', options: ['in', 'auf', 'nach', 'bei', 'aus', 'zu'], correct: 'in', hint: 'Stadt → Dativ: in + Dativ' },
  { sentence: 'Das Buch liegt ___ dem Tisch.', blank: 'auf', options: ['auf', 'unter', 'in', 'neben', 'vor', 'hinter'], correct: 'auf', hint: 'Position (wo?) → Dativ' },
  { sentence: 'Wir gehen ___ die Schule.', blank: 'in', options: ['in', 'nach', 'zu', 'aus', 'bei', 'mit'], correct: 'in', hint: 'Richtung (wohin?) → Akkusativ: in + Akk' },
  { sentence: 'Er fährt ___ Hause.', blank: 'nach', options: ['nach', 'zu', 'in', 'aus', 'bei', 'von'], correct: 'nach', hint: 'Richtung ohne Artikel → nach Hause' },
  { sentence: 'Sie kommt ___ der Türkei.', blank: 'aus', options: ['aus', 'von', 'bei', 'nach', 'zu', 'mit'], correct: 'aus', hint: 'Herkunft (aus + Dativ)' },
  { sentence: 'Ich arbeite ___ einer Firma.', blank: 'bei', options: ['bei', 'in', 'mit', 'aus', 'nach', 'zu'], correct: 'bei', hint: 'Arbeitgeber → bei + Dativ ("in" = Ort/Gebäude, "bei" = Firma als Arbeitgeber)' },
  { sentence: '___ dem Stuhl sitzt eine Katze.', blank: 'unter', options: ['unter', 'auf', 'neben', 'vor', 'hinter', 'zwischen'], correct: 'unter', hint: 'Position (wo?) → Dativ' },
  { sentence: 'Die Lampe hängt ___ dem Tisch.', blank: 'über', options: ['über', 'unter', 'neben', 'auf', 'vor', 'hinter'], correct: 'über', hint: 'Position (wo?) → Dativ' },
  { sentence: 'Er stellt den Stuhl ___ den Tisch.', blank: 'neben', options: ['neben', 'auf', 'unter', 'vor', 'hinter', 'zwischen'], correct: 'neben', hint: 'Richtung (wohin?) → Akkusativ' },
  { sentence: 'Das Kind läuft ___ das Haus.', blank: 'hinter', options: ['hinter', 'vor', 'neben', 'auf', 'unter', 'in'], correct: 'hinter', hint: 'Richtung (wohin?) → Akkusativ' },
  { sentence: '___ dem Park steht ein Denkmal.', blank: 'vor', options: ['vor', 'hinter', 'neben', 'auf', 'unter', 'in'], correct: 'vor', hint: 'Position (wo?) → Dativ' },
  { sentence: 'Die Brücke führt ___ den Fluss.', blank: 'über', options: ['über', 'unter', 'neben', 'auf', 'vor', 'hinter'], correct: 'über', hint: 'Richtung (wohin?) → Akkusativ' },
  { sentence: 'Ich lerne Deutsch ___ meiner Freundin.', blank: 'mit', options: ['mit', 'bei', 'aus', 'nach', 'zu', 'von'], correct: 'mit', hint: 'Begleitung → mit + Dativ' },
  { sentence: 'Das ist ein Geschenk ___ meiner Mutter.', blank: 'von', options: ['von', 'aus', 'bei', 'nach', 'zu', 'mit'], correct: 'von', hint: 'Herkunft/Urheber → von + Dativ' },
  { sentence: 'Wir fahren ___ dem Auto ___ der Arbeit.', blank: 'mit', options: ['mit', 'bei', 'aus', 'nach', 'zu', 'von'], correct: 'mit', hint: 'Transportmittel → mit + Dativ' },
  { sentence: 'Er geht ___ seinem Bruder.', blank: 'zu', options: ['zu', 'nach', 'in', 'aus', 'bei', 'mit'], correct: 'zu', hint: 'Person/event (wohin?) → zu + Dativ' },
  { sentence: '___ dem Unfall hat sie Angst.', blank: 'nach', options: ['nach', 'aus', 'bei', 'zu', 'von', 'seit'], correct: 'nach', hint: 'zeitlich (nach + Dativ)' },
  { sentence: '___ einem Jahr lerne ich Deutsch.', blank: 'seit', options: ['seit', 'nach', 'aus', 'bei', 'zu', 'von'], correct: 'seit', hint: 'Beginn in der Vergangenheit → seit + Dativ' },
  { sentence: 'Das Buch ___ dem Regal ist neu.', blank: 'in', options: ['in', 'auf', 'neben', 'vor', 'hinter', 'unter'], correct: 'in', hint: 'Position (wo?) → Dativ' },
  { sentence: 'Sie legt das Buch ___ den Tisch.', blank: 'auf', options: ['auf', 'unter', 'neben', 'vor', 'hinter', 'in'], correct: 'auf', hint: 'Richtung (wohin?) → Akkusativ' },
]

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function PrepositionDrills({ appState }: { appState?: any } = {}) {
  const [questions] = useState(() => shuffleArray(DRILLS))
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [done, setDone] = useState(false)

  const current = questions[idx]

  const answer = (prep: string) => {
    if (feedback || !current) return
    const correct = prep === current.correct
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

  if (done) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <Gamepad2 className="size-3.5" /> Zurück zu Spielen
        </Button>
        <Card>
          <CardHeader><CardTitle>Präpositionen</CardTitle></CardHeader>
          <CardContent className="text-center space-y-4">
            <Trophy className="size-12 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold">{score}/{questions.length}</p>
            <p className="text-muted-foreground">{Math.round((score / Math.max(questions.length, 1)) * 100)}%</p>
            <Button onClick={() => window.location.reload()}><RefreshCw className="size-4 mr-2" /> Erneut versuchen</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!current) return null

  const sentenceParts = current.sentence.split(current.blank)

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
        <Gamepad2 className="size-3.5" /> Zurück zu Spielen
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">📍</span> Deutsche Präpositionen
          </CardTitle>
          <span className="text-xs text-muted-foreground">{idx + 1}/{questions.length}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={(idx / questions.length) * 100} />
          <AnimatePresence mode="wait">
            <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                <p className="text-base font-medium leading-relaxed">
                  {sentenceParts[0]}<span className="text-blue-500 font-bold underline decoration-dotted">____</span>{sentenceParts[1] || ''}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {current.options.map(prep => (
                  <motion.button key={prep} whileTap={{ scale: 0.98 }}
                    onClick={() => answer(prep)}
                    disabled={!!feedback}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                      !feedback
                        ? 'hover:border-primary/50 bg-white/50 dark:bg-gray-800/50 border-white/20 dark:border-white/10 cursor-pointer'
                        : prep === current.correct
                          ? 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300'
                          : prep !== current.correct && prep !== undefined
                            ? 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-300'
                            : 'opacity-50'
                    }`}
                  >
                    {prep}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
          {feedback && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              <div className={`flex items-center justify-between p-3 rounded-lg ${feedback === 'correct' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <span className={`text-sm font-medium flex items-center gap-1 ${feedback === 'correct' ? 'text-green-600' : 'text-red-600'}`}>
                  {feedback === 'correct' ? <><Check className="size-4" /> Richtig!</> : <><X className="size-4" /> Richtig: {current.correct}</>}
                </span>
                <Button onClick={next} size="sm">
                  {idx + 1 >= questions.length ? 'Ergebnis' : 'Weiter'} →
                </Button>
              </div>
              <div className="text-xs text-muted-foreground bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-white/20 dark:border-white/10">
                💡 {current.hint}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
