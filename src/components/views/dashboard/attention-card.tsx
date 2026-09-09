import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Attention card — Tier 1 item in the dashboard's "needs attention" strip.
 * Clickable (renders as a button) or static (renders as a div).
 */
export function AttentionCard({
  icon,
  title,
  description,
  onClick,
  children,
  delay,
  urgent,
}: {
  icon: ReactNode
  title: string
  description?: string
  onClick?: () => void
  children?: ReactNode
  delay?: number
  urgent?: boolean
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={delay ? { animationDelay: `${delay}ms`, animationFillMode: "backwards" } : undefined}
      className={cn(
        "card-quiet p-4 text-left border-l-2 border-l-club animate-fade-in transition-colors",
        onClick &&
          "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        urgent && "border-l-red-500"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-0.5 shrink-0", urgent ? "text-red-500" : "text-club")}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-card-title truncate">{title}</p>
          {description && <p className="text-caption mt-0.5">{description}</p>}
          {children}
        </div>
      </div>
    </Comp>
  )
}

/** "You're all caught up" positive empty state for the Tier 1 strip. */
export function AllCaughtUpCard() {
  return (
    <div className="card-quiet p-5 flex items-center gap-4 animate-fade-in">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-club-muted text-club shrink-0">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-card-title">You&apos;re all caught up</p>
        <p className="text-caption mt-0.5">
          Nothing needs your attention right now.
        </p>
      </div>
    </div>
  )
}

import { CheckCircle2 } from "lucide-react"
