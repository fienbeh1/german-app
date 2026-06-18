import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Loader2, Check, X, ArrowRight, ChevronDown, ArrowLeft } from 'lucide-react'
import { cn } from '../../lib/utils'

interface VerbConjugatorProps {
  onClose?: () => void
}

interface VerbData {
  infinitive: string
  praesens_ich: string
  praesens_du: string
  praesens_er: string
  praeteritum: string
  perfekt: string
  auxiliary_verb: string
  english: string
  spanish_translation: string
  french: string
  konjunktiv_ii_ich: string
  imperativ_singular: string
  imperativ_plural: string
}

type Tense = 'praesens' | 'praeteritum' | 'perfekt' | 'phrase'

interface PhraseData {
  sentence: string
  answer: string
}

interface TenseField {
  key: string
  label: string
  correct: (verb: VerbData) => string | null
}

const PRAESENS_FIELDS: TenseField[] = [
  { key: 'ich', label: 'ich', correct: (v) => v.praesens_ich || null },
  { key: 'du', label: 'du', correct: (v) => v.praesens_du || null },
  { key: 'er', label: 'er/sie/es', correct: (v) => v.praesens_er || null },
  { key: 'wir', label: 'wir', correct: (v) => v.infinitive },
  { key: 'ihr', label: 'ihr', correct: (v) => v.infinitive.replace(/en$/, '').replace(/n$/, '') + 't' },
  { key: 'sie', label: 'sie/Sie', correct: (v) => v.infinitive },
]

function derivePraeteritum(praeteritum: string, person: string): string {
  if (!praeteritum) return ''
  const endsInE = praeteritum.endsWith('e')
  switch (person) {
    case 'ich': return praeteritum
    case 'du': return endsInE ? praeteritum.slice(0, -1) + 'est' : praeteritum + 'st'
    case 'er': return praeteritum
    case 'wir': return endsInE ? praeteritum.slice(0, -1) + 'en' : praeteritum + 'en'
    case 'ihr': return endsInE ? praeteritum.slice(0, -1) + 'et' : praeteritum + 't'
    case 'sie': return endsInE ? praeteritum.slice(0, -1) + 'en' : praeteritum + 'en'
    default: return praeteritum
  }
}

const PRAETERITUM_FIELDS: TenseField[] = [
  { key: 'ich', label: 'ich', correct: (v) => v.praeteritum || null },
  { key: 'du', label: 'du', correct: (v) => v.praeteritum ? derivePraeteritum(v.praeteritum, 'du') : null },
  { key: 'er', label: 'er/sie/es', correct: (v) => v.praeteritum || null },
  { key: 'wir', label: 'wir', correct: (v) => v.praeteritum ? derivePraeteritum(v.praeteritum, 'wir') : null },
  { key: 'ihr', label: 'ihr', correct: (v) => v.praeteritum ? derivePraeteritum(v.praeteritum, 'ihr') : null },
  { key: 'sie', label: 'sie/Sie', correct: (v) => v.praeteritum ? derivePraeteritum(v.praeteritum, 'sie') : null },
]

const PERFEKT_FIELDS: TenseField[] = [
  { key: 'auxiliary', label: 'Hilfsverb (haben/sein)', correct: (v) => v.auxiliary_verb || null },
  { key: 'partizip', label: 'Partizip II', correct: (v) => v.perfekt || null },
]

