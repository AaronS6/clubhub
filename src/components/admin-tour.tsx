"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion"
import {
  ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, CheckSquare, Clock,
  Clapperboard, Copy, Database, Eye, Flag, Image as ImageIcon, KeyRound,
  LayoutDashboard, ListChecks, Lock, Megaphone, MessageSquare, NotebookPen,
  PenLine, Pin, Play, Plus, ScrollText, ShieldAlert, ShieldCheck,
  TrendingUp, Upload, UserCog, UserPlus, Users, Wand2, Wallet, X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore, type View } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * ============================================================================
 * AdminTour — the Executive introduction guide ("executive walkthrough")
 * ============================================================================
 *
 * A dedicated first-run guide for EXECUTIVES ONLY (the regular member
 * onboarding tour lives in onboarding-tour.tsx). It walks an exec through
 * every admin power in the club — branding, invites, the approval desk,
 * day-to-day running, money & records, and the exec-only oversight tools —
 * with a SCREENCAST-STYLE DEMO of how each feature works and a "try it now"
 * button that jumps straight into the real thing.
 *
 * DESIGN — built to feel like a flagship product onboarding:
 *   • Every demo lives in a PreviewFrame: a mini browser window (traffic
 *     lights, a lock + URL pill showing the real route) with a solid DEMO
 *     tag in the chrome and an amber SAMPLE label in the status bar — it is
 *     unmistakable that the contents are simulated, never the real club.
 *   • One clock drives every beat. The cursor glides to its target
 *     (~0.2s), PRESSES it — the target itself visibly depresses, exactly
 *     like a real screencast; the result fires at +0.42s. Cause and
 *     effect are always in the right order, never before the click.
 *   • Captions crossfade instantly (no stacked exit/enter dead time) — and
 *     nothing in the chrome loops or sweeps, so the demo stays calm to read.
 *   • Feature steps are TWO COLUMNS on md+ (demo left, copy right), centered
 *     single column below — the modal itself stays a centered card (never a
 *     fullscreen takeover), slides up as a bottom sheet on mobile, and is
 *     fully theme-aware (bg-card / border-border / --club-accent).
 *   • Segmented progress (8 segments) in the header; ←/→/Enter/Escape
 *     keyboard nav; every duration collapses under prefers-reduced-motion
 *     (demos freeze on their finished state, cursor hidden).
 *
 * OPEN TRIGGERS
 *   1. AUTO, once per club per browser: when the active club's viewer is an
 *      executive, the handbook has been acknowledged, and the localStorage
 *      flag `clubhub-admin-tour-seen-<clubId>` is absent. Any close path
 *      stamps the flag.
 *   2. MANUAL, anytime: the `open-admin-tour` window event — dispatched by
 *      the "Replay executive guide" button in Settings → Security (rendered
 *      for executives of the active club only). The handler re-checks the
 *      role so a stale event can never show the guide to a regular member.
 *
 * NEVER LOST MID-TOUR: every "leave early" path — Escape, X, clicking the
 * scrim, or a "try it now" jump into a real view — SUSPENDS the guide
 * instead of destroying it. A small floating pill docks just below the top
 * bar (step counter + segmented progress + Resume) so the exec can pick up
 * exactly where they left off while they click around the real app. The
 * "seen" flag is only stamped by finishing the guide or explicitly
 * dismissing the pill — an interrupted guide never counts as done.
 *
 * FINISH → MEMBER GUIDE: executives are members too. Completing this guide
 * (final button, Enter, or → on the last step) chains straight into the
 * member introduction guide ~0.4s later — avatar, decorations, personal
 * profile — via the `open-onboarding-tour` event. Escape/X/try-it jumps do
 * NOT chain (they suspend instead), and the Ready step offers a visible
 * "skip" link as well.
 *
 * STEPS (8 — same order for every executive)
 *   1  Welcome   — club lockup + the six stops at a glance
 *   2  Brand     — Dashboard banner (focus drag), logo/description, club
 *                  goal, executive insights       → try: Dashboard
 *   3  Invite    — club code + password, join requests, CSV import,
 *                  roles, public directory          → try: Members
 *   4  Approvals — the service-hour review desk (single + bulk, proof,
 *                  rejection comments)             → try: Approvals
 *   5  Run       — announcements (pin/urgent), meetings (recurring +
 *                  RSVP), tasks (main goal), teams → try: each view
 *   6  Records   — financials ledger, chat moderation, notes
 *                                                    → try: Financials
 *   7  Oversight — Activity Log + Storage (exec-only pair)
 *                                                    → try: Activity Log
 *   8  Ready     — auto-checking "try everything" checklist + jump chips
 *                  + the member-guide hand-off
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Steps & content data
// ---------------------------------------------------------------------------

type StepId =
  | "welcome"
  | "brand"
  | "invite"
  | "approvals"
  | "run"
  | "records"
  | "oversight"
  | "ready"

const STEP_ORDER: readonly StepId[] = [
  "welcome", "brand", "invite", "approvals", "run", "records", "oversight", "ready",
]

type BulletItem = { icon: LucideIcon; lead: string; rest: string }

const BRAND_BULLETS: BulletItem[] = [
  {
    icon: ImageIcon,
    lead: "The banner.",
    rest: "Upload it, then drag the focus point.",
  },
  {
    icon: PenLine,
    lead: "Logo & description.",
    rest: "Set once in Members — used everywhere.",
  },
  {
    icon: Flag,
    lead: "The club goal.",
    rest: "One hours target, tracked on every member’s dashboard.",
  },
  {
    icon: LayoutDashboard,
    lead: "Executive insights.",
    rest: "Pending approvals and completion rate, front and center.",
  },
]

const INVITE_BULLETS: BulletItem[] = [
  {
    icon: KeyRound,
    lead: "Code + password.",
    rest: "Share them for instant joins — regenerate anytime.",
  },
  {
    icon: UserPlus,
    lead: "Join requests.",
    rest: "No code? They request in with a note.",
  },
  {
    icon: Upload,
    lead: "CSV import.",
    rest: "Import a whole roster, up to 500 rows.",
  },
  {
    icon: ShieldCheck,
    lead: "Roles & removal.",
    rest: "Promote, demote, or remove — removals have undo.",
  },
  {
    icon: Eye,
    lead: "Public directory.",
    rest: "Flip it on to list the club on Explore.",
  },
]

const APPROVAL_BULLETS: BulletItem[] = [
  {
    icon: ListChecks,
    lead: "The pending queue.",
    rest: "Each shows its reason, category, and proof.",
  },
  {
    icon: BadgeCheck,
    lead: "Approve or reject.",
    rest: "One click approves; rejects ask for a comment.",
  },
  {
    icon: CheckSquare,
    lead: "Bulk review.",
    rest: "Select a batch and clear the queue in seconds.",
  },
  {
    icon: Clock,
    lead: "Review ETA.",
    rest: "Members see an ETA on pending hours.",
  },
]

const RUN_BULLETS: BulletItem[] = [
  {
    icon: Megaphone,
    lead: "Announcements.",
    rest: "Post, pin, or mark urgent app-wide.",
  },
  {
    icon: CalendarDays,
    lead: "Meetings.",
    rest: "One-off or recurring, with live RSVPs.",
  },
  {
    icon: CheckSquare,
    lead: "Tasks.",
    rest: "Anyone can assign them; you set the Main Goal.",
  },
  {
    icon: Users,
    lead: "Teams.",
    rest: "Sub-groups you can reshuffle anytime.",
  },
]

const RECORDS_BULLETS: BulletItem[] = [
  {
    icon: Wallet,
    lead: "Financials.",
    rest: "The club sees the balance; only execs edit.",
  },
  {
    icon: MessageSquare,
    lead: "Chat, moderated.",
    rest: "Groups and DMs — rename, pin, or remove messages.",
  },
  {
    icon: NotebookPen,
    lead: "Notes.",
    rest: "Everyone writes; you can tidy up any note.",
  },
]

const OVERSIGHT_BULLETS: BulletItem[] = [
  {
    icon: ScrollText,
    lead: "Activity Log.",
    rest: "Who did what and when — filter or clear.",
  },
  {
    icon: Database,
    lead: "Storage.",
    rest: "What fills the 15 MB quota, by category.",
  },
  {
    icon: ShieldCheck,
    lead: "Yours alone.",
    rest: "Members never see these two.",
  },
]

const READY_ITEMS: { icon: LucideIcon; text: string }[] = [
  { icon: Megaphone, text: "Post your first announcement" },
  { icon: CalendarDays, text: "Schedule a meeting" },
  { icon: ListChecks, text: "Approve a submitted hour" },
  { icon: Users, text: "Create a team" },
  { icon: KeyRound, text: "Share your club code" },
]

