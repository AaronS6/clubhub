"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles, ArrowRight, ArrowLeft, X, Check, Palette, Wand2,
  Megaphone, Clock, CheckSquare, CalendarDays, MessageSquare,
  Users, Wallet, Bell, Zap, Trophy, Rocket, Heart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AMBIENT_PRESETS, THEME_COLOR_PRESETS, useCustomizationStore, type AmbientEffect,
} from "@/lib/customization-store"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * ============================================================================
 * OnboardingTour — the polished first-run introduction
 * ============================================================================
 *
 * A 5-step guided tour shown the FIRST time a user joins/creates a club, and
 * replayable anytime from the account menu ("Replay introduction guide").
 *
 *   Step 0  Welcome          — animated brand mark + headline
 *   Step 1  What it does      — animated feature cards
 *   Step 2  Power tips         — 3 tips that make the app click
 *   Step 3  Customize          — live preview: pick ambient effect + theme color
 *   Step 4  You're all set     — confetti + a final CTA into the dashboard
 *
 * The tour uses Framer Motion for step transitions (slide + fade), and the
 * customization step writes to the customization store so the user sees the
 * effect live behind the dialog (the AmbientBackground is rendered globally
 * by the CustomizationProvider in layout.tsx).
 *
 * Open via the `open-onboarding-tour` window event (so the menu item and the
 * first-join detection can both trigger it without prop drilling).
 * ============================================================================
 */

const TOTAL_STEPS = 5