export function VerbConjugator({ onClose }: VerbConjugatorProps) {
  const [verb, setVerb] = useState<VerbData | null>(null)
  const [phrase, setPhrase] = useState<PhraseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tense, setTense] = useState<Tense>('praesens')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState(false)
  const [results, setResults] = useState<Record<string, boolean | 'skip'>>({})

  const fields = tense === 'praesens' ? PRAESENS_FIELDS
    : tense === 'praeteritum' ? PRAETERITUM_FIELDS
    : tense === 'perfekt' ? PERFEKT_FIELDS
    : []

  const loadVerb = async () => {
    setLoading(true)
    setChecked(false)
    setAnswers({})
    setResults({})
    setPhrase(null)
    try {
      if (tense === 'phrase') {
        const r = await fetch('/api/phrases/random?limit=1')
        const data = await r.json()
        if (data && data.length > 0) {
          setPhrase({ sentence: data[0].pregunta || data[0].sentence, answer: data[0].respuesta || data[0].answer })
        } else {
          setPhrase({ sentence: 'Ich ___ (gehen) nach Hause.', answer: 'gehe' })
        }
      } else {
        const r = await fetch('/api/verbs/random?limit=1')
        const data = await r.json()
        setVerb(data[0] || null)
      }
    } catch {
      if (tense === 'phrase') {
        setPhrase({ sentence: 'Ich ___ (gehen) nach Hause.', answer: 'gehe' })
      } else {
        setVerb(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadVerb() }, [tense])

  const handleCheck = () => {
    if (tense === 'phrase') {
      if (!phrase) return
      const given = (answers['phrase'] || '').trim().toLowerCase()
      const correct = phrase.answer.trim().toLowerCase()
      setResults({ phrase: given === correct })
      setChecked(true)
      return
    }

    if (!verb) return
    const res: Record<string, boolean | 'skip'> = {}
    for (const field of fields) {
      const correct = field.correct(verb)
      if (correct === null) {
        res[field.key] = 'skip'
      } else {
        const given = (answers[field.key] || '').trim().toLowerCase()
        res[field.key] = given === correct.trim().toLowerCase()
      }
    }
    setResults(res)
    setChecked(true)
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  )

  if (!verb && tense !== 'phrase') return (
    <div className="p-6 space-y-4">
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Keine Verben gefunden.
        </CardContent>
      </Card>
    </div>
  )

  const handleTenseChange = (newTense: Tense) => {
    if (newTense !== tense) {
      setTense(newTense)
    }
  }

  const renderFields = () => {
    if (tense === 'phrase') {
      if (!phrase) return (
        <p className="text-sm text-muted-foreground">Keine Übung gefunden.</p>
      )
      const isCorrect = checked && results['phrase'] === true
      const isWrong = checked && results['phrase'] === false
      return (
        <>
          <div className="bg-muted/30 rounded-lg p-4 mb-4 border border-border/50">
            <p className="text-sm leading-relaxed">{phrase.sentence}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium w-24 text-right shrink-0">Antwort:</span>
            <div className="relative flex-1 max-w-xs">
              <Input
                value={answers['phrase'] || ''}
                onChange={e => setAnswers(a => ({ ...a, phrase: e.target.value }))}
                placeholder="..."
                className={cn("h-8 text-sm font-mono pr-8",
                  isCorrect && "border-green-500 bg-green-500/10",
                  isWrong && "border-red-500 bg-red-500/10"
                )}
                disabled={checked}
              />
              {checked && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  {isCorrect ? <Check className="size-4 text-green-600" /> : <X className="size-4 text-red-600" />}
                </span>
              )}
            </div>
            {checked && isWrong && (
              <span className="text-xs text-green-600 font-mono shrink-0">{phrase.answer}</span>
            )}
          </div>
        </>
      )
    }

    if (!verb) return null

    return fields.map(field => {
      const val = answers[field.key] || ''
      const correct = field.correct(verb)
      const isSkip = checked && results[field.key] === 'skip'
      const isCorrect = checked && results[field.key] === true
      const isWrong = checked && results[field.key] === false
      return (
        <div key={field.key} className="flex items-center gap-3">
          <span className="text-sm font-medium w-20 text-right shrink-0">{field.label}:</span>
          <div className="relative flex-1">
            <Input
              value={val}
              onChange={e => setAnswers(a => ({ ...a, [field.key]: e.target.value }))}
              placeholder={correct || field.key}
              className={cn("h-8 text-sm font-mono pr-8",
                isCorrect && "border-green-500 bg-green-500/10",
                isWrong && "border-red-500 bg-red-500/10"
              )}
              disabled={checked}
            />
            {checked && !isSkip && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                {isCorrect ? <Check className="size-4 text-green-600" /> : <X className="size-4 text-red-600" />}
              </span>
            )}
          </div>
          {checked && isWrong && correct && (
            <span className="text-xs text-green-600 font-mono shrink-0">{correct}</span>
          )}
          {checked && isSkip && (
            <span className="text-xs text-gray-400 italic shrink-0">(nicht in DB)</span>
          )}
        </div>
      )
    })
  }

  const allFields = tense === 'phrase' ? ['phrase'] : fields
  const checkedFields = allFields.filter(f => {
    const k = typeof f === 'string' ? f : f.key
    return results[k] !== undefined && results[k] !== 'skip'
  })
  const correctCount = checkedFields.filter(f => {
    const k = typeof f === 'string' ? f : f.key
    return results[k] === true
  }).length
  const allCorrect = checked && checkedFields.length > 0 && checkedFields.every(f => {
    const k = typeof f === 'string' ? f : f.key
    return results[k] === true
  })

  const tenseLabel = tense === 'praesens' ? 'Präsens'
    : tense === 'praeteritum' ? 'Präteritum'
    : tense === 'perfekt' ? 'Perfekt'
    : 'Phrase'

  return (
    <div className="p-6 space-y-4">
      {onClose && (
        <Button variant="ghost" size="sm" className="h-7 text-xs mb-2" onClick={onClose}>
          <ArrowLeft className="size-3.5 mr-1" /> Zurück zu Spielen
        </Button>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {tense === 'phrase' ? 'Satzübung' : verb?.infinitive || ''}
            </CardTitle>
            {verb && verb.english && tense !== 'phrase' && (
              <p className="text-xs text-muted-foreground mt-1">
                {verb.english}{verb.spanish_translation ? ` · ${verb.spanish_translation}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {verb && <Badge variant="outline" className="text-xs">{verb.auxiliary_verb || 'hat/ist'}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(['praesens', 'praeteritum', 'perfekt', 'phrase'] as Tense[]).map(t => (
              <button
                key={t}
                onClick={() => handleTenseChange(t)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  tense === t
                    ? "bg-blue-500 text-white shadow-lg"
                    : "bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-white/80 dark:hover:bg-gray-800/80 border border-white/30 dark:border-white/10"
                )}
              >
                {t === 'praesens' ? 'Präsens' : t === 'praeteritum' ? 'Präteritum' : t === 'perfekt' ? 'Perfekt' : 'Phrase'}
              </button>
            ))}
          </div>

          <p className="text-sm text-gray-400">Konjugiere im {tenseLabel}</p>

          <div className="space-y-3">
            {renderFields()}
          </div>

          <div className="flex items-center justify-between pt-2">
            {!checked ? (
              <Button onClick={handleCheck} size="sm" disabled={Object.keys(answers).length === 0}>
                <Check className="size-4 mr-1" /> Prüfen
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                {allCorrect ? (
                  <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                    <Check className="size-4" /> Alles richtig!
                  </span>
                ) : (
                  <span className="text-sm text-red-600 font-medium">
                    {correctCount}/{checkedFields.length} richtig
                  </span>
                )}
                <Button onClick={loadVerb} size="sm" variant="outline">
                  <ArrowRight className="size-4 mr-1" /> Nächstes Verb
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
