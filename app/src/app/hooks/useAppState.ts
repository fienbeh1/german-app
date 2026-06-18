import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTheme } from 'next-themes'
import { api, type Book, type Lesson, type Vocabulary, type Audio } from '../../lib/api'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function useAppState() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const { theme, setTheme } = useTheme()
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [lessonData, setLessonData] = useState<Lesson | null>(null)
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0)
  const [currentView, setCurrentView] = useState<string>('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [vocabBookPicker, setVocabBookPicker] = useState(false)
  const [videoBookPicker, setVideoBookPicker] = useState(false)
  const [infoPanelOpen, setInfoPanelOpen] = useState(true)
  const [infoPanelWidth, setInfoPanelWidth] = useState(320)
  const [sectionsOpen, setSectionsOpen] = useState({ seitenDetails: false, vocab: true, audio: true, ocr: false, ki: false, transkription: false, loesung: false, bookAudio: false })
  const [currentAudioTracks, setCurrentAudioTracks] = useState<Audio[]>([])
  const [aiContent, setAiContent] = useState<string | null>(null)
  const [audioFiles, setAudioFiles] = useState<any[]>([])
  const [videoFiles, setVideoFiles] = useState<any[]>([])
  const [wordTypeFilter, setWordTypeFilter] = useState('Alle')
  const [vocabNivelFilter, setVocabNivelFilter] = useState('Alle')
  const [verbs, setVerbs] = useState<any[]>([])
  const [verbSearch, setVerbSearch] = useState('')
  const [verbPage, setVerbPage] = useState(0)
  const [verbTotal, setVerbTotal] = useState(0)
  const [verbLevel, setVerbLevel] = useState<string>('all')
  const [verbLoading, setVerbLoading] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [videoPlayerOpen, setVideoPlayerOpen] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [lektionen, setLektionen] = useState<{ lektion: string; page_min: number; page_max: number }[]>([])
  const [transkriptionen, setTranskriptionen] = useState<any[]>([])
  const [loesungen, setLoesungen] = useState<any[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [backendOnline, setBackendOnline] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentGame, setCurrentGame] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: 'Hallo! Wie kann ich dir beim Deutschlernen helfen?' },
  ])
  const [chatLoading, setChatLoading] = useState(false)
  const [hoertexteData, setHoertexteData] = useState<any[]>([])
  const [hoertexteFilter, setHoertexteFilter] = useState('Alle')
  const [playingAudio, setPlayingAudio] = useState<any>(null)
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [pageDetail, setPageDetail] = useState<any>(null)
  const [playingTrack, setPlayingTrack] = useState<any>(null)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioSpeed, setAudioSpeed] = useState(1)

  const vocabByLevel = useMemo(() => {
    const counts: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }
    for (const v of vocabulary) {
      const lvl = v.nivel || 'B1'
      if (counts[lvl] !== undefined) counts[lvl]++
    }
    return counts
  }, [vocabulary])

  const verbsByLevel = useMemo(() => {
    const counts: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }
    for (const v of verbs) {
      const lvl = v.nivel || 'B1'
      if (counts[lvl] !== undefined) counts[lvl]++
    }
    return counts
  }, [verbs])

  const getStats = useMemo(() => ({
    totalWords: vocabulary.length,
    lessonsCompleted: lessonData?.pdfs.length || 0,
    currentLevel: selectedBook?.name?.split('/')[0] || 'A1',
    weeklyProgress: vocabulary.length,
    totalVerbs: verbs.length,
    totalAudio: currentAudioTracks.length,
    totalVideo: videoFiles.length,
    vocabByLevel: vocabByLevel,
    verbsByLevel: verbsByLevel,
  }), [vocabulary.length, lessonData?.pdfs.length, selectedBook, verbs.length, currentAudioTracks.length, videoFiles.length, vocabByLevel, verbsByLevel])

  const skillRadarData = useMemo(() => {
    const vpc = vocabulary.length
    const vbc = verbs.length
    const totalMax = Math.max(vpc, vbc, 100)
    return [
      { skill: 'Wortschatz', value: Math.min(100, (vpc / totalMax) * 100) },
      { skill: 'Verben', value: Math.min(100, (vbc / Math.max(totalMax, 50)) * 100) },
      { skill: 'A1-Grund', value: Math.min(100, (vocabByLevel.A1 / Math.max(vpc, 1)) * 100) },
      { skill: 'A2-Aufbau', value: Math.min(100, (vocabByLevel.A2 / Math.max(vpc, 1)) * 100) },
      { skill: 'B1-Mittel', value: Math.min(100, (vocabByLevel.B1 / Math.max(vpc, 1)) * 100) },
    ]
  }, [vocabulary, verbs, vocabByLevel])

  const weeklyEngagement = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return days.map((d, i) => ({
      name: d,
      engagement: Math.min(100, 60 + Math.sin(i * 0.8) * 20 + (vocabulary.length * 0.0005)),
      completion: Math.min(100, 40 + Math.cos(i * 0.6) * 25 + ((lessonData?.pdfs.length || 0) * 0.005)),
    }))
  }, [vocabulary.length, lessonData?.pdfs.length])

  const flashcards = useMemo(() => vocabulary.slice(0, 8).map(v => ({
    word: v.wort || v.palabra || '',
    translation: v.übersetzung_es || v.english || '',
    heat: Math.min(100, Math.round(40 + (v.nivel === 'A1' ? 40 : v.nivel === 'A2' ? 30 : v.nivel === 'B1' ? 20 : 10) + Math.random() * 20)),
  })), [vocabulary])

  const realBooks = useMemo(
    () => books.filter(b => !b.name.match(/\/[Aa]nswers$|AudioCD|Unterichtsplan$/) && b.name !== 'Verbs'),
    [books],
  )

  useEffect(() => { loadBooks() }, [])

  useEffect(() => {
    loadVerbs(0, false)
  }, [verbLevel])

  useEffect(() => {
    if (selectedBook) loadBookData(selectedBook.id)
  }, [selectedBook])

  useEffect(() => {
    if (selectedBook) {
      api.getLektionen(selectedBook.id).then(setLektionen).catch(() => setLektionen([]))
    }
  }, [selectedBook])

  useEffect(() => {
    if (lessonData && lessonData.pdfs[currentPdfIndex]) {
      loadAiForPage(lessonData.pdfs[currentPdfIndex].page)
      loadTextForPage(lessonData.pdfs[currentPdfIndex].page)
      loadSegmentsForPage()
    }
  }, [lessonData, currentPdfIndex])

  useEffect(() => {
    if (selectedBook && currentView === 'hoertexte') {
      api.getTranskriptionen(selectedBook.id).then(setHoertexteData).catch(() => setHoertexteData([]))
    }
  }, [selectedBook, currentView])

  useEffect(() => {
    if (selectedBook) {
      api.getExercises(selectedBook.id).then(d => setExercises(d.exercises)).catch(() => {})
    }
  }, [selectedBook])

  useEffect(() => {
    const check = async () => {
      try {
        await fetch('/health', { signal: AbortSignal.timeout(2000) })
        setBackendOnline(true)
      } catch {
        setBackendOnline(false)
      }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (currentView === 'audio') {
      setCurrentAudioTrack(0)
    }
  }, [currentView])

  async function loadBooks() {
    try {
      setLoading(true)
      const booksData = await api.getBooks()
      setBooks(booksData)
      if (booksData.length > 0) setSelectedBook(booksData[0])
    } catch (error) {
      console.error('Error loading books:', error)
      setErrorMessage('Server nicht erreichbar. Starte das Backend (Port 3456).')
    } finally {
      setLoading(false)
    }
  }

  async function loadBookData(bookId: string) {
    try {
      const fallbackLesson = () => ({ pdfs: [], annotations: [], aiFiles: [], txtFiles: [], id: '', name: '' });
      const [lessons, vocab, audioData, audioFilesData, videoData] = await Promise.all([
        api.getLessons(bookId).catch(() => fallbackLesson()),
        api.getVocabulary(bookId).catch(() => ({ vocabulary: [] })),
        api.getAudio(bookId).catch(() => ({ audio: [] })),
        api.getAudioFiles(bookId).catch(() => ({ audioFiles: [] })),
        api.getVideoFiles(bookId).catch(() => ({ videoFiles: [] })),
      ])
      setLessonData(lessons)
      setVocabulary(vocab.vocabulary)
      setCurrentAudioTracks(audioData.audio)
      setAudioFiles(audioFilesData.audioFiles)
      setVideoFiles(videoData.videoFiles)
    } catch (error) {
      console.error('Error loading book data:', error)
      setErrorMessage('Fehler beim Laden der Buchdaten. Backend läuft?')
    }
  }

  async function loadAiForPage(page: string) {
    if (!selectedBook) return
    try {
      const data = await api.getAiContent(selectedBook.id, page)
      setAiContent(data.content)
    } catch {
      setAiContent(null)
    }
  }

  async function loadTextForPage(page: string) {
    if (!selectedBook) return
    try {
      const data = await api.getTextContent(selectedBook.id, page)
      setTextContent(data.content)
    } catch {
      setTextContent(null)
    }
  }

  async function loadSegmentsForPage() {
    if (!selectedBook || !lessonData) return
    const pageAnn = lessonData.annotations.find(a => a.page === lessonData.pdfs[currentPdfIndex]?.page)
    const lektion = pageAnn?.struktur?.lektion
    try {
      const [trans, loes] = await Promise.all([
        api.getTranskriptionen(selectedBook.id, lektion ? { lektion } : undefined),
        api.getLoesungen(selectedBook.id, lektion ? { lektion } : undefined),
      ])
      setTranskriptionen(trans)
      setLoesungen(loes)
    } catch {
      setTranskriptionen([])
      setLoesungen([])
    }
  }

  async function loadVerbs(page: number, append: boolean) {
    setVerbLoading(true)
    try {
      const qs = `page=${page}&limit=50&level=${verbLevel}`
      const data = await api.fetch<{ verbs: any[]; total: number }>(`/api/verbs?${qs}`)
      if (append) {
        setVerbs(prev => [...prev, ...data.verbs])
      } else {
        setVerbs(data.verbs)
      }
      setVerbTotal(data.total)
      setVerbPage(page)
    } catch (e) {
      console.error('Failed to load verbs:', e)
    } finally {
      setVerbLoading(false)
    }
  }

  const sendChat = useCallback(async () => {
    if (!chatInput.trim()) return
    const msg = chatInput
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: msg })
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || 'Entschuldigung, ich habe keine Antwort gefunden.'
      }])
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Entschuldigung, ich habe keine Antwort gefunden.'
      }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput])

  const getPageVocabulary = () => {
    if (!lessonData || !lessonData.pdfs[currentPdfIndex]) return vocabulary
    const page = lessonData.pdfs[currentPdfIndex].page
    const pageAnn = lessonData.annotations.find(a => a.page === page)
    if (!pageAnn) return vocabulary.slice(0, 15)
    const annFile = pageAnn.file.replace('.json', '')
    return vocabulary.filter(v => (v.source || '').includes(annFile)).slice(0, 20)
  }

  const getPageAudio = () => {
    if (!lessonData || !lessonData.pdfs[currentPdfIndex]) return []
    const page = lessonData.pdfs[currentPdfIndex].page
    return currentAudioTracks.filter(a => {
      const trackPage = a.seite || a.lektion || ''
      return trackPage === page || trackPage.includes(page)
    }).slice(0, 5)
  }

  const resolveAudioSrc = (track: any) => {
    const raw = track?.audio_url || track?.path || (track?.track ? `/audio/${track.track}` : '')
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    return `${api.url('')}${encodeURI(raw)}`
  }

  const playAudio = (track: any) => {
    if (audioRef.current) {
      const src = resolveAudioSrc(track)
      if (!src) return
      audioRef.current.src = src
      audioRef.current.playbackRate = audioSpeed
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
      setPlayingAudio(track)
    }
  }

  const togglePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const seekAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioDuration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = x * audioDuration
  }

  return {
    audioRef, theme, setTheme,
    books, selectedBook, setSelectedBook,
    lessonData, vocabulary, loading,
    currentPdfIndex, setCurrentPdfIndex,
    currentView, setCurrentView,
    searchQuery, setSearchQuery, bookSearch, setBookSearch,
    vocabBookPicker, setVocabBookPicker,
    videoBookPicker, setVideoBookPicker,
    infoPanelOpen, setInfoPanelOpen,
    infoPanelWidth, setInfoPanelWidth,
    sectionsOpen, setSectionsOpen,
    currentAudioTracks, setCurrentAudioTracks,
    aiContent, setAiContent,
    audioFiles, videoFiles,
    wordTypeFilter, setWordTypeFilter,
    vocabNivelFilter, setVocabNivelFilter,
    verbs, verbSearch, setVerbSearch,
    verbPage, verbTotal, verbLevel, setVerbLevel,
    verbLoading, loadVerbs,
    textContent, setTextContent,
    videoPlayerOpen, setVideoPlayerOpen,
    selectedVideo, setSelectedVideo,
    exercises, lektionen,
    transkriptionen, loesungen,
    chatOpen, setChatOpen,
    backendOnline, errorMessage,
    currentGame, setCurrentGame,
    chatInput, setChatInput,
    chatMessages, chatLoading,
    sendChat,
    hoertexteData, setHoertexteData,
    hoertexteFilter, setHoertexteFilter,
    playingAudio, setPlayingAudio,
    currentAudioTrack, setCurrentAudioTrack,
    isPlaying, setIsPlaying,
    audioProgress, setAudioProgress,
    audioDuration, setAudioDuration,
    audioSpeed, setAudioSpeed,
    getStats, skillRadarData, weeklyEngagement, flashcards, realBooks,
    vocabByLevel, verbsByLevel,
    loadBooks, loadBookData,
    getPageVocabulary, getPageAudio,
    pageDetail, setPageDetail,
    playingTrack, setPlayingTrack,
    resolveAudioSrc, playAudio, togglePlayPause, seekAudio,
    SPEEDS,
  }
}
