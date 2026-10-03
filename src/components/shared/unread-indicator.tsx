import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * UnreadDot — the single, app-wide "new / unread" dot.
 *
 * One size (8px / h-2 w-2), one color (the club accent), one optional
 * pulse animation. Used everywhere an unread/new indicator appears:
 * nav-item badges, chat conversation dots, notification list items, the
 * bell dropdown — so the treatment is consistent instead of each feature
 * inventing its own size/color/pulse.
 *
 * Use the dot form when there's no count (or count is exactly 1 and the
 * number isn't worth showing). When the count is > 1, use <UnreadBadge/>.
 *
 * `pulse` is opt-in (default off) because lists with many unread items
 * (e.g. a chat conversation list) would be distracting with N pulsing
 * dots. Use it for single, attention-grabbing spots like the nav item dot
 * or the bell trigger.
 */
export function UnreadDot({
  className,
  pulse = false,
  "aria-label": ariaLabel = "New",
  ...rest
}: {
  className?: string
  pulse?: boolean
  "aria-label"?: string
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full bg-club",
        pulse && "animate-pulse",
        className,
      )}
      {...rest}
    />
  )
}

/**
 * UnreadBadge — the count form of the unread indicator (count > 1).
 *
 * One size (h-4 / 16px), one color (club accent + club-foreground text),
 * tabular-nums so the width only jumps at digit boundaries. Replaces the
 * old mix of green chat badges and red notification badges — everything
 * is now the brand accent for consistency.
 */
export function UnreadBadge({
  count,
  className,
  ...rest
}: {
  count: number
  className?: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  if (count <= 0) return null
  return (
    <span
      role="status"
      aria-label={`${count} unread`}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-club px-1 text-xs font-semibold leading-none text-club-foreground tabular-nums",
        className,
      )}
      {...rest}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}
