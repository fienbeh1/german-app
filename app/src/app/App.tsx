import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { ScrollArea } from './components/ui/scroll-area'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from './components/ui/sidebar'
import {
  BookOpen, Headphones, Video, Search, ChevronRight,
  FileText, GraduationCap, Sun, Moon, Send, Bot, Loader2,
  ChevronLeft, Gamepad2, BarChart3, ClipboardList, LayoutDashboard, Zap,
  BookText, Globe, ScrollText, Mic, Languages, BookMarked,
  PanelRightOpen, PanelRightClose, Sidebar as SidebarIcon
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppState } from './hooks/useAppState'
import { DashboardView } from './views/DashboardView'
import { LessonsView } from './views/LessonsView'
import { VocabularyView } from './views/VocabularyView'
import { VerbsView } from './views/VerbsView'
import { AudioView } from './views/AudioView'
import { HoertexteView } from './views/HoertexteView'
import { VideoView } from './views/VideoView'
import { GamesView } from './views/GamesView'
import { ExercisesView } from './views/ExercisesView'
import { ProgressView } from './views/ProgressView'
import { GoetheView } from './views/GoetheView'
import { DictionaryView } from './views/DictionaryView'
import { WritingView } from './views/WritingView'
import { SpeakingView } from './views/SpeakingView'
import { SpeakingTestView } from './views/SpeakingTestView'
import { GradedReaderView } from './views/GradedReaderView'
import { Seitendetails } from './components/Seitendetails'

