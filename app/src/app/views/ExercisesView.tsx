import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { ClipboardList, BookOpen, ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api'

interface ExercisesViewProps {
  appState: any
  onBack?: () => void
}

export function ExercisesView({ appState }: ExercisesViewProps) {
  const { exercises, selectedBook } = appState

  if (!selectedBook) {
    return (
      <ScrollArea className="h-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col items-center py-20 text-gray-400">
            <BookOpen className="size-12 mb-4 opacity-50" />
            <p className="text-sm">Bitte wähle ein Buch aus</p>
          </div>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="size-4" /> Zurück
        </button>
        <div className="flex items-center gap-3">
          <ClipboardList className="size-5 text-blue-500" />
          <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">Übungen</h2>
          <Badge variant="secondary" className="text-xs">{exercises?.length || 0} Übungen</Badge>
        </div>

        {(!exercises || exercises.length === 0) ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <ClipboardList className="size-12 mb-4 opacity-50" />
            <p className="text-sm">Keine Übungen für dieses Buch</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exercises.map((ex: any, i: number) => (
              <div key={ex.id || i}
                className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-3 backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {ex.numero && <Badge variant="outline" className="text-[10px]">Nr. {ex.numero}</Badge>}
                    {ex.pagina && <Badge variant="outline" className="text-[10px]">S. {ex.pagina}</Badge>}
                    {ex.tipo && <Badge className="text-[10px]">{ex.tipo}</Badge>}
                  </div>
                </div>
                {ex.titulo && <p className="text-sm font-medium">{ex.titulo}</p>}
                {ex.texto && <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{ex.texto}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
