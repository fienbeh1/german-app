import { GlassCard } from './GlassCard'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import { BookOpen, FileText, Volume2, Award } from 'lucide-react'

interface StatsData {
  totalLessons: number
  completedLessons: number
  totalVocabulary: number
  learnedVocabulary: number
  totalAudio: number
  listenedAudio: number
  currentLevel: string
  weeklyProgress: number
}

interface DashboardStatsProps {
  stats: StatsData
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const completionPercentage = stats.totalLessons > 0 ? (stats.completedLessons / stats.totalLessons) * 100 : 0
  const vocabPercentage = stats.totalVocabulary > 0 ? (stats.learnedVocabulary / stats.totalVocabulary) * 100 : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="size-5 text-primary" />
          </div>
          <Badge variant="secondary">{stats.currentLevel}</Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-bold">{stats.totalLessons}</h3>
          </div>
          <p className="text-sm text-muted-foreground">Total Lektionen</p>
          <Progress value={completionPercentage} className="h-2" />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="size-10 rounded-xl bg-chart-3/10 flex items-center justify-center">
            <FileText className="size-5 text-chart-3" />
          </div>
          <Badge variant="outline" className="text-primary border-primary/30">
            +{stats.weeklyProgress}
          </Badge>
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">{stats.totalVocabulary}</h3>
          <p className="text-sm text-muted-foreground">Vokabeln</p>
          <Progress value={vocabPercentage} className="h-2" />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="size-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Volume2 className="size-5 text-accent" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">{stats.totalAudio}</h3>
          <p className="text-sm text-muted-foreground">Audio-Übungen</p>
        </div>
      </GlassCard>

      <GlassCard className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5">
        <div className="flex items-center justify-between mb-4">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Award className="size-5 text-white" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-gradient">Gut gemacht!</h3>
          <p className="text-sm text-muted-foreground">Weiter so!</p>
        </div>
      </GlassCard>
    </div>
  )
}
