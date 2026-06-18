import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import { Progress } from '../components/ui/progress'
import { BarChart3, BookOpen, Headphones, Zap, GraduationCap, Target, Trophy, ArrowLeft } from 'lucide-react'

interface ProgressViewProps {
  appState: any
  onBack?: () => void
}

export function ProgressView({ appState }: ProgressViewProps) {
  const { lessonData, vocabulary, verbs, currentAudioTracks, selectedBook } = appState

  const totalBooks = 59
  const maxVocab = Math.max(vocabulary?.length || 0, 1000)
  const maxVerbs = Math.max(verbs?.length || 0, 500)

  const stats = [
    { icon: BookOpen, label: 'Bücher', value: lessonData?.pdfs?.length || 0, max: 200, color: 'emerald' },
    { icon: GraduationCap, label: 'Vokabeln', value: vocabulary?.length || 0, max: maxVocab, color: 'blue' },
    { icon: Zap, label: 'Verben', value: verbs?.length || 0, max: maxVerbs, color: 'amber' },
    { icon: Headphones, label: 'Audio-Tracks', value: currentAudioTracks?.length || 0, max: 100, color: 'purple' },
  ]

  const recentSessions = parseInt(localStorage.getItem('session_count') || '0')
  const completedExercises = parseInt(localStorage.getItem('exercises_completed') || '0')

  const achievements = [
    { icon: Target, label: 'Sitzungen', value: recentSessions > 0 ? recentSessions.toString() : '—', color: 'blue' },
    { icon: Trophy, label: 'Übungen abgeschlossen', value: completedExercises > 0 ? completedExercises.toString() : '—', color: 'amber' },
    { icon: BarChart3, label: 'Vokabeln gelernt', value: vocabulary?.length > 0 ? vocabulary.length.toString() : '—', color: 'green' },
  ]

  const statGradients: Record<string, string> = {
    emerald: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
  }
  const iconColors: Record<string, string> = {
    blue: 'text-blue-500',
    amber: 'text-amber-500',
    green: 'text-green-500',
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="size-4" /> Zurück
          </button>
        )}
        <div className="flex items-center gap-3">
          <BarChart3 className="size-5 text-indigo-500" />
          <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 bg-clip-text text-transparent">Fortschritt</h2>
          {selectedBook && <Badge variant="outline" className="text-xs">{selectedBook.name.split('/').pop()}</Badge>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <Card key={i} className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                   <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${statGradients[s.color] || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                    <s.icon className="size-4 text-white" />
                  </div>
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
                <Progress value={Math.min(100, (s.value / Math.max(1, s.max)) * 100)} className="h-1.5" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="size-4 text-yellow-500" /> Errungenschaften
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {achievements.map((a, i) => (
                <div key={i} className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-indigo-200/50 dark:border-indigo-800/30 text-center">
                  <a.icon className={`size-6 mx-auto mb-2 ${iconColors[a.color] || 'text-gray-500'}`} />
                  <p className="text-xs text-muted-foreground">{a.label}</p>
                  <p className="text-lg font-bold">{a.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
