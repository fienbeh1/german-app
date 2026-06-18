import { useState, useEffect } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { BookText, Search, Shuffle, Globe, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

interface DictionaryViewProps {
  onBack?: () => void
}

export function DictionaryView({ onBack }: DictionaryViewProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [total] = useState(205907)
  const [wordTypes, setWordTypes] = useState<any[]>([])
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/dictionary/word-types`).then(r => r.json()).then(d => setWordTypes(d.data || [])).catch(() => {})
  }, [])

  const searchDict = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: query, limit: '50' })
      if (typeFilter) params.set('type', typeFilter)
      const resp = await fetch(`${API_URL}/api/dictionary/search?${params}`)
      if (resp.ok) {
        const json = await resp.json()
        setResults(json.data || [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const randomWord = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (typeFilter) params.set('type', typeFilter)
      const resp = await fetch(`${API_URL}/api/dictionary/random?${params}`)
      if (resp.ok) {
        const json = await resp.json()
        setResults(json.data || [])
        setQuery('')
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="size-4" /> Zurück
        </button>
        <div className="flex items-center gap-3">
          <BookText className="size-6 text-emerald-600" />
          <h2 className="text-lg font-bold">Deutsch Wörterbuch</h2>
          <Badge variant="secondary">{total.toLocaleString()} Einträge</Badge>
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
            <Input placeholder="Deutsches Wort eingeben..." className="pl-8 h-9 text-sm"
              value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchDict()} />
          </div>
          <button onClick={searchDict} disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
            Suchen
          </button>
          <button onClick={randomWord} disabled={loading}
            className="px-3 py-2 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80">
            <Shuffle className="size-3 inline mr-1" />Zufall
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setTypeFilter(''); setResults([]) }}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${typeFilter === '' ? 'bg-gray-800 text-white' : 'bg-muted'}`}>
            Alle
          </button>
          {wordTypes.slice(0, 20).map((wt: any) => (
            <button key={wt.word_type} onClick={() => { setTypeFilter(wt.word_type); setResults([]) }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${typeFilter === wt.word_type ? 'bg-emerald-600 text-white' : 'bg-muted hover:bg-muted/80'}`}>
              {wt.word_type} ({wt.cnt})
            </button>
          ))}
        </div>

        {(() => {
          if (loading) {
            return <div className="text-center py-20 text-muted-foreground">Suche...</div>
          }
          if (results.length === 0 && query) {
            return <div className="text-center py-20 text-muted-foreground">Keine Ergebnisse für "{query}"</div>
          }
          if (results.length > 0) {
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {results.map((entry: any) => (
                  <Card key={entry.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        {entry.artikel && <Badge variant="outline" className="text-[10px]">{entry.artikel}</Badge>}
                        <span className="font-bold text-base">{entry.german_word}</span>
                        {entry.domains && <Badge className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">{entry.domains}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.english}</p>
                      {entry.word_type && <Badge variant="secondary" className="text-[10px]">{entry.word_type}</Badge>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          }
          return (
            <div className="text-center py-20 text-muted-foreground">
              <Globe className="size-12 mx-auto mb-4 opacity-30" />
              <p>Suche ein Wort oder klicke auf "Zufall"</p>
              <p className="text-xs mt-2">{total.toLocaleString()} Wörter im Wörterbuch</p>
            </div>
          )
        })()}
      </div>
    </ScrollArea>
  )
}
