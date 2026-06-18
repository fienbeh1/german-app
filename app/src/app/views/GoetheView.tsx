import { useState, useEffect } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { BookOpen, Search, Filter, Info, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

const LEVELS = ['A1', 'A2', 'B1']
const RULES = ['all', 'umlaut+e', 'umlaut+er', 'umlaut+en', 'add-e', 'add-er', 'add-en', 'add-s', 'no-change']
const RULE_LABELS: Record<string, string> = {
  'all': 'Alle', 'umlaut+e': 'Umlaut + -e', 'umlaut+er': 'Umlaut + -er',
  'umlaut+en': 'Umlaut + -en', 'add-e': 'Nur -e', 'add-er': 'Nur -er',
  'add-en': 'Nur -en', 'add-s': 'Nur -s', 'no-change': '= Singular',
}

interface GoetheViewProps {
  onBack?: () => void
}

export function GoetheView({ onBack }: GoetheViewProps) {
  const [level, setLevel] = useState('A1')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rule, setRule] = useState('all')
  const [stats, setStats] = useState<any[]>([])
  const [selectedWord, setSelectedWord] = useState<any>(null)
  const [showOnlyNouns, setShowOnlyNouns] = useState(true)
  const [translations, setTranslations] = useState<any[]>([])

  // Look up translation when a word is selected
  useEffect(() => {
    if (!selectedWord?.wort) { setTranslations([]); return }
    const word = selectedWord.wort.replace(/[.,!?;:()"']/g, '').toLowerCase()
    Promise.all([
      fetch(`${import.meta.env.VITE_API_URL || ''}/api/vocab/search?q=${encodeURIComponent(word)}`).then(r => r.ok ? r.json() : { data: [] }),
      fetch(`${import.meta.env.VITE_API_URL || ''}/api/dictionary/search?q=${encodeURIComponent(word)}`).then(r => r.ok ? r.json() : { data: [] }),
    ]).then(([vocab, dict]) => {
      const combined = [...(vocab.data || []), ...(dict.data || [])]
      const seen = new Set()
      setTranslations(combined.filter((e: any) => {
        const key = e.palabra || e.german_word || ''
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 5))
    }).catch(() => setTranslations([]))
  }, [selectedWord])

  useEffect(() => {
    loadData()
    loadStats()
  }, [level])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '1000' })
      if (search) params.set('search', search)
      if (rule !== 'all') params.set('rule', rule)
      if (showOnlyNouns) params.set('type', 'Substantiv')
      const resp = await fetch(`${API_URL}/api/goethe-view/${level}?${params}`)
      if (resp.ok) {
        const json = await resp.json()
        setData(json.data || [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const loadStats = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/goethe/plural-stats`)
      if (resp.ok) {
        const json = await resp.json()
        setStats((json.data || []).filter((s: any) => s.level === level))
      }
    } catch (e) { console.error(e) }
  }

  const getRuleColor = (r: string) => {
    if (r.startsWith('umlaut')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
    if (r.startsWith('add-')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    if (r === 'no-change') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="size-4" /> Zurück
        </button>
        <div className="flex items-center gap-3">
          <BookOpen className="size-6 text-cyan-600" />
          <h2 className="text-lg font-bold">Goethe Wortschatz</h2>
          <Badge variant="secondary">{level}</Badge>
          <Badge variant="outline">{data.length} Wörter</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {LEVELS.map(l => (
            <button key={l} onClick={() => { setLevel(l); setSelectedWord(null) }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                level === l ? 'bg-cyan-600 text-white' : 'bg-muted hover:bg-muted/80'
              }`}>{l}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
            <Input placeholder="Wort suchen..." className="pl-8 h-8 text-xs"
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadData()} />
          </div>
          <button onClick={() => { setShowOnlyNouns(!showOnlyNouns); loadData() }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${showOnlyNouns ? 'bg-purple-600 text-white' : 'bg-muted'}`}>
            <Filter className="size-3 inline mr-1" />Nur Nomen
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {RULES.map(r => (
            <button key={r} onClick={() => { setRule(r); loadData() }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                rule === r ? (r === 'all' ? 'bg-gray-800 text-white dark:bg-white dark:text-black' : getRuleColor(r)) : 'bg-muted hover:bg-muted/80'
              }`}>{RULE_LABELS[r]}</button>
          ))}
        </div>

        {stats.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            {stats.map((s: any) => (
              <Badge key={s.plural_rule} variant="outline" className="text-[10px]">
                {RULE_LABELS[s.plural_rule] || s.plural_rule}: {s.cnt}
              </Badge>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Lade...</div>
        ) : data.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">Keine Wörter gefunden</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.map((entry: any) => (
              <Card key={entry.id} className={`cursor-pointer transition-all hover:shadow-md ${
                selectedWord?.id === entry.id ? 'ring-2 ring-cyan-500' : ''
              }`} onClick={() => setSelectedWord(selectedWord?.id === entry.id ? null : entry)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">
                      {entry.artikel && <span className="text-xs opacity-60 mr-1">{entry.artikel}</span>}
                      {entry.wort}
                    </span>
                    <Badge className={`text-[10px] ${getRuleColor(entry.plural_rule)}`}>
                      {RULE_LABELS[entry.plural_rule] || entry.plural_rule}
                    </Badge>
                  </div>

                  {entry.plural_form && entry.plural_form !== entry.wort && (
                    <div className="text-sm text-cyan-600 dark:text-cyan-400 font-medium">
                      die {entry.plural_form}
                    </div>
                  )}

                  {entry.beispiel && (
                    <p className="text-xs text-muted-foreground italic line-clamp-2">{entry.beispiel}</p>
                  )}

                  {selectedWord?.id === entry.id && (
                    <div className="pt-2 border-t text-xs space-y-1 text-muted-foreground">
                      {translations.length > 0 && (
                        <div className="space-y-0.5 mb-1">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Übersetzung</p>
                          {translations.map((t: any, i: number) => (
                            <p key={i}><span className="font-medium">{t.palabra || t.german_word}</span>: {t.traduccion || t.spanish || ''}{t.english ? ` (EN: ${t.english})` : ''}</p>
                          ))}
                        </div>
                      )}
                      {translations.length === 0 && <p className="text-[10px] text-muted-foreground italic">Übersetzung wird geladen...</p>}
                      {entry.umlaut && <p>Umlaut: <Badge variant="outline" className="text-[10px]">{entry.umlaut}</Badge></p>}
                      {entry.plural_suffix && <p>Suffix: <Badge variant="outline" className="text-[10px]">{entry.plural_suffix}</Badge></p>}
                      {entry.wortart && <p>Typ: {entry.wortart}</p>}
                      {entry.level && <p>Niveau: {entry.level}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
