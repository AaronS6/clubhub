"use client"

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react"
import { useAppStore, type View } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
import { PageHeader, EmptyState, StatusBadge } from "@/components/shared/page-header"
import { toast } from "sonner"
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Shield,
  Sparkles,
  MessageSquare,
  Megaphone,
  ListTodo,
  StickyNote,
  CalendarDays,
  Users,
  Wallet,
  History,
  Image as ImageIcon,
  Building2,
  Mail,
  Copy,
  Check,
  ArrowUpCircle,
  Info,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"

/* =========================================================================
   Storage — executive-only club footprint view, presented as a pure
   iCloud-style storage page: one usage dial in a glass hero, then calm
   glass panes of clean jump-rows per category.
   Backed by GET /api/clubs/[clubId]/storage (live-content-only math: deleted
   & tombstoned content contributes zero bytes, so the numbers drop the
   moment content is removed). Quota is 15 MB shared by the whole club.
   At 100%, storage-taking writes club-wide are paused until an executive
   clears some room (see src/lib/storage-guard.ts) — this view is where
   executives see it, act on it, and request more capacity.
   ========================================================================= */

// ── Types ──────────────────────────────────────────────────────────────────

interface StorageCategory {
  id: string
  label: string
  bytes: number
  items: number
  detail: string
}

interface StorageResponse {
  quotaBytes: number
  usedBytes: number
  percent: number
  categories: StorageCategory[]
  excluded: {
    avatarsBytes: number
    notificationsBytes: number
    tombstonedMessages: number
    tombstonedNotes: number
  }
  clubId: string
}

/** Where to reach the person who can raise a club's quota. */
const STORAGE_CONTACT_EMAIL = "aaronshansh@gmail.com"

// ── Category metadata (icon + the view its "open" button jumps to) ─────────

/** How much clearing a category hurts the club — drives the ranked "free up
 *  space" suggestions. The ranking prefers SAFE wins (things whose deletion
 *  nobody feels) over bigger-but-dramatic ones, and never suggests finance. */
type CleanupImpact = "none" | "low" | "medium" | "high"

const IMPACT_RANK: Record<CleanupImpact, number> = { none: 0, low: 1, medium: 2, high: 3 }

interface CategoryMeta {
  icon: LucideIcon
  /** Set when deleting/trimming this category's content is actionable from
   *  a real view — drives the ranked "free up space" suggestion rows. */
  view?: View
  /** Concrete, useful copy for the suggestion row. */
  hint?: string
  /** Clearing-impact tier for the suggestion ranking (see CleanupImpact). */
  impact?: CleanupImpact
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  chat: {
    icon: MessageSquare,
    view: "chat",
    impact: "low",
    hint: "Old threads. Hover any message to delete it.",
  },
  announcements: {
    icon: Megaphone,
    view: "announcements",
    impact: "medium",
    hint: "Outdated posts. Deleting frees space instantly.",
  },
  tasks: {
    icon: ListTodo,
    view: "tasks",
    impact: "medium",
    hint: "Finished tasks stop counting once cleared.",
  },
  notes: {
    icon: StickyNote,
    view: "notes",
    impact: "low",
    hint: "Old notes stop counting once deleted.",
  },
  meetings: {
    icon: CalendarDays,
    view: "meetings",
    impact: "low",
    hint: "Past meetings free up space once deleted.",
  },
  finance: {
    icon: Wallet,
    view: "financials",
    impact: "high",
    hint: "Official records. Clear last.",
  },
  activity: {
    icon: History,
    view: "activity",
    impact: "none",
    hint: "A pure feed. Clearing it changes nothing else.",
  },
  images: {
    icon: ImageIcon,
    view: "members",
    impact: "low",
    hint: "Re-upload a smaller logo or banner; only the newest counts.",
  },
  people: { icon: Users },
  profile: { icon: Building2 },
}

const FALLBACK_META: CategoryMeta = { icon: Building2 }