/** Ready-step quick jumps (view targets, not demos). */
const READY_JUMPS: { icon: LucideIcon; label: string; view: View }[] = [
  { icon: ListChecks, label: "Approvals", view: "approvals" },
  { icon: UserCog, label: "Members", view: "members" },
  { icon: Megaphone, label: "Announcements", view: "announcements" },
  { icon: CalendarDays, label: "Meetings", view: "meetings" },
  { icon: Wallet, label: "Financials", view: "financials" },
  { icon: ScrollText, label: "Activity", view: "activity" },
]

// ---------------------------------------------------------------------------
// Motion — variant factories so every duration can collapse under
// prefers-reduced-motion (transform/opacity only; nothing repaints).
// ---------------------------------------------------------------------------

const EASE = [0.22, 1, 0.36, 1] as const

/** The cursor's glide: fast, soft-landing, almost no overshoot. */
const CURSOR_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const

const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.16, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: EASE } },
}

const makeStepVariants = (reduce: boolean): Variants => ({
  enter: { opacity: 0, y: reduce ? 0 : 8 },
  visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.17, ease: EASE } },
  exit: { opacity: 0, y: reduce ? 0 : -5, transition: { duration: reduce ? 0 : 0.09, ease: EASE } },
})

const makeFadeUp = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : 8 },
  visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.22, ease: EASE } },
})

const makeStagger = (reduce: boolean): { container: Variants; child: Variants } => ({
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: reduce ? 0 : 0.035, delayChildren: 0.02 } },
  },
  child: {
    hidden: { opacity: 0, y: reduce ? 0 : 6 },
    visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.18, ease: EASE } },
  },
})

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0")

const HEADLINE_STYLE = { fontFamily: "var(--font-display)", letterSpacing: "-0.03em" } as const

const EYEBROW_CLS = "text-[0.62rem] font-bold tracking-[0.22em] uppercase text-club"

const STEP_SHELL_CLS = "mx-auto w-full max-w-xl px-5 py-5 sm:px-8 sm:py-7"

const FEATURE_SHELL_CLS = "mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-6"

/** ms after the guide closes before the member guide chains in. */
const MEMBER_GUIDE_CHAIN_MS = 380

// ---------------------------------------------------------------------------
// The demo clock — ONE timeline per beat, so cause always precedes effect
// ---------------------------------------------------------------------------
//
// Every screencast beat is driven by a single set of timers:
//
//   t=0      beat begins — caption swaps, cursor starts gliding to target
//   t=200ms  the cursor PRESSES — the target itself visibly depresses
//   t=420ms  the click LANDS — the result fires (pill flips, row approves…)
//   t=540ms  the press releases
//   t=dur    next beat
//
// The old version fired results on a separate delay that landed BEFORE the
// cursor pressed — the UI reacted to a click that hadn't happened yet. That
// single ordering bug is most of why a mock feels "off", so everything now
// reads its phase from this one clock.

const PRESS_MS = 200
const ACT_MS = 420
const RELEASE_MS = 540

type LoopState = { i: number; pressed: boolean; acted: boolean }

/**
 * useLoop — cycles a demo through its beats forever, exposing:
 *   i       the current beat index
 *   pressed true while the cursor is mid-press (200–540ms into the beat)
 *   acted   true once the click has landed (420ms onward)
 * Pass a MODULE-LEVEL const array so the effect identity stays stable.
 * Disabled (frozen on the final beat, already acted) under
 * prefers-reduced-motion.
 */
function useLoop(durations: readonly number[], enabled: boolean): LoopState {
  const [state, setState] = useState<LoopState>({ i: 0, pressed: false, acted: false })
  useEffect(() => {
    if (!enabled) return
    let timers: ReturnType<typeof setTimeout>[] = []
    /** Arm one beat's timers. The state itself is only ever written from
     *  inside timer callbacks, so the effect body stays render-safe. */
    const arm = (n: number) => {
      timers.push(
        setTimeout(() => setState((s) => (s.i === n ? { ...s, pressed: true } : s)), PRESS_MS),
        setTimeout(() => setState((s) => (s.i === n ? { ...s, acted: true } : s)), ACT_MS),
        setTimeout(() => setState((s) => (s.i === n ? { ...s, pressed: false } : s)), RELEASE_MS),
        setTimeout(() => advance((n + 1) % durations.length), durations[n]),
      )
    }
    const advance = (n: number) => {
      setState({ i: n, pressed: false, acted: false })
      arm(n)
    }
    // Kick the clock from a 0ms tick so even a re-enable mid-loop resets
    // cleanly (the initial state already matches beat 0, so nothing flashes).
    timers.push(setTimeout(() => advance(0), 0))
    return () => {
      timers.forEach(clearTimeout)
      timers = []
    }
  }, [enabled, durations])
  return enabled ? state : { i: durations.length - 1, pressed: false, acted: true }
}

// ---------------------------------------------------------------------------
// Demo atoms — the shared pieces every screencast is built from
// ---------------------------------------------------------------------------

/** Where the demo cursor sits for one beat (percent of the demo body),
 *  and whether it CLICKS when it lands there. */
type CursorSpec = { x: number; y: number; click?: boolean }

/** The classic arrow cursor glyph — tip anchored at its top-left corner. */
function CursorGlyph() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 17 17"
      fill="none"
      aria-hidden
      className="block drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
    >
      <path
        d="M1 1.2 L1 14.6 L4.7 11.1 L7 16.2 L9.2 15.2 L7 10.4 L11.6 10.1 Z"
        fill="#ffffff"
        stroke="rgba(15,23,42,0.85)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * DemoCursor — glides to each beat's target on a soft-landing spring, then
 * dips and fires a ripple the moment the clock says "pressed". Decorative
 * (aria-hidden) and never rendered under prefers-reduced-motion.
 */
function DemoCursor({ spec, beat, pressing }: { spec: CursorSpec; beat: number; pressing: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-30"
      initial={false}
      animate={{ left: `${spec.x}%`, top: `${spec.y}%` }}
      transition={CURSOR_SPRING}
    >
      <motion.span
        animate={{ scale: pressing ? 0.78 : 1 }}
        transition={{ duration: 0.1, ease: "easeInOut" }}
        className="block origin-top-left"
      >
        <CursorGlyph />
      </motion.span>
      {pressing && (
        <motion.span
          key={`ripple-${beat}`}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="absolute -left-3.5 -top-3.5 block h-7 w-7 rounded-full border-2 border-club/70"
        />
      )}
    </motion.div>
  )
}

/**
 * PressTarget — wraps one demo control so it visibly depresses at the exact
 * moment the demo cursor presses it: a quick 0.93 squeeze with a snappy
 * spring release. This is what makes a mock read as a real screencast — the
 * clicked thing reacts, not just the cursor.
 */
function PressTarget({
  pressed, reduce, className, children,
}: {
  pressed: boolean
  reduce: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <motion.span
      className={cn("inline-flex", className)}
      animate={reduce ? { scale: 1 } : { scale: pressed ? 0.93 : 1 }}
      transition={{ type: "spring", stiffness: 700, damping: 34 }}
    >
      {children}
    </motion.span>
  )
}

/**
 * PreviewFrame — the unmistakably-a-demo host. A mini browser window:
 * traffic lights, a lock + URL pill for the REAL route of the feature being
 * shown, a solid DEMO tag in the chrome, and a status bar narrating each
 * beat with an amber SAMPLE label on the right. Decorative (aria-hidden);
 * under reduced-motion the loop freezes on the finished state and the
 * cursor never renders.
 */
function PreviewFrame({
  url, reduce, index, pressed, captions, cursor, children,
}: {
  url: string
  reduce: boolean
  index: number
  pressed: boolean
  captions: readonly string[]
  cursor?: readonly CursorSpec[]
  children: ReactNode
}) {
  const cap = captions[Math.min(index, captions.length - 1)]
  const cur = cursor && !reduce ? cursor[Math.min(index, cursor.length - 1)] : null
  return (
    <section
      aria-hidden
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card"
    >
      {/* browser chrome: traffic lights · URL pill · DEMO tag */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/50 px-3 py-2">
        <span className="flex shrink-0 gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1">
          <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[10px] font-medium text-muted-foreground">{url}</span>
        </span>
        <span className="inline-flex shrink-0 items-center rounded-full bg-club px-2 py-[3px] text-[9px] font-black uppercase tracking-[0.16em] text-club-foreground">
          demo
        </span>
      </div>

      {/* body — the looping screencast + cursor overlay */}
      <div className="relative p-3.5 sm:p-4">
        {children}
        {cur && <DemoCursor spec={cur} beat={index} pressing={!!cur.click && pressed} />}
      </div>

      {/* status bar — narrates the beat, flags the sample data */}
      <div className="relative flex items-center gap-2 border-t border-border/60 bg-muted/40 px-3 py-2">
        <Play className="h-3 w-3 shrink-0 text-club" />
        {/* instant crossfade — keyed remount, no stacked exit/enter */}
        <motion.span
          key={cap}
          initial={{ opacity: 0, y: reduce ? 0 : 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.12, ease: EASE }}
          className="min-w-0 flex-1 truncate text-[11.5px] leading-relaxed text-muted-foreground"
        >
          {cap}
        </motion.span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80" />
          sample
        </span>
      </div>
    </section>
  )
}

/** A tiny initials avatar for demo rows (decorative). */
function DemoAvatar({
  initials, tone = 0, className,
}: {
  initials: string
  tone?: number
  className?: string
}) {
  const tones = [
    "bg-club-muted text-club-ink",
    "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    "bg-club/15 text-club",
  ]
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold",
        tones[tone % tones.length],
        className,
      )}
    >
      {initials}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Demo 1 — the welcome hero (a quiet "what's inside" panel — no video)