export default function App() {
  const appState = useAppState()
  const { audioRef, theme, setTheme, loading, currentView, setCurrentView, selectedBook, setSelectedBook, realBooks, bookSearch, setBookSearch, lessonData, currentPdfIndex, setCurrentPdfIndex, lektionen, searchQuery, setSearchQuery, verbSearch, setVerbSearch, chatOpen, setChatOpen, chatInput, setChatInput, chatMessages, chatLoading, sendChat, audioProgress, audioDuration, setAudioProgress, setAudioDuration, setIsPlaying, setPlayingAudio, backendOnline, errorMessage, setErrorMessage, infoPanelOpen, setInfoPanelOpen, pageDetail, setPageDetail, playingTrack, setPlayingTrack } = appState

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-6xl">🥨</motion.div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div className="absolute top-20 right-10 text-6xl opacity-20 dark:opacity-10"
          animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }} transition={{ duration: 4, repeat: Infinity }}>🥨</motion.div>
        <motion.div className="absolute bottom-40 left-20 text-4xl opacity-20 dark:opacity-10"
          animate={{ y: [0, 15, 0], rotate: [0, -10, 0] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }}>🥨</motion.div>
        <motion.div className="absolute top-1/2 right-1/4 text-3xl opacity-15 dark:opacity-10"
          animate={{ y: [0, -25, 0] }} transition={{ duration: 6, repeat: Infinity, delay: 2 }}>🇩🇪</motion.div>
      </div>

      {!backendOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white text-center py-2 px-4 text-sm font-medium">
          Backend nicht erreichbar (Port 3456). Bitte Tkinter-Launcher öffnen und Backend starten.
        </div>
      )}
      {errorMessage && backendOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white text-center py-2 px-4 text-sm font-medium">
          {errorMessage}
          <button className="ml-4 underline" onClick={() => setErrorMessage(null)}>Schließen</button>
        </div>
      )}
      <SidebarProvider>
        <div className="flex h-screen w-full relative z-10">
          <Sidebar collapsible="icon" className="border-r border-white/20 dark:border-white/10">
            <SidebarContent className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/80">
              <div className="px-4 py-3 border-b border-white/20 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <motion.div className="text-3xl" animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>🦉</motion.div>
                  <div>
                    <h1 className="font-bold text-sm bg-gradient-to-r from-emerald-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">Deutsch Lernen</h1>
                    <p className="text-[10px] text-gray-500 font-mono">Interaktive Lernplattform</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs text-gray-500">Bücher ({realBooks.length})</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <div className="px-2 mb-2">
                      <Input
                        placeholder="Buch suchen..."
                        className="h-6 text-xs bg-white/50 dark:bg-gray-800/50 border-white/30"
                        value={bookSearch}
                        onChange={e => setBookSearch(e.target.value)}
                      />
                    </div>
                    <SidebarMenu>
                      {realBooks
                        .filter(book => book.name.toLowerCase().includes(bookSearch.toLowerCase()))
                        .map(book => {
                          const shortName = book.name
                          return (
                            <SidebarMenuItem key={book.id}>
                              <SidebarMenuButton onClick={() => { setSelectedBook(book); setCurrentView('lessons') }} isActive={selectedBook?.id === book.id}>
                                <BookOpen className="size-4" />
                                <span className="flex-1 text-left truncate">{shortName}</span>
                                <Badge variant="secondary" className="ml-auto text-[10px]">{book.pdfCount}</Badge>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )
                        })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs text-gray-500">Navigation</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('dashboard')} isActive={currentView === 'dashboard'}>
                          <LayoutDashboard className="size-4" /><span>Dashboard</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('lessons')} isActive={currentView === 'lessons'}>
                          <BookOpen className="size-4" /><span>Lektionen</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('vocabulary')} isActive={currentView === 'vocabulary'}>
                          <GraduationCap className="size-4" /><span>Vokabeln</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('verbs')} isActive={currentView === 'verbs'}>
                          <Zap className="size-4" /><span>Verben</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('audio')} isActive={currentView === 'audio'}>
                          <Headphones className="size-4" /><span>Hörverstehen</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('hoertexte')} isActive={currentView === 'hoertexte'}>
                          <FileText className="size-4" /><span>Hörtexte</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('video')} isActive={currentView === 'video'}>
                          <Video className="size-4" /><span>Videos</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('games')} isActive={currentView === 'games'}>
                          <Gamepad2 className="size-4" /><span>Spiele</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('exercises')} isActive={currentView === 'exercises'}>
                          <ClipboardList className="size-4" /><span>Übungen</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('progress')} isActive={currentView === 'progress'}>
                          <BarChart3 className="size-4" /><span>Fortschritt</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel className="text-xs text-gray-500">Wortschatz</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('goethe')} isActive={currentView === 'goethe'}>
                          <Languages className="size-4" /><span>Goethe A1-B1</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('dictionary')} isActive={currentView === 'dictionary'}>
                          <BookText className="size-4" /><span>Wörterbuch</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('readers')} isActive={currentView === 'readers'}>
                          <BookMarked className="size-4" /><span>Graded Reader</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('writing')} isActive={currentView === 'writing'}>
                          <ScrollText className="size-4" /><span>Schreibtraining</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('speaking')} isActive={currentView === 'speaking'}>
                          <Mic className="size-4" /><span>Sprechtraining</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setCurrentView('speaking-test')} isActive={currentView === 'speaking-test'} className="pl-8">
                          <BarChart3 className="size-3.5" /><span className="text-[11px]">Sprachtest (Dev)</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </div>

              <div className="p-3 border-t border-white/20 dark:border-white/10">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs text-muted-foreground">{theme === 'dark' ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}</span>
                  <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="relative w-10 h-5 rounded-full bg-gray-300 dark:bg-gray-600 transition-colors">
                    <motion.div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow" animate={{ x: theme === 'dark' ? 20 : 0 }} />
                  </button>
                </div>
              </div>
            </SidebarContent>
          </Sidebar>

          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border-b border-white/20 dark:border-white/10 shadow-lg">
              <div className="flex items-center justify-between h-14 px-4">
                <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <div>
                    <h2 className="font-bold text-sm bg-gradient-to-r from-emerald-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
                      {currentView === 'dashboard' && 'Dashboard'}
                      {currentView === 'lessons' && (selectedBook?.name || 'Lektionen')}
                      {currentView === 'vocabulary' && 'Vokabeltrainer'}
                      {currentView === 'verbs' && 'Verben'}
                      {currentView === 'audio' && 'Hörverstehen'}
                      {currentView === 'hoertexte' && 'Hörtexte'}
                      {currentView === 'video' && 'Videos'}
                      {currentView === 'games' && 'Spiele'}
                      {currentView === 'exercises' && 'Grammatik Übungen'}
                      {currentView === 'progress' && 'Fortschritt'}
                      {currentView === 'goethe' && 'Goethe Wortschatz'}
                      {currentView === 'dictionary' && 'Wörterbuch'}
                      {currentView === 'writing' && 'Schreibtraining'}
                      {currentView === 'speaking' && 'Sprechtraining'}
                      {currentView === 'readers' && 'Graded Reader'}
                      {currentView === 'speaking-test' && 'Sprachtest'}
                    </h2>
                    {currentView === 'lessons' && lessonData && (
                      <p className="text-[10px] text-gray-500 font-mono">
                        S. {currentPdfIndex + 1}/{lessonData.pdfs.length}
                        {lektionen.length > 0 && (() => {
                          const cur = lektionen.find(l => currentPdfIndex + 1 >= l.page_min && currentPdfIndex + 1 <= l.page_max)
                          return cur ? ` · Lektion ${cur.lektion}` : ''
                        })()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentView === 'lessons' && lessonData && (
                    <>
                      {lektionen.length > 0 && (
                        <select
                          className="h-7 text-xs rounded-md border border-white/30 bg-white/50 dark:bg-gray-800/50 px-2 font-mono"
                          value={lektionen.find(l => currentPdfIndex + 1 >= l.page_min && currentPdfIndex + 1 <= l.page_max)?.lektion || ''}
                          onChange={e => {
                            const l = lektionen.find(l => l.lektion === e.target.value)
                            if (l) setCurrentPdfIndex(l.page_min - 1)
                          }}>
                          <option value="" disabled>Lektion</option>
                          {lektionen.map(l => (
                            <option key={l.lektion} value={l.lektion}>Lektion {l.lektion} (S. {l.page_min})</option>
                          ))}
                        </select>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPdfIndex(p => Math.max(0, p - 1))} disabled={currentPdfIndex === 0}>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={lessonData?.pdfs.length || 1}
                        value={currentPdfIndex + 1}
                        onChange={e => {
                          const val = parseInt(e.target.value) - 1
                          if (!isNaN(val) && val >= 0 && val < (lessonData?.pdfs.length || 1))
                            setCurrentPdfIndex(val)
                        }}
                        className="w-14 h-7 text-xs text-center font-mono px-1 bg-white/50 dark:bg-gray-800/50 border-white/30"
                      />
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPdfIndex(p => Math.min((lessonData?.pdfs.length || 1) - 1, p + 1))} disabled={currentPdfIndex === (lessonData?.pdfs.length || 1) - 1}>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </>
                  )}
                  {(currentView === 'vocabulary' || currentView === 'verbs') && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
                      <Input placeholder={currentView === 'vocabulary' ? "Suchen..." : "Verb suchen..."}
                        className="pl-8 h-7 text-xs w-48 bg-white/50 dark:bg-gray-800/50 border-white/30"
                        value={currentView === 'vocabulary' ? searchQuery : verbSearch}
                        onChange={e => currentView === 'vocabulary' ? setSearchQuery(e.target.value) : setVerbSearch(e.target.value)} />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setInfoPanelOpen(!infoPanelOpen)}>
                    {infoPanelOpen ? <PanelRightClose className="size-3 mr-1" /> : <PanelRightOpen className="size-3 mr-1" />} Details
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setChatOpen(!chatOpen)}>
                    <Bot className="size-3 mr-1" /> Chat
                  </Button>
                </div>
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-hidden flex">
              <div className="flex-1 min-w-0 relative">
                <div className="absolute inset-0">
                  <AnimatePresence mode="wait">
                    <motion.div key={currentView} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-hidden">
                      {currentView === 'dashboard' && <DashboardView appState={appState} />}
                      {currentView === 'lessons' && <LessonsView appState={appState} />}
                      {currentView === 'vocabulary' && <VocabularyView appState={appState} />}
                      {currentView === 'verbs' && <VerbsView appState={appState} onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'audio' && <AudioView appState={appState} />}
                      {currentView === 'hoertexte' && <HoertexteView appState={appState} onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'video' && <VideoView appState={appState} />}
                      {currentView === 'games' && <GamesView appState={appState} />}
                      {currentView === 'progress' && <ProgressView appState={appState} onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'exercises' && <ExercisesView appState={appState} onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'goethe' && <GoetheView onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'dictionary' && <DictionaryView onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'writing' && <WritingView onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'speaking' && <SpeakingView onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'speaking-test' && <SpeakingTestView onBack={() => setCurrentView('dashboard')} />}
                      {currentView === 'readers' && <GradedReaderView onBack={() => setCurrentView('dashboard')} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <Seitendetails appState={appState} sidebarOpen={infoPanelOpen} setSidebarOpen={setInfoPanelOpen} />
            </div>
          </div>

          {chatOpen && !infoPanelOpen && (
            <div className="w-80 border-l border-white/20 dark:border-white/10 flex flex-col backdrop-blur-xl bg-white/70 dark:bg-gray-900/80">
              <div className="px-4 py-3 border-b border-white/20 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-emerald-600" />
                  <span className="text-sm font-medium">KI Assistent</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setChatOpen(false)}>✕</Button>
              </div>
              <ScrollArea className="flex-1 p-4 space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-xs ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-br-md'
                        : 'bg-white/50 dark:bg-gray-800/50 backdrop-blur border border-white/30 dark:border-white/10 rounded-bl-md'
                    }`}>
                      {msg.role === 'assistant' && <Bot className="size-3 text-emerald-600 mb-1" />}
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur border border-white/30 dark:border-white/10 p-3 rounded-2xl rounded-bl-md">
                      <Loader2 className="size-4 animate-spin text-emerald-600" />
                    </div>
                  </div>
                )}
              </ScrollArea>
              <div className="p-3 border-t border-white/20 dark:border-white/10">
                <div className="flex gap-2">
                  <Input placeholder="Frag etwas zu deiner Lektion..." className="flex-1 bg-white/50 dark:bg-gray-800/50 text-xs h-9 border-white/30" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
                  <Button size="icon" className="h-9 w-9 shrink-0 bg-gradient-to-r from-emerald-500 to-emerald-600" onClick={sendChat} disabled={chatLoading}>
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarProvider>
      <audio ref={audioRef}
        onTimeUpdate={() => { if (audioRef.current) setAudioProgress(audioRef.current.currentTime) }}
        onLoadedMetadata={() => { if (audioRef.current) setAudioDuration(audioRef.current.duration) }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setPlayingAudio(null) }}
        onError={() => { setIsPlaying(false); }} />
    </div>
  )
}
