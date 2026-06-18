import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { Mic, Play, RotateCcw, BarChart3, Volume2, History, Trash2, Pause, Square, SkipBack, SkipForward, BookOpen, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''
const LEVELS = ['A1', 'A2', 'B1', 'B2']

const WORD_LIMITS: Record<string, { min: number; max: number }> = {
  A1: { min: 4, max: 7 },
  A2: { min: 6, max: 12 },
  B1: { min: 5, max: 15 },
  B2: { min: 7, max: 20 },
}

function getHistoryKey(level: string) { return `speaking_history_${level}` }
function loadHistory(level: string): any[] {
  try { return JSON.parse(localStorage.getItem(getHistoryKey(level)) || '[]') } catch { return [] }
}
function saveHistory(level: string, entry: any) {
  const h = loadHistory(level)
  h.unshift({ ...entry, timestamp: Date.now() })
  if (h.length > 50) h.length = 50
  localStorage.setItem(getHistoryKey(level), JSON.stringify(h))
}

function generateReferenceWaveform(text: string): Float32Array {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const length = wordCount * 2000
  const buf = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const wordIdx = Math.floor(i / 2000)
    const phase = (i % 2000) / 2000
    const envelope = Math.sin(phase * Math.PI) * 0.6
    const freq = 120 + (wordIdx % 7) * 20
    buf[i] = Math.sin(2 * Math.PI * freq * i / 16000) * envelope + (Math.random() - 0.5) * 0.05
  }
  return buf
}

