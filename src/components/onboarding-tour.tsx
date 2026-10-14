"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import {
  ArrowRight, ArrowLeft, X, Check, Palette, Wand2,
  Megaphone, Clock, CheckSquare, CalendarDays, MessageSquare,
  Users, Wallet, Bell, Trophy, Rocket, Sparkles, Command, ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AMBIENT_PRESETS, THEME_COLOR_PRESETS, useCustomizationStore, type AmbientEffect,
} from "@/lib/customization-store"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * ============================================================================
 * OnboardingTour — the first-run introduction
 * ============================================================================
 *
 * A 4-step premium tour shown the first time a user joins/creates a club,
 * and replayable from the account menu.
 *
 * Design language: Linear-inspired. Calm, editorial, confident. Each step
 * owns the full card surface and feels intentional — never a screensaver,
 * never a checklist. Strong visual hierarchy, restrained motion.
 *
 *   Step 0  Welcome       — brand mark + headline + subtle accent halo
 *   Step 1  Features       — staggered bento card grid (8 tools)
 *   Step 2  Customize     — LIVE ambient + theme-color preview on hover
 *   Step 3  Ready           — single emphatic CTA
 *
 * Motion:
 *   - Card entrance: spring in from below, opacity 0→1
 *   - Step transitions: AnimatePresence mode="wait" — old step exits up +
 *     fades, new step enters from below + fades
 *   - Staggered children inside StepFeatures via custom variants
 *   - prefers-reduced-motion: AnimatePresence transitions reduce to opacity
 *     only (the global CSS nukes transforms)
 * ============================================================================
 */

const TOTAL_STEPS = 4

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const EASE = [0.22, 1, 0.36, 1] as const

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.995,
    transition: { duration: 0.22, ease: EASE },
  },
}

const stepVariants: Variants = {
  enter: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.18, ease: EASE } },
}

// Stagger container — children inherit a delay so the bento grid reveals
// in a soft wave from top-left to bottom-right.
const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
}

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: EASE },
  },
}

// ============================================================================

