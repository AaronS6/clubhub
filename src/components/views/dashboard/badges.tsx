import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ShieldCheck, Users } from "lucide-react"

/** Role badge pill — Executive (violet) or Member (club accent). */
export function RoleBadgePill({ role }: { role: "member" | "executive" }) {
  if (role === "executive") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-club-subtle border-club/20 px-2 py-0.5 text-xs font-medium text-club-ink">
        <ShieldCheck className="h-3 w-3" /> Executive
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-club/30 bg-club-muted px-2 py-0.5 text-xs font-medium text-club">
      <Users className="h-3 w-3" /> Member
    </span>
  )
}

/** Leaderboard rank badge — gold/silver/bronze for top 3. */
export function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? "bg-warning-subtle text-warning-foreground dark:bg-warning-subtle dark:text-warning-foreground border-warning/30 dark:border-amber-900"
      : rank === 2
      ? "bg-muted bg-muted text-muted-foreground border-border"
      : rank === 3
      ? "bg-warning-subtle text-warning-foreground dark:bg-warning-subtle dark:text-warning-foreground border-orange-200 dark:border-orange-900"
      : "bg-muted text-muted-foreground border-border"
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold shrink-0 tabular-nums",
        styles
      )}
    >
      {rank}
    </span>
  )
}

/** RSVP status badge for meeting cards. */
export function RsvpBadge({ status }: { status: "going" | "not_going" | "maybe" }) {
  const map: Record<string, { label: string; className: string }> = {
    going: { label: "Going", className: "chip-approved" },
    not_going: { label: "Not going", className: "chip-rejected" },
    maybe: { label: "Maybe", className: "chip-pending" },
  }
  const s = map[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
        s.className
      )}
    >
      {s.label}
    </span>
  )
}

/** Re-export ReactNode for convenience (used by other dashboard files). */
export type { ReactNode }
