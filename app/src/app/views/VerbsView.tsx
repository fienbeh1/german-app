import { useEffect } from 'react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { VerbCard } from '../components/VerbCard'
import { Zap, Search, Loader2, ArrowLeft } from 'lucide-react'

interface VerbsViewProps {
  appState: any
  onBack?: () => void
}

const LEVELS = ['all', 'A1', 'A2', 'B1', 'B2', 'C1']

export function VerbsView({ appState, onBack }: VerbsViewProps) {
  const {
    verbs, verbSearch, setVerbSearch, verbPage, verbTotal, verbLevel, setVerbLevel,
    verbLoading, loadVerbs, searchQuery, setSearchQuery,
  } = appState

  useEffect(() => {
    if (!verbs || verbs.length === 0) loadVerbs(0, false)
  }, [])

  const filtered = (verbs || []).filter((v: any) => {
    const name = (v.infinitiv || v.german || '').toLowerCase()
    return name.includes((verbSearch || '').toLowerCase())
  })

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="size-4" /> Zurück
        </button>
        <div className="flex items-center gap-3">
          <Zap className="size-5 text-red-500" />
          <h2 className="text-lg font-bold bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 bg-clip-text text-transparent">
            Verben
          </h2>
          <Badge variant="secondary" className="text-xs">{verbTotal || verbs?.length || 0} Verben</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => { setVerbLevel(level); loadVerbs(0, false) }}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                verbLevel === level
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {level === 'all' ? 'Alle' : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
          <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={verbSearch || ''}
              onChange={(e) => setVerbSearch(e.target.value)}
              placeholder="Verb suchen..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {verbLoading && verbs.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mr-2" />
            <span className="text-sm">Verben werden geladen...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <Search className="size-12 mb-4 opacity-50" />
            <p className="text-sm">Keine Verben gefunden</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((verb: any, i: number) => (
                <VerbCard
                  key={verb.id || i}
                  infinitiv={verb.infinitiv || verb.infinitive || ''}
                  präsensIch={verb.präsensIch || verb.praesens_ich || ''}
                  präsensDu={verb.präsensDu || verb.praesens_du || ''}
                  präsensEr={verb.präsensEr || verb.praesens_er || ''}
                  präteritumIch={verb.präteritumIch || verb.praeteritum || verb.praeteritum_ich || ''}
                  partizipIi={verb.partizipIi || verb.partizip_ii || verb.perfekt || ''}
                  hilfsverb={verb.hilfsverb || verb.auxiliary_verb || ''}
                  english={verb.english || ''}
                  spanish={verb.spanish || verb.spanish_translation || ''}
                  french={verb.french || ''}
                  rank={verb.rank}
                  freq={verb.freq}
                  konjunktivIiIch={verb.konjunktivIiIch || verb.konjunktiv_ii_ich || ''}
                  imperativSingular={verb.imperativSingular || verb.imperativ_singular || ''}
                  imperativPlural={verb.imperativPlural || verb.imperativ_plural || ''}
                />
              ))}
            </div>

            {filtered.length > 0 && filtered.length < verbTotal && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadVerbs(verbPage + 1, true)}
                  disabled={verbLoading}
                >
                  {verbLoading ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : null}
                  Mehr laden
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
