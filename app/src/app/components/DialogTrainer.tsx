import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Send, Star, MessageSquare, Gamepad2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface DialogTrainerProps { vocabulary: any[]; exercises: any[]; verbs: any[]; appState?: any }

interface Scenario { title: string; context: string; keywords: string[]; responses: string[] }

const SCENARIOS: Scenario[] = [
  { title: 'Im Restaurant', context: 'You are at a restaurant in Berlin. Order a meal and interact with the waiter.', keywords: ['ich', 'möchte', 'bitte', 'essen', 'trinken', 'zahlen', 'speisekarte', 'bestellen', 'hätten', 'gern'], responses: ['Ich möchte bitte...', 'Kann ich die Speisekarte haben?', 'Ich möchte zahlen.', 'Ich hätte gern...'] },
  { title: 'Beim Arzt', context: 'You are at the doctor\'s office. Describe your symptoms.', keywords: ['ich', 'habe', 'schmerzen', 'fieber', 'kopfschmerzen', 'bauchschmerzen', 'husten', 'schnupfen', 'arzt', 'termin'], responses: ['Ich habe Kopfschmerzen.', 'Mir tut der Bauch weh.', 'Ich habe Fieber.', 'Ich brauche einen Termin.'] },
  { title: 'Im Supermarkt', context: 'You are grocery shopping. Ask for items and prices.', keywords: ['ich', 'suche', 'kosten', 'preis', 'euro', 'kilogramm', 'haben', 'brauchen', 'noch', 'tüte'], responses: ['Was kostet das?', 'Ich suche die Milch.', 'Ich brauche eine Tüte.', 'Haben Sie Äpfel?'] },
  { title: 'Auf der Straße', context: 'You are on the street. Ask for directions.', keywords: ['entschuldigung', 'wo', 'wie', 'komme', 'bahn', 'straße', 'links', 'rechts', 'geradeaus', 'weit'], responses: ['Entschuldigung, wo ist der Bahnhof?', 'Wie komme ich zum Museum?', 'Gehen Sie geradeaus.', 'Ist es weit?'] },
  { title: 'Im Hotel', context: 'You are checking into a hotel. Talk to the receptionist.', keywords: ['ich', 'hätte', 'gern', 'zimmer', 'nacht', 'reservierung', 'buchung', 'frühstück', 'schlüssel', 'check'], responses: ['Ich habe eine Reservierung.', 'Ich hätte gern ein Einzelzimmer.', 'Gibt es Frühstück?', 'Kann ich den Schlüssel haben?'] },
  { title: 'Im Sprachkurs', context: 'You are in a German class. Introduce yourself and talk about learning.', keywords: ['ich', 'heiße', 'lerne', 'deutsch', 'sprechen', 'verstehen', 'frage', 'antwort', 'buch', 'kurs'], responses: ['Ich heiße ...', 'Ich lerne Deutsch.', 'Können Sie das wiederholen?', 'Ich habe eine Frage.'] }
]

export function DialogTrainer({ appState, ..._props }: DialogTrainerProps) {
  const goBack = () => { if (appState?.setCurrentGame) appState.setCurrentGame(null) }
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<{ score: number; found: string[] } | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [attempts, setAttempts] = useState(0)

  const scenario = SCENARIOS[scenarioIdx]

  const handleSend = useCallback(() => {
    const lower = input.toLowerCase()
    const found = scenario.keywords.filter(k => lower.includes(k))
    const score = found.length
    setFeedback({ score, found })
    setTotalScore(s => s + score)
    setAttempts(a => a + 1)
  }, [input, scenario])

  const nextScenario = useCallback(() => {
    setScenarioIdx(i => (i + 1) % SCENARIOS.length)
    setInput('')
    setFeedback(null)
  }, [])

  return (
    <div className="p-6 space-y-4">
      <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
        <Gamepad2 className="size-3.5" /> Zurück zu Spielen
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><MessageSquare className="size-5" />DialogTrainer</CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Star className="size-4 text-yellow-500" />
            <span>{totalScore}</span>
            <Badge variant="secondary">{scenarioIdx + 1}/{SCENARIOS.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div key={scenarioIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <h3 className="font-semibold text-primary text-lg">{scenario.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{scenario.context}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {scenario.keywords.map(k => (
                  <Badge key={k} variant={feedback?.found?.includes(k) ? "default" : "outline"} className="text-xs">{k}</Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type your German response..." onKeyDown={e => e.key === 'Enter' && !feedback && handleSend()} />
                {!feedback ? <Button onClick={handleSend} disabled={!input.trim()}><Send className="size-4" /></Button> : <Button onClick={nextScenario} variant="outline">Next</Button>}
              </div>
              {feedback && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className={cn("p-3 rounded-lg text-sm", feedback.score >= 3 ? "bg-green-500/20 text-green-700" : feedback.score >= 1 ? "bg-yellow-500/20 text-yellow-700" : "bg-red-500/20 text-red-700")}>
                    {feedback.score >= 3 ? 'Great response!' : feedback.score >= 1 ? 'Good effort! Try including more keywords.' : 'Try again with some of the suggested keywords.'}
                  </div>
                  <ScrollArea className="h-24">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Example phrases:</p>
                      {scenario.responses.map((r, i) => <p key={i} className="text-sm italic text-muted-foreground">• {r}</p>)}
                    </div>
                  </ScrollArea>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}