export function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const setOnboardingCompleted = useCustomizationStore((s) => s.setOnboardingCompleted)
  const setAmbient = useCustomizationStore((s) => s.setAmbient)
  const setThemeColor = useCustomizationStore((s) => s.setThemeColor)
  const setView = useAppStore((s) => s.setView)

  useEffect(() => {
    const handler = () => { setStep(0); setOpen(true) }
    window.addEventListener("open-onboarding-tour", handler as EventListener)
    return () => window.removeEventListener("open-onboarding-tour", handler as EventListener)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setOnboardingCompleted(true)
  }, [setOnboardingCompleted])

  const next = useCallback(() => {
    if (step < TOTAL_STEPS - 1) setStep(step + 1)
    else close()
  }, [step, close])

  const back = useCallback(() => {
    if (step > 0) setStep(step - 1)
  }, [step])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight" || e.key === "Enter") next()
      else if (e.key === "ArrowLeft") back()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, close, next, back])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[200] flex items-stretch sm:items-center justify-stretch sm:justify-center p-0 sm:p-6"
          style={{ background: "color-mix(in oklab, rgba(15,18,22,0.55), rgba(15,18,22,0))", backdropFilter: "blur(10px) saturate(140%)" }}
        >
          <TourCard
            step={step}
            total={TOTAL_STEPS}
            onClose={close}
            onNext={next}
            onBack={back}
            onSetAmbient={setAmbient}
            onSetThemeColor={setThemeColor}
            onViewDashboard={() => { close(); setView("dashboard") }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────────────────── Card shell ───────────────────────── */

function TourCard({
  step, total, onClose, onNext, onBack, onSetAmbient, onSetThemeColor, onViewDashboard,
}: {
  step: number
  total: number
  onClose: () => void
  onNext: () => void
  onBack: () => void
  onSetAmbient: (a: AmbientEffect) => void
  onSetThemeColor: (hex: string) => void
  onViewDashboard: () => void
}) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      // Mobile: full-screen sheet (h-dvh, no rounding, flex-col).
      // Desktop: centered modal with rounded-2xl + soft layered shadow,
      // constrained to 90dvh so the bottom always clears the viewport.
      className="relative w-full max-w-2xl flex flex-col h-dvh sm:h-[90dvh] sm:max-h-[90dvh] overflow-hidden sm:rounded-2xl border border-border/80 bg-card shadow-dialog"
    >
      {/* ── Top: progress segmented bar + close ───────────────────────── */}
      <ProgressHeader
        step={step}
        total={total}
        onClose={onClose}
      />

      {/* ── Middle: scrollable step content with cross-fade ──────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={stepVariants}
            initial="enter"
            animate="visible"
            exit="exit"
          >
            {step === 0 && <StepWelcome />}
            {step === 1 && <StepFeatures />}
            {step === 2 && (
              <StepCustomize
                onSetAmbient={onSetAmbient}
                onSetThemeColor={onSetThemeColor}
              />
            )}
            {step === 3 && <StepReady onViewDashboard={onViewDashboard} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom: nav footer ────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 border-t border-border/80 bg-card/80 backdrop-blur-sm px-5 py-3.5 shrink-0"
        style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={step === 0}
          className={cn(
            "text-muted-foreground transition-opacity",
            step === 0 && "opacity-0 pointer-events-none"
          )}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <StepDots step={step} total={total} className="hidden sm:flex" />
        {step < total - 1 ? (
          <Button size="sm" variant="club" onClick={onNext} className="min-w-[7rem]">
            Continue <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="club" onClick={onViewDashboard} className="min-w-[7rem]">
            <Rocket className="mr-1.5 h-4 w-4" /> Enter ClubHub
          </Button>
        )}
      </div>
    </motion.div>
  )
}

/* ───────────────────────── Progress header ─────────────────────────
   A segmented progress bar that fills left-to-right as the user advances.
   Each segment animates its width + opacity when the current step passes
   through it. The close button sits to the right; the step counter is
   omitted from the header (it's in the dots row at the bottom). */

function ProgressHeader({
  step, total, onClose,
}: {
  step: number
  total: number
  onClose: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-5 sm:px-6 pt-5 pb-2 shrink-0 z-20">
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full bg-club rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / total) * 100}%` }}
          transition={{ duration: 0.4, ease: EASE }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
        {step + 1}<span className="opacity-50"> / {total}</span>
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Skip introduction"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/* StepDots — bottom-of-card dot indicator (desktop only, supplements the
   segmented progress bar at the top). The active dot expands into a small
   pill, completed dots fill with the accent color, future dots stay muted. */

function StepDots({
  step, total, className,
}: {
  step: number
  total: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === step
        const done = i < step
        return (
          <motion.span
            key={i}
            initial={false}
            animate={{
              width: active ? 22 : 6,
              opacity: done || active ? 1 : 0.4,
            }}
            transition={{ duration: 0.24, ease: EASE }}
            className={cn(
              "h-1.5 rounded-full",
              done ? "bg-club" : active ? "bg-club" : "bg-muted-foreground/40"
            )}
          />
        )
      })}
    </div>
  )
}

/* ───────────────────────── Step 0: Welcome ───────────────────────── */

function StepWelcome() {
  return (
    <div className="flex flex-col items-center justify-center px-5 sm:px-6 pt-10 sm:pt-20 pb-12 sm:pb-20 text-center min-h-[56vh] sm:min-h-[64vh]">
      {/* Brand mark — a rounded square with the club accent + a subtle
          accent halo behind it. The halo is a single static ring at 18%
          opacity; nothing pulses, nothing drifts. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative mb-8"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-2xl"
          style={{ boxShadow: "0 0 0 14px var(--club-accent-subtle)" }}
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-club shadow-card-hover">
          <span
            className="text-3xl font-bold text-club-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            C
          </span>
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5, ease: EASE }}
        className="text-[2.5rem] sm:text-[3.25rem] font-semibold tracking-tight leading-[1.05] mb-4 max-w-md"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
      >
        Welcome to ClubHub.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.5, ease: EASE }}
        className="text-body text-muted-foreground max-w-sm mx-auto leading-relaxed"
      >
        One shared home for your club — announcements, service hours,
        tasks, meetings, chat, and more. This takes about a minute.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32, duration: 0.4 }}
        className="mt-10 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs text-muted-foreground"
      >
        <Sparkles className="h-3.5 w-3.5 text-club" />
        <span>Replayable anytime from your account menu</span>
      </motion.div>
    </div>
  )
}

/* ───────────────────────── Step 1: Features ─────────────────────────
   Staggered bento grid. Each card uses the staggerChild variant so the
   reveal cascades top-left → bottom-right at 40ms intervals. The card
   icon sits in a soft accent-muted tile; the title + one-line
   description sits below. */

const FEATURES = [
  { icon: Megaphone, title: "Announcements", desc: "Pin news, react, reply in threads." },
  { icon: Clock, title: "Service Hours", desc: "Log hours, track goals, export." },
  { icon: CheckSquare, title: "Tasks", desc: "Kanban + list, assign, subtasks." },
  { icon: CalendarDays, title: "Meetings", desc: "RSVP, attendees, calendar export." },
  { icon: MessageSquare, title: "Chat", desc: "Real-time DMs + group chats." },
  { icon: Users, title: "Teams", desc: "Sub-groups, roles, member import." },
  { icon: Wallet, title: "Financials", desc: "Track income, expenses, balance." },
  { icon: Trophy, title: "Badges", desc: "Earn badges, climb the leaderboard." },
] as const

function StepFeatures() {
  return (
    <div className="px-5 sm:px-6 pt-8 sm:pt-12 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="text-center mb-8 sm:mb-10 max-w-md mx-auto"
      >
        <h2
          className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}
        >
          Everything in one place.
        </h2>
        <p className="text-body text-muted-foreground">
          Eight tools, one shared home for your club.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3"
      >
        {FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <motion.div
              key={f.title}
              variants={staggerChild}
              className="group flex flex-col items-start gap-2.5 rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-card transition-colors hover:border-club/25"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-club-muted text-club transition-transform group-hover:scale-105">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">{f.title}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-snug">{f.desc}</div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

/* ───────────────────────── Step 2: Customize ─────────────────────────
   Live preview: hovering an ambient swatch (or a color swatch) applies
   the change immediately via the customization store, so the ambient
   background + accent color behind the modal shifts in real time. The
   committed value is whatever the user last hovered (or clicked). This
   is intentional — it's a "preview by hover, commit by click" pattern
   with the same end state. */

function StepCustomize({
  onSetAmbient, onSetThemeColor,
}: {
  onSetAmbient: (a: AmbientEffect) => void
  onSetThemeColor: (hex: string) => void
}) {
  const ambient = useCustomizationStore((s) => s.ambient)
  const themeColor = useCustomizationStore((s) => s.themeColor)
  const override = useCustomizationStore((s) => s.overrideThemeColor)
  const setOverride = useCustomizationStore((s) => s.setOverrideThemeColor)

  return (
    <div className="px-5 sm:px-6 pt-8 sm:pt-12 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="text-center mb-8 max-w-md mx-auto"
      >
        <h2
          className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight mb-2"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}
        >
          Make it yours.
        </h2>
        <p className="text-body text-muted-foreground">
          Hover a swatch to preview it live behind this card. Change
          anytime in Settings → Appearance.
        </p>
      </motion.div>

      {/* Ambient picker */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="h-4 w-4 text-club" />
          <h3 className="text-sm font-semibold">Background</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {AMBIENT_PRESETS.map((p) => {
            const isActive = ambient === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSetAmbient(p.id)}
                onMouseEnter={() => onSetAmbient(p.id)}
                onFocus={() => onSetAmbient(p.id)}
                aria-pressed={isActive}
                className={cn(
                  "group relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-[border-color,background-color,box-shadow] duration-200",
                  isActive
                    ? "border-club bg-club-muted ring-1 ring-club/30 shadow-card"
                    : "border-border/80 bg-card hover:border-club/25 hover:shadow-card"
                )}
              >
                <AmbientPreviewMini effect={p.id} active={isActive} />
                <span className={cn(
                  "text-xs font-medium transition-colors",
                  isActive ? "text-club-ink" : "text-foreground"
                )}>
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Theme color */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-club" />
            <h3 className="text-sm font-semibold">Theme color</h3>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-club"
            />
            Override club color
          </label>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {THEME_COLOR_PRESETS.map((c) => {
            const isActive = themeColor.toLowerCase() === c.hex.toLowerCase() && override
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSetThemeColor(c.hex)}
                onMouseEnter={() => onSetThemeColor(c.hex)}
                onFocus={() => onSetThemeColor(c.hex)}
                aria-label={`Theme color ${c.label}`}
                aria-pressed={isActive}
                className={cn(
                  "h-9 w-9 rounded-full border-2 transition-[box-shadow,transform,border-color] duration-200",
                  isActive
                    ? "border-foreground ring-2 ring-club/30 scale-110"
                    : "border-card hover:scale-110"
                )}
                style={{ background: c.hex }}
              />
            )
          })}
          <label
            className="relative h-9 w-9 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-accent/40 hover:border-club/30 transition-colors overflow-hidden"
            title="Pick a custom color"
          >
            <input
              type="color"
              value={themeColor}
              onChange={(e) => onSetThemeColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          </label>
        </div>
      </div>
    </div>
  )
}

/** Mini preview tile for each ambient effect. A small (~h-12) canvas that
 *  mirrors the actual ambient-background.tsx rendering for each preset so
 *  the user can see what they're picking. */
function AmbientPreviewMini({ effect, active }: { effect: AmbientEffect; active: boolean }) {
  const baseColor = "var(--club-accent, #10b981)"
  return (
    <div
      className={cn(
        "relative h-12 w-full overflow-hidden rounded-md",
        active && "ring-1 ring-club/30"
      )}
      style={{ background: "rgba(0,0,0,0.04)" }}
    >
      <div className="absolute inset-0" style={{ ["--amb" as string]: baseColor } as React.CSSProperties}>
        {effect === "none" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
            clean
          </div>
        )}
        {effect === "aurora" && (
          <div className="absolute inset-0">
            <div
              className="absolute left-0 top-0 h-full w-1/2 blur-md"
              style={{ background: `linear-gradient(160deg, transparent, ${baseColor} 50%, transparent)` }}
            />
          </div>
        )}
        {effect === "blobs" && (
          <div className="absolute inset-0">
            <div className="absolute left-1 top-1 h-7 w-7 rounded-full blur-md" style={{ background: baseColor, opacity: 0.5 }} />
            <div className="absolute right-1 bottom-1 h-7 w-7 rounded-full blur-md" style={{ background: baseColor, opacity: 0.4 }} />
          </div>
        )}
        {effect === "bubbles" && (
          <div className="absolute inset-0 flex items-end gap-0.5 px-1 pb-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 8 + (i % 2) * 4,
                  height: 8 + (i % 2) * 4,
                  background: `radial-gradient(circle at 40% 40%, ${baseColor}, transparent 65%)`,
                }}
              />
            ))}
          </div>
        )}
        {effect === "mesh" && (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 60% 50% at 30% 30%, ${baseColor} 0%, transparent 70%)`,
              opacity: 0.5,
            }}
          />
        )}
        {effect === "waves" && (
          <div className="absolute inset-0 flex items-end">
            <div
              className="absolute bottom-0 left-0 right-0 h-1/2"
              style={{
                background: `linear-gradient(to top, ${baseColor}, transparent)`,
                borderRadius: "50% 50% 0 0 / 30% 30% 0 0",
              }}
            />
          </div>
        )}
        {effect === "particles" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${15 + i * 18}%`,
                  top: `${20 + (i % 3) * 25}%`,
                  width: 8,
                  height: 8,
                  background: `radial-gradient(circle, ${baseColor}, transparent 70%)`,
                }}
              />
            ))}
          </div>
        )}
        {effect === "stardust" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${10 + (i * 12) % 80}%`,
                  top: `${15 + (i * 19) % 70}%`,
                  width: 1.5,
                  height: 1.5,
                  background: baseColor,
                  boxShadow: `0 0 3px ${baseColor}`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 3: Ready ─────────────────────────
   The final step. A single emphatic CTA in the accent color, with a
   soft confetti-free checkmark above the headline. */

function StepReady({ onViewDashboard }: { onViewDashboard: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 sm:px-6 pt-10 sm:pt-20 pb-12 sm:pb-20 text-center min-h-[56vh] sm:min-h-[64vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="relative mb-7"
      >
        {/* Soft halo ring — sits behind the check. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full"
          style={{ boxShadow: "0 0 0 12px var(--club-accent-subtle)" }}
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-club shadow-card-hover">
          <Check className="h-8 w-8 text-club-foreground" strokeWidth={2.5} />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45, ease: EASE }}
        className="text-[2.25rem] sm:text-[2.75rem] font-semibold tracking-tight mb-3"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
      >
        You&rsquo;re in.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.45, ease: EASE }}
        className="text-body text-muted-foreground max-w-sm mx-auto mb-8 leading-relaxed"
      >
        That&rsquo;s the tour. Change your background or theme color anytime
        in Settings → Appearance. Welcome to ClubHub.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.45, ease: EASE }}
      >
        <Button size="lg" variant="club" onClick={onViewDashboard} className="min-w-[12rem] h-12 text-base">
          <Rocket className="mr-1.5 h-4 w-4" /> Go to dashboard
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.36, duration: 0.4 }}
        className="mt-8 grid grid-cols-3 gap-x-6 gap-y-2 max-w-md mx-auto text-xs text-muted-foreground"
      >
        <div className="flex items-center justify-center gap-1.5">
          <Command className="h-3.5 w-3.5" />⌘K search
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <Bell className="h-3.5 w-3.5" />Notifications
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />Approvals
        </div>
      </motion.div>
    </div>
  )
}
