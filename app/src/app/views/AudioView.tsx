import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { api } from '../../lib/api'
import { GlassCard } from '../components/GlassCard'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import {
  Headphones, Loader2, ArrowLeft, Search, RefreshCw,
  Play, Pause, FileText, Languages, ChevronDown, ChevronRight,
  BookOpen
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

interface AudioViewProps {
  appState: any
}

type BookEntry = {
  id: string
  name: string
  pdfCount?: number
  audioFileCount?: number
}

type AudioTrack = {
  id?: string | number
  name: string
  audio_url: string
  cd?: string
  track?: string
  transcription_content?: string | null
  translation_content?: string | null
}

const API_URL = import.meta.env.VITE_API_URL || ''
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

function normalizeBookName(name: string) {
  return name.split('/').pop() || name
}

function getInitials(name: string) {
  return normalizeBookName(name)
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??'
}

export function AudioView({ appState }: AudioViewProps) {
  const [books, setBooks] = useState<BookEntry[]>([])
  const [bookSearch, setBookSearch] = useState('')
  const [selectedBook, setSelectedBook] = useState<BookEntry | null>(null)
  const [tracks, setTracks] = useState<AudioTrack[]>([])
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [activeTrackId, setActiveTrackId] = useState<string | number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showTranscription, setShowTranscription] = useState<Record<string, boolean>>({})

  const audioRef = useRef<HTMLAudioElement>(null)

  const filteredBooks = useMemo(() => {
    const query = bookSearch.trim().toLowerCase()
    if (!query) return books
    return books.filter((b) => b.name.toLowerCase().includes(query))
  }, [books, bookSearch])

  function getBookColor(index: number) {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-emerald-500 to-emerald-600',
      'from-purple-500 to-purple-600',
      'from-amber-500 to-orange-500',
      'from-pink-500 to-rose-500',
      'from-cyan-500 to-teal-500',
      'from-indigo-500 to-violet-600',
      'from-red-500 to-red-600',
    ]
    return colors[index % colors.length]
  }

  async function loadBooks() {
    setLoadingBooks(true)
    setError(null)
    try {
      const data = await api.getBooks()
      const withAudio = data.filter((b: any) => (b.audioFileCount || 0) > 0)
      setBooks(withAudio)
    } catch {
      const fallback = Array.isArray(appState?.realBooks) ? appState.realBooks : []
      if (fallback.length > 0) {
        setBooks(fallback.map((b: any) => ({
          id: String(b.id),
          name: b.name,
          pdfCount: b.pdfCount,
          audioFileCount: b.audioFileCount,
        })))
      } else {
        setError('Bücher konnten nicht geladen werden')
      }
    } finally {
      setLoadingBooks(false)
    }
  }

  async function loadTracks(book: BookEntry) {
    setSelectedBook(book)
    setTracks([])
    setTrackError(null)
    setLoadingTracks(true)
    setActiveTrackId(null)
    setIsPlaying(false)
    setShowTranscription({})
    try {
      const data = await api.getAudio(book.id)
      const raw: AudioTrack[] = (data.audio || []).map((item: any) => ({
        id: item.id,
        name: item.name || item.file_name || '',
        audio_url: item.audio_url || item.path || '',
        cd: item.cd || '',
        track: item.track || '',
        transcription_content: item.transcription_content || null,
        translation_content: item.translation_content || null,
      }))

      const seen = new Set<string>()
      const unique: AudioTrack[] = []
      for (const t of raw) {
        if (t.name && !seen.has(t.name)) {
          seen.add(t.name)
          unique.push(t)
        }
      }

      unique.sort((a, b) => {
        const cdA = parseInt(a.cd) || 999
        const cdB = parseInt(b.cd) || 999
        if (cdA !== cdB) return cdA - cdB
        return (parseInt(a.track) || 0) - (parseInt(b.track) || 0)
      })

      setTracks(unique)
      if (unique.length === 0) {
        setTrackError('Keine Audiodateien für dieses Buch gefunden')
      }
    } catch {
      setTrackError('Audiodateien konnten nicht geladen werden')
    } finally {
      setLoadingTracks(false)
    }
  }

  const playTrack = useCallback((track: AudioTrack) => {
    if (!audioRef.current) return
    const audioSrc = track.audio_url
      ? `${API_URL}${track.audio_url.startsWith('/') ? '' : '/'}${track.audio_url}`
      : ''
    if (!audioSrc) return
    audioRef.current.src = audioSrc
    audioRef.current.playbackRate = speed
    audioRef.current.play().then(() => {
      setIsPlaying(true)
      setActiveTrackId(track.id ?? track.name)
    }).catch(() => setIsPlaying(false))
  }, [speed])

  const togglePlayPause = useCallback((track: AudioTrack) => {
    if (!audioRef.current) return
    if (activeTrackId === (track.id ?? track.name)) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
    } else {
      playTrack(track)
    }
  }, [activeTrackId, isPlaying, playTrack])

  const changeSpeed = useCallback((newSpeed: number) => {
    setSpeed(newSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed
    }
  }, [])

  const toggleTranscription = (trackId: string | number | undefined) => {
    if (trackId === undefined) return
    setShowTranscription(prev => ({ ...prev, [String(trackId)]: !prev[String(trackId)] }))
  }

  const groupedTracks = useMemo(() => {
    const groups: Record<string, AudioTrack[]> = {}
    for (const t of tracks) {
      const cdNum = parseInt(t.cd)
      const key = !isNaN(cdNum) && cdNum > 0 ? `CD ${cdNum}` : 'Andere'
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }
    return Object.entries(groups)
      .map(([cd, items]) => ({ cd, items }))
      .sort((a, b) => {
        const aNum = parseInt(a.cd.replace('CD ', '')) || 999
        const bNum = parseInt(b.cd.replace('CD ', '')) || 999
        return aNum - bNum
      })
  }, [tracks])

  const hasLoaded = books.length > 0 || error

  if (!hasLoaded && !loadingBooks) {
    loadBooks()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <audio ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setActiveTrackId(null) }}
        onError={() => setIsPlaying(false)}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">
              Hörverstehen
            </h2>
            {selectedBook ? (
              <Badge variant="secondary" className="text-xs">{tracks.length} Tracks</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">{books.length} Bücher</Badge>
            )}
            <div className="flex-1" />
          </div>

          <AnimatePresence mode="wait">
            {!selectedBook ? (
              <motion.div key="books" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input placeholder="Buch suchen..." className="pl-9 h-9 text-sm" value={bookSearch} onChange={(e) => setBookSearch(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" className="h-9" onClick={loadBooks} disabled={loadingBooks}>
                    {loadingBooks ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
                    Aktualisieren
                  </Button>
                </div>

                {loadingBooks && books.length === 0 ? (
                  <div className="h-64 flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
                ) : error ? (
                  <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Headphones className="size-12 mb-4 opacity-50" />
                    <p className="text-sm">{error}</p>
                    <Button variant="outline" size="sm" onClick={loadBooks} className="mt-3">Erneut versuchen</Button>
                  </div>
                ) : filteredBooks.length === 0 ? (
                  <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Headphones className="size-12 mb-4 opacity-50" />
                    <p className="text-sm">Keine Bücher mit Audio gefunden</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredBooks.map((book: any, i) => {
                      const shortName = normalizeBookName(book.name)
                      return (
                        <motion.div key={book.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                          <div onClick={() => loadTracks(book)} className="cursor-pointer backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border border-white/30 dark:border-white/10 rounded-xl shadow-lg hover:shadow-xl transition-all overflow-hidden">
                            {book.coverUrl ? (
                              <div className="relative w-full aspect-[3/4]">
                                <img src={book.coverUrl} alt={shortName} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                  <p className="text-white text-[10px] font-semibold truncate">{shortName}</p>
                                </div>
                              </div>
                            ) : (
                              <div className={`h-24 bg-gradient-to-br ${getBookColor(i)} flex items-center justify-center`}>
                                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white text-lg font-semibold">
                                  {getInitials(book.name)}
                                </div>
                              </div>
                            )}
                            <div className="p-2 flex items-center justify-between">
                              {!book.coverUrl && <p className="font-medium text-[10px] truncate">{shortName}</p>}
                              {typeof book.audioFileCount === 'number' && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0">{book.audioFileCount}</Badge>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="tracks" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedBook(null); setTracks([]); setTrackError(null); setIsPlaying(false); setActiveTrackId(null) }}>
                    <ArrowLeft className="size-3.5 mr-1" /> Bücher
                  </Button>
                  <div className="flex-1" />
                  {activeTrackId && (
                    <div className="flex items-center gap-1 mr-2">
                      <span className="text-[10px] text-muted-foreground mr-1">Geschw.:</span>
                      {SPEEDS.map(s => (
                        <button key={s} onClick={() => changeSpeed(s)}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${speed === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        >{s}x</button>
                      ))}
                    </div>
                  )}
                  <Badge variant="secondary" className="text-xs">{tracks.length} Tracks</Badge>
                </div>

                {loadingTracks ? (
                  <div className="h-64 flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
                ) : trackError ? (
                  <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Headphones className="size-12 mb-4 opacity-50" />
                    <p className="text-sm">{trackError}</p>
                    <Button variant="outline" size="sm" onClick={() => loadTracks(selectedBook)} className="mt-3">Erneut versuchen</Button>
                  </div>
                ) : groupedTracks.length === 0 ? (
                  <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Headphones className="size-12 mb-4 opacity-50" />
                    <p className="text-sm">Keine Audiodateien für dieses Buch gefunden</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h2 className="text-lg font-bold">{normalizeBookName(selectedBook.name)}</h2>
                    {groupedTracks.map((group) => (
                      <div key={group.cd} className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">{group.cd}</h3>
                        <div className="space-y-2">
                          {group.items.map((track, idx) => {
                            const audioSrc = track.audio_url
                              ? `${API_URL}${track.audio_url.startsWith('/') ? '' : '/'}${track.audio_url}`
                              : ''
                            const trackId = track.id ?? track.name
                            const isActive = activeTrackId === trackId
                            const hasTranscription = !!(track.transcription_content || track.translation_content)
                            const transOpen = showTranscription[String(trackId)] ?? false
                            return (
                              <GlassCard key={`${group.cd}-${idx}`} className={`p-0 overflow-hidden transition-all ${isActive ? 'ring-2 ring-primary/30' : ''}`}>
                                <div className="p-3 flex items-center gap-3">
                                  <button onClick={() => togglePlayPause(track)}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                      isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                                    }`}
                                  >
                                    {isActive && isPlaying ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{track.name || `Track ${track.track || idx + 1}`}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {track.track && <Badge variant="outline" className="text-[9px] px-1 py-0">T{track.track}</Badge>}
                                      {hasTranscription && (
                                        <Badge variant="secondary" className="text-[9px] px-1 py-0">Transkription</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {hasTranscription && (
                                      <button onClick={() => toggleTranscription(trackId)}
                                        className="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted"
                                        title="Transkription anzeigen"
                                      >
                                        <FileText className="size-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {audioSrc && (
                                  <div className="px-3 pb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1">
                                        <audio
                                          controls
                                          preload="none"
                                          className="w-full h-8"
                                          src={audioSrc}
                                          ref={isActive ? undefined : undefined}
                                        />
                                      </div>
                                    </div>
                                    {isActive && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <span className="text-[9px] text-muted-foreground">Geschwindigkeit:</span>
                                        {SPEEDS.map(s => (
                                          <button key={s} onClick={() => changeSpeed(s)}
                                            className={`text-[9px] px-1.5 py-0.5 rounded ${
                                              speed === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                                            }`}
                                          >{s}x</button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {hasTranscription && transOpen && (
                                  <div className="border-t border-border/50 px-3 py-3 space-y-3 bg-muted/20">
                                    {track.transcription_content && (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                          <Headphones className="size-3" /> Deutsch
                                        </div>
                                        <p className="text-xs whitespace-pre-wrap leading-relaxed">{track.transcription_content}</p>
                                      </div>
                                    )}
                                    {track.translation_content && (
                                      <div className="space-y-1 pt-2 border-t border-border/30">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                          <Languages className="size-3" /> English
                                        </div>
                                        <p className="text-xs whitespace-pre-wrap leading-relaxed">{track.translation_content}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </GlassCard>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
