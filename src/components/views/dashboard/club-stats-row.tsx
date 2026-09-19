import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Clickable stat tile — used in the "Club at a glance" strip. */
export function ClubStat({
  label,
  value,
  icon,
  onClick,
}: {
  label: string
  value: string
  icon: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent/40 hover:border-club/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </button>
  )
}

/** Executive metric tile — used in the "Executive insights" strip. */
export function ExecMetric({
  label,
  value,
  hint,
  urgent,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  urgent?: boolean
  onClick?: () => void
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-card/40 px-3 py-2 transition-colors w-full",
        onClick &&
          "hover:bg-accent/40 hover:border-club/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        urgent && "border-amber-300 dark:border-amber-800 bg-warning-subtle/50 dark:bg-warning-subtle"
      )}
    >
      <p className="text-caption ">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </Comp>
  )
}
