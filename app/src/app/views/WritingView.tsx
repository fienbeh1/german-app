import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { ScrollArea } from '../components/ui/scroll-area'
import { ScrollText, Send, RotateCcw, Mic, BarChart3, BookOpen, Info, X, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

const LEVELS = ['A1', 'A2', 'B1', 'B2']
const WRITING_PROMPTS: Record<string, string[]> = {
  A1: ['apartment-request', 'congratulation', 'New Year-letter', 'visit-letter', 'swimming appointment', 'ticket-offer'],
  A2: ['apartment-request', 'birthday-letter', 'congratulation', 'housing office-enquiry', 'pet sitting-request', 'swimming appointment', 'visit-letter', 'New Year-letter', 'ticket-offer'],
  B1: ['apartment-request', 'Au pair Agency-complaint', 'Au pair Agency-enquiry', 'birthday-letter', 'congratulation', 'housing office-enquiry', 'internship-application', 'New Year-letter', 'pet sitting-request', 'visit-letter'],
  B2: ['Au pair Agency-complaint', 'Au pair Agency-enquiry', 'birthday-letter', 'housing situation-essay', 'integration issues-essay', 'internship-application', 'New Year-letter', 'visit-letter'],
}

const PROMPT_DESC: Record<string, string> = {
  'apartment-request': 'Schreibe eine Anfrage für eine Wohnung.',
  'congratulation': 'Schreibe eine Glückwunschkarte.',
  'New Year-letter': 'Schreibe einen Neujahrsbrief.',
  'visit-letter': 'Schreibe einen Brief über einen Besuch.',
  'swimming appointment': 'Schreibe eine Nachricht über einen Schwimmtermin.',
  'ticket-offer': 'Schreibe über ein Ticket-Angebot.',
  'birthday-letter': 'Schreibe einen Geburtstagsbrief.',
  'housing office-enquiry': 'Schreibe eine Anfrage an das Wohnungsamt.',
  'pet sitting-request': 'Schreibe eine Anfrage für Haustierbetreuung.',
  'Au pair Agency-complaint': 'Schreibe eine Beschwerde an eine Au-pair-Agentur.',
  'Au pair Agency-enquiry': 'Schreibe eine Anfrage an eine Au-pair-Agentur.',
  'internship-application': 'Schreibe eine Praktikumsbewerbung.',
  'housing situation-essay': 'Schreibe einen Aufsatz über deine Wohnsituation.',
  'integration issues-essay': 'Schreibe einen Aufsatz über Integration.',
}

function computeWordDiff(userText: string, modelText: string) {
  const userWords = userText.split(/\s+/).filter(Boolean)
  const modelWords = modelText.split(/\s+/).filter(Boolean)

  const grammarWords = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'eines',
    'bin', 'bist', 'ist', 'sind', 'seid', 'habe', 'hast', 'hat', 'haben', 'habt',
    'werde', 'wirst', 'wird', 'werden', 'werdet'])
  const vocabWords = new Set(['und', 'oder', 'aber', 'denn', 'weil', 'dass', 'wenn', 'sehr', 'viel', 'gut', 'groß', 'klein',
    'schön', 'neu', 'alt', 'teuer', 'billig', 'wichtig'])

  const alignment: Array<{ type: 'same' | 'grammar' | 'vocab' | 'syntax'; word: string; modelWord?: string }> = []

  let mi = 0
  for (let ui = 0; ui < userWords.length && mi < modelWords.length; ui++) {
    const uw = userWords[ui].toLowerCase().replace(/[.,!?;:]+$/, '')
    const mw = modelWords[mi].toLowerCase().replace(/[.,!?;:]+$/, '')

    if (uw === mw) {
      alignment.push({ type: 'same', word: userWords[ui] })
      mi++
    } else if (grammarWords.has(uw) || grammarWords.has(mw)) {
      alignment.push({ type: 'grammar', word: userWords[ui], modelWord: modelWords[mi] })
      mi++
    } else if (vocabWords.has(uw) || vocabWords.has(mw)) {
      alignment.push({ type: 'vocab', word: userWords[ui], modelWord: modelWords[mi] })
      mi++
    } else {
      alignment.push({ type: 'syntax', word: userWords[ui], modelWord: modelWords[mi] })
      mi++
    }
  }

  for (; mi < modelWords.length; mi++) {
    alignment.push({ type: 'syntax', word: '', modelWord: modelWords[mi] })
  }

  return alignment
}