function metaFor(id: string): CategoryMeta {
  return CATEGORY_META[id] ?? FALLBACK_META
}

// ── Category color identities (presentation only) ──────────────────────────
// Each category's iOS-style tinted squircle chip: the color at ~10% behind
// the icon (kept whisper-quiet so no chip reads as a heavy colored box),
// the color itself for the icon. Deliberately NO blue/indigo —
// meetings carries the club accent instead.

const CATEGORY_TILE: Record<string, string> = {
  chat: "bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-300",
  announcements: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300",
  tasks: "bg-orange-500/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300",
  notes: "bg-yellow-500/10 text-yellow-700 dark:bg-yellow-400/10 dark:text-yellow-300",
  meetings: "bg-club-muted text-club-ink",
  finance: "bg-lime-600/10 text-lime-700 dark:bg-lime-400/10 dark:text-lime-300",
  activity: "bg-purple-500/10 text-purple-600 dark:bg-purple-400/10 dark:text-purple-300",
  images: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300",
  people: "bg-stone-500/10 text-stone-600 dark:bg-stone-400/10 dark:text-stone-300",
  profile: "bg-stone-600/10 text-stone-700 dark:bg-stone-300/10 dark:text-stone-200",
}

const FALLBACK_TILE = "bg-muted text-muted-foreground"

function tileFor(id: string): string {
  return CATEGORY_TILE[id] ?? FALLBACK_TILE
}

// ── Category grouping into glass panes (presentation only) ─────────────────

const CATEGORY_GROUPS: { id: string; title: string; ids: string[] }[] = [
  { id: "conversations", title: "Conversations", ids: ["chat"] },
  { id: "content", title: "Club content", ids: ["announcements", "tasks", "notes", "meetings"] },
  { id: "identity", title: "Images & identity", ids: ["images", "people", "profile"] },
  { id: "records", title: "Records", ids: ["finance", "activity"] },
]

// ── Formatting helpers ─────────────────────────────────────────────────────

/** Human byte format: "17.0 KB" / "1.2 MB" / "512 B". */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${Math.max(1, Math.round(bytes))} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US")
}

/** Share of total usage, small-value aware ("3.1%" vs "42%"). */
function sharePct(bytes: number, total: number): number {
  if (total <= 0) return 0
  const pct = (bytes / total) * 100
  return pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10
}

// ── Count-up hook (rAF, eased, reduced-motion aware) ───────────────────────

/** Animates 0 → target over `durationMs` (cubic ease-out). `replayKey`
 *  re-runs the animation whenever it changes (e.g. every completed fetch). */
function useCountUp(target: number | null, replayKey: number, durationMs = 600): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === null) return
    // Reduced motion → duration 0, so the first rAF tick lands directly on
    // the final number (still via the async callback — never a synchronous
    // setState inside the effect body).
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const duration = reduce ? 0 : durationMs
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = duration <= 0 ? 1 : Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, replayKey, durationMs])
  return value
}

// ── Presentation primitives ────────────────────────────────────────────────

/** iOS-style tinted squircle chip — a category's color identity. */
function CategoryTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", className)}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  )
}

