import { useState, useRef } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Volume2, FileText, Gauge } from 'lucide-react'

interface AudioFile {
  name: string
  path: string
  cd: string
  track: string
  description: string
  original?: string
}

interface AudioPlayerProps {
  files: AudioFile[]
  title?: string
  transcripts?: Record<string, string>
}

const API_URL = import.meta.env.VITE_API_URL || ''
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function AudioPlayer({ files, title, transcripts }: AudioPlayerProps) {
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const [speeds, setSpeeds] = useState<Record<string, number>>({})

  if (files.length === 0) return null

  const cdGroups: Record<string, AudioFile[]> = {}
  for (const f of files) {
    const key = f.cd || '1'
    if (!cdGroups[key]) cdGroups[key] = []
    cdGroups[key].push(f)
  }

  const setAudioRef = (key: string, el: HTMLAudioElement | null) => {
    if (el) audioRefs.current.set(key, el)
  }

  const changeSpeed = (key: string) => {
    const el = audioRefs.current.get(key)
    if (!el) return
    const current = speeds[key] || 1
    const idx = SPEEDS.indexOf(current)
    const next = SPEEDS[(idx + 1) % SPEEDS.length]
    el.playbackRate = next
    setSpeeds(prev => ({ ...prev, [key]: next }))
  }

  return (
    <div className="space-y-3">
      {title && (
        <h4 className="font-medium text-sm flex items-center gap-1">
          <Volume2 className="size-3 text-primary" />
          {title}
        </h4>
      )}
      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {Object.entries(cdGroups).map(([cd, group]) => (
          <div key={cd}>
            {Object.keys(cdGroups).length > 1 && (
              <p className="text-xs text-muted-foreground font-medium sticky top-0 bg-background/80 backdrop-blur py-1">CD {cd}</p>
            )}
            <div className="space-y-1">
              {group.map((f, i) => {
                const key = `${cd}-${i}`
                const isExpanded = expandedTranscript === key
                const speed = speeds[key] || 1
                return (
                  <div key={i} className="glass rounded-lg p-2 space-y-1 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <audio
                        ref={el => setAudioRef(key, el)}
                        controls
                        className="flex-1 min-w-0 h-8"
                        src={`${API_URL}${f.path}`}
                        preload="none"
                      />
                      {f.track && <Badge variant="outline" className="text-[10px] shrink-0">T{f.track}</Badge>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">{f.description || f.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] gap-1"
                          onClick={() => changeSpeed(key)}
                        >
                          <Gauge className="size-3" />
                          {speed}x
                        </Button>
                        {transcripts?.[key] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[10px]"
                            onClick={() => setExpandedTranscript(isExpanded ? null : key)}
                          >
                            <FileText className="size-3 mr-1" />
                            Hörtext
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && transcripts?.[key] && (
                      <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap leading-relaxed">
                        {transcripts[key]}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
