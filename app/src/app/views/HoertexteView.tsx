import { useEffect } from 'react'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import { Headphones, CheckCircle2, Filter, BookOpen, Library, ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api'

interface HoertexteViewProps {
  appState: any
  onBack?: () => void
}

const FILTERS = ['Alle', 'Transkription', 'Lösung'] as const

export function HoertexteView({ appState, onBack }: HoertexteViewProps) {
  const {
    hoertexteData, setHoertexteData,
    hoertexteFilter, setHoertexteFilter,
    selectedBook, setSelectedBook, realBooks: books,
  } = appState

  useEffect(() => {
    if (!selectedBook) return
    api.getTranskriptionen(selectedBook.id).then((data) => {
      setHoertexteData(data || [])
    })
  }, [selectedBook?.id])

  const filtered = (hoertexteData || []).filter((item: any) => {
    if (!hoertexteFilter || hoertexteFilter === 'Alle') return true
    return (item.ziel || '').toLowerCase() === hoertexteFilter.toLowerCase()
  })

  if (!selectedBook) {
    return (
      <ScrollArea className="h-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="size-4" /> Zurück
            </button>
          )}
          <div className="flex items-center gap-3">
            <Headphones className="size-5 text-blue-500" />
            <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">Hörtexte</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {books.map((book: any, i: number) => {
              const shortName = book.name.split('/').pop() || book.name
              const gradients = ['from-blue-500/20','from-cyan-500/20','from-teal-500/20','from-sky-500/20','from-indigo-500/20','from-violet-500/20']
              return (
                <div key={book.id} onClick={() => setSelectedBook(book)}
                  className={`backdrop-blur-xl bg-gradient-to-br ${gradients[i % gradients.length]} to-transparent border border-white/30 dark:border-white/10 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer overflow-hidden`}>
                  <div className="p-3 flex flex-col gap-2">
                    {book.coverUrl ? (
                      <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-muted/30">
                        <img src={book.coverUrl} alt={shortName} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      </div>
                    ) : (
                      <div className="w-full aspect-[3/4] rounded-lg bg-gradient-to-br from-muted/50 to-muted/80 flex items-center justify-center">
                        <BookOpen className="size-8 opacity-50" />
                      </div>
                    )}
                    <p className="text-xs font-semibold truncate">{shortName}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Book Cover Banner */}
        <div className="relative rounded-xl overflow-hidden">
          {selectedBook.coverUrl ? (
            <>
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent z-10" />
              <img src={selectedBook.coverUrl} alt={selectedBook.name.split('/').pop()}
                className="w-full h-32 sm:h-48 object-cover" />
              <div className="absolute inset-0 z-20 flex items-center p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-16 sm:w-16 sm:h-20 rounded-lg overflow-hidden shadow-lg ring-2 ring-white/30 shrink-0">
                    <img src={selectedBook.coverUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-white">
                    <h2 className="text-base sm:text-lg font-bold drop-shadow-lg">{selectedBook.name.split('/').pop()}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0">{filtered.length} Einträge</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 h-24 sm:h-32 flex items-center p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <Library className="size-8 text-white/80" />
                <div className="text-white">
                  <h2 className="text-base sm:text-lg font-bold">{selectedBook.name.split('/').pop()}</h2>
                  <Badge variant="secondary" className="text-[10px] bg-white/20 text-white border-0 mt-1">{filtered.length} Einträge</Badge>
                </div>
              </div>
            </div>
          )}
          <button onClick={() => setSelectedBook(null)}
            className="absolute top-2 right-2 z-30 text-xs px-2 py-1 rounded bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur">
            ← Buch wechseln
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setHoertexteFilter(f === 'Alle' ? '' : f)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                (hoertexteFilter === f || (!hoertexteFilter && f === 'Alle'))
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <Headphones className="size-12 mb-4 opacity-50" />
            <p className="text-sm">Keine Hörtexte gefunden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item: any, i: number) => (
              <div key={item.id || i} className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.source_page && <Badge variant="outline" className="text-[10px]">S. {item.source_page}</Badge>}
                    {item.lektion && <Badge variant="outline" className="text-[10px]">{item.lektion}</Badge>}
                    {item.ziel && <Badge variant="secondary" className="text-[10px] flex items-center gap-1"><CheckCircle2 className="size-3" />{item.ziel}</Badge>}
                  </div>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.inhalt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}