export function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const setOnboardingCompleted = useCustomizationStore((s) => s.setOnboardingCompleted)
  const setAmbient = useCustomizationStore((s) => s.setAmbient)
  const setThemeColor = useCustomizationStore((s) => s.setThemeColor)
  const setView = useAppStore((s) => s.setView)

  // Listen for the open-onboarding-tour event (from the menu "Replay" button
  // and from the first-club-join detection in AppShell).
  useEffect(() => {
    const handler = () => {
      setStep(0)
      setOpen(true)
    }
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

  // Keyboard: Escape closes, ArrowRight/Enter next, ArrowLeft back
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight" || e.key === "Enter") next()
      else if (e.key === "ArrowLeft") back()
    }
    window.addEventListener("keydown", onKey)
    // Lock body scroll while the tour is open
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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        >
          <TourCard step={step} total={TOTAL_STEPS} onClose={close} onNext={next} onBack={back} onSetAmbient={setAmbient} onSetThemeColor={setThemeColor} onViewDashboard={() => { close(); setView("dashboard") }} />
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
      initial={{ scale: 0.95, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.95, opacity: 0, y: 10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-2xl overflow-hidden rounded-none sm:rounded-2xl border border-border bg-card shadow-2xl"
      style={{ maxHeight: "100dvh" }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Skip introduction"
        className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Step progress dots */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === step ? "w-6 bg-club" : i < step ? "w-1.5 bg-club/50" : "w-1.5 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {/* Step content — slides horizontally */}
      <div className="overflow-y-auto" style={{ maxHeight: "100dvh" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && <StepWelcome />}
            {step === 1 && <StepFeatures />}
            {step === 2 && <StepTips />}
            {step === 3 && <StepCustomize onSetAmbient={onSetAmbient} onSetThemeColor={onSetThemeColor} />}
            {step === 4 && <StepAllSet onViewDashboard={onViewDashboard} />}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border bg-card/95 backdrop-blur px-5 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={step === 0} className="text-muted-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <span className="text-caption text-muted-foreground tabular-nums">
            {step + 1} / {total}
          </span>
          {step < total - 1 ? (
            <Button size="sm" variant="club" onClick={onNext}>
              Continue <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" variant="club" onClick={onViewDashboard}>
              <Rocket className="mr-1 h-4 w-4" /> Enter ClubHub
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ───────────────────────── Steps ───────────────────────── */

/** Step 0 — Welcome */
function StepWelcome() {
  return (
    <div className="relative flex flex-col items-center justify-center px-6 pt-16 pb-12 text-center sm:pt-20 sm:pb-16 min-h-[60vh] overflow-hidden">
      {/* Animated brand mark */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <BrandMarkHero />
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <p className="text-caption-medium text-club font-medium mb-2 tracking-wider uppercase">
          Welcome to
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
          ClubHub
        </h1>
        <p className="text-body text-muted-foreground max-w-md mx-auto">
          The all-in-one home for clubs — announcements, service hours, tasks,
          meetings, chat, and more. Built for the people who run things.
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="mt-8 flex items-center gap-2 text-caption text-muted-foreground"
      >
        <Zap className="h-3.5 w-3.5 text-club" />
        <span>Takes ~60 seconds · you can replay this anytime</span>
      </motion.div>
    </div>
  )
}

/** Animated brand mark — three concentric rounded squares with a pulse.
 *  Pure SVG + Framer Motion so it's crisp at any size and respects reduced
 *  motion (Framer auto-handles that). */
function BrandMarkHero() {
  return (
    <div className="relative h-28 w-28">
      <motion.div
        className="absolute inset-0 rounded-3xl bg-club/20"
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.2, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-2 rounded-2xl bg-club/30"
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.4, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />
      <motion.div
        className="absolute inset-4 rounded-xl bg-club flex items-center justify-center shadow-lg"
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      >
        <Sparkles className="h-9 w-9 text-club-foreground" />
      </motion.div>
    </div>
  )
}

/** Step 1 — What it does (feature showcase) */
const FEATURES = [
  { icon: Megaphone, title: "Announcements", desc: "Pin urgent news, react with emoji, threaded replies.", color: "#f97316" },
  { icon: Clock, title: "Service Hours", desc: "Log hours, track goals, get executive approval, export.", color: "#10b981" },
  { icon: CheckSquare, title: "Tasks", desc: "Kanban + list, assign teammates, subtasks, comments.", color: "#0ea5e9" },
  { icon: CalendarDays, title: "Meetings", desc: "RSVP, attendees, calendar export (.ics), recap notes.", color: "#a855f7" },
  { icon: MessageSquare, title: "Chat", desc: "Real-time DMs + group chats, pin messages, reactions.", color: "#ec4899" },
  { icon: Users, title: "Teams & Members", desc: "Sub-groups, role permissions, member import.", color: "#14b8a6" },
  { icon: Wallet, title: "Financials", desc: "Track income & expenses, see the club balance over time.", color: "#eab308" },
  { icon: Trophy, title: "Badges & Leaderboard", desc: "Earn badges for milestones, climb the leaderboard.", color: "#ef4444" },
]

function StepFeatures() {
  const [visible, setVisible] = useState(0)
  useEffect(() => {
    // Stagger reveal of feature cards
    if (visible < FEATURES.length) {
      const t = setTimeout(() => setVisible(v => v + 1), 80)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <div className="px-6 pt-14 pb-8 sm:pt-16">
      <div className="text-center mb-6">
        <p className="text-caption-medium text-club font-medium mb-1.5 tracking-wider uppercase">
          Everything in one place
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          What ClubHub does
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon
          const isShown = i < visible
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              animate={isShown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 hover:bg-accent/30 transition-colors"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${f.color}20`, color: f.color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-body-medium font-medium">{f.title}</div>
                <div className="text-caption text-muted-foreground mt-0.5">{f.desc}</div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/** Step 2 — Power tips */
const TIPS = [
  {
    icon: Bell,
    title: "Notifications that work for you",
    body: "Open Account → Notifications to pick what pings you. Each type (announcements, tasks, hours, chat) has its own channel — email, push, or both. Don't want a 2am email? Turn it off.",
  },
  {
    icon: Zap,
    title: "Real-time everything",
    body: "Chat, typing indicators, presence dots, and announcements update live. No refresh needed. The green dot in the top bar means you're connected.",
  },
  {
    icon: Palette,
    title: "Make it yours",
    body: "Each club has its own accent color, and on the next step you'll pick an ambient background + your own theme color. You can change these anytime in Settings → Appearance.",
  },
]

function StepTips() {
  return (
    <div className="px-6 pt-14 pb-8 sm:pt-16">
      <div className="text-center mb-6">
        <p className="text-caption-medium text-club font-medium mb-1.5 tracking-wider uppercase">
          Pro tips
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Three things that make it click
        </h2>
      </div>
      <div className="space-y-3">
        {TIPS.map((t, i) => {
          const Icon = t.icon
          return (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-club-muted text-club">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-muted-foreground/60 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-body-medium font-semibold">{t.title}</h3>
                </div>
                <p className="text-body text-muted-foreground leading-relaxed">{t.body}</p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/** Step 3 — Customize (live preview) */
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
    <div className="px-6 pt-14 pb-8 sm:pt-16">
      <div className="text-center mb-6">
        <p className="text-caption-medium text-club font-medium mb-1.5 tracking-wider uppercase">
          Make it yours
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Customize your space
        </h2>
        <p className="text-body text-muted-foreground mt-2 max-w-md mx-auto">
          Pick a background effect and a theme color. You'll see it live behind
          this card. Change it anytime in Settings → Appearance.
        </p>
      </div>

      {/* Ambient picker */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <Wand2 className="h-4 w-4 text-club" />
          <h3 className="text-body-medium font-semibold">Background effect</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {AMBIENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSetAmbient(p.id)}
              className={cn(
                "group relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                ambient === p.id
                  ? "border-club bg-club-muted ring-2 ring-club/30"
                  : "border-border bg-card hover:bg-accent/40"
              )}
            >
              <AmbientPreviewMini effect={p.id} active={ambient === p.id} />
              <span className={cn("text-caption-medium font-medium", ambient === p.id ? "text-club-ink" : "text-foreground")}>
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Theme color picker */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-club" />
            <h3 className="text-body-medium font-semibold">Theme color</h3>
          </div>
          <label className="flex items-center gap-2 text-caption text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-club"
            />
            Override club color
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {THEME_COLOR_PRESETS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSetThemeColor(c.hex)}
              aria-label={`Theme color ${c.label}`}
              className={cn(
                "h-9 w-9 rounded-full border-2 transition-all hover:scale-110",
                themeColor.toLowerCase() === c.hex.toLowerCase() && override
                  ? "border-foreground ring-2 ring-club/40 scale-110"
                  : "border-card"
              )}
              style={{ background: c.hex }}
            />
          ))}
          {/* Custom color input */}
          <label
            className="relative h-9 w-9 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-accent/40 transition-colors overflow-hidden"
            title="Pick a custom color"
          >
            <input
              type="color"
              value={themeColor}
              onChange={(e) => onSetThemeColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Palette className="h-4 w-4 text-muted-foreground" />
          </label>
        </div>
        {override && (
          <p className="text-caption text-muted-foreground mt-2">
            Your theme color overrides the club's accent everywhere.
          </p>
        )}
      </div>
    </div>
  )
}

/** Mini live preview of an ambient effect for the picker tiles. Renders a
 *  tiny inset card with a CSS approximation of the effect. */
function AmbientPreviewMini({ effect, active }: { effect: AmbientEffect; active: boolean }) {
  const baseColor = "var(--club-accent, #10b981)"
  return (
    <div
      className={cn(
        "relative h-12 w-full overflow-hidden rounded-lg",
        active ? "ring-1 ring-club/30" : ""
      )}
      style={{ background: "rgba(0,0,0,0.04)" }}
    >
      <div className="absolute inset-0" style={{ ["--amb" as string]: baseColor } as React.CSSProperties}>
        {effect === "none" && <div className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground/50">clean</div>}
        {effect === "aurora" && (
          <div className="absolute inset-0">
            <div className="absolute -inset-x-4 top-0 h-8 blur-md" style={{ background: `linear-gradient(90deg, transparent, ${baseColor}, transparent)`, opacity: 0.6 }} />
          </div>
        )}
        {effect === "blobs" && (
          <div className="absolute inset-0">
            <div className="absolute left-1 top-1 h-6 w-6 rounded-full blur-md" style={{ background: baseColor, opacity: 0.5 }} />
            <div className="absolute right-1 bottom-1 h-6 w-6 rounded-full blur-md" style={{ background: baseColor, opacity: 0.4 }} />
          </div>
        )}
        {effect === "bubbles" && (
          <div className="absolute inset-0 flex items-end gap-0.5 px-1 pb-1">
            <div className="h-2 w-2 rounded-full" style={{ background: baseColor, opacity: 0.5 }} />
            <div className="h-3 w-3 rounded-full" style={{ background: baseColor, opacity: 0.4 }} />
            <div className="h-2 w-2 rounded-full" style={{ background: baseColor, opacity: 0.5 }} />
            <div className="h-3 w-3 rounded-full" style={{ background: baseColor, opacity: 0.3 }} />
          </div>
        )}
        {effect === "mesh" && (
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(at 20% 20%, ${baseColor} 0px, transparent 30%), radial-gradient(at 80% 80%, ${baseColor} 0px, transparent 30%)`,
            opacity: 0.5,
          }} />
        )}
        {effect === "waves" && (
          <div className="absolute inset-0 flex items-end">
            <svg viewBox="0 0 60 20" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0,15 Q15,5 30,15 T60,15 L60,20 L0,20 Z" fill={baseColor} opacity={0.4} />
              <path d="M0,17 Q20,10 40,17 T60,17 L60,20 L0,20 Z" fill={baseColor} opacity={0.3} />
            </svg>
          </div>
        )}
        {effect === "particles" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="absolute rounded-full" style={{
                left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 25}%`, width: 2, height: 2,
                background: baseColor, boxShadow: `0 0 4px ${baseColor}`, opacity: 0.7,
              }} />
            ))}
          </div>
        )}
        {effect === "stardust" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="absolute rounded-full" style={{
                left: `${10 + (i * 16) % 80}%`, top: `${15 + (i * 23) % 70}%`, width: 1.5, height: 1.5,
                background: baseColor, boxShadow: `0 0 3px ${baseColor}`, opacity: 0.8,
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Step 4 — You're all set (with confetti) */
function StepAllSet({ onViewDashboard }: { onViewDashboard: () => void }) {
  const confetti = useRef<{ left: number; delay: number; color: string; rot: number }[]>(null as any)
  if (!confetti.current) {
    const colors = ["#10b981", "#f97316", "#a855f7", "#ec4899", "#eab308", "#0ea5e9"]
    confetti.current = Array.from({ length: 40 }).map(() => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 720 - 360,
    }))
  }
  return (
    <div className="relative px-6 pt-16 pb-12 text-center overflow-hidden min-h-[60vh] flex flex-col items-center justify-center">
      {/* Confetti burst */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.current.map((c, i) => (
          <motion.div
            key={i}
            initial={{ y: -20, opacity: 1, rotate: 0 }}
            animate={{ y: "120vh", opacity: 0, rotate: c.rot }}
            transition={{ duration: 2.5, delay: c.delay, ease: "easeIn" }}
            className="absolute top-0 h-3 w-2 rounded-sm"
            style={{ left: `${c.left}%`, background: c.color }}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10"
      >
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-club text-club-foreground shadow-lg">
          <Check className="h-10 w-10" strokeWidth={3} />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" style={{ fontFamily: "var(--font-display)" }}>
          You&apos;re all set
        </h2>
        <p className="text-body text-muted-foreground max-w-md mx-auto mb-6">
          That&apos;s the tour. You can revisit this anytime from your account
          menu, and change your background or theme color in Settings →
          Appearance. Welcome to ClubHub.
        </p>

        <div className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
          <Heart className="h-3.5 w-3.5 text-club fill-club" />
          <span>Built for the people who run things.</span>
        </div>
      </motion.div>
    </div>
  )
}
