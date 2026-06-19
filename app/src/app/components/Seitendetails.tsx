import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { InteractiveText } from './InteractiveText'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import {
  ChevronLeft, ChevronRight, ChevronDown, GraduationCap,
  Headphones, FileText, CheckCircle2, Play, Pause, BookOpen,
  Loader2, Volume2, Search, BookMarked, BarChart3, Square, Repeat,
  Zap, PanelRightClose, Trash2, BookmarkCheck
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

const API_URL = import.meta.env.VITE_API_URL || ''
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const formatTime = (s: number) => {
  if (!s || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
const NIVEL_BG: Record<string, string> = {
  A1: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  A2: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  B1: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  B2: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  C1: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
}

interface SeitendetailsProps {
  appState: any
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export function Seitendetails({ appState, sidebarOpen, setSidebarOpen }: SeitendetailsProps) {
  const {
    pageDetail, setPageDetail,
    playingTrack, setPlayingTrack,
    selectedBook, currentPdfIndex: currentPageIdx, setCurrentPdfIndex: setCurrentPageIdx,
    audioRef, isPlaying, setIsPlaying, audioSpeed, setAudioSpeed,
    aiContent, textContent, transkriptionen, loesungen,
    currentAudioTracks, lektionen,
  } = appState

  const audioRefLocal = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loop, setLoop] = useState(false)
  const [showPlayerTranscription, setShowPlayerTranscription] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth] = useState(380)

  const [dictQuery, setDictQuery] = useState('')
  const [dictResults, setDictResults] = useState<any[]>([])
  const [dictLoading, setDictLoading] = useState(false)
  const [verbQuery, setVerbQuery] = useState('')
  const [verbResults, setVerbResults] = useState<any[]>([])
  const [verbLoading, setVerbLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [grammarData, setGrammarData] = useState<any[]>([])
  const [lessonVocab, setLessonVocab] = useState<any[]>([])
  const [lessonStats, setLessonStats] = useState<any[]>([])

  const defaultSections: Record<string, boolean> = {
    player: false, dictionary: false, verbs: false, notes: true,
    txtContent: false, aiContent: false, audio: false, allAudio: false,
    transkription: false, loesungen: false, grammatik: false, ki: false,
    lessonVocab: false, lessonStats: false, sectionJump: false, vocab: false,
  }
  const [sections, setSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_sections')
      if (saved) return { ...defaultSections, ...JSON.parse(saved) }
    } catch {}
    return defaultSections
  })
  useEffect(() => {
    try { localStorage.setItem('sidebar_sections', JSON.stringify(sections)) } catch {}
  }, [sections])
  const toggleSection = (key: string) => setSections(prev => ({ ...prev, [key]: !prev[key] }))
  const isOpen = (key: string) => sections[key] ?? false

  const currentLektion = lektionen?.find((l: any) => currentPageIdx + 1 >= l.page_min && currentPageIdx + 1 <= l.page_max)

  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`bookmarks_${selectedBook?.id}`)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem(`bookmarks_${selectedBook?.id}`, JSON.stringify(bookmarks)) } catch {}
  }, [bookmarks, selectedBook?.id])
  const bookmarkedPages = useMemo(() => Object.entries(bookmarks).map(([p]) => Number(p)).sort((a, b) => a - b), [bookmarks])
  const removeBookmark = useCallback((page: string) => {
    setBookmarks(prev => { const { [page]: _, ...rest } = prev; return rest })
  }, [])

  const searchDict = useCallback(async (q: string) => {
    if (!q.trim()) { setDictResults([]); return }
    setDictLoading(true)
    try {
      const [vocabRes, dictRes] = await Promise.all([
        fetch(`${API_URL}/api/vocab/search?q=${encodeURIComponent(q.trim())}`),
        fetch(`${API_URL}/api/dictionary/search?q=${encodeURIComponent(q.trim())}`),
      ])
      const vocabData = vocabRes.ok ? (await vocabRes.json()).data || [] : []
      const dictData = dictRes.ok ? (await dictRes.json()).data || [] : []
      const combined = [...vocabData, ...dictData]
      const seen = new Set()
      const deduped = combined.filter((e: any) => {
        const key = e.palabra || e.german_word || ''
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setDictResults(deduped.slice(0, 30))
    } catch { setDictResults([]) }
    finally { setDictLoading(false) }
  }, [])

  const searchVerbs = useCallback(async (q: string) => {
    if (!q.trim()) { setVerbResults([]); return }
    setVerbLoading(true)
    try {
      const r = await fetch(`${API_URL}/api/verbs/search?q=${encodeURIComponent(q.trim())}`)
      if (!r.ok) { setVerbResults([]); return }
      const d = await r.json()
      setVerbResults(d.verbs || [])
    } catch { setVerbResults([]) }
    finally { setVerbLoading(false) }
  }, [])

  useEffect(() => {
    if (!selectedBook || !pageDetail) return
    setGrammarData([])
    const pageNum = pageDetail.txt_path?.match(/page=(\d+)/)?.[1]
    if (pageNum) {
      fetch(`${API_URL}/api/grammar?book=${encodeURIComponent(selectedBook.id)}&page=${pageNum}`)
        .then(r => r.json()).then(d => setGrammarData(d.grammar || [])).catch(() => setGrammarData([]))
    }
  }, [selectedBook?.id, pageDetail])

  useEffect(() => {
    try { setNotes(localStorage.getItem(`notes_${selectedBook?.id}_${currentPageIdx}`) || '') } catch {}
  }, [selectedBook?.id, currentPageIdx])
  useEffect(() => {
    try { localStorage.setItem(`notes_${selectedBook?.id}_${currentPageIdx}`, notes) } catch {}
  }, [notes, selectedBook?.id, currentPageIdx])

  useEffect(() => {
    if (!selectedBook || !currentLektion) { setLessonVocab([]); return }
    fetch(`${API_URL}/api/vocabulary?book=${encodeURIComponent(selectedBook.id)}&lektion=${currentLektion.lektion}`)
      .then(r => r.json()).then(d => setLessonVocab(d.vocabulary || [])).catch(() => setLessonVocab([]))
  }, [selectedBook?.id, currentLektion?.lektion])

  useEffect(() => {
    if (!selectedBook) return
    fetch(`${API_URL}/api/lesson-stats?book=${encodeURIComponent(selectedBook.id)}`)
      .then(r => r.json()).then(d => setLessonStats(d.lessons || [])).catch(() => setLessonStats([]))
  }, [selectedBook?.id])

  useEffect(() => {
    if (pageDetail?.audio_tracks?.length > 0 && (!pageDetail?.audio_refs || pageDetail.audio_refs.length === 0)) {
      setSections(prev => ({ ...prev, allAudio: true }))
    }
  }, [pageDetail])

  const playTrack = useCallback((track: any) => {
    const au = audioRef?.current || audioRefLocal.current
    if (!au) return
    const src = track.url || track.path || (track.audio_url?.startsWith('http') ? track.audio_url : `${API_URL}${track.audio_url || ''}`)
    if (!src) return
    au.src = src
    au.playbackRate = speed
    au.currentTime = 0
    setCurrentTime(0)
    setDuration(0)
    au.play().then(() => {
      setIsPlaying(true)
      setPlayingTrack(track)
    }).catch(() => setIsPlaying(false))
  }, [speed, audioRef, setIsPlaying, setPlayingTrack])

  const togglePlayPauseLocal = useCallback(() => {
    const au = audioRef?.current || audioRefLocal.current
    if (!au) return
    if (isPlaying) { au.pause(); setIsPlaying(false) }
    else { au.play().catch(() => {}); setIsPlaying(true) }
  }, [isPlaying, audioRef, setIsPlaying])

  const cdGroups: Record<string, any[]> = {}
  for (const t of pageDetail?.audio_tracks || []) {
    const key = t.cd ? `CD ${t.cd}` : 'Audio'
    if (!cdGroups[key]) cdGroups[key] = []
    cdGroups[key].push(t)
  }

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.div
          data-seitendetails
          initial={{ width: sidebarCollapsed ? 36 : sidebarWidth, opacity: 0 }}
          animate={{ width: sidebarCollapsed ? 36 : sidebarWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative bg-background/95 backdrop-blur flex flex-col shrink-0 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:top-auto max-md:max-h-[80vh] max-md:z-50 max-md:bg-background max-md:rounded-t-xl max-md:shadow-2xl max-md:border-t max-md:border-border/50 h-full max-h-[100dvh]"
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
        >
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 transition-all z-20 flex items-center justify-center ${sidebarCollapsed ? 'bg-primary/30 hover:bg-primary/50' : 'bg-transparent hover:bg-primary/20'}`}
            onClick={() => setSidebarCollapsed(false)}
            style={{ width: sidebarCollapsed ? '36px' : '1px' }}
          >
            {sidebarCollapsed && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-primary">
                <ChevronRight className="size-4 rotate-180" />
                <span className="text-[9px] writing-mode-vertical-rl text-center">S I D E B A R</span>
                <ChevronRight className="size-4" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-2 border-b md:hidden">
            <span className="text-xs font-medium">Seitendetails</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 min-h-0" onClick={() => setSidebarOpen(false)}><span className="text-lg">✕</span></Button>
          </div>

          {!sidebarCollapsed && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4 space-y-4">

                {/* ── Now Playing ── */}
                {playingTrack && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('player')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('player') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <Volume2 className="size-3" /> Jetzt spielt
                    </button>
                    {isOpen('player') && (
                      <div className="p-3 rounded bg-muted/50 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]">{playingTrack.cd ? `CD ${playingTrack.cd}` : ''} T{playingTrack.track}</Badge>
                          <span className="text-xs font-medium truncate">{playingTrack.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={togglePlayPauseLocal}
                            className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
                          </button>
                          <button onClick={() => { const au = audioRef?.current || audioRefLocal.current; if (au) { au.pause(); au.currentTime = 0; setIsPlaying(false); setCurrentTime(0) } }}
                            className="w-7 h-7 rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 flex items-center justify-center shrink-0">
                            <Square className="size-3" />
                          </button>
                          <button onClick={() => setLoop(!loop)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${loop ? 'bg-accent-warm/20 text-accent-warm' : 'text-muted-foreground hover:bg-muted'}`}>
                            <Repeat className="size-3" />
                          </button>
                          <div className="flex-1" />
                          <span className="text-[9px] font-mono text-muted-foreground">{formatTime(currentTime)} / {formatTime(duration)}</span>
                        </div>
                        <input type="range" min={0} max={duration || 0} value={currentTime}
                          onChange={e => { const v = parseFloat(e.target.value); const au = audioRef?.current || audioRefLocal.current; if (au) { au.currentTime = v; setCurrentTime(v) } }}
                          className="w-full h-1 appearance-none bg-muted-foreground/20 rounded-full cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary" />
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground">Geschw.:</span>
                          {SPEEDS.map(s => (
                            <button key={s} onClick={() => { setSpeed(s); const au = audioRef?.current || audioRefLocal.current; if (au) au.playbackRate = s }}
                              className={`text-[9px] px-1.5 py-0.5 rounded ${speed === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{s}x</button>
                          ))}
                        </div>
                        {(playingTrack.transcription_content || playingTrack.translation_content) && (
                          <>
                            <button onClick={() => setShowPlayerTranscription(!showPlayerTranscription)}
                              className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground">
                              <FileText className="size-3" /> {showPlayerTranscription ? 'Transkription ausblenden' : 'Transkription anzeigen'}
                            </button>
                            {showPlayerTranscription && (
                              <div className="space-y-2 text-xs border-t border-border/40 pt-2">
                                {playingTrack.transcription_content && (
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Deutsch</p>
                                    <InteractiveText text={playingTrack.transcription_content} />
                                  </div>
                                )}
                                {playingTrack.translation_content && (
                                  <div className="space-y-1 pt-1 border-t border-border/30">
                                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">English</p>
                                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{playingTrack.translation_content}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Quick Dictionary ── */}
                <div className="space-y-2">
                  <button onClick={() => toggleSection('dictionary')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                    {isOpen('dictionary') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <BookOpen className="size-3" /> Wörterbuch
                  </button>
                  {isOpen('dictionary') && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <Input value={dictQuery} onChange={e => setDictQuery(e.target.value)}
                          placeholder="Wort suchen..." className="h-7 text-xs flex-1" onKeyDown={e => { if (e.key === 'Enter') searchDict(dictQuery) }} />
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => searchDict(dictQuery)} disabled={dictLoading}>
                          {dictLoading ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                        </Button>
                      </div>
                      {dictResults.length > 0 && (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {dictResults.map((entry: any, i: number) => (
                            <div key={i} className="text-xs p-2 rounded bg-muted/30 space-y-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-medium">{entry.artikel ? `${entry.artikel} ` : ''}{entry.palabra || entry.wort}</span>
                                {entry.wortart && <Badge variant="outline" className="text-[8px] px-1 py-0">{entry.wortart}</Badge>}
                                {entry.nivel && <span className={`text-[8px] px-1 py-0 rounded ${NIVEL_BG[entry.nivel] || ''}`}>{entry.nivel}</span>}
                              </div>
                              <span className="text-muted-foreground">{entry.traduccion || entry.spanish || ''}</span>
                              {entry.english && <span className="text-[10px] text-muted-foreground block">EN: {entry.english}</span>}
                              {entry.kontext && <span className="text-[10px] text-muted-foreground block italic">"{entry.kontext}"</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {dictQuery && !dictLoading && dictResults.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">Keine Ergebnisse für "{dictQuery}"</p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Quick Verbs ── */}
                <div className="space-y-2">
                  <button onClick={() => toggleSection('verbs')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                    {isOpen('verbs') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <Zap className="size-3" /> Verben
                  </button>
                  {isOpen('verbs') && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <Input value={verbQuery} onChange={e => setVerbQuery(e.target.value)}
                          placeholder="Verb suchen..." className="h-7 text-xs flex-1" onKeyDown={e => { if (e.key === 'Enter') searchVerbs(verbQuery) }} />
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => searchVerbs(verbQuery)} disabled={verbLoading}>
                          {verbLoading ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                        </Button>
                      </div>
                      {verbResults.length > 0 && (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {verbResults.map((verb: any, i: number) => (
                            <div key={i} className="text-xs p-2 rounded bg-muted/30 space-y-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-medium">{verb.infinitiv || verb.german || ''}</span>
                                {verb.rank && <Badge variant="outline" className="text-[8px] px-1 py-0">#{verb.rank}</Badge>}
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                {verb.english && <span>EN: {verb.english}</span>}
                                {verb.spanish && <span>ES: {verb.spanish}</span>}
                                {verb.praesens_ich && <span>ich {verb.praesens_ich}</span>}
                                {verb.praesens_er && <span>er {verb.praesens_er}</span>}
                                {verb.praeteritum && <span>Prät.: {verb.praeteritum}</span>}
                                {verb.partizip_ii && <span>Perf.: {verb.partizip_ii}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {verbQuery && !verbLoading && verbResults.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">Keine Verben gefunden für "{verbQuery}"</p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Notes ── */}
                <div className="space-y-2">
                  <button onClick={() => toggleSection('notes')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                    {isOpen('notes') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <FileText className="size-3" /> Notizen
                  </button>
                  {isOpen('notes') && (
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Notizen zu dieser Seite..."
                      className="w-full h-24 text-xs p-2 rounded border bg-background resize-y focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  )}
                </div>

                {/* ── TXT Content (OCR) ── */}
                {pageDetail?.txt_content && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('txtContent')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('txtContent') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <FileText className="size-3" /> OCR Text
                    </button>
                    {isOpen('txtContent') && (
                      <InteractiveText text={pageDetail.txt_content} />
                    )}
                  </div>
                )}

                {/* ── Visual Dictionary / AI Annotations ── */}
                {pageDetail?.ai_content && (() => {
                  try {
                    const parsed = JSON.parse(pageDetail.ai_content);
                    if (parsed.pairs && Array.isArray(parsed.pairs) && parsed.pairs.length > 0) {
                      return (
                        <div className="space-y-2">
                          <button onClick={() => toggleSection('aiContent')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                            {isOpen('aiContent') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <BookOpen className="size-3 text-accent-warm" /> Bildwörterbuch
                            <Badge variant="outline" className="text-[10px] ml-auto">{parsed.pair_count || parsed.pairs.length}</Badge>
                          </button>
                          {isOpen('aiContent') && (
                            <div className="max-h-80 overflow-y-auto space-y-0.5">
                              {parsed.pairs.map((pair: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50 transition-colors">
                                  <span className="font-medium min-w-[40%]">{pair.german}</span>
                                  <ChevronRight className="size-2.5 text-muted-foreground shrink-0" />
                                  <span className="text-muted-foreground">{pair.english}</span>
                                  {pair.dictionary_english && pair.dictionary_english !== pair.english && (
                                    <span className="text-[9px] text-muted-foreground/50 ml-auto truncate max-w-[30%]" title={pair.dictionary_english}>📖 {pair.dictionary_english}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                  } catch (_) {}
                  return (
                    <div className="space-y-2">
                      <button onClick={() => toggleSection('aiContent')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                        {isOpen('aiContent') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <FileText className="size-3 text-accent-warm" /> AI Annotationen
                      </button>
                      {isOpen('aiContent') && (
                        <InteractiveText text={pageDetail.ai_content} />
                      )}
                    </div>
                  );
                })()}

                {/* ── Audio refs ── */}
                {pageDetail?.audio_refs && pageDetail.audio_refs.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('audio')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('audio') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <Headphones className="size-3" /> Hörübungen <Badge variant="outline" className="text-[10px] ml-auto">{pageDetail.audio_refs.length}</Badge>
                    </button>
                    {isOpen('audio') && pageDetail.audio_refs.map((ref: any, i: number) => (
                      <div key={i} className="p-2 rounded bg-muted/50 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">CD {ref.cd_num} T{ref.track_num}</Badge>
                          <button onClick={() => { const track = pageDetail.audio_tracks?.find((t: any) => t.cd === ref.cd_num && t.track === ref.track_num); if (track) playTrack(track) }}
                            className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Play className="size-3 text-white ml-0.5" />
                          </button>
                        </div>
                        {ref.exercise_text && <p className="text-xs text-muted-foreground">{ref.exercise_text}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── All Audio ── */}
                {pageDetail?.audio_tracks && pageDetail.audio_tracks.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('allAudio')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('allAudio') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <Headphones className="size-3" /> Alle Audios <Badge variant="outline" className="text-[10px] ml-auto">{(() => { const s = new Set<string>(); (pageDetail.audio_tracks || []).forEach((t: any) => s.add(`${t.cd || 0}-${t.track || 0}`)); return s.size })()}</Badge>
                    </button>
                    {isOpen('allAudio') && (() => {
                      const seen = new Set<string>()
                      const unique = pageDetail.audio_tracks.filter((t: any) => {
                        const key = `${t.cd || 0}-${t.track || 0}`
                        if (seen.has(key)) return false
                        seen.add(key)
                        return true
                      })
                      const grouped: Record<number, any[]> = {}
                      unique.forEach((t: any) => {
                        const cd = t.cd || 0
                        if (!grouped[cd]) grouped[cd] = []
                        grouped[cd].push(t)
                      })
                      return (
                        <div className="max-h-80 overflow-y-auto space-y-2">
                          {Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([cd, tracks]) => (
                            <div key={cd} className="space-y-1">
                              <p className="text-[10px] font-semibold text-muted-foreground sticky top-0 bg-background/95 py-1">CD {cd}</p>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                                {tracks.sort((a: any, b: any) => (a.track || 0) - (b.track || 0)).map((t: any) => (
                                  <button key={`${t.cd}-${t.track}-${t.id}`}
                                    onClick={() => playTrack(t)}
                                    className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded transition-colors ${playingTrack?.id === t.id ? 'bg-primary/20 text-primary ring-1 ring-primary/40' : 'bg-muted/50 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground'}`}
                                    title={t.name || `CD ${t.cd} T${t.track}`}>
                                    <Play className="size-2.5 shrink-0" />
                                    <span>T{t.track}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* ── Bookmarks ── */}
                {bookmarkedPages.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('sectionJump')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('sectionJump') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <BookmarkCheck className="size-3 text-amber-500" /> Lesezeichen <Badge variant="outline" className="text-[10px] ml-auto">{bookmarkedPages.length}</Badge>
                    </button>
                    {isOpen('sectionJump') && (
                      <div className="flex flex-wrap gap-1.5">
                        {bookmarkedPages.map(page => (
                          <button key={page}
                            onClick={() => setCurrentPageIdx(page - 1)}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
                          >
                            <BookmarkCheck className="size-3 fill-amber-500" />
                            S. {page}
                            <Trash2 className="size-2.5 ml-0.5 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); removeBookmark(String(page)) }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Lesson Stats ── */}
                {lessonStats.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('lessonStats')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('lessonStats') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <BarChart3 className="size-3" /> Lektions-Statistiken
                    </button>
                    {isOpen('lessonStats') && (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {lessonStats.map((ls: any, i: number) => (
                          <div key={i} className={`flex items-center gap-2 text-xs p-1.5 rounded ${currentLektion?.lektion === ls.lektion ? 'bg-accent-warm/10 ring-1 ring-accent-warm/30' : 'bg-muted/30'}`}>
                            <Badge variant="outline" className="text-[9px] px-1">L{ls.lektion}</Badge>
                            <span className="font-mono">{ls.vocab_count} Wörter</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Lesson Vocabulary ── */}
                {currentLektion && lessonVocab.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('lessonVocab')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('lessonVocab') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <BookMarked className="size-3 text-accent-warm" /> Lektion {currentLektion.lektion} — Vokabeln
                      <Badge className="text-[9px] ml-auto bg-accent-warm/20 text-accent-warm-foreground">{lessonVocab.length}</Badge>
                    </button>
                    {isOpen('lessonVocab') && (
                      <div className="max-h-60 overflow-y-auto space-y-1">
                        {lessonVocab.map((v: any, i: number) => (
                          <div key={i} className="text-xs p-2 rounded bg-muted/50 flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{v.artikel ? <span className="text-emerald-600">{v.artikel} </span> : ''}{v.wort || v.palabra}</span>
                              <span className="text-muted-foreground"> — {v['übersetzung_es'] || v.traduccion || '—'}</span>
                              {v.english && <span className="text-[10px] text-muted-foreground block truncate">EN: {v.english}</span>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {v.nivel && <Badge className={`text-[9px] px-1 py-0 ${NIVEL_BG[v.nivel] || ''}`}>{v.nivel}</Badge>}
                              {v.seite && <Badge variant="outline" className="text-[9px] px-1 py-0">S.{v.seite}</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Page vocabulary ── */}
                {pageDetail?.vocabulary && pageDetail.vocabulary.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('vocab')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('vocab') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <GraduationCap className="size-3" /> Vokabeln
                    </button>
                    {isOpen('vocab') && pageDetail.vocabulary.map((v: any, i: number) => (
                      <div key={i} className="text-xs p-2 rounded bg-muted/50 flex items-start gap-2">
                        <span className="font-medium">{v.artikel ? `${v.artikel} ` : ''}{v.palabra}</span> — {v.traduccion}
                        {v.nivel && <Badge className={`text-[9px] px-1 py-0 ml-auto ${NIVEL_BG[v.nivel] || ''}`}>{v.nivel}</Badge>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Transcriptions ── */}
                {pageDetail?.transkriptionen && pageDetail.transkriptionen.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('transkription')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('transkription') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <FileText className="size-3" /> Transkription Fragmente
                    </button>
                    {isOpen('transkription') && pageDetail.transkriptionen.map((t: any, i: number) => <div key={i} className="text-xs p-2 rounded bg-muted/50"><InteractiveText text={t.inhalt} /></div>)}
                  </div>
                )}

                {/* ── Answers ── */}
                {pageDetail?.loesungen && pageDetail.loesungen.length > 0 && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('loesungen')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('loesungen') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <CheckCircle2 className="size-3" /> Lösungen
                    </button>
                    {isOpen('loesungen') && pageDetail.loesungen.map((l: any, i: number) => <div key={i} className="text-xs p-2 rounded bg-green-50"><InteractiveText text={l.inhalt} /></div>)}
                  </div>
                )}

                {/* ── Grammatik ── */}
                <div className="space-y-2">
                  <button onClick={() => toggleSection('grammatik')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                    {isOpen('grammatik') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <BookMarked className="size-3" /> Grammatik
                    {grammarData.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{grammarData.length}</Badge>}
                  </button>
                  {isOpen('grammatik') && (
                    grammarData.length > 0 ? (
                      <div className="max-h-80 overflow-y-auto space-y-2">
                        {grammarData.map((g: any, i: number) => (
                          <div key={i} className="text-xs p-2 rounded bg-muted/50 space-y-1">
                            {g.page && <span className="text-[10px] font-mono text-muted-foreground">S. {g.page}</span>}
                            <p className="whitespace-pre-wrap leading-relaxed">{g.grammar}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground px-1">Keine Grammatikpunkte für diese Seite</p>
                    )
                  )}
                </div>

                {/* ── KI Analyse ── */}
                {pageDetail?.audio_tracks && pageDetail.audio_tracks.some((t: any) => t.transcription_content) && (
                  <div className="space-y-2">
                    <button onClick={() => toggleSection('ki')} className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left">
                      {isOpen('ki') ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} <FileText className="size-3" /> KI Analyse
                    </button>
                    {isOpen('ki') && pageDetail.audio_tracks.filter((t: any) => t.transcription_content).map((t: any, i: number) => (
                      <div key={i} className="text-xs p-3 rounded bg-muted/50 space-y-2">
                        <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">CD {t.cd} T{t.track}</Badge><span className="font-medium truncate">{t.name}</span></div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deutsch</p>
                          <InteractiveText text={t.transcription_content} />
                        </div>
                        {t.translation_content && (
                          <div className="space-y-1 pt-1 border-t border-border/40">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">English</p>
                            <p className="whitespace-pre-wrap text-[11px]">{t.translation_content}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          )}

          <audio ref={audioRefLocal} loop={loop}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={() => { if (audioRefLocal.current) setCurrentTime(audioRefLocal.current.currentTime) }}
            onLoadedMetadata={() => { if (audioRefLocal.current) setDuration(audioRefLocal.current.duration) }}
            onEnded={() => { if (!loop) { setIsPlaying(false); setPlayingTrack(null); setCurrentTime(0) } }}
            onError={() => setIsPlaying(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* InteractiveText moved to ./InteractiveText.tsx */