function decodeAudioBlob(blob: Blob): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const ctx = new OfflineAudioContext(1, 1, 44100)
        const buf = await ctx.decodeAudioData(reader.result as ArrayBuffer)
        resolve(buf.getChannelData(0))
      } catch (e) { reject(e) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

function Waveform({ data, color }: { data: Float32Array | null; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'rgb(20, 20, 30)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (data && data.length > 0) {
      const step = Math.max(1, Math.floor(data.length / canvas.width))
      ctx.lineWidth = 1.5
      ctx.strokeStyle = color
      ctx.beginPath()
      for (let x = 0; x < canvas.width; x++) {
        const idx = Math.min(Math.floor(x * step), data.length - 1)
        const v = data[idx] * 0.5 + 0.5
        const y = (1 - v) * canvas.height
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }, [data, color])
  return <canvas ref={canvasRef} className="w-full h-16 rounded-lg bg-gray-950" width={600} height={64} />
}

function formatTime(s: number) {
  if (!s || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface SpeakingViewProps {
  onBack?: () => void
}

export function SpeakingView({ onBack }: SpeakingViewProps) {
  const [mode, setMode] = useState<'phrases' | 'audio'>('audio')
  const [level, setLevel] = useState('A1')
  const [sentences, setSentences] = useState<any[]>([])
  const [currentSet, setCurrentSet] = useState(0)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingPaused, setRecordingPaused] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [refWaveform, setRefWaveform] = useState<Float32Array | null>(null)

  // Audio mode state
  const [books, setBooks] = useState<any[]>([])
  const [selectedBook, setSelectedBook] = useState('')
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [selectedTrack, setSelectedTrack] = useState<any | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [recordings, setRecordings] = useState<Array<{
    id: number; blob: Blob; url: string; result: any; waveform: Float32Array | null
  }>>([])
  const [selectedRec, setSelectedRec] = useState<number | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewRecId, setPreviewRecId] = useState<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const togglePreview = useCallback((rec: { id: number; url: string }) => {
    if (previewRecId === rec.id && previewPlaying) {
      previewAudioRef.current?.pause()
      setPreviewPlaying(false)
      setPreviewRecId(null)
      return
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio()
    }
    const audio = previewAudioRef.current
    audio.src = rec.url
    audio.onended = () => { setPreviewPlaying(false); setPreviewRecId(null) }
    audio.onpause = () => setPreviewPlaying(false)
    audio.onplay = () => setPreviewPlaying(true)
    audio.play().catch(() => {})
    setPreviewRecId(rec.id)
    setPreviewPlaying(true)
  }, [previewPlaying, previewRecId])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recIdCounter = useRef(0)

  const limit = WORD_LIMITS[level]

  // ── Audio mode: load books ──
  useEffect(() => {
    fetch(`${API_URL}/api/books?category=book`)
      .then(r => r.json())
      .then(d => setBooks(d.books || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedBook) { setAudioTracks([]); setSelectedTrack(null); return }
    fetch(`${API_URL}/api/audio/by-book?book=${encodeURIComponent(selectedBook)}`)
      .then(r => r.json())
      .then(d => setAudioTracks(d.audio || []))
      .catch(() => setAudioTracks([]))
  }, [selectedBook])

  // ── Phrase mode ──
  useEffect(() => { setHistory(loadHistory(level)) }, [level])
  useEffect(() => { if (mode === 'phrases') loadSentences() }, [level, mode])

  async function loadSentences() {
    setLoading(true)
    try {
      const resp = await fetch(`${API_URL}/api/speaking/phrases?level=${level}&limit=9`)
      if (resp.ok) {
        let data = await resp.json()
        data = (Array.isArray(data) ? data : data.data || []).filter((p: any) => {
          const wc = (p.text || '').split(/\s+/).filter(Boolean).length
          return wc >= limit.min && wc <= limit.max
        })
        setSentences(data.slice(0, 9))
        setCurrentSet(0)
        setRecordings([])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const setPhrases = sentences.slice(currentSet * 3, currentSet * 3 + 3)

  useEffect(() => {
    if (setPhrases.length > 0) {
      setRefWaveform(generateReferenceWaveform(setPhrases.map((p: any) => p.text).join(' ')))
    }
  }, [setPhrases])

  // ── Audio Track Player ──
  const playTrack = useCallback((track: any) => {
    setSelectedTrack(track)
    if (audioRef.current) {
      audioRef.current.src = `${API_URL}${track.path}`
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setAudioPlaying(true)
    }
  }, [])

  const playingRef = useRef(false)

  const toggleAudioPlayback = useCallback(() => {
    if (!audioRef.current || !selectedTrack) return
    if (audioRef.current.paused) {
      audioRef.current.play()
      setAudioPlaying(true)
      playingRef.current = true
    } else {
      audioRef.current.pause()
      setAudioPlaying(false)
      playingRef.current = false
    }
  }, [selectedTrack])

  const seekAudio = useCallback((delta: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + delta))
  }, [])

  const setAudioTime = useCallback((t: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = t
  }, [])

  // ── Recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : 'audio/mp4'
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const id = ++recIdCounter.current
        const url = URL.createObjectURL(blob)
        setRecordings(prev => [...prev, { id, blob, url, result: null, waveform: null }])
        decodeAudioBlob(blob).then(wf => {
          setRecordings(prev => prev.map(r => r.id === id ? { ...r, waveform: wf } : r))
        }).catch(() => {})
        setSelectedRec(id)
        if (mode === 'phrases') {
          const expected = setPhrases.map((p: any) => p.text).join(' ')
          analyzeAudio(blob, expected, id)
        } else if (selectedTrack) {
          const expected = selectedTrack.name ? selectedTrack.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').trim() : ''
          analyzeAudio(blob, expected, id)
        }
      }
      mr.start()
      setRecording(true)
      setRecordingPaused(false)
    } catch {
      alert('Mikrofonzugriff verweigert.')
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setRecordingPaused(true)
    }
  }

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setRecordingPaused(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setRecording(false)
    setRecordingPaused(false)
  }

  const analyzeAudio = async (blob: Blob, expected: string, recId: number) => {
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      const expectedText = expected || (mode === 'audio' && selectedTrack ? (selectedTrack.name || '') : '')
      formData.append('expected_text', expectedText)
      const isAudioMode = mode === 'audio' && selectedTrack?.path
      if (isAudioMode) {
        const ref = selectedTrack.path.replace(/^\/audio\//, '')
        formData.append('ref_audio', ref)
      }
      const resp = await fetch(`${API_URL}/api/speaking/analyze`, { method: 'POST', body: formData })
      if (!resp.ok) { setAnalyzing(false); return }
      const reader = resp.body?.getReader()
      if (!reader) { setAnalyzing(false); return }
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() || ''
        for (const line of parts) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.status === 'done' && data.result) {
                const r = data.result
                const entry = {
                  expected,
                  spoken: r.transcribed || '',
                  score: r.combined_score || r.accuracy,
                  accuracy: r.text_accuracy || 0,
                  intonation_score: r.intonation?.score || 0,
                  rhythm_score: r.rhythm_score || 0,
                  feedback: r.feedback || [],
                  word_timings: r.word_timings || [],
                }
                setRecordings(prev => prev.map(r => r.id === recId ? { ...r, result: entry } : r))
                saveHistory(level, { ...entry, setIndex: currentSet, phrases: setPhrases })
                setHistory(loadHistory(level))
              }
            } catch {}
          }
        }
      }
    } catch (e) { console.error(e) }
    setAnalyzing(false)
  }

  const evaluateAll = async () => {
    const pending = recordings.filter(r => !r.result)
    if (pending.length === 0) return
    const expected = setPhrases.map((p: any) => p.text).join(' ')
    for (const rec of pending) {
      await analyzeAudio(rec.blob, expected, rec.id)
    }
  }

  const clearRecording = (id: number) => {
    const rec = recordings.find(r => r.id === id)
    if (rec) URL.revokeObjectURL(rec.url)
    setRecordings(prev => {
      const next = prev.filter(r => r.id !== id)
      if (selectedRec === id) setSelectedRec(next.length > 0 ? next[next.length - 1].id : null)
      return next
    })
  }

  const [speaking, setSpeaking] = useState(false)
  const [ttsVoice, setTtsVoice] = useState('thorsten')
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)

  const speakPhrase = async (text: string) => {
    try {
      const resp = await fetch(`${API_URL}/api/tts?text=${encodeURIComponent(text)}&voice=${ttsVoice}`)
      if (!resp.ok) throw new Error('TTS failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      ttsAudioRef.current = audio
      setSpeaking(true)
      audio.play()
    } catch {
      setSpeaking(false)
    }
  }

  const stopSpeaking = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current = null
    }
    setSpeaking(false)
  }

  const totalSets = Math.ceil(sentences.length / 3)
  const activeRec = recordings.find(r => r.id === selectedRec) || recordings[recordings.length - 1] || null

  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="size-4" /> Zurück
        </button>
        <div className="flex items-center gap-3">
          <Mic className="size-6 text-pink-600" />
          <h2 className="text-lg font-bold">Sprechtraining</h2>
          <Badge variant="secondary">{level}</Badge>
          <div className="flex gap-1 ml-2">
            <button onClick={() => setMode('phrases')}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${mode === 'phrases' ? 'bg-pink-600 text-white' : 'bg-muted hover:bg-muted/80'}`}>Sätze</button>
            <button onClick={() => setMode('audio')}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${mode === 'audio' ? 'bg-pink-600 text-white' : 'bg-muted hover:bg-muted/80'}`}>Audio</button>
          </div>
          <button onClick={() => setHistoryOpen(!historyOpen)} className="ml-auto p-2 rounded-lg hover:bg-muted transition-colors" title="Verlauf">
            <History className="size-4" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {LEVELS.map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${level === l ? 'bg-pink-600 text-white' : 'bg-muted hover:bg-muted/80'}`}>{l}</button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Volume2 className="size-3" />
            <select value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}
              className="h-6 text-xs rounded border bg-background px-1.5">
              <option value="thorsten">Thorsten (high)</option>
              <option value="eva">Eva (low)</option>
            </select>
          </div>
        </div>

        {historyOpen && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><History className="size-4" /> Verlauf — {level} <Badge variant="outline" className="text-[9px]">{history.length} Versuche</Badge></CardTitle></CardHeader>
            <CardContent className="max-h-64 overflow-y-auto space-y-2">
              {history.length === 0 ? <p className="text-xs text-muted-foreground">Noch keine Versuche</p> : history.map((h: any, i: number) => (
                <div key={i} className="text-xs p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${(h.score || 0) >= 70 ? 'text-green-600' : (h.score || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{h.score}/100</span>
                    {h.intonation_score ? <span className="text-[9px] text-muted-foreground">Intonation: {h.intonation_score}</span> : null}
                    {h.rhythm_score ? <span className="text-[9px] text-muted-foreground">Rhythmus: {h.rhythm_score}</span> : null}
                    <span className="text-[9px] text-muted-foreground ml-auto">{new Date(h.timestamp).toLocaleDateString()}</span>
                  </div>
                  {h.expected && <p className="text-muted-foreground truncate">Erwartet: {h.expected.replace(/={3,}.*?={3,}/g, '').replace(/START PAGE \d+/g, '').trim()}</p>}
                  <p className="truncate">Gesprochen: {h.spoken.replace(/={3,}.*?={3,}/g, '').replace(/START PAGE \d+/g, '').trim()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {mode === 'audio' ? (
          <>
            {/* Audio mode: Book & Track selector */}
            <Card className="border-indigo-200 dark:border-indigo-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="size-4 text-indigo-600" /> Original Audio auswählen</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <select value={selectedBook} onChange={e => { setSelectedBook(e.target.value); setSelectedTrack(null); setRecordings([]) }}
                    className="flex-1 text-xs h-8 rounded border bg-background px-2">
                    <option value="">— Buch wählen —</option>
                    {books.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                {selectedBook && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {audioTracks.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground py-2">Keine Audiospuren für dieses Buch</p>
                    ) : (
                      audioTracks.map((t: any, i: number) => (
                        <button key={i}
                          onClick={() => playTrack(t)}
                          className={`w-full text-left flex items-center gap-2 p-1.5 rounded text-[10px] transition-colors ${selectedTrack?.path === t.path ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-1 ring-indigo-300' : 'hover:bg-muted'}`}>
                          <Play className={`size-2.5 shrink-0 ${selectedTrack?.path === t.path && audioPlaying ? 'text-green-500' : 'text-muted-foreground'}`} />
                          <span className="font-mono shrink-0">{t.cd_num ? `CD${t.cd_num}` : ''}{t.track_num ? ` T${t.track_num}` : ''}</span>
                          <span className="truncate">{t.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audio mode: Player with fine seek controls */}
            {selectedTrack && (
              <Card className="border-indigo-200 dark:border-indigo-800">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Volume2 className="size-4 text-indigo-600" /> {selectedTrack.name}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1 justify-center">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => seekAudio(-5)} title="-5s"><SkipBack className="size-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => seekAudio(-1)} title="-1s"><span className="text-[9px] font-bold">−1s</span></Button>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-full" onClick={toggleAudioPlayback}>
                      {audioPlaying ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => seekAudio(1)} title="+1s"><span className="text-[9px] font-bold">+1s</span></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => seekAudio(5)} title="+5s"><SkipForward className="size-3.5" /></Button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="min-w-[3rem] text-right">{formatTime(audioCurrentTime)}</span>
                    <input type="range" min={0} max={audioDuration || 1} step={0.01} value={audioCurrentTime}
                      onChange={e => setAudioTime(parseFloat(e.target.value))}
                      className="flex-1 h-1 appearance-none bg-muted-foreground/20 rounded-full cursor-pointer accent-indigo-500" />
                    <span className="min-w-[3rem]">{formatTime(audioDuration)}</span>
                  </div>

                  <audio ref={audioRef} preload="auto"
                    onTimeUpdate={() => { if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime) }}
                    onLoadedMetadata={() => { if (audioRef.current) setAudioDuration(audioRef.current.duration) }}
                    onEnded={() => setAudioPlaying(false)}
                    onPlay={() => setAudioPlaying(true)}
                    onPause={() => setAudioPlaying(false)} />
                </CardContent>
              </Card>
            )}

            {/* Audio mode: Recording controls (works alongside audio player) */}
            {selectedTrack && (
              <Card className="border-pink-200 dark:border-pink-800">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Mic className="size-4 text-pink-600" /> Aufnahme</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    {!recording ? (
                      <Button onClick={startRecording} className="bg-pink-600 hover:bg-pink-700 gap-2 h-10">
                        <Mic className="size-5" /> Aufnahme starten
                      </Button>
                    ) : (
                      <>
                        <Button onClick={recordingPaused ? resumeRecording : pauseRecording}
                          className={recordingPaused ? 'bg-emerald-600 hover:bg-emerald-700 gap-1 h-10' : 'bg-amber-600 hover:bg-amber-700 gap-1 h-10'}>
                          {recordingPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                          {recordingPaused ? 'Fortsetzen' : 'Pause'}
                        </Button>
                        <Button onClick={stopRecording} variant="destructive" className="gap-1 h-10">
                          <Square className="size-4" /> Stop
                        </Button>
                      </>
                    )}
                  </div>
                  {recording && (
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full ${recordingPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
                      <span className="text-muted-foreground">{recordingPaused ? 'Pausiert' : 'Aufnahme läuft...'}</span>
                      {recordingPaused && <span className="text-[9px] text-muted-foreground">(MP3 weiterhören, dann fortsetzen)</span>}
                    </div>
                  )}

                  {recordings.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      <p className="text-[10px] font-medium text-muted-foreground">Deine Aufnahmen</p>
                      {recordings.map((rec, i) => (
                        <div key={rec.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selectedRec === rec.id ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300' : 'bg-muted/30 border-transparent'}`}
                          onClick={() => setSelectedRec(rec.id)}>
                          <span className="text-xs font-bold text-muted-foreground min-w-[1.5rem]">#{i + 1}</span>
                          <button onClick={(e) => { e.stopPropagation(); togglePreview(rec) }} className="p-1.5 rounded-full hover:bg-indigo-100">
                            {previewPlaying && previewRecId === rec.id ? <Square className="size-3 text-red-500" /> : <Play className="size-3 text-indigo-600" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); clearRecording(rec.id) }} className="p-1.5 rounded-full hover:bg-red-100"><Trash2 className="size-3 text-red-500" /></button>
                          {rec.result && (
                            <span className={`text-xs font-bold ${rec.result.score >= 70 ? 'text-green-600' : rec.result.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{rec.result.score}</span>
                          )}
                          <span className="text-[9px] text-muted-foreground ml-auto">{(rec.blob.size / 1024).toFixed(0)} KB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Waveform comparison */}
            {selectedTrack && activeRec?.waveform && (
              <Card className="border-indigo-200 dark:border-indigo-800">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Volume2 className="size-4 text-indigo-600" /> Wellenform-Vergleich</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Waveform data={activeRec.waveform} color="rgb(99, 102, 241)" />
                </CardContent>
              </Card>
            )}

            {/* Evaluate */}
            {selectedTrack && recordings.some(r => !r.result) && recordings.length > 0 && (
              <div className="flex justify-center">
                <Button onClick={() => recordings.filter(r => !r.result).forEach(r => analyzeAudio(r.blob, selectedTrack.name || '', r.id))} disabled={analyzing} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  <BarChart3 className="size-4" /> {analyzing ? 'Analysiere...' : 'Bewerten'}
                </Button>
              </div>
            )}

            {/* Audio mode: Result display */}
            {activeRec?.result && (
              <Card className="border-indigo-200 dark:border-indigo-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-5 text-indigo-600" /> Bewertung
                    <span className={`text-2xl font-bold ${activeRec.result.score >= 70 ? 'text-green-600' : activeRec.result.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{activeRec.result.score}/100</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.accuracy || '-'}</p><p className="text-muted-foreground">Textgenauigkeit</p></div>
                    <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.intonation_score || '-'}</p><p className="text-muted-foreground">Intonation</p></div>
                    <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.rhythm_score || '-'}</p><p className="text-muted-foreground">Rhythmus</p></div>
                    <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.word_timings?.length || 0}</p><p className="text-muted-foreground">Wörter erkannt</p></div>
                  </div>
                  {activeRec.result.feedback?.length > 0 && (
                    <ul className="space-y-1">{activeRec.result.feedback.map((fb: string, i: number) => (
                      <li key={i} className="text-xs flex gap-2"><span className="text-indigo-600 shrink-0">•</span><span>{fb}</span></li>
                    ))}</ul>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          /* ── Phrase mode (existing) ── */
          <>
            {loading && sentences.length === 0 ? <div className="text-center py-20 text-muted-foreground">Lade Sätze...</div> : setPhrases.length > 0 ? (
              <>
                {recordings.length > 0 && (
                  <Card className="border-indigo-200 dark:border-indigo-800">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Volume2 className="size-4 text-indigo-600" /> Aufnahmen ({recordings.length})</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {recordings.map((rec, i) => (
                          <div key={rec.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selectedRec === rec.id ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300' : 'bg-muted/30 border-transparent'}`}
                            onClick={() => setSelectedRec(rec.id)}>
                            <span className="text-xs font-bold text-muted-foreground min-w-[1.5rem]">#{i + 1}</span>
                            <button onClick={(e) => { e.stopPropagation(); togglePreview(rec) }} className="p-1.5 rounded-full hover:bg-indigo-100">
                              {previewPlaying && previewRecId === rec.id ? <Square className="size-3 text-red-500" /> : <Play className="size-3.5 text-indigo-600" />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); clearRecording(rec.id) }} className="p-1.5 rounded-full hover:bg-red-100"><Trash2 className="size-3 text-red-500" /></button>
                            {rec.result && <span className={`text-xs font-bold ${rec.result.score >= 70 ? 'text-green-600' : rec.result.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{rec.result.score}</span>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-pink-200 dark:border-pink-800">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Volume2 className="size-4 text-pink-600" /> Wellenform-Vergleich</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <Waveform data={refWaveform} color="rgb(219, 39, 119)" />
                    <div className="border-t border-muted pt-3">
                      {activeRec ? (
                        <div className="space-y-2">
                          <Waveform data={activeRec.waveform} color="rgb(99, 102, 241)" />
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => new Audio(activeRec.url).play()} className="gap-1 text-xs h-7">
                              <Play className="size-3" /> Abspielen
                            </Button>
                            <span className="text-[9px] text-muted-foreground">{(activeRec.blob.size / 1024).toFixed(0)} KB</span>
                          </div>
                        </div>
                      ) : recording ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse"><span className="w-2 h-2 rounded-full bg-red-500" /> Aufnahme läuft...</div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">Nimm deine Stimme auf, um die Wellenform zu sehen</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-pink-200 dark:border-pink-800 ${recording ? 'ring-2 ring-red-400' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-sm"><Volume2 className="size-4 text-pink-600" /> Satz-Set {currentSet + 1} — Sprich diese Sätze:</CardTitle>
                      {speaking && (
                        <button onClick={stopSpeaking} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-red-100 dark:bg-red-900/40 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors">
                          <Square className="size-3" /> Sprechen stoppen
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {setPhrases.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <span className="w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-900 text-pink-600 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{p.text}</p>
                          <p className="text-[10px] text-muted-foreground">{(p.text || '').split(/\s+/).filter(Boolean).length} Wörter</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {speaking ? (
                            <button onClick={stopSpeaking} className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0" title="Stopp">
                              <Square className="size-4 text-red-600" />
                            </button>
                          ) : (
                            <button onClick={() => speakPhrase(p.text)} className="p-2 rounded-full hover:bg-pink-100 dark:hover:bg-pink-900 shrink-0" title="Abspielen">
                              <Play className="size-4 text-pink-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-center gap-4 pt-2">
                      {!recording ? (
                        <>
                          <Button onClick={startRecording} className="bg-pink-600 hover:bg-pink-700 gap-2"><Mic className="size-5" /> Aufnehmen</Button>
                          {recordings.some(r => !r.result) && (
                            <Button onClick={evaluateAll} disabled={analyzing} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                              <BarChart3 className="size-4" /> {analyzing ? 'Analysiere...' : 'Bewerten'}
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button onClick={recordingPaused ? resumeRecording : pauseRecording}
                            className={recordingPaused ? 'bg-emerald-600 hover:bg-emerald-700 gap-1' : 'bg-amber-600 hover:bg-amber-700 gap-1'}>
                            {recordingPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                            {recordingPaused ? 'Fortsetzen' : 'Pause'}
                          </Button>
                          <Button onClick={stopRecording} variant="destructive" className="gap-1"><Square className="size-4" /> Stop</Button>
                        </div>
                      )}
                    </div>
                    {recording && (
                      <div className="flex items-center justify-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${recordingPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
                        <span className="text-muted-foreground">{recordingPaused ? 'Pausiert' : 'Aufnahme läuft...'}</span>
                      </div>
                    )}
                    {activeRec?.result?.spoken && (() => {
                      const clean = activeRec.result.spoken
                        .replace(/={3,}.*?={3,}/g, '')
                        .replace(/START PAGE \d+/g, '')
                        .replace(/Schritt \w+,?/g, '')
                        .trim()
                      if (!clean) return null
                      return (
                        <div className="p-4 rounded-lg bg-gradient-to-r from-muted to-muted/50 border border-border/50">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Transkription</p>
                          <p className="text-sm font-medium">{clean}</p>
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>

                <div className="flex justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => { setCurrentSet(s => Math.max(0, s - 1)); setRecordings([]); setSelectedRec(null) }} disabled={currentSet === 0}>← Vorheriges Set</Button>
                  <span className="text-xs text-muted-foreground self-center">{currentSet + 1} / {totalSets}</span>
                  <Button variant="outline" size="sm" onClick={() => { setCurrentSet(s => Math.min(totalSets - 1, s + 1)); setRecordings([]); setSelectedRec(null) }} disabled={currentSet >= totalSets - 1}>Nächstes Set →</Button>
                </div>

                {analyzing && <div className="text-center py-6 text-muted-foreground animate-pulse">Analysiere Aufnahme...</div>}

                {activeRec?.result && (
                  <Card className="border-indigo-200 dark:border-indigo-800">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="size-5 text-indigo-600" /> Bewertung
                        <span className={`text-2xl font-bold ${activeRec.result.score >= 70 ? 'text-green-600' : activeRec.result.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{activeRec.result.score}/100</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.accuracy || '-'}</p><p className="text-muted-foreground">Textgenauigkeit</p></div>
                        <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.intonation_score || '-'}</p><p className="text-muted-foreground">Intonation</p></div>
                        <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.rhythm_score || '-'}</p><p className="text-muted-foreground">Rhythmus</p></div>
                        <div className="p-3 rounded bg-muted"><p className="font-bold text-lg">{activeRec.result.word_timings?.length || 0}</p><p className="text-muted-foreground">Wörter erkannt</p></div>
                      </div>
                      {(() => {
                        const stripPunct = (s: string) => s.replace(/[.,!?;:()"']/g, '').toLowerCase()
                        const ew = activeRec.result.expected?.split(/\s+/).filter(Boolean) || []
                        const sw = (activeRec.result.spoken || '').split(/\s+/).filter(Boolean)
                        if (ew.length > 0) return (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Wort-für-Wort Vergleich</p>
                            <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-muted/50">{
                              ew.map((w: string, i: number) => {
                                const cleaned = stripPunct(w)
                                const matched = sw.some((s: string) => stripPunct(s) === cleaned)
                                return <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono ${matched ? 'bg-green-100 dark:bg-green-900/40 text-green-700' : 'bg-red-100 dark:bg-red-900/40 text-red-700'}`}>{w}{!matched && <span className="ml-0.5 opacity-60">✗</span>}</span>
                              })
                            }</div>
                          </div>
                        )
                        return null
                      })()}
                      {activeRec.result.feedback?.length > 0 && (
                        <ul className="space-y-1">{activeRec.result.feedback.map((fb: string, i: number) => (
                          <li key={i} className="text-xs flex gap-2"><span className="text-indigo-600 shrink-0">•</span><span>{fb}</span></li>
                        ))}</ul>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-20 text-muted-foreground">
                <Mic className="size-12 mx-auto mb-4 opacity-30" />
                <p>Keine passenden Sätze für Niveau {level} gefunden</p>
                <Button variant="outline" size="sm" onClick={loadSentences} className="mt-3">Erneut versuchen</Button>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