/** A clean hairline row whose whole surface is the jump control. */
function JumpRow({
  icon,
  tileClass,
  label,
  detail,
  aside,
  onOpen,
}: {
  icon: LucideIcon
  tileClass: string
  label: string
  detail?: ReactNode
  aside?: string
  onOpen?: () => void
}) {
  const body = (
    <>
      <CategoryTile icon={icon} className={tileClass} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {detail && (
          <span className="mt-0.5 block truncate text-caption tabular-nums text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      {aside && <span className="shrink-0 text-caption tabular-nums">{aside}</span>}
      {onOpen && (
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      )}
    </>
  )
  if (!onOpen) {
    return <div className="flex w-full items-center gap-3.5 px-5 py-3.5 sm:px-6">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035] dark:hover:bg-white/[0.05] dark:focus-visible:bg-white/[0.05] sm:px-6"
    >
      {body}
    </button>
  )
}

// ── Usage dial — the page's single meter ───────────────────────────────────

const DIAL_RADIUS = 74
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS

function UsageDial({
  label,
  fraction,
  tone,
  mounted,
  valueNow,
}: {
  /** The big numeral (already formatted). */
  label: string
  /** 0..1 share of the quota the arc should cover. */
  fraction: number
  tone: "ink" | "warn" | "danger"
  mounted: boolean
  valueNow: number
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const safeFraction = Math.min(Math.max(fraction, 0), 1)
  const targetOffset = DIAL_CIRCUMFERENCE * (1 - safeFraction)
  return (
    <div
      role="progressbar"
      aria-label="Club storage used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valueNow}
      className="relative mx-auto size-40 sm:size-[168px]"
    >
      <svg viewBox="0 0 168 168" className="size-full" aria-hidden>
        <defs>
          {/* Metallic ink — the resting arc. */}
          <linearGradient id={`${uid}-ink`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--foreground)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--foreground)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={`${uid}-warn`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--warning)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--warning)" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id={`${uid}-danger`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--danger)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--danger)" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* Recessed channel — a low-contrast neutral track. */}
        <circle
          cx="84"
          cy="84"
          r={DIAL_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-muted-foreground/20 dark:text-white/[0.12]"
        />
        {/* Progress arc — draws itself in after mount (1150ms Apple-settle,
            driven by the .storage-dial-arc transition in globals.css). */}
        <g transform="rotate(-90 84 84)">
          <circle
            cx="84"
            cy="84"
            r={DIAL_RADIUS}
            fill="none"
            stroke={`url(#${uid}-${tone})`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={DIAL_CIRCUMFERENCE}
            strokeDashoffset={mounted ? targetOffset : DIAL_CIRCUMFERENCE}
            className="storage-dial-arc"
          />
        </g>
        {/* Hairline specular glint near the top of the ring. */}
        <circle
          cx="84"
          cy="84"
          r={DIAL_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${DIAL_CIRCUMFERENCE * 0.055} ${DIAL_CIRCUMFERENCE}`}
          transform="rotate(-116 84 84)"
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-[32px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {label}
          <span className="ml-0.5 text-[0.55em] font-medium text-muted-foreground">%</span>
        </span>
        <span className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          used
        </span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function StorageView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const clubName = useAppStore((s) => s.currentClub?.clubName) ?? "your club"
  const setView = useAppStore((s) => s.setView)

  const [data, setData] = useState<StorageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [increaseOpen, setIncreaseOpen] = useState(false)
  // Bumps on every completed fetch so the count-up replays on refresh.
  const [fetchStamp, setFetchStamp] = useState(0)
  // Flips true right after mount (double rAF) so the dial's arc draws itself
  // in via its stroke-dashoffset transition.
  const [dialMounted, setDialMounted] = useState(false)

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!clubId) return
      if (mode === "refresh") setRefreshing(true)
      else setLoading(true)
      setError(null)
      setForbidden(false)
      try {
        const res = await fetch(`/api/clubs/${clubId}/storage`, { credentials: "same-origin" })
        const body = await res.json().catch(() => null)
        if (res.status === 403 && body && typeof body === "object" && "error" in body) {
          const msg = String((body as { error: unknown }).error)
          if (msg === "Executives only") {
            setForbidden(true)
            return
          }
          throw new Error(msg || "Not a member of this club")
        }
        if (!res.ok) {
          throw new Error(
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown }).error)
              : `Request failed (${res.status})`,
          )
        }
        setData(body as StorageResponse)
        setFetchStamp((s) => s + 1)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load storage")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [clubId],
  )

  useEffect(() => {
    void load("initial")
  }, [load])

  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setDialMounted(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  const shown = data && data.clubId === clubId ? data : null
  const busy = loading || refreshing
  const animatedBytes = useCountUp(shown?.usedBytes ?? null, fetchStamp)

  // Ranked categories + derived composition data (memoized for stable keys).
  const ranked = useMemo(
    () => (shown ? [...shown.categories].sort((a, b) => b.bytes - a.bytes) : []),
    [shown],
  )
  const composition = useMemo(
    () => ranked.filter((c) => c.bytes > 0),
    [ranked],
  )
  // Top-3 SAFE suggestions. Ranked by IMPACT first — an easy win that
  // nobody feels (old chat, the activity feed, past meetings) beats a bigger
  // number that takes club records with it — then by size within each tier.
  // High-impact categories (finance) are never suggested; they get a
  // dedicated "last resort" note in the cleanup pane instead.
  const actionable = useMemo(
    () =>
      composition
        .filter((c) => {
          const meta = CATEGORY_META[c.id]
          return !!meta?.view && !!meta.impact && meta.impact !== "high"
        })
        .sort((a, b) => {
          const ra = IMPACT_RANK[(CATEGORY_META[a.id] ?? {}).impact ?? "medium"]
          const rb = IMPACT_RANK[(CATEGORY_META[b.id] ?? {}).impact ?? "medium"]
          return ra !== rb ? ra - rb : b.bytes - a.bytes
        })
        .slice(0, 3),
    [composition],
  )
  // Visible categories grouped into glass panes (fixed section order, bytes
  // rank within each pane). Zero-byte categories are filtered out of the
  // visible list here but still count toward every total above.
  const grouped = useMemo(() => {
    const groups = CATEGORY_GROUPS.map((g) => ({ ...g, cats: [] as StorageCategory[] }))
    const other: { id: string; title: string; ids: string[]; cats: StorageCategory[] } = {
      id: "other",
      title: "Other",
      ids: [],
      cats: [],
    }
    for (const cat of composition) {
      const group = groups.find((g) => g.ids.includes(cat.id))
      if (group) group.cats.push(cat)
      else other.cats.push(cat)
    }
    return [...groups, other].filter((g) => g.cats.length > 0)
  }, [composition])

  // ── Guard states ────────────────────────────────────────────────────────

  if (!clubId) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No club selected"
      />
    )
  }

  if (loading && !shown) return <StorageSkeleton />

  if (forbidden) {
    return (
      <EmptyState
        icon={<Shield className="h-8 w-8" />}
        title="Executives only"
      />
    )
  }

  if (error && !shown) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title="Couldn't load storage"
        description={error}
        action={
          <Button variant="outline" onClick={() => void load("initial")}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        }
      />
    )
  }

  if (!shown) return <StorageSkeleton />

  // ── Derived numbers ─────────────────────────────────────────────────────
  const quota = shown.quotaBytes
  const used = shown.usedBytes
  const percent = shown.percent
  const pctClamped = Math.min(percent, 100)
  const free = Math.max(0, quota - used)
  const over = Math.max(0, used - quota)
  const isFull = percent >= 100

  const status = isFull
    ? { kind: "rejected" as const, label: "Storage full" }
    : percent >= 90
      ? { kind: "rejected" as const, label: "Almost full" }
      : percent >= 70
        ? { kind: "pending" as const, label: "Filling up" }
        : { kind: "approved" as const, label: "Healthy" }

  // Dial ink escalates with the same thresholds as the status chip (this is
  // the old linear meter's fill escalation, reborn as the arc's gradient).
  const arcTone: "ink" | "warn" | "danger" =
    percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ink"

  // Pace: how many times the current content fits before the quota is full.
  const paceRatio = used > 0 ? Math.floor(quota / used) : 0

  // Big numeral for the dial — one decimal while small, whole thereafter,
  // and it never claims 100% before the quota is actually reached.
  const pctLabel = isFull
    ? "100"
    : pctClamped < 10
      ? pctClamped.toFixed(1)
      : String(Math.min(99, Math.round(pctClamped)))

  return (
    <div className="space-y-4 overflow-x-clip sm:space-y-5">
      <PageHeader title="Storage" />

      {/* ── 0. Storage-full pause notice ───────────────────────────────────
          At 100% the whole club's storage-taking writes are paused (see
          src/lib/storage-guard.ts). This is the executive's at-a-glance
          explanation + the two ways out: clear content, or request more. */}
      {isFull && (
        <section
          role="alert"
          className="storage-rise relative overflow-hidden rounded-[1.75rem] border border-danger/40 bg-danger-subtle/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl sm:p-6 dark:border-danger/30 dark:bg-danger-subtle/50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger [&_svg]:size-5">
              <AlertTriangle aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-card-title text-danger-foreground">
                Storage is full — new content is paused
              </h2>
              <p className="mt-1 max-w-2xl text-body leading-relaxed text-danger-foreground/80">
                New content is paused for everyone in {clubName} until an executive clears
                room. Deleting frees space instantly.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 sm:ml-[3.25rem]">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full border border-danger/30 px-4 text-danger-foreground hover:bg-danger/10 dark:border-danger/25 dark:hover:bg-danger/20"
              onClick={() => setView("chat")}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Clear old messages
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full px-4 text-muted-foreground"
              onClick={() => setIncreaseOpen(true)}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" /> Increase storage capacity
            </Button>
          </div>
        </section>
      )}

      {/* Softer heads-up in the 90–100% band, before the pause kicks in. */}
      {!isFull && percent >= 90 && (
        <section
          role="status"
          className="storage-rise flex items-start gap-3 rounded-[1.75rem] border border-warning/40 bg-warning-subtle/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl dark:border-warning/30 dark:bg-warning-subtle/50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning [&_svg]:size-4">
            <AlertTriangle aria-hidden />
          </span>
          <p className="text-body leading-relaxed text-foreground/80">
            <span className="font-medium">Almost full.</span> At 100%, new content pauses
            club-wide — clear the big categories below now.
          </p>
        </section>
      )}

      {/* ── 1. Usage hero — the dial, on glass, with a club-accent halo ──── */}
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-3 rounded-[2.5rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--club-accent)_13%,transparent),transparent)] blur-2xl sm:-inset-6"
        />
        <div className="storage-glass storage-rise">
          <div className="flex flex-col items-center px-5 pt-7 text-center sm:px-8 sm:pt-9">
            <UsageDial
              label={pctLabel}
              fraction={pctClamped / 100}
              tone={arcTone}
              mounted={dialMounted}
              valueNow={Math.round(percent)}
            />

            <p className="mt-5 text-sm tabular-nums text-muted-foreground">
              <span
                className="font-medium text-foreground/85"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatBytes(animatedBytes)}
              </span>{" "}
              of {(quota / 1024 / 1024).toFixed(0)} MB used
            </p>
            <div className="mt-3">
              <StatusBadge status={status.kind} label={status.label} />
            </div>
            <p className="mt-2.5 text-caption tabular-nums">
              {over > 0
                ? `Over quota by ${formatBytes(over)}`
                : `${formatBytes(free)} free`}
              {paceRatio > 0 && (
                <>
                  {" "}· ≈ {paceRatio >= 99999 ? "99,999×+" : `${formatCount(paceRatio)}×`} more
                  content before full
                </>
              )}
            </p>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load("refresh")}
              disabled={busy}
              className="mt-4 rounded-full px-4 text-muted-foreground"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>

          {/* Hero footer — the capacity escape hatch, always one tap away. */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 px-5 py-4 sm:px-8">
            <p className="text-caption text-muted-foreground">
              {quota / 1024 / 1024} MB shared by the whole club.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full px-4 text-muted-foreground"
              onClick={() => setIncreaseOpen(true)}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" /> Increase storage capacity
            </Button>
          </div>
        </div>
      </section>

      {/* ── 2. Cleanup pane — directly beneath the usage hero, per user ────
          Top 3 categories ranked by clearing-impact (things nobody will
          miss) then by size, with concrete instructions. Finance is
          deliberately NOT here — see the last-resort note at the bottom. */}
      {actionable.length > 0 && (
        <section
          id="free-up-space"
          className="storage-glass storage-glass--warm storage-rise"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex items-center gap-2 px-5 pb-2 pt-4 sm:px-6">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2
              className="text-card-title tracking-[-0.01em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {percent >= 70 ? "Free up space" : "Keep it tidy"}
            </h2>
          </div>
          <div className="divide-y divide-border/60">
            {actionable.map((cat) => {
              const meta = metaFor(cat.id)
              const targetView = meta.view
              return (
                <JumpRow
                  key={cat.id}
                  icon={meta.icon}
                  tileClass={tileFor(cat.id)}
                  label={cat.label}
                  detail={meta.hint}
                  aside={formatBytes(cat.bytes)}
                  onOpen={targetView ? () => setView(targetView) : undefined}
                />
              )
            })}
          </div>

          {/* The one direct danger action — a soft, calm pill, offered only
              once the quota is at risk (90%+) or already exhausted. */}
          {(isFull || percent >= 90) && (
            <div className="px-5 pt-4 sm:px-6">
              <button
                type="button"
                onClick={() => setView("chat")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-500/15 focus-visible:bg-red-500/15 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/20 dark:focus-visible:bg-red-500/20"
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
                Clear old messages
              </button>
            </div>
          )}

          {/* Last-resort note — finance is intentionally never suggested
              above: transactions and service hours are the club's official
              records. Say so once, plainly, so nobody clears their books to
              free a few kilobytes. */}
          <div className="border-t border-border/60 px-5 py-4 sm:px-6">
            <p className="flex items-start gap-2 text-caption leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>
                Avoid clearing{" "}
                <strong className="font-semibold text-foreground/80">Finance</strong> unless you
                must; it&apos;s the club&apos;s official record.
              </span>
            </p>
          </div>
        </section>
      )}

      {/* ── 3. Category panes — clean jump-rows, honest (bytes > 0 only) ─── */}
      {grouped.length > 0 && (
        <div
          className="storage-rise flex items-baseline gap-2"
          style={{ animationDelay: "160ms" }}
        >
          <h2
            className="text-card-title tracking-[-0.01em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            What&apos;s taking space
          </h2>
          <span className="text-caption text-muted-foreground tabular-nums">
            · {formatCount(shown.categories.reduce((a, c) => a + c.items, 0))} live rows
          </span>
        </div>
      )}
      {grouped.map((group, gi) => (
        <section
          key={group.id}
          className="storage-glass storage-glass--quiet storage-rise"
          style={{ animationDelay: `${160 + 80 * (gi + 1)}ms` }}
        >
          <h2 className="px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:px-6">
            {group.title}
          </h2>
          <div className="divide-y divide-border/60">
            {group.cats.map((cat) => {
              const meta = metaFor(cat.id)
              const share = sharePct(cat.bytes, used)
              const targetView = meta.view
              return (
                <JumpRow
                  key={cat.id}
                  icon={meta.icon}
                  tileClass={tileFor(cat.id)}
                  label={cat.label}
                  detail={`${formatBytes(cat.bytes)} · ${formatCount(cat.items)} ${
                    cat.items === 1 ? "item" : "items"
                  }`}
                  aside={share > 0 ? `${share}%` : undefined}
                  onOpen={targetView ? () => setView(targetView) : undefined}
                />
              )
            })}
          </div>
        </section>
      ))}

      {/* ── Increase-storage dialog ──────────────────────────────────────── */}
      <IncreaseStorageDialog
        open={increaseOpen}
        onOpenChange={setIncreaseOpen}
        clubName={clubName}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// IncreaseStorageDialog — the "more room" path. Clubs outgrow 15 MB? Email
// the operator. Copy address + open mail app, club name pre-filled in the
// subject so the request is one glance to action.
// ---------------------------------------------------------------------------

function IncreaseStorageDialog({
  open,
  onOpenChange,
  clubName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clubName: string
}) {
  const [copied, setCopied] = useState(false)

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(STORAGE_CONTACT_EMAIL)
      setCopied(true)
      toast.success("Email copied to clipboard")
      // Self-resetting chip — no dialog-open effect needed ( reopening
      // within the 2s window simply keeps showing "Copied", which is true).
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the email address")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG_CLASS, "sm:max-w-md")}>
        <div className="px-5 pt-5 pb-6 sm:px-0 sm:pt-0 sm:pb-0 flex flex-col gap-4">
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-club-muted text-club">
              <ArrowUpCircle className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle>Increase storage capacity</DialogTitle>
            <DialogDescription>
              Email {STORAGE_CONTACT_EMAIL} to request more space.
            </DialogDescription>
          </DialogHeader>

          {/* The address, front and center — tappable + copyable. */}
          <a
            href={`mailto:${STORAGE_CONTACT_EMAIL}?subject=${encodeURIComponent(
              `Storage increase request — ${clubName}`,
            )}&body=${encodeURIComponent(
              `Hi,\n\nI'd like to increase the storage capacity for my club "${clubName}" on ClubHub.\n\nCurrent quota: 15 MB\nThanks!`,
            )}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 transition-colors hover:border-club/40 hover:bg-club-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-club shadow-card">
              <Mail className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {STORAGE_CONTACT_EMAIL}
              </span>
              <span className="block text-caption text-muted-foreground">
                Pre-fills your mail app
              </span>
            </span>
          </a>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={copyEmail}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy email
                </>
              )}
            </Button>
            <Button variant="club" asChild>
              <a
                href={`mailto:${STORAGE_CONTACT_EMAIL}?subject=${encodeURIComponent(
                  `Storage increase request — ${clubName}`,
                )}&body=${encodeURIComponent(
                  `Hi,\n\nI'd like to increase the storage capacity for my club "${clubName}" on ClubHub.\n\nCurrent quota: 15 MB\nThanks!`,
                )}`}
              >
                <Mail className="h-4 w-4" /> Email about storage
              </a>
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            Your club name is already included.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Loading skeleton — content-shaped (dial hero + glass panes) ────────────

function StorageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header ghost */}
      <div className="h-7 w-32 rounded skeleton-shimmer" />

      {/* Hero glass — dial + captions + footer pill */}
      <div className="storage-glass">
        <div className="flex flex-col items-center px-5 pt-8 sm:px-8">
          <div className="size-40 rounded-full skeleton-shimmer sm:size-[168px]" />
          <div className="mt-5 h-4 w-44 max-w-full rounded skeleton-shimmer" />
          <div className="mt-3 h-5 w-20 rounded-full skeleton-shimmer" />
          <div className="mt-4 h-3.5 w-64 max-w-full rounded skeleton-shimmer" />
          <div className="mb-5 mt-5 h-9 w-24 rounded-full skeleton-shimmer" />
        </div>
        <div className="flex w-full items-center justify-between gap-4 border-t border-border/60 px-5 py-4 sm:px-8">
          <div className="h-3 w-40 max-w-full rounded skeleton-shimmer" />
          <div className="h-8 w-36 rounded-full skeleton-shimmer" />
        </div>
      </div>

      {/* Category panes */}
      {[3, 2].map((rows, i) => (
        <div key={i} className="storage-glass">
          <div className="px-5 pt-4 pb-2 sm:px-6">
            <div className="h-3 w-28 rounded skeleton-shimmer" />
          </div>
          <div className="divide-y divide-border/60">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="flex items-center gap-3.5 px-5 py-3.5 sm:px-6">
                <div className="h-10 w-10 shrink-0 rounded-2xl skeleton-shimmer" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-1/3 rounded skeleton-shimmer" />
                  <div className="h-2.5 w-1/2 rounded skeleton-shimmer" />
                </div>
                <div className="h-4 w-4 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
