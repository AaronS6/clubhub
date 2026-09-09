import { ReactNode } from "react"
import { cn } from "@/lib/utils"

/* =========================================================================
   Shared UI primitives — type scale + semantic status chips + empty states
   ========================================================================= */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between gap-y-2", className)}>
      <div className="min-w-0">
        <h1 className="text-page-title truncate">{title}</h1>
        {description && <p className="text-body text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

export type StatusKind =
  | "pending"
  | "approved"
  | "rejected"
  | "in_progress"
  | "not_started"
  | "done"
  | "neutral"

const statusChipClass: Record<StatusKind, string> = {
  pending: "chip-pending",
  approved: "chip-approved",
  rejected: "chip-rejected",
  in_progress: "chip-progress",
  done: "chip-approved",
  not_started: "chip-neutral",
  neutral: "chip-neutral",
}

const dotClass: Record<StatusKind, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
  not_started: "bg-gray-400",
  neutral: "bg-gray-400",
}

export function StatusBadge({ status, label }: { status: StatusKind; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        statusChipClass[status]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[status])} />
      {label ?? status.replace(/_/g, " ")}
    </span>
  )
}

/** A compact dot-only status indicator (no text) for dense tables. */
export function StatusDot({ status }: { status: StatusKind }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", dotClass[status])}
      aria-label={status.replace(/_/g, " ")}
    />
  )
}

export function RoleBadge({ role }: { role: "member" | "executive" }) {
  return role === "executive" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
      Executive
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md chip-neutral px-2 py-0.5 text-xs font-medium">
      Member
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center animate-fade-in",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-card-title">{title}</h3>
      {description && (
        <p className="text-body text-muted-foreground mt-1.5 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ----- Skeletons that match content shape ----- */

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card-quiet p-5 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-1/3 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-1/4 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="h-3 w-full rounded bg-muted animate-pulse" />
      <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-1/4 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-6 w-16 rounded bg-muted animate-pulse" />
    </div>
  )
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card-quiet overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="card-quiet p-5 space-y-3">
      <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
      <div className="h-7 w-1/3 rounded bg-muted animate-pulse" />
    </div>
  )
}

/* ----- Utilities ----- */

export function initials(name?: string | null) {
  if (!name) return "?"
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  )
}

export function relativeTime(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

/** Avatar initials background — deterministic soft color from a name. */
export function avatarColor(name?: string | null) {
  if (!name) return "bg-muted text-muted-foreground"
  const palette = [
    "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
    "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
