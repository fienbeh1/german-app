import { useState, useEffect, useRef } from 'react'
import { GlassCard } from './GlassCard'
import { Badge } from './ui/badge'
import { Volume2, RotateCcw, Languages, FileText } from 'lucide-react'
import { Button } from './ui/button'

const API_URL = import.meta.env.VITE_API_URL || ''

const WORTART_COLORS: Record<string, { border: string; bg: string }> = {
  'Substantiv': { border: '#4CAF50', bg: 'linear-gradient(135deg, rgba(76,175,80,0.12), transparent)' },
  'Verb':       { border: '#2196F3', bg: 'linear-gradient(135deg, rgba(33,150,243,0.12), transparent)' },
  'Adjektiv':   { border: '#FF9800', bg: 'linear-gradient(135deg, rgba(255,152,0,0.12), transparent)' },
  'Adverb':     { border: '#9C27B0', bg: 'linear-gradient(135deg, rgba(156,39,176,0.12), transparent)' },
  'Präposition':{ border: '#F44336', bg: 'linear-gradient(135deg, rgba(244,67,54,0.12), transparent)' },
  'Konjunktion':{ border: '#00BCD4', bg: 'linear-gradient(135deg, rgba(0,188,212,0.12), transparent)' },
}

const DEFAULT_COLOR = { border: '#607D8B', bg: 'linear-gradient(135deg, rgba(96,125,139,0.08), transparent)' }

const ARTIKEL_COLORS: Record<string, string> = {
  'der': '#5B9BD5',
  'die': '#E74C3C',
  'das': '#27AE60',
}

interface VocabularyCardProps {
  word: string
  article?: string
  plural?: string
  translation: string
  english?: string
  spanish?: string
  french?: string
  category: string
  context?: string
  audioUrl?: string
}

const NOUN_TYPES = new Set(['Substantiv', 'Nomen', 'Noun'])

export function VocabularyCard({
  word,
  article,
  plural,
  translation,
  english,
  spanish,
  french,
  category,
  context,
  audioUrl,
}: VocabularyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [examples, setExamples] = useState<{ sentence: string; source: string }[] | null>(null)
  const [loadingExamples, setLoadingExamples] = useState(false)
  const fetchedRef = useRef(false)

  const playAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (audioUrl) {
      new Audio(audioUrl).play()
    }
  }

  useEffect(() => {
    if (isFlipped && !fetchedRef.current && !examples && !loadingExamples) {
      fetchedRef.current = true
      setLoadingExamples(true)
      fetch(`${API_URL}/api/sentence-examples?word=${encodeURIComponent(word)}&max=3`)
        .then(r => r.ok ? r.json() : { examples: [] })
        .then(d => setExamples(d.examples || []))
        .catch(() => setExamples([]))
        .finally(() => setLoadingExamples(false))
    }
  }, [isFlipped])

  const isNoun = NOUN_TYPES.has(category)
  const wortartColors = WORTART_COLORS[category] || DEFAULT_COLOR
  const artikelColor = article ? ARTIKEL_COLORS[article] : undefined

  return (
    <div
      className="perspective-1000 h-52 cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:brightness-110"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className={`relative w-full h-full transition-all duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        <div className={`absolute inset-0 backface-hidden ${isFlipped ? 'invisible' : ''}`}>
          <GlassCard
            hover
            className="h-full flex flex-col justify-between"
            style={{ borderLeft: `4px solid ${wortartColors.border}`, background: wortartColors.bg }}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="inline-flex items-center rounded-full text-xs px-2 py-0.5 font-medium shrink-0"
                style={{ backgroundColor: wortartColors.border, color: '#fff' }}
              >
                {category}
              </span>
              <div className="flex gap-1 shrink-0">
                {plural && isNoun && (
                  <Badge variant="outline" className="text-[10px]">
                    {plural}
                  </Badge>
                )}
                {audioUrl && (
                  <Button size="icon" variant="ghost" className="size-7" onClick={playAudio}>
                    <Volume2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-bold">
                {article && isNoun && (
                  <span className="mr-2 text-base font-medium" style={{ color: artikelColor }}>
                    {article}
                  </span>
                )}
                {word}
              </h3>
              {!isNoun && (
                <p className="text-xs text-muted-foreground italic">
                  {category === 'Verb' ? 'Verb' : category === 'Adjektiv' ? 'Adjektiv' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RotateCcw className="size-3" />
              Klicken zum Übersetzen
            </div>
          </GlassCard>
        </div>

        <div className={`absolute inset-0 backface-hidden rotate-y-180 ${!isFlipped ? 'invisible' : ''}`}>
          <GlassCard
            className="h-full flex flex-col justify-between bg-primary text-primary-foreground border-primary"
            style={{ borderLeft: `4px solid ${wortartColors.border}` }}
          >
            <Badge variant="secondary" className="text-xs self-start flex items-center gap-1">
              <Languages className="size-3" />
              Übersetzung
            </Badge>
            <div className="space-y-2">
              <h3 className="text-sm italic font-medium opacity-80">{translation}</h3>
              <div className="space-y-0.5 text-sm opacity-90">
                {spanish && spanish !== translation && <p><span className="opacity-70">ES:</span> {spanish}</p>}
                {english && <p><span className="opacity-70">EN:</span> {english}</p>}
                {french && <p><span className="opacity-70">FR:</span> {french}</p>}
              </div>
              {plural && isNoun && (
                <p className="text-sm opacity-80">Plural: {plural}</p>
              )}
              {context && (
                <div className="pt-2 border-t border-primary-foreground/20">
                  <p className="text-sm opacity-90 italic">"{context}"</p>
                </div>
              )}
              {examples && examples.length > 0 && (
                <div className="pt-2 border-t border-primary-foreground/20 space-y-1">
                  <p className="text-[10px] opacity-60 flex items-center gap-1">
                    <FileText className="size-3" /> Leipzig Korpus
                  </p>
                  {examples.map((ex, i) => (
                    <p key={i} className="text-xs opacity-85 leading-relaxed">{ex.sentence}</p>
                  ))}
                </div>
              )}
              {loadingExamples && (
                <p className="text-xs opacity-50 pt-1">Beispiele laden...</p>
              )}
            </div>
            <p className="text-xs opacity-70">
              <RotateCcw className="size-3 inline mr-1" />
              Klicken zum Zurückkehren
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
