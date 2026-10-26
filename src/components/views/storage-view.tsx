"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  CheckCircle2,
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
  Zap,
  Info,
  type LucideIcon,
} from "lucide-react"

/* =========================================================================
   Storage — executive-only club footprint view.
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
   *  a real view — drives the ranked "free up space" suggestion cards. */
  view?: View
  /** Concrete, useful copy for the suggestion card. */
  hint?: string
  /** Clearing-impact tier for the suggestion ranking (see CleanupImpact). */
  impact?: CleanupImpact
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  chat: {
    icon: MessageSquare,
    view: "chat",
    impact: "low",
    hint: "Old threads and banter — pure conversation, no club records. Hover any message to delete it, or clear a whole old conversation.",
  },
  announcements: {
    icon: Megaphone,
    view: "announcements",
    impact: "medium",
    hint: "Outdated posts and their comments — members have long since seen them. Deleting frees the space instantly.",
  },
  tasks: {
    icon: ListTodo,
    view: "tasks",
    impact: "medium",
    hint: "Finished tasks from past projects — titles, descriptions and comments all stop counting once cleared.",
  },
  notes: {
    icon: StickyNote,
    view: "notes",
    impact: "low",
    hint: "Old notes and scratch pads — they stop counting the second they're gone and are easy to re-create if ever needed.",
  },
  meetings: {
    icon: CalendarDays,
    view: "meetings",
    impact: "low",
    hint: "Past meetings you no longer need — their details and RSVP history free up the moment they're deleted.",
  },
  finance: {
    icon: Wallet,
    view: "financials",
    impact: "high",
    hint: "Official records — clear last, and only entries you're certain you'll never need.",
  },
  activity: {
    icon: History,
    view: "activity",
    impact: "none",
    hint: "A pure feed of what happened — clearing it changes nothing else in the club, and old entries are the easiest bytes you'll ever free.",
  },
  images: {
    icon: ImageIcon,
    view: "members",
    impact: "low",
    hint: "Re-upload a smaller logo or banner — only the newest file counts, and the old one stops the moment it's replaced.",
  },
  people: { icon: Users },
  profile: { icon: Building2 },
}

const FALLBACK_META: CategoryMeta = { icon: Building2 }

function metaFor(id: string): CategoryMeta {
  return CATEGORY_META[id] ?? FALLBACK_META
}

