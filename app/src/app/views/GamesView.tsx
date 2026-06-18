import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import { Gamepad2, Castle, ArrowLeftRight, Shuffle, Search, MessageSquare, FlipVertical, Briefcase, MapPin, Mic, BarChart3, ArrowLeft } from 'lucide-react'
import { WordCastle } from '../components/WordCastle'
import { Satzbau } from '../components/Satzbau'
import { ArtikelQuiz } from '../components/ArtikelQuiz'
import { Wortsuche } from '../components/Wortsuche'
import { DialogTrainer } from '../components/DialogTrainer'
import { VerbCardFlip } from '../components/VerbCardFlip'
import { VerbConjugator } from '../components/VerbConjugator'
import { GermanCasePractice } from '../components/GermanCasePractice'
import { PrepositionDrills } from '../components/PrepositionDrills'
import { SpeakingTrainer } from '../components/SpeakingTrainer'
import { PluralForms } from '../components/PluralForms'

const API_URL = import.meta.env.VITE_API_URL || ''

interface GamesViewProps {
  appState: any
}

const GAMES = [
  { id: 'WordCastle', label: 'Word Castle', icon: Castle, color: 'from-amber-500 to-orange-600', desc: 'Baue Sätze Wort für Wort' },
  { id: 'Satzbau', label: 'Satzbau', icon: ArrowLeftRight, color: 'from-blue-500 to-indigo-600', desc: 'Ordne die Wörter richtig' },
  { id: 'ArtikelQuiz', label: 'Artikel Quiz', icon: Shuffle, color: 'from-emerald-500 to-teal-600', desc: 'Der, Die oder Das?' },
  { id: 'Wortsuche', label: 'Wortsuche', icon: Search, color: 'from-purple-500 to-violet-600', desc: 'Finde die versteckten Wörter' },
  { id: 'DialogTrainer', label: 'Dialog Trainer', icon: MessageSquare, color: 'from-cyan-500 to-blue-600', desc: 'Übe Alltagsgespräche' },
  { id: 'VerbCardFlip', label: 'Verb Card Flip', icon: FlipVertical, color: 'from-red-500 to-rose-600', desc: 'Karteikarten für Verben' },
  { id: 'VerbConjugator', label: 'Verb Conjugator', icon: FlipVertical, color: 'from-orange-500 to-red-600', desc: 'Konjugation üben' },
  { id: 'GermanCasePractice', label: 'German Cases', icon: Briefcase, color: 'from-green-500 to-emerald-600', desc: 'Nominativ, Akkusativ, Dativ, Genitiv' },
  { id: 'PrepositionDrills', label: 'Preposition Drills', icon: MapPin, color: 'from-pink-500 to-fuchsia-600', desc: 'Präpositionen üben' },
  { id: 'SpeakingTrainer', label: 'Speaking Trainer', icon: Mic, color: 'from-red-500 to-pink-600', desc: 'Sprich und verbessere deine Aussprache' },
  { id: 'PluralForms', label: 'Plural Forms', icon: BarChart3, color: 'from-cyan-500 to-blue-600', desc: 'Erkunde die Pluralformen' },
]

const GAME_COMPONENTS: Record<string, any> = {
  WordCastle, Satzbau, ArtikelQuiz, Wortsuche, DialogTrainer, VerbCardFlip, VerbConjugator, GermanCasePractice, PrepositionDrills, SpeakingTrainer, PluralForms,
}

export function GamesView({ appState }: GamesViewProps) {
  const { currentGame, setCurrentGame } = appState

  // Local data fallback for games
  const [localVocab, setLocalVocab] = useState<any[]>([])
  const [localVerbs, setLocalVerbs] = useState<any[]>([])
  const [localExercises, setLocalExercises] = useState<any[]>([])

  useEffect(() => {
    if (currentGame) {
      // Fetch data if appState arrays are empty
      if (!appState?.vocabulary?.length) {
        fetch(`${API_URL}/api/verbs?page=0&limit=50&level=all`)
          .then(r => r.json())
          .then(d => setLocalVerbs(d.verbs || []))
          .catch(() => {})
      }
    }
  }, [currentGame])

  if (currentGame) {
    const GameComponent = GAME_COMPONENTS[currentGame]
    if (GameComponent) {
      const gameLabel = GAMES.find(g => g.id === currentGame)?.label || currentGame
      const backBtn = <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setCurrentGame(null)}>
        <ArrowLeft className="size-3.5 mr-1" /> Zurück
      </Button>
      if (currentGame === 'VerbConjugator') {
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 h-full overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              {backBtn}
              <Badge variant="secondary" className="text-xs">{gameLabel}</Badge>
            </div>
            <VerbConjugator onClose={() => setCurrentGame(null)} />
          </div>
        )
      }
      return (
        <ScrollArea className="h-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center gap-3 mb-4">
              {backBtn}
              <Badge variant="secondary" className="text-xs">{gameLabel}</Badge>
            </div>
            <GameComponent
              appState={{
                ...appState,
                vocabulary: appState?.vocabulary?.length ? appState.vocabulary : localVocab,
                verbs: appState?.verbs?.length ? appState.verbs : localVerbs,
                exercises: appState?.exercises?.length ? appState.exercises : localExercises,
              }}
            />
          </div>
        </ScrollArea>
      )
    }
    return (
      <ScrollArea className="h-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Button variant="ghost" size="sm" className="h-7 text-xs mb-4" onClick={() => setCurrentGame(null)}>
            <ArrowLeft className="size-3.5 mr-1" /> Zurück
          </Button>
          <p className="text-muted-foreground text-sm">Spiel nicht gefunden: {currentGame}</p>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-bold bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">Spiele</h2>
          <Badge variant="secondary" className="text-xs">{GAMES.length} Spiele</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {GAMES.map((game) => (
            <Card key={game.id}
              className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-all hover:scale-[1.02]"
              onClick={() => setCurrentGame(game.id)}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center shadow-lg`}>
                    <game.icon className="size-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{game.label}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{game.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
