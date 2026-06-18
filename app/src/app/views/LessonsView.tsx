import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { ScrollArea } from '../components/ui/scroll-area'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { api } from '../../lib/api'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, BookOpen,
  PanelRightClose, PanelRightOpen, Loader2,
  SkipBack, SkipForward, Bookmark, BookmarkCheck
} from 'lucide-react'
import { motion } from 'motion/react'

const API_URL = import.meta.env.VITE_API_URL || ''

interface LessonsViewProps {
  appState: any
}

interface PageDetail {
  jpg_path: string | null
  pdf_path: string | null
  txt_path: string | null
  ai_path: string | null
  txt_content: string | null
  transkription_content: string | null
  ai_content: string | null
  vocabulary: any[]
  audio_tracks: any[]
  audio_refs: any[]
  transkriptionen: any[]
  loesungen: any[]
}

export function LessonsView({ appState }: LessonsViewProps) {
  const { selectedBook, setCurrentView, currentPdfIndex: currentPageIdx, setCurrentPdfIndex: setCurrentPageIdx } = appState

  const { setPageDetail: setAppPageDetail } = appState

  const [bookPages, setBookPages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lektionen, setLektionen] = useState<any[]>([])
  const [pageDetail, setPageDetail] = useState<PageDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [zoom, setZoom] = useState(1)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom(z => Math.max(0.5, Math.min(3, z + delta)))
    }
  }, [])

  const currentLektion = lektionen.find((l: any) => currentPageIdx + 1 >= l.page_min && currentPageIdx + 1 <= l.page_max)

  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`bookmarks_${selectedBook?.id}`)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`bookmarks_${selectedBook?.id}`, JSON.stringify(bookmarks))
    } catch {}
  }, [bookmarks, selectedBook?.id])

  const isBookmarked = bookmarks[String(currentPageIdx + 1)] ?? false

  const toggleBookmark = useCallback(() => {
    setBookmarks(prev => {
      const page = String(currentPageIdx + 1)
      if (prev[page]) {
        const { [page]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [page]: true }
    })
  }, [currentPageIdx])

  useEffect(() => {
    if (!selectedBook) return
    setLoading(true)
    api.getLessons(selectedBook.id)
      .then(data => {
        setBookPages(data.pdfs || [])
        setLektionen(data.lektionen || [])
        setCurrentPageIdx(0)
        setLoading(false)
      })
      .catch(() => {
        setBookPages([])
        setLoading(false)
      })
  }, [selectedBook?.id])

  useEffect(() => {
    if (!selectedBook || !bookPages.length) return
    const page = bookPages[currentPageIdx]
    if (!page) return
    setDetailLoading(true)
    fetch(`${API_URL}/api/page/detail?book=${encodeURIComponent(selectedBook.id)}&page=${page.page}`)
      .then(r => r.json())
      .then(data => {
        setPageDetail(data)
        setDetailLoading(false)
      })
      .catch(() => {
        setPageDetail(null)
        setDetailLoading(false)
      })
  }, [selectedBook?.id, currentPageIdx, bookPages])

  // Sync pageDetail to appState
  useEffect(() => { setAppPageDetail(pageDetail) }, [pageDetail, setAppPageDetail])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPageIdx((p: number) => Math.max(0, p - 1))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPageIdx((p: number) => Math.min(bookPages.length - 1, p + 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bookPages.length, setCurrentPageIdx])

  if (!selectedBook) {
    const books = appState.realBooks || []
    const catColors: Record<string, { grad: string; icon: string; label: string }> = {
      book: { grad: 'from-emerald-500/20 to-emerald-600/10 border-emerald-400/60 shadow-emerald-500/10', icon: 'text-emerald-500', label: 'Kursbuch' },
      lehrer: { grad: 'from-amber-500/20 to-amber-600/10 border-amber-400/60 shadow-amber-500/10', icon: 'text-amber-500', label: 'Lehrerhandbuch' },
      answers: { grad: 'from-sky-500/20 to-sky-600/10 border-sky-400/60 shadow-sky-500/10', icon: 'text-sky-500', label: 'Antworten' },
    }
    const categories = ['book', 'lehrer', 'answers'] as const
    const catLabels: Record<string, string> = { book: 'Kursbücher', lehrer: 'Lehrerhandbücher', answers: 'Antworten & Arbeitsbücher' }
    return (
      <ScrollArea className="h-full">
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
          <div className="flex items-center gap-3">
            <BookOpen className="size-5 text-emerald-500" />
            <h2 className="text-lg font-bold">Wähle ein Buch</h2>
            <Badge variant="secondary" className="text-xs">{books.length} Bücher</Badge>
          </div>
          {categories.map(cat => {
            const catBooks = books.filter((b: any) => (b.category || 'book') === cat)
            if (catBooks.length === 0) return null
            const cc = catColors[cat]
            return (
              <div key={cat}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">{catLabels[cat]}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {catBooks.map((book: any, i: number) => (
                    <motion.div
                      key={book.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ scale: 1.05, y: -4 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { appState.setSelectedBook(book); appState.setCurrentView('lessons') }}
                      className="cursor-pointer"
                    >
                      <Card className={`backdrop-blur-xl bg-gradient-to-br ${cc.grad} shadow-lg hover:shadow-xl transition-all h-full border-2`}>
                        <CardContent className="p-3 flex flex-col gap-2">
                          {book.coverUrl ? (
                            <div className="relative w-full aspect-[3/4] rounded-md overflow-hidden bg-muted/30">
                              <img src={book.coverUrl} alt={book.name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            </div>
                          ) : (
                            <div className="w-full aspect-[3/4] rounded-md bg-gradient-to-br from-white/40 to-white/10 flex items-center justify-center">
                              <BookOpen className={`size-10 ${cc.icon} opacity-60`} />
                            </div>
                          )}
                          <p className="text-xs font-bold leading-tight">{book.name}</p>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">{book.pdfCount} S.</Badge>
                            {book.audioFileCount > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-600 border-blue-300">{book.audioFileCount} Audio</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    )
  }
  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
  if (!bookPages.length) return <ScrollArea className="h-full"><div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><BookOpen className="size-12 mb-4 opacity-50" /><p className="text-sm">Keine Seiten für dieses Buch gefunden</p></div></ScrollArea>

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background/80 backdrop-blur">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs shrink-0" onClick={() => appState.setSelectedBook(null)}>
              <ChevronLeft className="size-3.5 mr-0.5" /> Zurück
            </Button>
            <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 shrink-0 ${isBookmarked ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-foreground'}`} onClick={toggleBookmark} title={isBookmarked ? 'Lesezeichen entfernen' : 'Lesezeichen setzen'}>
              {isBookmarked ? <BookmarkCheck className="size-4 fill-amber-500" /> : <Bookmark className="size-4" />}
            </Button>
            <span className="text-sm font-medium truncate">{selectedBook.name}</span>
            <Badge variant="secondary" className="text-xs shrink-0">S. {currentPageIdx + 1}/{bookPages.length}</Badge>
            {currentLektion && <Badge variant="outline" className="text-xs shrink-0">Lektion {currentLektion.lektion}</Badge>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {lektionen.length > 0 && (
              <select className="text-xs h-7 rounded border bg-background px-2" value={currentLektion?.lektion || ''} onChange={e => { const l = lektionen.find((x: any) => x.lektion === e.target.value); if (l) setCurrentPageIdx(l.page_min - 1) }}>
                <option value="">Lektion</option>
                {lektionen.map((l: any) => <option key={l.lektion} value={l.lektion}>Lektion {l.lektion}</option>)}
              </select>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPageIdx <= 0} onClick={() => setCurrentPageIdx(p => Math.max(0, p - 1))}><ChevronUp className="size-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={currentPageIdx >= bookPages.length - 1} onClick={() => setCurrentPageIdx(p => Math.min(bookPages.length - 1, p + 1))}><ChevronDown className="size-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => appState.setInfoPanelOpen(!appState.infoPanelOpen)}>{appState.infoPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</Button>
          </div>
        </div>

        <div data-lesson-page className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 flex items-start justify-center p-2 sm:p-4" onWheel={handleWheel}>
          {pageDetail?.jpg_path ? (
            <div className="relative w-full max-w-4xl mx-auto">
              {/* Zoom is now in the bottom navigation bar */}
              <img src={pageDetail.jpg_path} alt={`Seite ${currentPageIdx + 1}`}
                className="shadow-lg rounded w-full h-auto transition-transform"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                loading="lazy" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              {detailLoading ? <Loader2 className="size-8 animate-spin mb-4" /> : <><FileText className="size-12 mb-4 opacity-50" /><p className="text-sm">Kein Bild verfügbar</p></>}
            </div>
          )}
        </div>

        <div className="border-t bg-background/80 backdrop-blur px-2 sm:px-4 py-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" disabled={currentPageIdx <= 0} onClick={() => setCurrentPageIdx(p => Math.max(0, p - 10))} title="10 pages back"><SkipBack className="size-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" disabled={currentPageIdx <= 0} onClick={() => setCurrentPageIdx(p => Math.max(0, p - 1))} title="Previous page"><ChevronLeft className="size-3.5" /></Button>
            <input type="number" min={1} max={bookPages.length} value={currentPageIdx + 1}
              onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= bookPages.length) setCurrentPageIdx(v - 1) }}
              onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (v >= 1 && v <= bookPages.length) setCurrentPageIdx(v - 1) } }}
              className="w-12 h-7 text-xs font-mono text-center rounded border bg-background px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="text-[10px] font-mono text-muted-foreground">/ {bookPages.length}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" disabled={currentPageIdx >= bookPages.length - 1} onClick={() => setCurrentPageIdx(p => Math.min(bookPages.length - 1, p + 1))} title="Next page"><ChevronRight className="size-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" disabled={currentPageIdx >= bookPages.length - 1} onClick={() => setCurrentPageIdx(p => Math.min(bookPages.length - 1, p + 10))} title="10 pages forward"><SkipForward className="size-3.5" /></Button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Zoom in"><span className="text-sm font-bold">+</span></Button>
            <button onClick={() => setZoom(1)} className="text-[10px] font-mono text-muted-foreground hover:text-foreground min-w-[2.5rem] text-center">{Math.round(zoom * 100)}%</button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out"><span className="text-sm font-bold">−</span></Button>
            <div className="w-px h-4 bg-border mx-0.5" />
            {lektionen.length > 0 && (
              <select className="text-[10px] h-7 rounded border bg-background px-1.5 font-mono max-w-[9rem]" value={currentLektion?.lektion || ''} onChange={e => { const l = lektionen.find(x => x.lektion === e.target.value); if (l) setCurrentPageIdx(l.page_min - 1) }}>
                <option value="">Lektion</option>
                {lektionen.map((l: any) => <option key={l.lektion} value={l.lektion}>L{l.lektion} (S.{l.page_min})</option>)}
              </select>
            )}
            <div className="flex-1 min-w-[1rem]" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-0" onClick={() => appState.setInfoPanelOpen(!appState.infoPanelOpen)} title={appState.infoPanelOpen ? 'Hide sidebar' : 'Show sidebar'}>{appState.infoPanelOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}


