"use client"

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
  in_progress: "bg-sky-500",
  done: "bg-emerald-500",
  not_started: "bg-amber-500",
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
  illustration,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  /** Optional line-art illustration — when provided, replaces the icon-in-circle
   *  entirely (rendered raw, no muted circle wrapper). Use for the high-visibility
   *  empty states (chat, tasks, members, announcements) per §32. */
  illustration?: ReactNode
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
      {illustration ? (
        illustration
      ) : icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="text-card-title">{title}</h3>
      {description && (
        <p className="text-body text-muted-foreground mt-1.5 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* =========================================================================
   §32 — Custom empty-state illustrations (line art).
   Each is a small inline SVG (~40px) using muted-foreground stroke with a
   single accent line in the club accent color (currentColor with text-club).
   ========================================================================= */

export function ChatEmptyIllustration() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="mb-4 text-muted-foreground"
    >
      {/* Speech bubble outline (muted) */}
      <path
        d="M10 14a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-9l-7 6v-6h-4a4 4 0 0 1-4-4V14Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Single accent line inside the bubble */}
      <path
        d="M16 18h12"
        stroke="var(--club)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Second muted line */}
      <path
        d="M16 22h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

export function TasksEmptyIllustration() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="mb-4 text-muted-foreground"
    >
      {/* Checklist outline (muted) */}
      <rect
        x="10"
        y="8"
        width="28"
        height="32"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* First checkmark row — accent */}
      <path
        d="M15 17l2 2 4-4"
        stroke="var(--club)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Line next to accent check */}
      <path
        d="M24 18h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Second row check (muted) */}
      <path
        d="M15 27l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <path
        d="M24 28h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

export function MembersEmptyIllustration() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="mb-4 text-muted-foreground"
    >
      {/* Two people outline (muted) */}
      <circle
        cx="18"
        cy="17"
        r="5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* Accent body for the front person */}
      <path
        d="M9 36c0-5 4-8 9-8s9 3 9 8"
        stroke="var(--club)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Back person (muted, slightly offset) */}
      <circle
        cx="32"
        cy="19"
        r="4"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.6"
      />
      <path
        d="M28 32c0-3 3-6 6-6s6 3 6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

export function AnnouncementsEmptyIllustration() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="mb-4 text-muted-foreground"
    >
      {/* Megaphone outline (muted) */}
      <path
        d="M12 20v8l16 6V14L12 20Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Handle (muted) */}
      <path
        d="M12 22H8v4h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Sound waves — accent */}
      <path
        d="M32 18c2 2 2 8 0 10"
        stroke="var(--club)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M35 15c4 4 4 12 0 16"
        stroke="var(--club)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
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