// ---------------------------------------------------------------------------

/** The six feature stops, mapped once as a glanceable overview of the guide.
 *  Everything here is static after a one-time staggered entrance — premium
 *  means calm, so nothing loops or sweeps in the welcome. */
const WELCOME_STOPS: { icon: LucideIcon; label: string }[] = [
  { icon: ImageIcon, label: "Branding" },
  { icon: KeyRound, label: "Invites" },
  { icon: ListChecks, label: "Approvals" },
  { icon: Megaphone, label: "Day to day" },
  { icon: Wallet, label: "Records" },
  { icon: ScrollText, label: "Oversight" },
]

function WelcomeHero({ reduce, clubName }: { reduce: boolean; clubName: string }) {
  const stagger = makeStagger(reduce)
  return (
    <motion.div
      variants={makeFadeUp(reduce)}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card"
    >
      {/* Backdrop — a faint dot grid fading out downward + one soft club
          glow. Fully static, theme-aware through the CSS variables. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--border) 60%, transparent) 1px, transparent 0)",
          backgroundSize: "15px 15px",
          maskImage: "linear-gradient(to bottom, black 45%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 45%, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(360px 160px at 16% -14%, color-mix(in srgb, var(--club) 13%, transparent), transparent 72%)",
        }}
      />

      {/* Identity lockup — whose club this is, and what this guide is */}
      <div className="relative flex items-center gap-3 px-4 pt-4 sm:px-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-club text-sm font-black text-club-foreground shadow-card">
          {(clubName || "C").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-bold leading-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {clubName || "Your club"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Every tool below is yours.
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full border border-club/25 bg-club-muted/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-club-ink sm:inline-flex">
          Executive guide
        </span>
      </div>

      {/* The six stops — one staggered entrance, then still */}
      <motion.ul
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="relative grid grid-cols-3 gap-1.5 p-4 sm:grid-cols-6 sm:gap-2 sm:px-5 sm:pb-5"
      >
        {WELCOME_STOPS.map((s) => {
          const StopIcon = s.icon
          return (
            <motion.li
              key={s.label}
              variants={stagger.child}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-muted/30 px-1 py-2.5"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-club-muted text-club">
                <StopIcon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-[10px] font-semibold text-foreground/80">{s.label}</span>
            </motion.li>
          )
        })}
      </motion.ul>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Demo 2 — Dashboard branding (banner upload + focus drag)
// ---------------------------------------------------------------------------

const BRAND_CAPS = [
  "Click “Edit banner”.",
  "Upload, then drag the focus.",
  "Saved — everyone sees it instantly.",
] as const
const BRAND_DUR = [900, 1050, 800]
const BRAND_CURSOR: readonly CursorSpec[] = [
  { x: 84, y: 87, click: true },
  { x: 94, y: 50 },
  { x: 28, y: 22 },
]

function BrandDemo({ reduce, clubName }: { reduce: boolean; clubName: string }) {
  const { i, pressed, acted } = useLoop(BRAND_DUR, !reduce)
  // beat 0: click Edit banner → the dashed "edit mode" ring appears
  const editing = i === 0 ? acted : i === 1
  const hasPhoto = i >= 1
  const saved = i === 2
  return (
    <PreviewFrame
      url="clubhub.app/dashboard"
      reduce={reduce}
      index={i}
      pressed={pressed}
      captions={BRAND_CAPS}
      cursor={BRAND_CURSOR}
    >
      <div className="relative h-40 overflow-hidden rounded-xl border border-border/60 sm:h-44">
        {/* plain accent wash → uploaded photo */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "linear-gradient(125deg, var(--club-accent) 0%, rgba(0,0,0,0.4) 135%)" }}
        />
        <AnimatePresence>
          {hasPhoto && (
            <motion.img
              key="banner-photo"
              src="/landing/bn-atrium.jpg"
              alt=""
              initial={{ opacity: 0, scale: reduce ? 1 : 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </AnimatePresence>

        {/* dashed "edit mode" ring — the result of clicking Edit banner */}
        <AnimatePresence>
          {editing && (
            <motion.span
              key="edit-ring"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              className="pointer-events-none absolute inset-[3px] rounded-[9px] border-2 border-dashed border-white/70"
            />
          )}
        </AnimatePresence>

        {/* club identity chip over the banner */}
        <div className="absolute left-3 top-3 flex max-w-[75%] items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 backdrop-blur-sm">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-club text-[9px] font-black text-club-foreground">
            {(clubName || "C").slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-[11px] font-semibold text-white/95">{clubName}</span>
          <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/85">
            Exec
          </span>
        </div>

        {/* the focus slider while the photo lands */}
        <AnimatePresence>
          {i === 1 && (
            <motion.div
              key="focus-slider"
              initial={{ opacity: 0, x: reduce ? 0 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5"
            >
              <span className="text-[8px] font-bold uppercase tracking-wider text-white/90 drop-shadow">
                focus
              </span>
              <span className="relative h-20 w-1 rounded-full bg-white/45">
                <motion.span
                  initial={{ top: "12%" }}
                  animate={{ top: "58%" }}
                  transition={{ duration: reduce ? 0 : 0.7, ease: EASE, delay: reduce ? 0 : 0.1 }}
                  className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-club shadow-card"
                />
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the edit pill (presses → saved state) */}
        <div className="absolute bottom-2.5 right-2.5">
          {saved ? (
            <motion.span
              key="saved"
              initial={{ opacity: 0, y: reduce ? 0 : 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: EASE }}
              className="inline-flex items-center gap-1.5 rounded-full bg-club px-3 py-1.5 text-[11px] font-semibold text-club-foreground shadow-card"
            >
              <Check className="h-3.5 w-3.5" /> Banner saved
            </motion.span>
          ) : (
            <PressTarget pressed={pressed && i === 0} reduce={reduce}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card/85 px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-card backdrop-blur">
                <ImageIcon className="h-3.5 w-3.5" /> Edit banner
              </span>
            </PressTarget>
          )}
        </div>
      </div>
    </PreviewFrame>
  )
}

// ---------------------------------------------------------------------------
// Demo 3 — invites (copy the code → join request → approve)
// ---------------------------------------------------------------------------

const INVITE_CAPS = [
  "Copy the code to share it.",
  "Code + password — instant join.",
  "No code? They send a request.",
  "Approved — they’re in and notified.",
] as const
const INVITE_DUR = [800, 700, 850, 800]
const INVITE_CURSOR: readonly CursorSpec[] = [
  { x: 48, y: 22, click: true },
  { x: 20, y: 22 },
  { x: 85, y: 65, click: true },
  { x: 40, y: 65 },
]

function InviteDemo({ reduce }: { reduce: boolean }) {
  const { i, pressed, acted } = useLoop(INVITE_DUR, !reduce)
  const copied = i === 0 ? acted : i >= 1
  const showRequest = i >= 2
  const approved = i === 2 ? acted : i === 3
  return (
    <PreviewFrame
      url="clubhub.app/members"
      reduce={reduce}
      index={i}
      pressed={pressed}
      captions={INVITE_CAPS}
      cursor={INVITE_CURSOR}
    >
      {/* fixed min-height so the cursor's % coordinates never drift
          when the request card slides in */}
      <div className="min-h-[8rem]">
        {/* the club code row */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <KeyRound className="h-3.5 w-3.5 text-club" aria-hidden />
            <span className="text-sm font-bold tracking-[0.18em] text-foreground">NORF</span>
          </span>
          <PressTarget pressed={pressed && i === 0} reduce={reduce}>
            <motion.span
              key={copied ? "copied" : "copy"}
              initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduce ? 0 : 0.16, ease: EASE }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-card",
                copied ? "bg-club text-club-foreground" : "bg-muted text-foreground ring-1 ring-border",
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy code"}
            </motion.span>
          </PressTarget>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border/60 sm:inline-flex">
            + password = instant join
          </span>
        </div>

        {/* the join request card */}
        <AnimatePresence>
          {showRequest && (
            <motion.div
              key="join-request"
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
              className="mt-3 rounded-xl border border-border/70 bg-muted/40 p-3"
            >
              <div className="flex items-center gap-2.5">
                <DemoAvatar initials="JK" tone={1} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">Jamie Kim</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {approved
                      ? "Member · joined just now"
                      : "wants to join · “Can I help with the robot arm?”"}
                  </p>
                </div>
                {approved ? (
                  <motion.span
                    key="in"
                    initial={{ scale: reduce ? 1 : 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-club-muted px-2.5 py-1 text-[11px] font-bold text-club-ink"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} /> In
                  </motion.span>
                ) : (
                  <PressTarget pressed={pressed && i === 2} reduce={reduce}>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-club px-3.5 py-1.5 text-[11px] font-bold text-club-foreground shadow-card shadow-club/25">
                      Approve
                    </span>
                  </PressTarget>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PreviewFrame>
  )
}

// ---------------------------------------------------------------------------
// Demo 4 — the approval desk (select the batch → clear the queue)
// ---------------------------------------------------------------------------

const APPROVAL_CAPS = [
  "Submitted hours land here with proof.",
  "Select the batch…",
  "…as many as you like…",
  "…then clear them all at once.",
] as const
const APPROVAL_DUR = [850, 650, 650, 950]
const APPROVAL_CURSOR: readonly CursorSpec[] = [
  { x: 60, y: 22 },
  { x: 9, y: 22, click: true },
  { x: 9, y: 54, click: true },
  { x: 78, y: 83, click: true },
]

const APPROVAL_ROWS = [
  { initials: "AT", tone: 0, title: "Tutoring at the library", meta: "3.0h · proof attached", time: "2m ago" },
  { initials: "MB", tone: 2, title: "Robot build session", meta: "2.5h · Robotics", time: "1h ago" },
] as const

function ApprovalRow({
  initials, tone, title, meta, time, approved, selected, pressed, reduce,
}: {
  initials: string
  tone: number
  title: string
  meta: string
  time: string
  approved: boolean
  selected: boolean
  pressed: boolean
  reduce: boolean
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-2.5 rounded-xl border p-2.5",
        approved
          ? "border-club/30 bg-club-muted/50"
          : selected
            ? "border-club/35 bg-club-muted/25"
            : "border-border/70 bg-card",
      )}
    >
      {/* multi-select checkbox — it presses when the cursor clicks it */}
      <PressTarget pressed={pressed} reduce={reduce}>
        <motion.span
          key={selected ? "on" : "off"}
          initial={selected ? { scale: reduce ? 1 : 0.7 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          className={cn(
            "grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150",
            selected ? "border-club bg-club text-club-foreground" : "border-border bg-card",
          )}
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </motion.span>
      </PressTarget>
      <DemoAvatar initials={initials} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{meta} · {time}</p>
      </div>
      {approved ? (
        <motion.span
          key="approved-pill"
          initial={{ scale: reduce ? 1 : 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-club px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-club-foreground"
        >
          <Check className="h-3 w-3" strokeWidth={3} /> Approved
        </motion.span>
      ) : (
        <span className="inline-flex shrink-0 items-center rounded-lg bg-club px-3 py-1.5 text-[11px] font-bold text-club-foreground shadow-card shadow-club/25">
          Approve
        </span>
      )}
    </div>
  )
}

function ApprovalsDemo({ reduce }: { reduce: boolean }) {
  const { i, pressed, acted } = useLoop(APPROVAL_DUR, !reduce)
  // beat 1 ticks row 1's checkbox, beat 2 row 2's, beat 3 clears the queue
  const row1Sel = i === 1 ? acted : i >= 2
  const row2Sel = i === 2 ? acted : i === 3
  const cleared = i === 3 && acted
  const n = (row1Sel ? 1 : 0) + (row2Sel ? 1 : 0)
  return (
    <PreviewFrame
      url="clubhub.app/approvals"
      reduce={reduce}
      index={i}
      pressed={pressed}
      captions={APPROVAL_CAPS}
      cursor={APPROVAL_CURSOR}
    >
      {/* fixed min-height so the bulk bar appearing never shifts the rows */}
      <div className="min-h-[10rem] space-y-2">
        <ApprovalRow
          initials={APPROVAL_ROWS[0].initials}
          tone={APPROVAL_ROWS[0].tone}
          title={APPROVAL_ROWS[0].title}
          meta={APPROVAL_ROWS[0].meta}
          time={APPROVAL_ROWS[0].time}
          approved={cleared}
          selected={row1Sel}
          pressed={pressed && i === 1}
          reduce={reduce}
        />
        <ApprovalRow
          initials={APPROVAL_ROWS[1].initials}
          tone={APPROVAL_ROWS[1].tone}
          title={APPROVAL_ROWS[1].title}
          meta={APPROVAL_ROWS[1].meta}
          time={APPROVAL_ROWS[1].time}
          approved={cleared}
          selected={row2Sel}
          pressed={pressed && i === 2}
          reduce={reduce}
        />

        {/* the bulk bar → the cleared state */}
        <AnimatePresence mode="wait" initial={false}>
          {cleared ? (
            <motion.div
              key="cleared"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
              className="mt-2.5 flex items-center gap-2 rounded-xl bg-club-muted px-3 py-2"
            >
              <span className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-club text-club-foreground">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="text-[11px] font-bold text-club-ink">
                Queue cleared
              </span>
            </motion.div>
          ) : n > 0 ? (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
              className="mt-2.5 flex items-center gap-2 rounded-xl bg-club-muted px-3 py-2"
            >
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-club" aria-hidden />
              <motion.span
                key={n}
                initial={{ y: reduce ? 0 : 3, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.16 }}
                className="text-[11px] font-bold tabular-nums text-club-ink"
              >
                {n} selected
              </motion.span>
              <PressTarget pressed={pressed && i === 3} reduce={reduce} className="ml-auto">
                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-club px-3 py-1.5 text-[11px] font-bold text-club-foreground shadow-card shadow-club/25">
                  Approve {n}
                </span>
              </PressTarget>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </PreviewFrame>
  )
}

// ---------------------------------------------------------------------------
// Demo 5 — running the club (pin, urgent, RSVP, task drag)
// ---------------------------------------------------------------------------

const RUN_CAPS = [
  "Pinned — it stays on top.",
  "Urgent — it banners app-wide.",
  "RSVPs land in real time.",
  "Tasks drag across the board.",
] as const
const RUN_DUR = [800, 800, 800, 950]
const RUN_CURSOR: readonly CursorSpec[] = [
  { x: 19, y: 72, click: true },
  { x: 15, y: 23, click: true },
  { x: 50, y: 74, click: true },
  { x: 84, y: 45 },
]

function RunPanel({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-muted/30 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate text-[9px] font-bold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function RunDemo({ reduce }: { reduce: boolean }) {
  const { i, pressed, acted } = useLoop(RUN_DUR, !reduce)
  const pinned = i === 0 ? acted : i >= 1
  const urgent = i === 1 ? acted : i >= 2
  const rsvp = i === 2 ? acted : i === 3
  const going = rsvp ? 5 : 4
  const taskStage = i === 0 ? 0 : i < 3 ? 1 : 2
  return (
    <PreviewFrame
      url="clubhub.app/announcements"
      reduce={reduce}
      index={i}
      pressed={pressed}
      captions={RUN_CAPS}
      cursor={RUN_CURSOR}
    >
      <div className="grid grid-cols-3 gap-2">
        {/* ── Announcement panel ── */}
        <RunPanel label="Announce" icon={Megaphone}>
          <div className="flex flex-col gap-1.5">
            {/* the urgent toggle — fills red the beat it's clicked */}
            <PressTarget pressed={pressed && i === 1} reduce={reduce}>
              <motion.span
                key={urgent ? "urgent-on" : "urgent-off"}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.18 }}
                className={cn(
                  "inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide",
                  urgent
                    ? "border-danger/30 bg-danger/15 text-danger-foreground"
                    : "border-border/60 bg-muted text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    urgent ? "bg-danger-foreground" : "bg-muted-foreground/50",
                  )}
                />
                Urgent
              </motion.span>
            </PressTarget>

            {/* the announcement card — fixed footer slot so pinning
                never shifts the layout under the cursor */}
            <div
              className={cn(
                "rounded-lg border border-border/60 bg-card p-2 transition-shadow duration-200",
                urgent && "ring-1 ring-danger/40",
              )}
            >
              <div className="flex items-start justify-between gap-1.5">
                <p className="text-[11px] font-semibold leading-tight text-foreground">
                  Bake sale Friday 🧁
                </p>
                <AnimatePresence>
                  {pinned && (
                    <motion.span
                      key="pin-badge"
                      initial={{ scale: reduce ? 1 : 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 550, damping: 28 }}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-club-muted px-1.5 py-0.5 text-[8px] font-bold uppercase text-club-ink"
                    >
                      <Pin className="h-2.5 w-2.5" /> Pin
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground">
                Lobby · after school · bring cash
              </p>
              <div className="mt-1.5 flex h-6 items-center">
                {pinned ? (
                  <motion.span
                    key="pinned-label"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduce ? 0 : 0.15 }}
                    className="inline-flex items-center gap-1 text-[9px] font-bold text-club"
                  >
                    <Pin className="h-2.5 w-2.5" /> Pinned to top
                  </motion.span>
                ) : (
                  <PressTarget pressed={pressed && i === 0} reduce={reduce}>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[9px] font-bold text-foreground ring-1 ring-border">
                      <Pin className="h-2.5 w-2.5" /> Pin to top
                    </span>
                  </PressTarget>
                )}
              </div>
            </div>
          </div>
        </RunPanel>

        {/* ── Meeting panel ── */}
        <RunPanel label="Meeting" icon={CalendarDays}>
          <div className="rounded-lg border border-border/60 bg-card p-2">
            <p className="text-[11px] font-semibold leading-tight text-foreground">Weekly sync</p>
            <p className="mt-0.5 text-[9.5px] text-muted-foreground">Thu · 4:30 PM · Rm 204</p>
            <div className="mt-2 flex items-center gap-1">
              <div className="flex -space-x-1.5">
                {["AT", "MB", "JK", "RS"].map((c, idx) => (
                  <DemoAvatar key={c} initials={c} tone={idx} className="h-5 w-5 text-[8px] ring-2 ring-card" />
                ))}
                <AnimatePresence>
                  {rsvp && (
                    <motion.span
                      key="rsvp-new"
                      initial={{ scale: reduce ? 1 : 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 26 }}
                    >
                      <DemoAvatar initials="CV" tone={3} className="h-5 w-5 text-[8px] ring-2 ring-card" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <motion.span
                key={going}
                initial={{ y: reduce ? 0 : 3, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.16 }}
                className="ml-auto rounded-full bg-club-muted px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-club-ink"
              >
                Going {going}
              </motion.span>
            </div>
            <div className="mt-1.5 flex gap-1">
              <PressTarget pressed={pressed && i === 2} reduce={reduce} className="flex min-w-0 flex-1">
                <span className="w-full rounded-md bg-club px-1 py-1 text-center text-[8.5px] font-bold text-club-foreground">
                  Going
                </span>
              </PressTarget>
              <span className="flex-1 rounded-md bg-muted px-1 py-1 text-center text-[8.5px] font-semibold text-muted-foreground">
                Maybe
              </span>
            </div>
          </div>
        </RunPanel>

        {/* ── Task panel (shared-layout chip slides across columns) ── */}
        <RunPanel label="Task" icon={CheckSquare}>
          <div className="grid grid-cols-3 gap-1">
            {["To do", "Now", "Done"].map((label) => (
              <span
                key={label}
                className={cn(
                  "rounded-md px-1 py-1 text-center text-[8px] font-bold uppercase tracking-wide",
                  label === "Done" ? "bg-club-muted/60 text-club-ink" : "bg-muted text-muted-foreground",
                )}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-3 items-center gap-1">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border",
                  idx === taskStage ? "border-border/60 bg-card" : "border-dashed border-border/50",
                )}
              >
                {idx === taskStage && (
                  <motion.div
                    layoutId="run-task-chip"
                    transition={{ layout: { duration: reduce ? 0 : 0.34, ease: EASE } }}
                    className="flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-1 shadow-card"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        taskStage === 2 ? "bg-club" : "bg-amber-500/70",
                      )}
                    />
                    <span className="truncate text-[9.5px] font-semibold text-foreground">Order parts</span>
                    {taskStage === 2 && (
                      <Check className="h-2.5 w-2.5 shrink-0 text-club" strokeWidth={3} />
                    )}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </RunPanel>
      </div>
    </PreviewFrame>
  )
}

// ---------------------------------------------------------------------------
// Demo 6 — financials ledger (entry lands → balance ticks up)
// ---------------------------------------------------------------------------

const RECORDS_CAPS = [
  "Log revenue or expenses in seconds.",
  "The balance ticks for everyone.",
  "Only executives edit the books.",
] as const
const RECORDS_DUR = [800, 1000, 800]
const RECORDS_CURSOR: readonly CursorSpec[] = [
  { x: 20, y: 88, click: true },
  { x: 55, y: 85 },
  { x: 30, y: 20 },
]

const LEDGER_SEED = [
  { dot: "bg-club", text: "Dues · 12 members", amt: "+$120" },
  { dot: "bg-amber-500/80", text: "Pizza party", amt: "−$24" },
] as const

function RecordsDemo({ reduce }: { reduce: boolean }) {
  const { i, pressed, acted } = useLoop(RECORDS_DUR, !reduce)
  const entryAdded = i === 0 ? acted : i >= 1
  const updated = i === 1 ? acted : i >= 2
  const balance = updated ? "$275" : "$248"
  return (
    <PreviewFrame
      url="clubhub.app/financials"
      reduce={reduce}
      index={i}
      pressed={pressed}
      captions={RECORDS_CAPS}
      cursor={RECORDS_CURSOR}
    >
      {/* balance card — the number ticks and a delta chip lands with the
          entry (cause → effect); no decorative looping bars */}
      <div className="flex flex-col justify-center rounded-xl border border-border/70 bg-club-muted/40 p-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Club balance
        </p>
        <div className="mt-1 flex items-center gap-2 overflow-hidden">
          <motion.span
            key={balance}
            initial={{ y: reduce ? 0 : 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
            className="text-2xl font-bold tabular-nums tracking-tight text-foreground"
          >
            {balance}
          </motion.span>
          <AnimatePresence>
            {updated && (
              <motion.span
                key="delta"
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18, ease: EASE }}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-club px-1.5 py-0.5 text-[9.5px] font-bold text-club-foreground"
              >
                <TrendingUp className="h-2.5 w-2.5" aria-hidden /> +$27
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* the ledger */}
      <div className="mt-2.5 min-w-0 space-y-1.5">
        {LEDGER_SEED.map((row) => (
          <div
            key={row.text}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5"
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", row.dot)} />
            <span className="truncate text-[11px] font-medium text-foreground/90">{row.text}</span>
            <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
              {row.amt}
            </span>
          </div>
        ))}
        {/* the Add entry pill — presses, then becomes the landed entry */}
        <AnimatePresence mode="wait" initial={false}>
          {entryAdded ? (
            <motion.div
              key="new-entry"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
              className="flex items-center gap-2 rounded-lg border border-club/25 bg-club-muted/40 px-2.5 py-1.5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-club" />
              <span className="truncate text-[11px] font-medium text-foreground">Bake sale revenue</span>
              <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums text-club">+$27</span>
            </motion.div>
          ) : (
            <motion.div
              key="add-pill"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.12 }}
            >
              <PressTarget pressed={pressed && i === 0} reduce={reduce}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[10px] font-bold text-foreground ring-1 ring-border">
                  <Plus className="h-3 w-3" /> Add entry
                </span>
              </PressTarget>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PreviewFrame>
  )
}

// ---------------------------------------------------------------------------
// Demo 7 — oversight (filter the activity feed + storage meter)
// ---------------------------------------------------------------------------

const OVERSIGHT_CAPS = [
  "Every action, recorded.",
  "Filter the feed by type.",
  "Delete it — space frees on the spot.",
  "Yours alone — members never see these.",
] as const
const OVERSIGHT_DUR = [800, 850, 950, 750]
const OVERSIGHT_CURSOR: readonly CursorSpec[] = [
  { x: 50, y: 18 },
  { x: 24, y: 10, click: true },
  { x: 34, y: 90, click: true },
  { x: 50, y: 45 },
]

const ACTIVITY_ROWS = [
  { initials: "AV", tone: 1, text: "Ava approved 3.0h · “Tutoring at the library”", time: "now", hours: true },
  { initials: "YU", tone: 0, text: "You pinned “Bake sale Friday”", time: "1m", hours: false },
  { initials: "SD", tone: 2, text: "Sam joined with the club code", time: "4m", hours: false },
  { initials: "RT", tone: 3, text: "Riley logged 2.0h · Robot build", time: "9m", hours: true },
] as const

function OversightDemo({ reduce }: { reduce: boolean }) {
  const { i, pressed, acted } = useLoop(OVERSIGHT_DUR, !reduce)
  const hoursOn = i === 1 ? acted : i >= 2
  // beat 2 presses the images chip's clear button → that category (and its
  // bytes) leaves the club, and the meter visibly shrinks
  const imagesGone = i === 2 ? acted : i > 2
  return (
    <PreviewFrame
      url="clubhub.app/activity"
      reduce={reduce}
      index={i}
      pressed={pressed}
      captions={OVERSIGHT_CAPS}
      cursor={OVERSIGHT_CURSOR}
    >
      {/* filter chips — "Hours" presses and lights up */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[9.5px] font-bold transition-colors duration-150",
            !hoursOn
              ? "bg-club text-club-foreground shadow-card shadow-club/20"
              : "bg-muted text-muted-foreground ring-1 ring-border/70",
          )}
        >
          All
        </span>
        <PressTarget pressed={pressed && i === 1} reduce={reduce}>
          <motion.span
            key={hoursOn ? "hours-on" : "hours-off"}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-[9.5px] font-bold transition-colors duration-150",
              hoursOn
                ? "bg-club text-club-foreground shadow-card shadow-club/20"
                : "bg-muted text-muted-foreground ring-1 ring-border/70",
            )}
          >
            Hours
          </motion.span>
        </PressTarget>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[9.5px] font-bold text-muted-foreground ring-1 ring-border/70">
          Members
        </span>
      </div>

      {/* the feed — non-matching rows dim when the filter is on */}
      <div className="mt-2 min-w-0 space-y-1.5">
        {ACTIVITY_ROWS.map((r) => (
          <motion.div
            key={r.text}
            initial={false}
            animate={{ opacity: hoursOn && !r.hours ? 0.45 : 1 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5"
          >
            <DemoAvatar initials={r.initials} tone={r.tone} className="h-5 w-5 text-[8px]" />
            <span className="truncate text-[11px] text-foreground/90">{r.text}</span>
            <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">{r.time}</span>
          </motion.div>
        ))}
      </div>

      {/* the storage meter — pressing the images chip's clear button
          removes that category: the KB ticks down and the meter shrinks */}
      <div className="mt-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Database className="h-3 w-3" aria-hidden />
          <span className="text-[9px] font-bold uppercase tracking-wide">Storage</span>
          <span className="ml-auto flex items-baseline gap-1 overflow-hidden">
            <motion.span
              key={imagesGone ? "kb-after" : "kb-before"}
              initial={{ y: reduce ? 0 : 7, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
              className="text-[9.5px] font-bold tabular-nums text-foreground"
            >
              {imagesGone ? "9.4 KB" : "18.2 KB"}
            </motion.span>
            <span className="text-[9.5px] text-muted-foreground">/ 15 MB</span>
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-club"
            initial={false}
            animate={{ width: imagesGone ? "6%" : "13%" }}
            transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="rounded-full bg-card px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground ring-1 ring-border/60">
            chat
          </span>
          <AnimatePresence initial={false}>
            {!imagesGone && (
              <motion.span
                key="images-chip"
                exit={{ opacity: 0, scale: reduce ? 1 : 0.7 }}
                transition={{ duration: reduce ? 0 : 0.16 }}
              >
                <PressTarget pressed={pressed && i === 2} reduce={reduce}>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-card px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground ring-1 ring-border/60">
                    images
                    <X className="h-2 w-2 opacity-60" aria-hidden />
                  </span>
                </PressTarget>
              </motion.span>
            )}
          </AnimatePresence>
          <span className="rounded-full bg-card px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground ring-1 ring-border/60">
            tasks
          </span>
        </div>
      </div>
    </PreviewFrame>
  )
}

// ---------------------------------------------------------------------------
// Demo 8 — the ready checklist (checks itself off in a fast loop)
// ---------------------------------------------------------------------------

const READY_DUR = [480, 480, 480, 480, 2200]

function ReadyChecklist({ reduce }: { reduce: boolean }) {
  const { i } = useLoop(READY_DUR, !reduce)
  const done = reduce ? READY_ITEMS.length : i + 1
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card sm:p-4">
      <ul className="space-y-1.5">
        {READY_ITEMS.map((item, idx) => {
          const checked = idx < done
          const Icon = item.icon
          return (
            <li
              key={item.text}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-200",
                checked ? "border-club/25 bg-club-muted/40" : "border-border/60 bg-card",
              )}
            >
              <motion.span
                animate={checked && !reduce ? { scale: [1, 1.18, 1] } : {}}
                transition={{ duration: 0.28 }}
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-200",
                  checked ? "bg-club text-club-foreground" : "bg-muted text-muted-foreground/50",
                )}
              >
                {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : <Icon className="h-3 w-3" />}
              </motion.span>
              <span
                className={cn(
                  "text-[12.5px] font-medium transition-colors duration-200",
                  checked ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.text}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared step furniture
// ---------------------------------------------------------------------------

/** Compact step header for the feature steps (right column). */
function StepHeader({
  eyebrow, title, children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  const fadeUp = makeFadeUp(!!useReducedMotion())
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <p className={EYEBROW_CLS}>{eyebrow}</p>
      <h2
        className="text-[1.3rem] font-semibold leading-[1.1] text-foreground sm:text-[1.55rem]"
        style={HEADLINE_STYLE}
      >
        {title}
      </h2>
      {children ? (
        <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      ) : null}
    </motion.div>
  )
}

/** The staggered "what you can do" list (right column, compact). */
function BulletList({ items, reduce }: { items: BulletItem[]; reduce: boolean }) {
  const stagger = makeStagger(reduce)
  return (
    <motion.ul
      variants={stagger.container}
      initial="hidden"
      animate="visible"
      className="mt-4 space-y-2"
    >
      {items.map((b) => {
        const Icon = b.icon
        return (
          <motion.li key={b.lead} variants={stagger.child} className="flex gap-2.5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-club-muted text-club">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{b.lead}</span> {b.rest}
            </p>
          </motion.li>
        )
      })}
    </motion.ul>
  )
}

/** "Try it now" — parks the guide in the floating resume pill and jumps
 *  straight into the real view (the pill brings the guide back). */
function TryItButton({
  icon: Icon, label, onTry,
}: {
  icon: LucideIcon
  label: string
  onTry: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTry}
      className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-club/30 bg-club-muted/60 px-4 text-[13px] font-semibold text-club-ink transition-all hover:border-club/50 hover:bg-club-muted active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  )
}

/** Small jump chip (ready step + run step extras). */
function JumpChip({
  icon: Icon, label, onJump,
}: {
  icon: LucideIcon
  label: string
  onJump: () => void
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3.5 text-xs font-medium text-foreground/90 transition-colors hover:border-club/40 hover:bg-club-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <Icon className="h-3.5 w-3.5 text-club" aria-hidden />
      {label}
    </button>
  )
}

/**
 * FeatureStep — the two-column layout every feature step shares: the demo
 * preview on the left (stacked first on mobile), the copy + try-it on the
 * right. Centered single column below md.
 */
function FeatureStep({
  demo, children,
}: {
  demo: ReactNode
  children: ReactNode
}) {
  return (
    <div className={FEATURE_SHELL_CLS}>
      <div className="grid items-start gap-5 md:grid-cols-[1.06fr_0.94fr] md:gap-7">
        <div className="min-w-0">{demo}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step content components
// ---------------------------------------------------------------------------

function StepWelcome({ reduce, clubName }: { reduce: boolean; clubName: string }) {
  const fadeUp = makeFadeUp(reduce)
  return (
    <div className={STEP_SHELL_CLS}>
      <WelcomeHero reduce={reduce} clubName={clubName} />

      <motion.h2
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-6 text-[2rem] font-semibold leading-[1.05] text-foreground sm:text-[2.5rem]"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
      >
        Everything you need to run {clubName || "this club"}.
      </motion.h2>

      <motion.p
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-3 max-w-md leading-relaxed text-muted-foreground"
      >
        A quick tour of your admin powers — each with a live demo.
      </motion.p>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-club" />
          2 minutes
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-foreground/90">
          <Clapperboard className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          Sample data
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold">←</kbd>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold">→</kbd>
          to navigate
        </span>
      </motion.div>
    </div>
  )
}

function StepBrand({ reduce, clubName, onTry }: { reduce: boolean; clubName: string; onTry: (v: View) => void }) {
  return (
    <FeatureStep demo={<BrandDemo reduce={reduce} clubName={clubName} />}>
      <StepHeader eyebrow="Branding" title="Your club, your look.">
        Banner, logo, club goal — all set by you.
      </StepHeader>
      <BulletList items={BRAND_BULLETS} reduce={reduce} />
      <TryItButton
        icon={LayoutDashboard}
        label="Dashboard"
        onTry={() => onTry("dashboard")}
      />
    </FeatureStep>
  )
}

function StepInvite({ reduce, onTry }: { reduce: boolean; onTry: (v: View) => void }) {
  return (
    <FeatureStep demo={<InviteDemo reduce={reduce} />}>
      <StepHeader eyebrow="Growing the club" title="Bring people in.">
        Share the code, or approve requests.
      </StepHeader>
      <BulletList items={INVITE_BULLETS} reduce={reduce} />
      <TryItButton
        icon={UserCog}
        label="Members"
        onTry={() => onTry("members")}
      />
    </FeatureStep>
  )
}

function StepApprovals({ reduce, onTry }: { reduce: boolean; onTry: (v: View) => void }) {
  return (
    <FeatureStep demo={<ApprovalsDemo reduce={reduce} />}>
      <StepHeader eyebrow="Service hours" title="The approval desk.">
        Submitted hours land here for your approval.
      </StepHeader>
      <BulletList items={APPROVAL_BULLETS} reduce={reduce} />

      {/* The school-submission reminder (mirrors the handbook warning) */}
      <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-foreground/90">
          <span className="font-semibold">Remember:</span> ClubHub doesn&apos;t
          submit hours to your school — members export and submit them
          themselves.
        </p>
      </div>

      <TryItButton
        icon={ListChecks}
        label="Approvals"
        onTry={() => onTry("approvals")}
      />
    </FeatureStep>
  )
}

function StepRun({ reduce, onTry }: { reduce: boolean; onTry: (v: View) => void }) {
  return (
    <FeatureStep demo={<RunDemo reduce={reduce} />}>
      <StepHeader eyebrow="Day to day" title="Run the day-to-day.">
        The four tools the club runs on.
      </StepHeader>
      <BulletList items={RUN_BULLETS} reduce={reduce} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TryItButton
          icon={Megaphone}
          label="Announcements"
          onTry={() => onTry("announcements")}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <JumpChip icon={CalendarDays} label="Meetings" onJump={() => onTry("meetings")} />
        <JumpChip icon={CheckSquare} label="Tasks" onJump={() => onTry("tasks")} />
        <JumpChip icon={Users} label="Teams" onJump={() => onTry("teams")} />
      </div>
    </FeatureStep>
  )
}

function StepRecords({ reduce, onTry }: { reduce: boolean; onTry: (v: View) => void }) {
  return (
    <FeatureStep demo={<RecordsDemo reduce={reduce} />}>
      <StepHeader eyebrow="Money & records" title="Keep the books.">
        Track the balance, moderate chat, keep notes tidy.
      </StepHeader>
      <BulletList items={RECORDS_BULLETS} reduce={reduce} />
      <TryItButton
        icon={Wallet}
        label="Financials"
        onTry={() => onTry("financials")}
      />
    </FeatureStep>
  )
}

function StepOversight({ reduce, onTry }: { reduce: boolean; onTry: (v: View) => void }) {
  return (
    <FeatureStep demo={<OversightDemo reduce={reduce} />}>
      <StepHeader eyebrow="Exec-only tools" title="See the full picture.">
        Two tools members never see: the audit trail and storage.
      </StepHeader>
      <BulletList items={OVERSIGHT_BULLETS} reduce={reduce} />
      <TryItButton
        icon={ScrollText}
        label="Activity Log"
        onTry={() => onTry("activity")}
      />
    </FeatureStep>
  )
}

function StepReady({
  reduce, onTry, onSkip,
}: {
  reduce: boolean
  onTry: (v: View) => void
  onSkip: () => void
}) {
  const fadeUp = makeFadeUp(reduce)
  return (
    <div className={STEP_SHELL_CLS}>
      <StepHeader eyebrow="You're set" title="Now make it yours.">
        Start with these:
      </StepHeader>
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mt-4">
        <ReadyChecklist reduce={reduce} />
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-5"
      >
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Jump straight in
        </p>
        <div className="flex flex-wrap gap-2">
          {READY_JUMPS.map((j) => (
            <JumpChip key={j.label} icon={j.icon} label={j.label} onJump={() => onTry(j.view)} />
          ))}
        </div>
      </motion.div>

      {/* ── The member-guide hand-off ──
          Executives are members too: finishing here chains straight into the
          member guide (avatar, decorations, personal profile). The single
          primary action lives in the footer; this card explains what's next
          and offers the explicit skip. */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-5 overflow-hidden rounded-2xl border border-club/25 bg-club-muted/30"
      >
        <div className="flex items-start gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-club-muted text-club">
            <Wand2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground">
              Your member guide
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Up next: your avatar and profile — the member side.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-club/20 bg-card/60 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            Replay anytime — <span className="font-semibold text-foreground">Settings → Security</span>
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Skip
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================================
// AdminTour — the mounted component (zero props, like OnboardingTour)
// ============================================================================

export function AdminTour() {
  const [open, setOpen] = useState(false)
  // SUSPENDED state — the guide was left mid-tour (Escape / X / scrim click /
  // try-it jump) and is parked in the floating resume pill. `stepIndex` is
  // preserved so Resume lands on the exact stop they left. `suspendedCtx`
  // records WHICH club/role parked it — the pill only renders while that
  // context still matches (a club or role switch quietly drops it, no
  // effect needed: it's a render-time derivation).
  const [suspendedCtx, setSuspendedCtx] = useState<{
    clubId: string
    role: string
  } | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  const setView = useAppStore((s) => s.setView)
  const clubId = useAppStore((s) => s.currentClubId)
  const clubName = useAppStore((s) => s.currentClub?.clubName) ?? "your club"
  const role = useAppStore((s) => s.currentClub?.role)
  const handbookAt = useAppStore((s) => s.currentClub?.handbookAcceptedAt)

  const reduce = !!useReducedMotion()

  const seenKey = clubId ? `clubhub-admin-tour-seen-${clubId}` : null
  const total = STEP_ORDER.length
  const index = Math.min(stepIndex, total - 1)
  const stepId = STEP_ORDER[index]

  // Timer for the member-guide chain (cleared on unmount so a late dispatch
  // can never fire after the component is gone).
  const chainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (chainTimerRef.current) clearTimeout(chainTimerRef.current)
  }, [])

  // Mirror of `suspendedCtx.clubId` for the AUTO-OPEN effect below: a club
  // whose guide is parked in the pill must NOT re-offer itself when the
  // exec switches away and back (seen isn't stamped while suspended).
  const suspendedForRef = useRef<string | null>(null)

  // The pill is live only while the same club + role that suspended it is
  // still active (derived at render — see `suspended` below).
  const suspended =
    !!suspendedCtx && suspendedCtx.clubId === clubId && suspendedCtx.role === role

  // ── AUTO-OPEN — once per executive club per browser ─────────────────────
  // Fires ~1.1s after the active club settles as an acknowledged executive
  // club with no localStorage "seen" flag. This naturally covers:
  //   • club creation (handbook confirm → membership refetch → this opens)
  //   • members promoted to executive mid-session (role flips → this opens)
  //   • existing execs on their next visit in a fresh browser
  // Any close path stamps the flag, so it never nags twice.
  useEffect(() => {
    if (!seenKey || role !== "executive") return
    if (handbookAt == null) return // handbook popup still due — wait for it
    // Parked in the resume pill? Then it's already been offered — the exec
    // resumes on their own terms, it must not pop open again.
    if (suspendedForRef.current === clubId) return
    let seen = false
    try {
      seen = localStorage.getItem(seenKey) === "1"
    } catch {
      seen = false
    }
    if (seen) return
    const t = setTimeout(() => setOpen(true), 1100)
    return () => clearTimeout(t)
  }, [seenKey, role, handbookAt, clubId])

  // ── MANUAL OPEN — the `open-admin-tour` window event ────────────────────
  // Dispatched by Settings → Security → "Replay executive guide" (exec-only
  // card). The handler re-checks the role so a stale event can never show
  // this guide to a regular member.
  useEffect(() => {
    const handler = () => {
      const c = useAppStore.getState().currentClub
      if (!c || c.role !== "executive") return
      setStepIndex(0)
      setOpen(true)
    }
    window.addEventListener("open-admin-tour", handler as EventListener)
    return () => window.removeEventListener("open-admin-tour", handler as EventListener)
  }, [])

  // ── Close / suspend / navigation ─────────────────────────────────────────

  /** Close the guide FOR GOOD. `chain` = open the MEMBER guide right after
   *  (the "execs are members too" hand-off). Used when the guide is COMPLETED
   *  — and by the pill's explicit dismiss. Always stamps "seen". */
  const close = useCallback(
    (target?: View, opts?: { chain?: boolean }) => {
      setOpen(false)
      setSuspendedCtx(null)
      suspendedForRef.current = null
      // Stamp "seen" on ANY full-close path — auto-open never nags twice.
      if (seenKey) {
        try {
          localStorage.setItem(seenKey, "1")
        } catch {
          /* private mode etc. — worst case it re-offers next visit */
        }
      }
      if (opts?.chain) {
        if (chainTimerRef.current) clearTimeout(chainTimerRef.current)
        chainTimerRef.current = setTimeout(() => {
          window.dispatchEvent(new CustomEvent("open-onboarding-tour"))
        }, MEMBER_GUIDE_CHAIN_MS)
      }
      if (target) setView(target)
    },
    [seenKey, setView],
  )

  /** Park the guide in the floating resume pill — every "leave early" path
   *  (try-it jump, Escape, X, scrim click) comes through here so the guide
   *  NEVER disappears mid-tour. Does NOT stamp "seen": an interrupted guide
   *  isn't finished, so it may legitimately re-offer itself next visit. */
  const suspend = useCallback(
    (target?: View) => {
      setOpen(false)
      if (clubId && role) {
        setSuspendedCtx({ clubId, role })
        suspendedForRef.current = clubId
      }
      if (target) setView(target)
    },
    [setView, clubId, role],
  )

  /** Bring the suspended guide back — same step, same place. */
  const resume = useCallback(() => {
    setSuspendedCtx(null)
    suspendedForRef.current = null
    setOpen(true)
  }, [])

  /** Finish: close + hand off to the member guide (the exec is a member too). */
  const finishToMemberGuide = useCallback(() => {
    close(undefined, { chain: true })
  }, [close])

  /** Skip the hand-off and land in the app. */
  const skipToApp = useCallback(() => {
    close("dashboard")
  }, [close])

  const next = useCallback(() => {
    if (index < total - 1) setStepIndex(index + 1)
    else finishToMemberGuide()
  }, [index, total, finishToMemberGuide])

  const back = useCallback(() => {
    if (index > 0) setStepIndex(index - 1)
  }, [index])

  /** Feature-step jump: park the guide in the resume pill and land directly
   *  in the real view — the pill floats up top whenever they want back in. */
  const tryView = useCallback(
    (v: View) => {
      suspend(v)
    },
    [suspend],
  )

  // ── Keyboard nav + scroll lock ──────────────────────────────────────────
  // Escape suspends (the pill brings the guide back — nothing is lost);
  // ArrowRight/Enter = next (chains on the last step, matching the finish
  // button); ArrowLeft = back. Enter on a focused button (or chip) lets that
  // control act natively — no double fire.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        suspend()
        return
      }
      const target = e.target instanceof HTMLElement ? e.target : null
      if (e.key === "Enter") {
        if (target?.closest("button, a, [role='button']")) return
        next()
      } else if (e.key === "ArrowRight") {
        next()
      } else if (e.key === "ArrowLeft") {
        back()
      }
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, suspend, next, back])

  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // ── Pill anchor ────────────────────────────────────────────────────────
  // The pill docks just below the app's top bar. A static calc breaks when
  // the UrgentBanner pushes the bar down, so the anchor is MEASURED from the
  // live header (on pill mount + whenever the header itself resizes). One
  // rAF hop keeps the initial read out of the effect body.
  const [pillTop, setPillTop] = useState<number | null>(null)
  useEffect(() => {
    if (!(suspended && !open)) return
    const header = document.querySelector(".ch-app > header")
    if (!header) return
    let raf = 0
    const measure = () => {
      const bottom = header.getBoundingClientRect().bottom
      setPillTop(Math.max(8, Math.round(bottom + 10)))
    }
    raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(header)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [suspended, open])

  // Reset the step body's scroll to the top on every step change, so a tall
  // step never leaves the next one scrolled halfway down.
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [stepId])

  const stepVariants = makeStepVariants(reduce)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── The floating resume pill ──────────────────────────────────────
          Docked just below the top bar while the guide is suspended, so the
          exec can click around the real app without ever losing their place.
          Quiet, approachable, zero looping motion — one entrance drop, then
          it just sits there waiting. Explicit X = dismiss for good. */}
      <AnimatePresence>
        {suspended && !open && (
          <motion.div
            role="status"
            aria-label="Executive guide paused"
            initial={{ opacity: 0, y: reduce ? 0 : -16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: reduce ? 0 : -12, x: "-50%" }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 32, mass: 0.9 }
            }
            className="fixed left-1/2 z-[150]"
            style={{
              top:
                pillTop != null
                  ? `${pillTop}px`
                  : "calc(3.5rem + env(safe-area-inset-top) + 0.625rem)",
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/95 py-1.5 pl-3 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-8px_rgba(0,0,0,0.18),0_24px_48px_-16px_rgba(0,0,0,0.22)] backdrop-blur-md">
              <ShieldCheck className="h-4 w-4 shrink-0 text-club" aria-hidden />
              <div className="flex min-w-0 flex-col leading-none">
                <span className="hidden text-[12px] font-semibold text-foreground sm:block">
                  Executive guide
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Step {index + 1} of {total}
                </span>
              </div>
              {/* Mini segmented progress — mirrors the modal header's */}
              <div className="hidden items-center gap-[3px] sm:flex" aria-hidden>
                {STEP_ORDER.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "h-[3px] w-3 rounded-full",
                      i <= index ? "bg-club" : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <Button
                variant="club"
                size="sm"
                onClick={resume}
                className="h-8 rounded-full px-3.5 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                Resume
              </Button>
              <button
                type="button"
                onClick={() => close()}
                aria-label="Dismiss guide"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[200] flex items-end justify-center p-3 sm:items-center sm:p-6">
          {/* Scrim — dims + soft-blurs the page, which stays visible AROUND
              the card. No blur on the panel itself (cheap to animate).
              Clicking it SUSPENDS the guide (pill up top) — “let me look
              around” is never a lost guide. */}
          <motion.button
            type="button"
            aria-label="Peek at the app"
            onClick={() => suspend()}
            variants={scrimVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[6px]"
          />

          {/* The modal card — centered on sm+, bottom sheet on mobile.
              NEVER fullscreen: max-w-3xl wide (two-column feature steps),
              max 85dvh tall. */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="ClubHub executive guide"
            initial={{ opacity: 0, y: reduce ? 0 : 20, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.98 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
            className="relative flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_40px_-12px_rgba(0,0,0,0.18),0_40px_100px_-28px_rgba(0,0,0,0.32)] outline-none will-change-transform sm:rounded-[26px]"
          >
            {/* Hairline gradient accent across the very top of the card */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-club/50 to-transparent"
            />

            {/* Header: wordmark + counter + close, then segmented progress */}
            <header className="shrink-0">
              <div className="flex items-center gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
                <span
                  className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-none text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-club" aria-hidden />
                  ClubHub
                  <span className="ml-1.5 hidden text-[0.65rem] font-medium uppercase tracking-[0.18em] text-club sm:inline">
                    Executive guide
                  </span>
                </span>
                <div className="flex-1" />
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {pad2(index + 1)}
                  <span className="opacity-50"> / {pad2(total)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => suspend()}
                  aria-label="Close executive guide"
                  className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Segmented progress — 8 segments, transform-only fills. */}
              <div className="mt-3 flex gap-1 border-b border-border/60 px-4 pb-3 sm:px-6" aria-hidden>
                {STEP_ORDER.map((s, i) => (
                  <div key={s} className="h-[3px] min-w-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full w-full origin-left bg-club"
                      initial={false}
                      animate={{ scaleX: i <= index ? 1 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                    />
                  </div>
                ))}
              </div>
            </header>

            {/* Scrollable step body */}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepId}
                  variants={stepVariants}
                  initial="enter"
                  animate="visible"
                  exit="exit"
                >
                  {stepId === "welcome" && (
                    <StepWelcome reduce={reduce} clubName={clubName} />
                  )}
                  {stepId === "brand" && (
                    <StepBrand reduce={reduce} clubName={clubName} onTry={tryView} />
                  )}
                  {stepId === "invite" && <StepInvite reduce={reduce} onTry={tryView} />}
                  {stepId === "approvals" && <StepApprovals reduce={reduce} onTry={tryView} />}
                  {stepId === "run" && <StepRun reduce={reduce} onTry={tryView} />}
                  {stepId === "records" && <StepRecords reduce={reduce} onTry={tryView} />}
                  {stepId === "oversight" && <StepOversight reduce={reduce} onTry={tryView} />}
                  {stepId === "ready" && (
                    <StepReady
                      reduce={reduce}
                      onTry={tryView}
                      onSkip={skipToApp}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer nav — 44px touch targets throughout. Completing the
                final step hands off to the member guide (the exec is a
                member too); Escape/X above is the explicit skip. */}
            <footer
              className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 px-4 py-3 sm:px-6"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              <Button
                variant="ghost"
                onClick={back}
                disabled={index === 0}
                className={cn(
                  "h-11 px-4 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
                  index === 0 && "pointer-events-none opacity-0",
                )}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>

              <span className="hidden text-[11px] font-medium text-muted-foreground/80 sm:inline">
                {stepId === "ready" ? "Next: member guide" : `Step ${index + 1} of ${total}`}
              </span>

              {stepId === "ready" ? (
                <Button
                  variant="club"
                  onClick={finishToMemberGuide}
                  className="h-11 min-w-[10rem] focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <Wand2 className="h-4 w-4" /> Member guide
                </Button>
              ) : (
                <Button
                  variant="club"
                  onClick={next}
                  className="h-11 min-w-[7.5rem] focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </footer>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </>
  )
}
