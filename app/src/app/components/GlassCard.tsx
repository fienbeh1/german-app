import { ReactNode } from "react"
import { cn } from "../../lib/utils"

interface GlassCardProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  hover?: boolean
  onClick?: () => void
}

export function GlassCard({ children, className = "", style, hover = false, onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        "glass rounded-2xl p-4",
        hover && "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
        onClick && "cursor-pointer active:scale-[0.98]",
        className,
      )}
    >
      {children}
    </div>
  )
}
