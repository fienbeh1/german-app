import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Loader2, Play, BarChart3, FileText, Volume2, CheckCircle2, XCircle, Shuffle, Mic, MicOff, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

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
  return <canvas ref={canvasRef} className="w-full h-12 rounded bg-gray-950" width={600} height={48} />
}

function decodeAudio(url: string): Promise<Float32Array> {
  return fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => {
      const ctx = new OfflineAudioContext(1, 1, 44100)
      return ctx.decodeAudioData(buf)
    })
    .then(audioBuf => audioBuf.getChannelData(0))
}

interface SpeakingTestViewProps {
  onBack?: () => void
}

export function SpeakingTestView({ onBack }: SpeakingTestViewProps) {
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [evalResult, setEvalResult] = useState<any | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [waveforms, setWaveforms] = useState<Record<string, Float32Array>>({})
  const [recording, setRecording] = useState<string | null>(null)
  const [recordedBlobs, setRecordedBlobs] = useState<Record<string, Blob>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    setLoading(true)
    fetch(`${API_URL}/api/speaking/test-manifest`)
      .then(r => r.json())
      .then(d => { setFiles(d.files || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    files.forEach(f => {
      if (!waveforms[f.file]) {
        decodeAudio(`${API_URL}${f.url}`).then(w => setWaveforms(prev => ({ ...prev, [f.file]: w }))).catch(() => {})
      }
    })
  }, [files])

  const startRecording = useCallback(async (fileId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setRecordedBlobs(prev => ({ ...prev, [fileId]: blob }))
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.start()
      setRecording(fileId)
    } catch { alert('Mikrofonzugriff verweigert') }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setRecording(null)
  }, [])

  const selectFile = useCallback((file: any) => {
    setSelected(file)
    setEvalResult(null)
  }, [])

  const playOriginal = useCallback(async (file: any) => {
    try {
      const resp = await fetch(`${API_URL}/api/audio/find?book=${encodeURIComponent(file.book)}&cd=${encodeURIComponent(file.cd)}&track=${encodeURIComponent(file.track)}`)
      const data = await resp.json()
      if (data.url) {
        const audio = new Audio(data.url)
        audio.play()
      }
    } catch {}
  }, [])

  const runEvaluation = useCallback(async () => {
    if (!selected) return
    setEvaluating(true)
    setEvalResult(null)
    try {
      const blob = recordedBlobs[selected.file]
      if (!blob) { setEvaluating(false); return }
      const formData = new FormData()
      formData.append('audio', blob, `${selected.file}.webm`)
      formData.append('expected_text', selected.tts_text)

      const resp = await fetch(`${API_URL}/api/speaking/analyze`, {
        method: 'POST',
        body: formData,
      })

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No reader')
      const decoder = new TextDecoder()
      let buf = ''
      let result: any = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          const m = line.match(/^data: (.+)$/)
          if (!m) continue
          try {
            const data = JSON.parse(m[1])
            if (data.status === 'done') result = data.result
            else if (data.error) throw new Error(data.error)
          } catch {}
        }
      }
      setEvalResult(result)
    } catch (e: any) {
      setEvalResult({ error: e.message })
    }
    setEvaluating(false)
  }, [selected, recordedBlobs])

  const pickRandom = useCallback(() => {
    if (files.length === 0) return
    const idx = Math.floor(Math.random() * files.length)
    selectFile(files[idx])
    setExpanded(files[idx].file)
  }, [files, selectFile])

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-background/80 backdrop-blur shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> Zurück
        </button>
        <BarChart3 className="size-4 text-indigo-500" />
        <span className="text-sm font-medium">Sprechtest — Künstliche MP3s</span>
        <Badge variant="secondary" className="text-xs">{files.length} Dateien</Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={pickRandom}>
          <Shuffle className="size-3" /> Zufällig
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Track grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <BarChart3 className="size-12 mb-4 opacity-30" />
              <p className="text-sm">Keine Test-MP3s gefunden</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {files.map((f) => (
                <Card key={f.file} className={`cursor-pointer transition-all ${selected?.file === f.file ? 'ring-2 ring-indigo-400' : ''}`}>
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" title={f.file}>{f.file.replace('.mp3', '')}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-[8px] px-1">{f.book}</Badge>
                          <Badge variant="outline" className="text-[8px] px-1">{f.cd}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <audio src={`${API_URL}${f.url}`} preload="none" />
                        <button onClick={(e) => { e.stopPropagation(); new Audio(`${API_URL}${f.url}`).play() }}
                          className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-800/60"
                        ><Play className="size-3 text-indigo-600 ml-0.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); selectFile(f); setExpanded(expanded === f.file ? null : f.file) }}
                          className="text-[10px] text-indigo-600 hover:underline shrink-0"
                        >Detail</button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-1" onClick={() => { selectFile(f); setExpanded(expanded === f.file ? null : f.file) }}>
                    {waveforms[f.file] && <Waveform data={waveforms[f.file]} color="#818cf8" />}
                    <p className="text-[9px] text-muted-foreground line-clamp-2">{f.tts_text}</p>

                    {expanded === f.file && (
                      <div className="space-y-2 pt-1 border-t border-border/50">
                        {/* Original text */}
                        {f.original_text && (
                          <div>
                            <p className="text-[9px] font-medium text-muted-foreground">Original Text</p>
                            <p className="text-[10px] whitespace-pre-wrap max-h-16 overflow-y-auto">{f.original_text}</p>
                          </div>
                        )}

                        {/* Record button */}
                        <div className="flex items-center gap-2">
                          {recording === f.file ? (
                            <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); stopRecording() }}>
                              <MicOff className="size-3" /> Aufnahme stoppen
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); startRecording(f.file) }}>
                              <Mic className="size-3" /> Aufnehmen
                            </Button>
                          )}
                        </div>

                        {/* Play recorded */}
                        {recordedBlobs[f.file] && (
                          <div className="flex items-center gap-2">
                            <audio controls className="h-7 w-full" src={URL.createObjectURL(recordedBlobs[f.file])} />
                          </div>
                        )}

                        {/* Evaluate recorded */}
                        {recordedBlobs[f.file] && (
                          <Button size="sm" className="h-7 text-xs gap-1 w-full" onClick={(e) => { e.stopPropagation(); selectFile(f); runEvaluation() }} disabled={evaluating}>
                            {evaluating ? <Loader2 className="size-3 animate-spin" /> : <BarChart3 className="size-3" />}
                            Auswertung
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Evaluation result for this file */}
                    {selected?.file === f.file && evalResult && (
                      <div className="pt-2 border-t border-border/50 space-y-2">
                        {evalResult.error ? (
                          <p className="text-xs text-red-500">Fehler: {evalResult.error}</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-4 gap-1 text-center">
                              <div className="p-1 rounded bg-muted"><p className="font-bold text-sm">{evalResult.accuracy ?? '-'}</p><p className="text-[8px] text-muted-foreground">MFCC</p></div>
                              <div className="p-1 rounded bg-muted"><p className="font-bold text-sm">{evalResult.intonation?.score ?? '-'}</p><p className="text-[8px] text-muted-foreground">Intonation</p></div>
                              <div className="p-1 rounded bg-muted"><p className="font-bold text-sm">{evalResult.rhythm_score ?? '-'}</p><p className="text-[8px] text-muted-foreground">Rhythmus</p></div>
                              <div className="p-1 rounded bg-muted"><p className="font-bold text-sm">{evalResult.text_accuracy ?? '-'}</p><p className="text-[8px] text-muted-foreground">Text</p></div>
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                              <Volume2 className="size-2.5" /> Transkribiert <Badge variant="outline" className="text-[7px]">{evalResult.duration}s</Badge>
                            </div>
                            <div className="text-[10px] p-1.5 rounded bg-muted/50 max-h-12 overflow-y-auto">{evalResult.transcribed || '—'}</div>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
