import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { ScrollArea } from '../components/ui/scroll-area'
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext,
} from '../components/ui/carousel'
import {
  BookOpen, Headphones, Video, FileText,
  GraduationCap, Sparkles, Target, TrendingUp, Brain,
  Languages, Zap, Gamepad2, BarChart3,
  Library, Globe, ChevronLeft, ChevronRight
} from 'lucide-react'
import { motion } from 'motion/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts'

const NIVEL_COLORS: Record<string, string> = {
  A1: 'bg-green-500', A2: 'bg-blue-500', B1: 'bg-amber-500', B2: 'bg-orange-500', C1: 'bg-red-500',
}
const NIVEL_BG = {
  A1: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  A2: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  B1: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  B2: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  C1: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
}

interface DashboardViewProps {
  appState: any
}

export function DashboardView({ appState }: DashboardViewProps) {
  const {
    realBooks, vocabulary, verbs, lessonData, currentAudioTracks, videoFiles,
    setCurrentView, setChatOpen, getStats, skillRadarData, weeklyEngagement,
    flashcards, vocabByLevel, verbsByLevel,
  } = appState
  const stats = getStats

  return (
    <ScrollArea className="h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold bg-gradient-to-r from-[#FFBF00] via-orange-500 to-red-500 bg-clip-text text-transparent">Dashboard</h2>
          <Badge variant="outline" className="text-xs border-accent-warm/30 text-accent-warm">{realBooks.length} Bücher</Badge>
          <Badge variant="outline" className="text-xs border-green-400 text-green-600 dark:text-green-400">{vocabulary.length} Vokabeln</Badge>
          <Badge variant="outline" className="text-xs border-purple-400 text-purple-600 dark:text-purple-400">{verbs.length} Verben</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: GraduationCap, label: 'Vokabeln', color: 'from-emerald-500 to-emerald-600', onClick: () => setCurrentView('vocabulary') },
            { icon: Headphones, label: 'Hörverstehen', color: 'from-blue-500 to-blue-600', onClick: () => setCurrentView('audio') },
            { icon: FileText, label: 'Lektionen', color: 'from-purple-500 to-purple-600', onClick: () => setCurrentView('lessons') },
            { icon: Sparkles, label: 'KI Chat', color: 'from-amber-500 to-orange-500', onClick: () => setChatOpen(true) },
            { icon: Zap, label: 'Verben', color: 'from-red-500 to-red-600', onClick: () => setCurrentView('verbs') },
            { icon: Gamepad2, label: 'Spiele', color: 'from-green-500 to-green-600', onClick: () => setCurrentView('games') },
            { icon: BarChart3, label: 'Fortschritt', color: 'from-indigo-500 to-indigo-600', onClick: () => setCurrentView('progress') },
            { icon: Video, label: 'Videos', color: 'from-pink-500 to-pink-600', onClick: () => setCurrentView('video') },
          ].map((action, i) => (
            <motion.div key={i} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={action.onClick} className="cursor-pointer">
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 dark:from-gray-800/80 dark:to-gray-800/60 border-white/30 dark:border-white/10 shadow-lg hover:shadow-xl transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-lg`}>
                    <action.icon className="size-5 text-white" />
                  </div>
                  <span className="text-sm font-medium">{action.label}</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Books Carousel */}
        {realBooks && realBooks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Library className="size-4 text-accent-warm" />
              <h3 className="text-sm font-bold text-accent-warm">Deine Bücher</h3>
              <Badge variant="outline" className="text-xs ml-auto">{realBooks.length} Bücher</Badge>
            </div>
            <Carousel opts={{ align: 'start', loop: false }} className="w-full">
              <CarouselContent className="-ml-2 md:-ml-3">
                {realBooks.map((book: any, i: number) => {
                  const shortName = book.name.split('/').pop() || book.name
                  const gradients = ['from-emerald-500/20','from-blue-500/20','from-purple-500/20','from-amber-500/20','from-rose-500/20','from-cyan-500/20','from-lime-500/20','from-orange-500/20','from-pink-500/20','from-teal-500/20','from-indigo-500/20','from-violet-500/20']
                  return (
                    <CarouselItem key={book.id} className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6 pl-2 md:pl-3">
                      <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                        onClick={() => { appState.setSelectedBook(book); appState.setCurrentView('lessons') }} className="cursor-pointer h-full">
                        <Card className={`backdrop-blur-xl bg-gradient-to-br ${gradients[i % gradients.length]} to-transparent border-white/30 dark:border-white/10 shadow-lg hover:shadow-xl transition-all h-full`}>
                          <CardContent className="p-3 flex flex-col gap-2">
                            {book.coverUrl ? (
                              <div className="relative w-full aspect-[3/4] rounded-md overflow-hidden bg-muted/30">
                                <img src={book.coverUrl} alt={shortName} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                              </div>
                            ) : (
                              <div className="w-full aspect-[3/4] rounded-md bg-gradient-to-br from-muted/50 to-muted/80 flex items-center justify-center">
                                <BookOpen className="size-8 opacity-60" />
                              </div>
                            )}
                            <p className="text-xs font-semibold truncate">{shortName}</p>
                          </CardContent>
                        </Card>
                      </motion.div>
                    </CarouselItem>
                  )
                })}
              </CarouselContent>
              <CarouselPrevious className="hidden sm:flex -left-3 size-7" />
              <CarouselNext className="hidden sm:flex -right-3 size-7" />
            </Carousel>
          </div>
        )}

        {/* Level Distribution Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-200/50 dark:border-emerald-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm">
                <Languages className="size-4" /> Vokabeln nach Niveau
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {['A1','A2','B1','B2','C1'].map(lvl => {
                  const count = (stats.vocabByLevel || {})[lvl] || 0
                  const max = Math.max(...Object.values(stats.vocabByLevel || {})) || 1
                  return (
                    <div key={lvl} className="flex items-center gap-2">
                      <Badge className={`w-8 text-center text-[10px] ${NIVEL_BG[lvl]}`}>{lvl}</Badge>
                      <div className="flex-1 h-3 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }}
                          className={`h-full rounded-full ${NIVEL_COLORS[lvl]}`} />
                      </div>
                      <span className="text-xs font-mono w-16 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50 dark:border-purple-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm">
                <Zap className="size-4" /> Verben nach Niveau
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {['A1','A2','B1','B2','C1'].map(lvl => {
                  const count = (stats.verbsByLevel || {})[lvl] || 0
                  const max = Math.max(...Object.values(stats.verbsByLevel || {})) || 1
                  return (
                    <div key={lvl} className="flex items-center gap-2">
                      <Badge className={`w-8 text-center text-[10px] ${NIVEL_BG[lvl]}`}>{lvl}</Badge>
                      <div className="flex-1 h-3 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }}
                          className={`h-full rounded-full ${NIVEL_COLORS[lvl]}`} />
                      </div>
                      <span className="text-xs font-mono w-16 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50 dark:border-blue-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
                <Target className="size-4" /> Lernfortschritt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span>Bücher</span><span>{realBooks.length}</span></div>
                <div className="h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (realBooks.length / 10) * 100)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-[#FFBF00] to-orange-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span>Audio-Tracks</span><span>{currentAudioTracks.length}</span></div>
                <div className="h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (currentAudioTracks.length / 100) * 100)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-[#FFBF00] to-orange-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span>Video-Lektionen</span><span>{videoFiles.length}</span></div>
                <div className="h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (videoFiles.length / 50) * 100)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-[#FFBF00] to-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Materials Overview */}
        <Card className="backdrop-blur-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-200/50 dark:border-amber-800/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
              <Library className="size-4" /> Alle Materialien
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <div onClick={() => setCurrentView('vocabulary')} className="cursor-pointer p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition-colors text-center">
                <p className="text-lg font-bold text-emerald-600">{vocabulary.length}</p>
                <p className="text-[10px] text-muted-foreground">Vokabeln</p>
              </div>
              <div onClick={() => setCurrentView('verbs')} className="cursor-pointer p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors text-center">
                <p className="text-lg font-bold text-purple-600">{verbs.length}</p>
                <p className="text-[10px] text-muted-foreground">Verben</p>
              </div>
              <div onClick={() => setCurrentView('audio')} className="cursor-pointer p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors text-center">
                <p className="text-lg font-bold text-blue-600">{currentAudioTracks.length}</p>
                <p className="text-[10px] text-muted-foreground">Audio-Tracks</p>
              </div>
              <div onClick={() => setCurrentView('video')} className="cursor-pointer p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-pink-100/50 dark:hover:bg-pink-900/30 transition-colors text-center">
                <p className="text-lg font-bold text-pink-600">{videoFiles.length}</p>
                <p className="text-[10px] text-muted-foreground">Videos</p>
              </div>
              <div onClick={() => setCurrentView('lessons')} className="cursor-pointer p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors text-center">
                <p className="text-lg font-bold text-amber-600">{realBooks.length}</p>
                <p className="text-[10px] text-muted-foreground">Bücher</p>
              </div>
              <div onClick={() => setCurrentView('goethe')} className="cursor-pointer p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-green-100/50 dark:hover:bg-green-900/30 transition-colors text-center">
                <p className="text-lg font-bold text-green-600">A1-B1</p>
                <p className="text-[10px] text-muted-foreground">Goethe</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-200/50 dark:border-emerald-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm">
                <TrendingUp className="size-4" /> Wöchentliche Aktivität
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyEngagement}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="engagement" fill="#FFBF00" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="completion" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50 dark:border-purple-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400 text-sm">
                <Brain className="size-4" /> Fähigkeiten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={skillRadarData}>
                  <PolarGrid stroke="#c4b5fd" />
                  <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} />
                  <Radar dataKey="value" stroke="#FFBF00" fill="#FFBF00" fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-xl bg-gradient-to-br from-[#FFBF00]/10 to-orange-500/5 border-amber-200/50 dark:border-amber-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <Sparkles className="size-4" /> Neueste Vokabeln
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {vocabulary.slice(0, 6).map((v: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {v.artikel && <span className="text-emerald-600">{v.artikel} </span>}
                        {v.wort || v.palabra}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        <Globe className="size-3 inline mr-0.5" />
                        {v['übersetzung_es'] || v.english || '—'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {v.nivel && <Badge className={`text-[9px] px-1 py-0 ${NIVEL_BG[v.nivel] || ''}`}>{v.nivel}</Badge>}
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{v.wortart}</Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  )
}