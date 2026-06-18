import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Mic, Square, Play, Loader2, Volume2, CheckCircle2, XCircle, AlertCircle, Settings2 } from 'lucide-react'
import { ScrollArea } from './ui/scroll-area'

const API_URL = import.meta.env.VITE_API_URL || ''

const PHRASES_BY_LEVEL: Record<string, { de: string; en: string }[]> = {
  A1: [
    { de: 'Guten Morgen', en: 'Good morning' },
    { de: 'Ich heiße Anna', en: 'My name is Anna' },
    { de: 'Wie geht es Ihnen?', en: 'How are you?' },
    { de: 'Mir geht es gut, danke', en: 'I am fine, thanks' },
    { de: 'Wo wohnen Sie?', en: 'Where do you live?' },
    { de: 'Ich komme aus Mexiko', en: 'I come from Mexico' },
    { de: 'Auf Wiedersehen', en: 'Goodbye' },
    { de: 'Bis morgen', en: 'See you tomorrow' },
    { de: 'Eins, zwei, drei', en: 'One, two, three' },
    { de: 'Das ist mein Buch', en: 'This is my book' },
  ],
  A2: [
    { de: 'Können Sie mir bitte helfen?', en: 'Can you help me please?' },
    { de: 'Ich möchte ein Zimmer reservieren', en: 'I would like to reserve a room' },
    { de: 'Wo ist der Bahnhof?', en: 'Where is the train station?' },
    { de: 'Wie viel kostet das Ticket?', en: 'How much does the ticket cost?' },
    { de: 'Ich hätte gern einen Kaffee', en: 'I would like a coffee' },
    { de: 'Können Sie das bitte wiederholen?', en: 'Can you repeat that please?' },
    { de: 'Ich habe meine Tasche verloren', en: 'I lost my bag' },
    { de: 'Welche Sprache sprechen Sie?', en: 'Which language do you speak?' },
    { de: 'Ich arbeite als Ingenieur', en: 'I work as an engineer' },
    { de: 'Meine Familie wohnt in Berlin', en: 'My family lives in Berlin' },
  ],
  B1: [
    { de: 'Ich habe mich sehr über Ihre Einladung gefreut', en: 'I was very happy about your invitation' },
    { de: 'Können Sie mir den Weg zum Museum beschreiben?', en: 'Can you describe the way to the museum?' },
    { de: 'Ich würde gern einen Termin vereinbaren', en: 'I would like to make an appointment' },
    { de: 'Entschuldigung, ich habe mich verspätet', en: 'Sorry, I am late' },
    { de: 'Meiner Meinung nach ist das eine gute Idee', en: 'In my opinion that is a good idea' },
    { de: 'Ich bin gestern mit dem Zug nach München gefahren', en: 'Yesterday I traveled to Munich by train' },
    { de: 'Das Wetter ist heute viel besser als gestern', en: 'The weather is much better today than yesterday' },
    { de: 'Könnten Sie mir bitte sagen, wo die Post ist?', en: 'Could you please tell me where the post office is?' },
    { de: 'Ich interessiere mich für Kunst und Musik', en: 'I am interested in art and music' },
    { de: 'Wir haben uns entschlossen, nach Österreich zu reisen', en: 'We decided to travel to Austria' },
  ],
}

interface SpeakingTrainerProps {
  appState?: any
}

