import { useState, useEffect } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { api } from '../../lib/api'
import { Video, Play, ArrowLeft, FileText, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

const API_URL = import.meta.env.VITE_API_URL || ''

interface VideoViewProps {
  appState: any
}

export function VideoView({ appState }: VideoViewProps) {
  const {
    selectedBook, setSelectedBook,
    videoFiles, videoBookPicker, setVideoBookPicker,
    realBooks: books,
  } = appState

  const [playingVideo, setPlayingVideo] = useState<any>(null)
  const [transcriptions, setTranscriptions] = useState<any[]>([])
  const [loadingTrans, setLoadingTrans] = useState(false)
  const [transOpen, setTransOpen] = useState(false)

  const booksWithVideo = books
    .filter((b: any) => (b.videoFileCount || 0) > 0)
    .map((b: any) => ({ ...b, videoCount: b.videoFileCount || 0 }))

  useEffect(() => {
    if (selectedBook) {
      setLoadingTrans(true)
      api.getTranskriptionen(selectedBook.id)
        .then(data => setTranscriptions(data || []))
        .catch(() => setTranscriptions([]))
        .finally(() => setLoadingTrans(false))
    }
  }, [selectedBook?.id])

  if (!selectedBook || videoFiles.length === 0) {
    return (
      <ScrollArea className="h-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-bold">Videos — Buch wählen</h2>
            <Badge variant="secondary" className="text-xs">{booksWithVideo.length} mit Videos</Badge>
          </div>
          {booksWithVideo.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <Video className="size-12 mb-4 opacity-50" />
              <p className="text-sm">Keine Bücher mit Videos gefunden</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {booksWithVideo.map((book: any) => (
                <Card key={book.id}
                  className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-all hover:scale-[1.02]"
                  onClick={() => { setSelectedBook(book); setVideoBookPicker(false) }}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg">
                        <Video className="size-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{book.name.split('/').pop()}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{book.videoCount} Videos</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    )
  }

  if (playingVideo) {
    const videoSrc = playingVideo.path
      ? `${API_URL}${playingVideo.path.startsWith('/') ? '' : '/'}${playingVideo.path}`
      : ''
    return (
      <ScrollArea className="h-full">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPlayingVideo(null)}>
              <ArrowLeft className="size-3.5 mr-1" /> Zurück
            </Button>
            <div className="flex-1" />
            <Badge variant="secondary" className="text-xs">{playingVideo.name || 'Video'}</Badge>
          </div>
          <div className="bg-black rounded-lg overflow-hidden">
            <video controls autoPlay className="w-full max-h-[70vh]" src={videoSrc}>
              Dein Browser unterstützt kein Video.
            </video>
          </div>
          <p className="text-sm mt-3 text-muted-foreground">{playingVideo.name || playingVideo.title || ''}</p>
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVideoBookPicker(true)}>
            <ArrowLeft className="size-3.5 mr-1" /> Bücher
          </Button>
          <div className="flex-1" />
          {transcriptions.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setTransOpen(!transOpen)}>
              <FileText className="size-3 mr-1" /> {transcriptions.length} Transkriptionen
            </Button>
          )}
          <Badge variant="secondary" className="text-xs">{videoFiles.length} Videos</Badge>
        </div>

        {transcriptions.length > 0 && transOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 rounded-xl bg-muted/30 border space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="size-4" /> Transkriptionen</h3>
            {transcriptions.map((t: any, i: number) => (
              <div key={t.id || i} className="text-xs p-3 rounded-lg bg-background/80 space-y-1">
                {t.lektion && <Badge variant="outline" className="text-[9px]">Lektion {t.lektion}</Badge>}
                {t.source_page && <span className="text-[10px] text-muted-foreground ml-1">S. {t.source_page}</span>}
                <p className="whitespace-pre-wrap leading-relaxed mt-1">{t.inhalt}</p>
              </div>
            ))}
          </motion.div>
        )}

        <h2 className="text-lg font-bold mb-4">{selectedBook.name.split('/').pop()}</h2>

        {videoFiles.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <Video className="size-12 mb-4 opacity-50" />
            <p className="text-sm">Keine Video-Dateien für dieses Buch</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videoFiles.map((vf: any, i: number) => {
              const videoSrc = vf.path
                ? `${API_URL}${vf.path.startsWith('/') ? '' : '/'}${vf.path}`
                : ''
              return (
                <Card key={i}
                  className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg overflow-hidden hover:shadow-xl transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shrink-0">
                        <Video className="size-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{vf.name || vf.title || `Video ${i + 1}`}</p>
                        {vf.duration && <p className="text-xs text-muted-foreground">{vf.duration}</p>}
                      </div>
                    </div>
                    <Button size="sm" className="w-full gap-2 text-xs"
                      onClick={() => setPlayingVideo(vf)}>
                      <Play className="size-3" /> Abspielen
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