export function WritingView({ onBack }: { onBack?: () => void }) {
  const [level, setLevel] = useState('A1')
  const [prompt, setPrompt] = useState('')
  const [text, setText] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [modelText, setModelText] = useState<any>(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [selectedAnnotation, setSelectedAnnotation] = useState<any>(null)

  useEffect(() => {
    if (prompt && showModel && !modelText) {
      loadModelText()
    }
  }, [prompt, showModel])

  const loadModelText = async () => {
    setModelLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/writing/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, prompt }),
      })
      if (!resp.ok) return
      const reader = resp.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.status === 'done' && data.result) {
                setModelText(data.result)
              } else if (data.error) {
                console.error(data.error)
              }
            } catch {}
          }
        }
      }
    } catch (e) { console.error(e) }
    setModelLoading(false)
  }

  const evaluate = async () => {
    if (!text.trim() || !prompt) return
    setLoading(true)
    setResult(null)
    try {
      const resp = await fetch(`${API_URL}/api/writing/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, level, prompt }),
      })
      if (resp.ok) {
        const json = await resp.json()
        setResult(json)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const handleSpeaking = async () => {
    try { await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { alert('Mikrofonzugriff verweigert.'); return }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || (window as any).mozSpeechRecognition
    if (Ctor) {
      const recognition = new Ctor()
      recognition.lang = 'de-DE'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.onresult = (event: any) => { setText(prev => prev + ' ' + event.results[0][0].transcript) }
      recognition.onerror = (e: any) => { console.error('SpeechRecognition error:', e.error || e.message || e) }
      recognition.start()
    } else {
      alert('Spracherkennung wird von Ihrem Browser nicht unterstützt.')
    }
  }

  const prompts = WRITING_PROMPTS[level] || []

  const renderModelSentence = (s: any, i: number) => {
    const bgColor = s.grammar === 'ok' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
      : s.grammar === 'warn' ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'

    return (
      <div key={i} className={`p-3 rounded-lg border ${bgColor} mb-2 relative group`}>
        <div className="flex items-start gap-2">
          <span className="text-xs font-mono text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
          <p className="text-sm flex-1">{s.text}</p>
          <div className="flex gap-1 shrink-0">
            {s.annotations.map((a: any, ai: number) => (
              <button key={ai} onClick={() => setSelectedAnnotation({ sentence: i, annotation: a })}
                className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-black/20 transition-colors">
                <Info className={`size-3.5 ${
                  a.type === 'grammar' ? 'text-red-500' : a.type === 'vocab' ? 'text-blue-500' : 'text-green-500'
                }`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          {onBack && <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={onBack}><ArrowLeft className="size-3.5 mr-1" /> Zurück</Button>}
          <ScrollText className="size-6 text-indigo-600" />
          <h2 className="text-lg font-bold">Schreibtraining</h2>
          <Badge variant="secondary">{level}</Badge>
          {modelText && (
            <Badge variant="outline" className="gap-1">
              <BookOpen className="size-3" /> Modelltext geladen
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          {LEVELS.map(l => (
            <button key={l} onClick={() => { setLevel(l); setPrompt(''); setResult(null); setModelText(null); setShowModel(false) }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                level === l ? 'bg-indigo-600 text-white' : 'bg-muted hover:bg-muted/80'
              }`}>{l}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {prompts.map(p => (
            <button key={p} onClick={() => { setPrompt(p); setResult(null); setModelText(null); setShowModel(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                prompt === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-muted hover:bg-muted/80 border-transparent'
              }`}>{p.replace(/-/g, ' ')}</button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <Button
            onClick={() => { setShowModel(v => !v); if (!showModel && !modelText) loadModelText() }}
            disabled={!prompt || modelLoading}
            variant={showModel ? 'default' : 'outline'}
            className={`gap-2 ${showModel ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
          >
            <BookOpen className="size-4" />
            {modelLoading ? 'Lade...' : showModel ? 'Modelltext ausblenden' : 'Modelltext anzeigen'}
          </Button>
        </div>

        {showModel && modelText && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="size-4 text-amber-600" />
                Modelltext — {level}
                <Badge variant="outline" className="text-[9px]">{modelText.word_count} Wörter</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Volltext</p>
                  <div className="text-sm p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 leading-relaxed whitespace-pre-wrap">
                    {modelText.text}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Satz-für-Satz Analyse
                    <span className="ml-2 text-[9px] text-muted-foreground">(klicke <Info className="size-2.5 inline" /> für Erklärung)</span>
                  </p>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {modelText.sentences.map((s: any, i: number) => renderModelSentence(s, i))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Click-to-Explain popup */}
        {selectedAnnotation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSelectedAnnotation(null)}>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <Badge className={
                  selectedAnnotation.annotation.type === 'grammar' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : selectedAnnotation.annotation.type === 'vocab' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                }>
                  {selectedAnnotation.annotation.type === 'grammar' ? 'Grammatik'
                    : selectedAnnotation.annotation.type === 'vocab' ? 'Wortschatz' : 'Satzbau'}
                </Badge>
                <button onClick={() => setSelectedAnnotation(null)} className="p-1 hover:bg-muted rounded">
                  <X className="size-4" />
                </button>
              </div>
              <p className="text-sm leading-relaxed">
                {selectedAnnotation.annotation.text.split('.')[0]}
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Satz {selectedAnnotation.sentence + 1}
              </p>
            </div>
          </div>
        )}

        {prompt && (
          <Card className="border-indigo-200 dark:border-indigo-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium">{PROMPT_DESC[prompt] || prompt}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Textarea placeholder="Schreibe deinen Text hier..."
                  className="min-h-[200px] text-sm" value={text}
                  onChange={e => setText(e.target.value)} />
                <button onClick={handleSpeaking}
                  className="absolute bottom-3 right-3 p-2 rounded-full bg-indigo-100 dark:bg-indigo-900 hover:bg-indigo-200 transition-colors">
                  <Mic className="size-4 text-indigo-600" />
                </button>
              </div>
              <div className="flex gap-2">
                <Button onClick={evaluate} disabled={loading || !text.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  <Send className="size-4" /> Bewerten
                </Button>
                <Button variant="outline" onClick={() => { setText(''); setResult(null) }} className="gap-2">
                  <RotateCcw className="size-4" /> Zurücksetzen
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="text-center py-10 text-muted-foreground">Bewerte...</div>
        )}

        {result && (
          <Card className="border-indigo-200 dark:border-indigo-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-5 text-indigo-600" />
                Ergebnis
                <span className={`text-2xl font-bold ${getScoreColor(result.score)}`}>
                  {result.score}/100
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold">{result.word_count}</p>
                  <p className="text-[10px] text-muted-foreground">Wörter</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold">{result.sentence_count}</p>
                  <p className="text-[10px] text-muted-foreground">Sätze</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold">{result.vocabulary_score}</p>
                  <p className="text-[10px] text-muted-foreground">Wortschatz</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-lg font-bold">{result.grammar_score}</p>
                  <p className="text-[10px] text-muted-foreground">Grammatik</p>
                </div>
              </div>

              {/* Contrastive Analysis with model */}
              {modelText && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Vergleich mit Modelltext</p>
                  <div className="p-4 rounded-lg bg-muted/50 border border-muted">
                    <div className="flex flex-wrap gap-1.5">
                      {computeWordDiff(text, modelText.text).map((w: any, i: number) => (
                        <span key={i}
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono border ${
                            w.type === 'same' ? 'text-foreground border-transparent'
                            : w.type === 'grammar' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                            : w.type === 'vocab' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
                          }`}
                          title={w.modelWord ? `Modell: ${w.modelWord}` : undefined}>
                          {w.word || '?'}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span><span className="inline-block w-2 h-2 rounded bg-red-400 mr-1" /> Grammatik</span>
                      <span><span className="inline-block w-2 h-2 rounded bg-blue-400 mr-1" /> Wortschatz</span>
                      <span><span className="inline-block w-2 h-2 rounded bg-green-400 mr-1" /> Satzbau</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Detaillierte Analyse</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Badge variant="outline">Ø Wortlänge: {result.avg_word_length}</Badge>
                  <Badge variant="outline">Ø Satzlänge: {result.avg_sentence_length}</Badge>
                  <Badge variant="outline">Einzigartig: {result.unique_ratio}%</Badge>
                  <Badge variant="outline">Passend: {result.level_fit}%</Badge>
                </div>
              </div>

              {result.feedback && result.feedback.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Feedback</p>
                  <ul className="space-y-1">
                    {result.feedback.map((fb: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-indigo-600">•</span>
                        {fb}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}