export function SpeakingTrainer({ appState }: SpeakingTrainerProps) {
  const [level, setLevel] = useState<string>('A1')
  const [currentPhrase, setCurrentPhrase] = useState(PHRASES_BY_LEVEL.A1[0])
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [rate, setRate] = useState(0.85)
  const [showSettings, setShowSettings] = useState(false)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices()
      const german = v.filter(v => v.lang.startsWith('de'))
      const others = v.filter(v => !v.lang.startsWith('de'))
      const sorted = [...german, ...others]
      setVoices(sorted)
      if (german.length > 0 && !selectedVoice) {
        const preferred = german.find(v => v.name.includes('Google') || v.name.includes('Microsoft Hedda') || v.name.includes('Katja') || v.name.includes('Markus'))
        setSelectedVoice(preferred?.voiceURI || german[0].voiceURI)
      }
    }
    loadVoices()
    speechSynthesis.onvoiceschanged = loadVoices
    return () => { speechSynthesis.onvoiceschanged = null }
  }, [])

  const selectLevel = (lvl: string) => {
    setLevel(lvl)
    const phrases = PHRASES_BY_LEVEL[lvl] || PHRASES_BY_LEVEL.A1
    setCurrentPhrase(phrases[Math.floor(Math.random() * phrases.length)])
    setResult(null)
    setAudioUrl(null)
  }

  const nextPhrase = () => {
    const phrases = PHRASES_BY_LEVEL[level] || PHRASES_BY_LEVEL.A1
    let next: typeof currentPhrase
    do {
      next = phrases[Math.floor(Math.random() * phrases.length)]
    } while (next.de === currentPhrase.de && phrases.length > 1)
    setCurrentPhrase(next)
    setResult(null)
    setAudioUrl(null)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks.current = []
      mediaRecorder.current = new MediaRecorder(stream)
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      mediaRecorder.current.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        evaluateAudio(blob)
      }
      mediaRecorder.current.start()
      setIsRecording(true)
    } catch (e) {
      console.error('Microphone error:', e)
    }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }

  const evaluateAudio = async (blob: Blob) => {
    setLoading(true)
    setResult(null)
    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1]
        const resp = await fetch(`${API_URL}/api/speaking/evaluate-base64`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_base64: base64, expected_text: currentPhrase.de }),
        })
        if (resp.ok) {
          const data = await resp.json()
          setResult(data)
        } else {
          setResult({ accuracy: 0, feedback: ['Server error - try again'], transcribed: '' })
        }
        setLoading(false)
      }
      reader.readAsDataURL(blob)
    } catch (e) {
      setResult({ accuracy: 0, feedback: ['Connection error'], transcribed: '' })
      setLoading(false)
    }
  }

  const speakPhrase = () => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(currentPhrase.de)
    utterance.lang = 'de-DE'
    utterance.rate = rate
    if (selectedVoice) {
      const voice = voices.find(v => v.voiceURI === selectedVoice)
      if (voice) utterance.voice = voice
    }
    speechSynthesis.speak(utterance)
  }

  const getVoiceLabel = (v: SpeechSynthesisVoice) => {
    const isDe = v.lang.startsWith('de')
    return `${isDe ? '🇩🇪 ' : ''}${v.name} (${v.lang})${v.default ? ' [Default]' : ''}`
  }

  const accuracyColor = (acc: number) => {
    if (acc >= 80) return 'text-green-600'
    if (acc >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Mic className="size-6 text-emerald-600" />
          <h2 className="text-lg font-bold">Speaking Trainer</h2>
          <Badge variant="secondary">{level}</Badge>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)} className="h-8 gap-1">
            <Settings2 className="size-3.5" /> Stimme
          </Button>
        </div>

        {showSettings && (
          <Card className="border-emerald-200/50">
            <CardContent className="p-3 space-y-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Stimme auswählen</label>
                <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
                  className="w-full text-xs h-8 rounded border bg-background px-2 mt-1">
                  {voices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{getVoiceLabel(v)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Geschwindigkeit: {rate.toFixed(2)}</label>
                <input type="range" min={0.3} max={1.5} step={0.05} value={rate}
                  onChange={e => setRate(parseFloat(e.target.value))}
                  className="w-full h-1 appearance-none bg-muted-foreground/20 rounded-full cursor-pointer accent-emerald-500 mt-1" />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          {['A1', 'A2', 'B1'].map(l => (
            <button key={l} onClick={() => selectLevel(l)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                level === l ? 'bg-emerald-600 text-white' : 'bg-muted hover:bg-muted/80'
              }`}>{l}</button>
          ))}
        </div>

        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sprechen Sie nach:</CardTitle>
              <Button variant="ghost" size="sm" onClick={speakPhrase} className="h-8 gap-1">
                <Volume2 className="size-4" /> Hören
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-center py-4">{currentPhrase.de}</p>
            <p className="text-sm text-muted-foreground text-center italic">{currentPhrase.en}</p>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-4">
          {!isRecording ? (
            <Button onClick={startRecording} disabled={loading} className="bg-red-500 hover:bg-red-600 h-12 w-12 rounded-full">
              <Mic className="size-6" />
            </Button>
          ) : (
            <Button onClick={stopRecording} className="bg-gray-800 hover:bg-gray-900 h-12 w-12 rounded-full">
              <Square className="size-6" />
            </Button>
          )}
          <Button variant="outline" onClick={nextPhrase} disabled={loading} className="h-12 px-6">
            Nächster Satz
          </Button>
        </div>

        {audioUrl && (
          <div className="flex justify-center">
            <audio src={audioUrl} controls className="h-10" />
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Analysiere...
          </div>
        )}

        {result && (
          <Card className={`border-2 ${
            result.accuracy >= 80 ? 'border-green-400' :
            result.accuracy >= 50 ? 'border-yellow-400' : 'border-red-400'
          }`}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center gap-3">
                {result.accuracy >= 80 ? <CheckCircle2 className="size-8 text-green-500" /> :
                 result.accuracy >= 50 ? <AlertCircle className="size-8 text-yellow-500" /> :
                 <XCircle className="size-8 text-red-500" />}
                <div>
                  <p className="text-2xl font-bold">{result.accuracy}%</p>
                  <p className="text-xs text-muted-foreground">Genauigkeit</p>
                </div>
              </div>

              {result.transcribed && (
                <div>
                  <p className="text-xs text-muted-foreground">Erkannt:</p>
                  <p className="text-sm font-mono bg-muted rounded p-2">{result.transcribed}</p>
                </div>
              )}

              {result.intonation && (
                <div>
                  <p className="text-xs text-muted-foreground">Intonation:</p>
                  <p className="text-sm">{result.intonation.score}/100</p>
                </div>
              )}

              {result.feedback?.map((fb: string, i: number) => (
                <p key={i} className="text-sm">{fb}</p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}
