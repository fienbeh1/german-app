import { useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { VocabularyCard } from '../components/VocabularyCard'
import { BookOpen, GraduationCap, Search, X } from 'lucide-react'

interface VocabularyViewProps {
  appState: any
}

const WORD_TYPES = ['Alle', 'Substantiv', 'Verb', 'Adjektiv', 'Adverb', 'Präposition', 'Konjunktion']
const NIVELES = ['Alle', 'A1', 'A2', 'B1', 'B2', 'C1']

const NIVEL_COLORS: Record<string, string> = {
  A1: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  A2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  B1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  B2: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  C1: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

export function VocabularyView({ appState }: VocabularyViewProps) {
  const {
    realBooks: books, selectedBook, setSelectedBook,
    vocabulary, wordTypeFilter, setWordTypeFilter,
    searchQuery, setSearchQuery,
    vocabBookPicker, setVocabBookPicker,
    vocabNivelFilter, setVocabNivelFilter,
  } = appState

  const showBookPicker = vocabBookPicker || !selectedBook || vocabulary.length === 0

  const booksWithVocab = books
    .map((b: any) => ({
      ...b,
      vocabCount: vocabulary.filter((v: any) => v.source_file === b.name).length,
    }))
    .filter((b: any) => b.vocabCount > 0)

  const filteredVocab = vocabulary.filter((v: any) => {
    if (wordTypeFilter && wordTypeFilter !== 'Alle' && v.wortart !== wordTypeFilter) return false
    if (vocabNivelFilter && vocabNivelFilter !== 'Alle' && v.nivel !== vocabNivelFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const fields = [v.palabra, v.traduccion, v.english, v.spanish, v.french]
      if (!fields.some((f) => f?.toLowerCase().includes(q))) return false
    }
    return true
  })

  if (showBookPicker) {
    return (
      <ScrollArea className="h-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-bold">Vokabeln — Buch wählen</h2>
            <Badge variant="secondary" className="text-xs">{booksWithVocab.length} mit Vokabeln</Badge>
          </div>
          {booksWithVocab.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <BookOpen className="size-12 mb-4 opacity-50" />
              <p className="text-sm">Keine Bücher mit Vokabeln gefunden</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {booksWithVocab.map((book: any) => (
                <Card key={book.id} className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-all hover:scale-[1.02]"
                  onClick={() => { setSelectedBook(book); setVocabBookPicker(false) }}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <GraduationCap className="size-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{book.name.split('/').pop()}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{book.vocabCount} Vokabeln</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVocabBookPicker(true)}>
            ← Bücher
          </Button>
          <div className="flex-1" />
          <Badge variant="secondary" className="text-xs">{filteredVocab.length} Vokabeln</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {WORD_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setWordTypeFilter(type === 'Alle' ? '' : type)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                (wordTypeFilter === type || (!wordTypeFilter && type === 'Alle'))
                  ? 'bg-accent-warm text-accent-warm-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {NIVELES.map((n) => (
            <button
              key={n}
              onClick={() => setVocabNivelFilter(n === 'Alle' ? '' : n)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                n === 'Alle'
                  ? (vocabNivelFilter === '' || vocabNivelFilter === 'Alle')
                    ? 'bg-accent-warm text-accent-warm-foreground'
                    : 'bg-muted hover:bg-muted/80'
                  : vocabNivelFilter === n
                    ? NIVEL_COLORS[n] + ' ring-2 ring-accent-warm'
                    : NIVEL_COLORS[n]
              }`}
            >
              {n}
            </button>
          ))}
          <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen..."
              className="pl-8 h-8 text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        {filteredVocab.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <Search className="size-12 mb-4 opacity-50" />
            <p className="text-sm">Keine Vokabeln gefunden</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredVocab.map((item: any, i: number) => (
              <VocabularyCard
                key={i}
                word={item.wort || item.palabra || item.word || ''}
                article={item.artikel || ''}
                plural={item.plural || ''}
                translation={item['übersetzung_es'] || item.traduccion || item.translation || ''}
                english={item.english || ''}
                spanish={item.spanish || item.traduccion || item['übersetzung_es'] || ''}
                french={item.french || ''}
                category={item.wortart || item.category || 'Substantiv'}
                context={item.kontext || item.context || ''}
                audioUrl={item.audio_url || ''}
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