// Monochrome shade ladder for the stacked composition bar — assigned by rank
// (largest category gets the strongest ink), skipping zero-byte segments.
const SHADES = [
  "bg-foreground/85",
  "bg-foreground/70",
  "bg-foreground/55",
  "bg-foreground/40",
  "bg-foreground/30",
  "bg-foreground/22",
  "bg-foreground/16",
  "bg-foreground/11",
  "bg-foreground/7",
  "bg-foreground/4",
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
  // dedicated "last resort" note under the grid instead.
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

  // ── Guard states ────────────────────────────────────────────────────────
  if (!clubId) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No club selected"
        description="Pick a club from the sidebar to view its storage."
      />
    )
  }

  if (loading && !shown) return <StorageSkeleton />

  if (forbidden) {
    return (
      <EmptyState
        icon={<Shield className="h-8 w-8" />}
        title="Executives only"
        description="Club storage is an executive tool — ask a club executive if you need a footprint report."
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

  // Meter fill escalates with the same thresholds as the status chip.
  const meterFill = percent >= 90 ? "bg-danger" : percent >= 70 ? "bg-warning" : "bg-club"

  // Pace: how many times the current content fits before the quota is full.
  const paceRatio = used > 0 ? Math.floor(quota / used) : 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Storage"
        description="Your current storage for your club."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load("refresh")}
            disabled={busy}
            className="text-muted-foreground shrink-0"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      {/* ── 0. Storage-full pause notice ───────────────────────────────────
          At 100% the whole club's storage-taking writes are paused (see
          src/lib/storage-guard.ts). This is the executive's at-a-glance
          explanation + the two ways out: clear content, or request more. */}
      {isFull && (
        <section
          role="alert"
          className="animate-fade-in relative overflow-hidden rounded-xl border border-danger/40 bg-danger-subtle p-4 sm:p-5"
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
                Messages, posts, notes, tasks, meetings and uploads are paused
                for <span className="font-medium">everyone</span> in {clubName}
                until an executive clears some room. Deleting frees space
                instantly — members are being told to message executives to
                clear it.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 sm:ml-[3.25rem]">
            <Button
              variant="outline"
              size="sm"
              className="border-danger/40 text-danger-foreground hover:bg-danger/10"
              onClick={() => setView("chat")}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Clear old messages
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
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
          className="animate-fade-in flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-subtle/60 p-4"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning [&_svg]:size-4">
            <AlertTriangle aria-hidden />
          </span>
          <p className="text-body leading-relaxed text-foreground/80">
            <span className="font-medium">Almost full.</span> At 100%, new
            content pauses club-wide until someone clears room — tidy the big
            categories below now and it never comes to that.
          </p>
        </section>
      )}

      {/* ── 1. Usage hero ─────────────────────────────────────────────────── */}
      <section className="card-quiet p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="text-4xl font-semibold tracking-tight tabular-nums text-balance"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatBytes(animatedBytes)}
              </span>
              <span className="text-body text-muted-foreground">
                of {(quota / 1024 / 1024).toFixed(0)} MB used
              </span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground tabular-nums">
              {percent.toFixed(2)}% of your club&apos;s storage
            </p>
          </div>
          <StatusBadge status={status.kind} label={status.label} />
        </div>

        {/* Gradient meter with labeled 70% / 90% ticks (hairlines live inside
            the track — no overshoot) and tiny labels below. */}
        <div className="mt-5">
          <div
            className="relative h-3 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-label="Club storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out",
                meterFill,
                used > 0 && "min-w-[3px]",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
              )}
              style={{ width: `${pctClamped}%` }}
            />
            <span aria-hidden className="absolute inset-y-0 left-[70%] w-px bg-border" />
            <span aria-hidden className="absolute inset-y-0 left-[90%] w-px bg-border" />
          </div>
          <div className="relative mt-1.5 h-3.5 text-[10px] leading-none text-muted-foreground/80 tabular-nums">
            <span className="absolute left-[70%] -translate-x-1/2">70%</span>
            <span className="absolute left-[90%] -translate-x-1/2">90%</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          <span className="tabular-nums">
            {over > 0
              ? `Over quota by ${formatBytes(over)}`
              : `${formatBytes(free)} free`}
          </span>
          {paceRatio > 0 && (
            <span className="tabular-nums">
              ≈{" "}
              {paceRatio >= 99999
                ? "99,999×+"
                : `${formatCount(paceRatio)}×`}{" "}
              more content before full
            </span>
          )}
        </div>

        {/* ── 2. Monochrome stacked composition bar ──────────────────────── */}
        {composition.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border/60">
            <div className="flex h-2 items-stretch gap-[2px]" aria-hidden>
              {composition.map((cat, i) => (
                <div
                  key={cat.id}
                  className={cn(
                    "min-w-[2px] rounded-[3px]",
                    SHADES[i % SHADES.length],
                  )}
                  style={{ flexGrow: cat.bytes, flexBasis: 0 }}
                />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {composition.map((cat, i) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center gap-1.5 text-caption text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-[3px]", SHADES[i % SHADES.length])}
                  />
                  {cat.label}
                  <span className="tabular-nums text-muted-foreground/70">
                    {sharePct(cat.bytes, used)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hero footer — the capacity escape hatch, always one tap away. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-caption text-muted-foreground">
            {quota / 1024 / 1024} MB shared by the whole club — messages, posts,
            notes, uploads and more.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setIncreaseOpen(true)}
          >
            <ArrowUpCircle className="h-4 w-4" />
            Increase storage capacity
          </Button>
        </div>
      </section>

      {/* ── 4. Ranked "what to clear" suggestions — safe wins first ─────────
          Top 3 categories ranked by clearing-impact (things nobody will miss)
          then by size, with concrete instructions. Finance is deliberately
          NOT here — see the last-resort note under the grid. */}
      {actionable.length > 0 && (
        <section id="free-up-space" className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-section-title">
              {percent >= 70 ? "Free up space" : "Keep it tidy"}
            </h2>
            <span className="text-caption text-muted-foreground">
              · safe wins first
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {actionable.map((cat, rank) => {
              const meta = metaFor(cat.id)
              const share = sharePct(cat.bytes, used)
              return (
                <div
                  key={cat.id}
                  className={cn(
                    "card-quiet animate-fade-in p-4 flex flex-col gap-3",
                    isFull
                      ? "border-danger/50"
                      : percent >= 90
                        ? "border-warning/50"
                        : rank === 0 && percent >= 70 && "border-warning/30",
                  )}
                  style={{ animationDelay: `${Math.min(rank * 60, 180)}ms` }}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                      <meta.icon />
                    </div>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-medium">
                        {cat.label} ·{" "}
                        <span className="tabular-nums font-medium">
                          {formatBytes(cat.bytes)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          ({share}% of usage)
                        </span>
                        {rank === 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-club-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-club">
                            <Zap className="h-2.5 w-2.5" aria-hidden />
                            Easiest win
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                        {meta.impact === "none" && "Clears with zero impact on your club"}
                        {meta.impact === "low" && "Low impact — nothing official lives here"}
                        {meta.impact === "medium" && "Medium impact — members lose some history"}
                      </p>
                      <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                        {meta.hint}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start mt-auto text-muted-foreground"
                    onClick={() => meta.view && setView(meta.view)}
                  >
                    Open {cat.label}
                  </Button>
                </div>
              )
            })}
          </div>
          {/* Last-resort note — finance is intentionally never suggested
              above: transactions and service hours are the club's official
              records. Say so once, plainly, so nobody clears their books to
              free a few kilobytes. */}
          <p className="flex items-start gap-2 text-caption leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span>
              One thing to avoid clearing unless you truly must:{" "}
              <strong className="font-semibold text-foreground/80">Finance</strong>{" "}
              — transactions and service hours are your club&apos;s official
              record, and future executives will need that history.
            </span>
          </p>
        </section>
      )}

      {/* ── 3. Ranked category rows ──────────────────────────────────────── */}
      <section className="card-quiet overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-1 flex items-center gap-2">
          <h2 className="text-card-title">What&apos;s taking space</h2>
          <span className="text-caption text-muted-foreground tabular-nums">
            · {formatCount(shown.categories.reduce((a, c) => a + c.items, 0))} live rows
          </span>
        </div>
        <div className="divide-y divide-border">
          {ranked.map((cat, i) => {
            const meta = metaFor(cat.id)
            const share = sharePct(cat.bytes, used)
            return (
              <div
                key={cat.id}
                className="flex items-center gap-3 px-4 sm:px-5 py-3.5 animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                  <meta.icon />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-medium truncate">{cat.label}</span>
                    <span className="tabular-nums font-medium text-sm whitespace-nowrap">
                      {formatBytes(cat.bytes)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-caption text-muted-foreground truncate">
                      {cat.detail}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatCount(cat.items)} {cat.items === 1 ? "item" : "items"}
                      {share > 0 && <> · {share}%</>}
                    </span>
                  </div>
                  {/* No overflow-hidden here so the fill's soft glow can
                      breathe just past the track edges. */}
                  <div className="mt-2 h-1 rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        meterFill,
                        cat.bytes > 0 && "min-w-[3px]",
                        "shadow-[0_0_6px_color-mix(in_oklab,var(--club-accent)_25%,transparent)]",
                      )}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

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
              Message {STORAGE_CONTACT_EMAIL} to increase your storage
              capacity if needed.
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
                Opens your mail app with the request pre-filled
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
            Include your club name and code so the request is quick to action.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Loading skeleton — content-shaped (hero + rows) ─────────────────────────

function StorageSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header row with a ghost refresh button */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded skeleton-shimmer" />
          <div className="h-3.5 w-72 max-w-full rounded skeleton-shimmer" />
        </div>
        <div className="h-8 w-24 rounded-md skeleton-shimmer" />
      </div>

      {/* Hero block */}
      <div className="card-quiet p-5 sm:p-6 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-9 w-44 rounded skeleton-shimmer" />
            <div className="h-3 w-28 rounded skeleton-shimmer" />
          </div>
          <div className="h-6 w-20 rounded-full skeleton-shimmer" />
        </div>
        <div className="h-3 w-full rounded-full skeleton-shimmer" />
        <div className="h-3 w-1/2 rounded skeleton-shimmer" />
        <div className="pt-4 border-t border-border/60 space-y-2.5">
          <div className="h-2 w-full rounded-full skeleton-shimmer" />
          <div className="h-3 w-2/3 rounded skeleton-shimmer" />
        </div>
      </div>

      {/* Suggestion cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-quiet p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg skeleton-shimmer shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded skeleton-shimmer" />
                <div className="h-2.5 w-full rounded skeleton-shimmer" />
              </div>
            </div>
            <div className="h-8 w-24 rounded-md skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Ranked rows */}
      <div className="card-quiet overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-border last:border-0"
          >
            <div className="size-9 rounded-lg skeleton-shimmer shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex justify-between gap-3">
                <div className="h-3.5 w-1/4 rounded skeleton-shimmer" />
                <div className="h-4 w-14 rounded skeleton-shimmer" />
              </div>
              <div className="flex justify-between gap-3">
                <div className="h-2.5 w-1/3 rounded skeleton-shimmer" />
                <div className="h-2.5 w-16 rounded skeleton-shimmer" />
              </div>
              <div className="h-1 w-1/2 rounded-full skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
