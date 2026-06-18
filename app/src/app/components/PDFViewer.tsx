import { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from './ui/button'
import { ZoomIn, ZoomOut, Loader2, BookOpen, Download, ExternalLink } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { cn } from '../../lib/utils'

const WORKER_VERSION = pdfjs.version || '4.8.69'
const WORKER_URLS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${WORKER_VERSION}/build/pdf.worker.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${WORKER_VERSION}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${WORKER_VERSION}/pdf.worker.min.mjs`,
]
pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URLS[0]

interface PDFViewerProps {
  pdfUrl?: string | null
  currentPage?: number
  totalPages?: number
  fallbackImageUrl?: string | null
}

export function PDFViewer({ pdfUrl, currentPage = 1, totalPages = 1, fallbackImageUrl }: PDFViewerProps) {
  const [scale, setScale] = useState(1.0)
  const [loadError, setLoadError] = useState(false)
  const [useImageFallback, setUseImageFallback] = useState(false)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URLS[0]
    setLoadError(false)
    setUseImageFallback(false)
    setImageError(false)
  }, [pdfUrl])

  function onDocumentLoadSuccess() {
    setLoadError(false)
    setUseImageFallback(false)
  }

  function onDocumentLoadError() {
    setLoadError(true)
    if (fallbackImageUrl) {
      setUseImageFallback(true)
    }
  }

  function zoomIn() {
    setScale(prev => Math.min(prev + 0.25, 3.0))
  }

  function zoomOut() {
    setScale(prev => Math.max(prev - 0.25, 0.25))
  }

  function zoomReset() {
    setScale(1.0)
  }

  const isMockUrl = pdfUrl && (pdfUrl.includes('example') || pdfUrl.includes('mock'))

  if (!pdfUrl || isMockUrl) {
    return (
      <div className="h-full flex items-center justify-center">
        <GlassCard className="text-center space-y-4 p-8 max-w-lg">
          <BookOpen className="size-16 mx-auto text-muted-foreground/50" />
          <div className="space-y-2">
            <p className="font-medium">PDF Viewer bereit</p>
            <p className="text-sm text-muted-foreground">
              Verbinde dein Backend mit echten PDF-Dateien, um sie hier anzuzeigen.
            </p>
          </div>
        </GlassCard>
      </div>
    )
  }

  if (useImageFallback && fallbackImageUrl) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b glass rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Seite {currentPage} / {totalPages}
            </span>
            <span className="text-xs text-muted-foreground ml-2">(Bildansicht)</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={zoomOut} disabled={scale <= 0.25}>
              <ZoomOut className="size-4" />
            </Button>
            <button
              onClick={zoomReset}
              className="text-sm min-w-16 text-center hover:text-primary transition-colors cursor-pointer bg-transparent border-none"
            >
              {Math.round(scale * 100)}%
            </button>
            <Button variant="ghost" size="sm" onClick={zoomIn} disabled={scale >= 3.0}>
              <ZoomIn className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open(fallbackImageUrl, '_blank')} title="Im Browser öffnen">
              <ExternalLink className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex justify-center p-4">
          {imageError ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <p className="text-sm text-destructive">Bild konnte nicht geladen werden</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setUseImageFallback(false); setLoadError(false) }}>
                  PDF erneut versuchen
                </Button>
                {pdfUrl && (
                  <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, '_blank')}>
                    <Download className="size-4 mr-1" /> PDF öffnen
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <img
              src={fallbackImageUrl}
              alt={`Seite ${currentPage}`}
              style={{ maxWidth: `${scale * 100}%`, height: 'auto' }}
              className="shadow-xl rounded-lg"
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center">
        <GlassCard className="text-center space-y-4 p-8">
          <BookOpen className="size-16 mx-auto text-destructive/50" />
          <div>
            <p className="text-sm font-medium text-destructive">PDF konnte nicht geladen werden</p>
            <p className="text-xs text-muted-foreground">Überprüfe den Dateipfad</p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" size="sm" onClick={() => setLoadError(false)}>
                Erneut versuchen
              </Button>
              {pdfUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, '_blank')}>
                  <Download className="size-4 mr-1" /> PDF öffnen
                </Button>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b glass rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            Seite {currentPage} / {totalPages}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={zoomOut} disabled={scale <= 0.25}>
            <ZoomOut className="size-4" />
          </Button>
          <button
            onClick={zoomReset}
            className="text-sm min-w-16 text-center hover:text-primary transition-colors cursor-pointer bg-transparent border-none"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button variant="ghost" size="sm" onClick={zoomIn} disabled={scale >= 3.0}>
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>

      <div className={cn(
        "flex-1 overflow-auto flex justify-start p-4",
        scale > 1 ? "justify-start" : "justify-center",
      )}>
        <div style={{ minWidth: scale > 1 ? `${80 * scale}%` : undefined }}>
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-20">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">PDF wird geladen...</span>
              </div>
            }
          >
            <Page
              pageNumber={1}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-xl rounded-lg overflow-hidden"
            />
          </Document>
        </div>
      </div>
    </div>
  )
}
