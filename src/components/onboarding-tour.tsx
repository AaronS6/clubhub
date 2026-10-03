"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowRight, ArrowLeft, X, Check, Palette, Wand2,
  Megaphone, Clock, CheckSquare, CalendarDays, MessageSquare,
  Users, Wallet, Bell, Zap, Trophy, Rocket,
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
 * A 6-step tour shown the first time a user joins/creates a club, and
 * replayable from the account menu.
 *
 * Design language: calm, editorial, confident. No pulsing rings, no drifting
 * orbs, no confetti cannons. Just clean typography, restrained motion, and
 * a clear sense of progress. Think Linear's onboarding, not a screensaver.
 *
 *   Step 0  Welcome       — quiet brand mark + headline
 *   Step 1  Features       — staggered card grid
 *   Step 2  How it works  — three pillars with short copy
 *   Step 3  Tips            — three practical tips
 *   Step 4  Customize    — pick your background + color
 *   Step 5  Ready           — simple "you're in" + CTA
 * ============================================================================
 */

const TOTAL_STEPS = 6

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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-6"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-2xl overflow-hidden sm:rounded-xl rounded-none border border-border bg-card shadow-xl"
      style={{ maxHeight: "100dvh" }}
    >
      {/* Top progress bar — thin, accent-colored */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted z-30">
        <motion.div
          className="h-full bg-club"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / total) * 100}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Close + step counter */}
      <div className="absolute top-3.5 right-4 z-30 flex items-center gap-3">
        <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">
          {step + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip introduction"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step content */}
      <div className="overflow-y-auto" style={{ maxHeight: "100dvh" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && <StepWelcome />}
            {step === 1 && <StepFeatures />}
            {step === 2 && <StepHowItWorks />}
            {step === 3 && <StepTips />}
            {step === 4 && <StepCustomize onSetAmbient={onSetAmbient} onSetThemeColor={onSetThemeColor} />}
            {step === 5 && <StepReady onViewDashboard={onViewDashboard} />}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={step === 0} className="text-muted-foreground">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Button>
          {step < total - 1 ? (
            <Button size="sm" variant="club" onClick={onNext}>
              Continue <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="club" onClick={onViewDashboard}>
              <Rocket className="mr-1.5 h-3.5 w-3.5" /> Enter ClubHub
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ───────────────────────── Step 0: Welcome ───────────────────────── */

function StepWelcome() {
  return (
    <div className="flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center min-h-[60vh]">
      {/* Simple brand mark — just a rounded square with the accent. No
          pulsing rings, no drifting orbs, no glow. Quiet and confident. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-club">
          <span className="text-2xl font-bold text-club-foreground" style={{ fontFamily: "var(--font-display)" }}>
            C
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
      >
        <h1
          className="text-4xl sm:text-5xl font-bold tracking-tight mb-4"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome to ClubHub
        </h1>
        <p className="text-body text-muted-foreground max-w-md mx-auto leading-relaxed">
          The home for your club — announcements, service hours, tasks,
          meetings, chat, and more. This takes about a minute.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mt-10 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Zap className="h-3.5 w-3.5 text-club" />
        <span>Replayable anytime from your account menu</span>
      </motion.div>
    </div>
  )
}

/* ───────────────────────── Step 1: Features ───────────────────────── */

const FEATURES = [
  { icon: Megaphone, title: "Announcements", desc: "Pin news, react, reply in threads." },
  { icon: Clock, title: "Service Hours", desc: "Log hours, track goals, export." },
  { icon: CheckSquare, title: "Tasks", desc: "Kanban + list, assign, subtasks." },
  { icon: CalendarDays, title: "Meetings", desc: "RSVP, attendees, calendar export." },
  { icon: MessageSquare, title: "Chat", desc: "Real-time DMs + group chats." },
  { icon: Users, title: "Teams", desc: "Sub-groups, roles, member import." },
  { icon: Wallet, title: "Financials", desc: "Track income, expenses, balance." },
  { icon: Trophy, title: "Badges", desc: "Earn badges, climb the leaderboard." },
]

function StepFeatures() {
  const [visible, setVisible] = useState(0)
  useEffect(() => {
    if (visible < FEATURES.length) {
      const t = setTimeout(() => setVisible(v => v + 1), 50)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <div className="px-6 pt-16 pb-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Everything in one place
        </h2>
        <p className="text-sm text-muted-foreground">Eight tools, one shared home for your club.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon
          const isShown = i < visible
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={isShown ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-club-muted text-club">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 2: How it works ───────────────────────── */

const PILLARS = [
  {
    icon: Zap,
    title: "Real-time by default",
    body: "Chat, typing indicators, and announcements update live. No refresh needed — the green dot means you're connected.",
  },
  {
    icon: Bell,
    title: "Notifications you control",
    body: "Each type — announcements, tasks, hours, chat — has its own channel. Email, push, or both. Silence what you don't need.",
  },
  {
    icon: Trophy,
    title: "Track what matters",
    body: "Service hours, badges, and the leaderboard celebrate contributions. See your impact grow over the season.",
  },
]

function StepHowItWorks() {
  return (
    <div className="px-6 pt-16 pb-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Built for clubs
        </h2>
        <p className="text-sm text-muted-foreground">Three things that make ClubHub different.</p>
      </div>
      <div className="space-y-3">
        {PILLARS.map((p, i) => {
          const Icon = p.icon
          return (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-club-muted text-club">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold mb-1">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 3: Tips ───────────────────────── */

const TIPS = [
  {
    title: "Press ⌘K to search",
    body: "Jump to any announcement, task, meeting, or member from anywhere. The search bar in the top nav opens it.",
  },
  {
    title: "Approvals are one click",
    body: "Executives can approve or reject hours in bulk from the Approvals tab. Select multiple, then approve all at once.",
  },
  {
    title: "Customize anytime",
    body: "Change your background effect, theme color, and color mode in Settings → Appearance. On the next step, you'll pick your first one.",
  },
]

function StepTips() {
  return (
    <div className="px-6 pt-16 pb-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Three quick tips
        </h2>
        <p className="text-sm text-muted-foreground">Small things that make the app feel natural.</p>
      </div>
      <div className="space-y-3">
        {TIPS.map((t, i) => (
          <motion.div
            key={t.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground tabular-nums">
              {i + 1}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold mb-1">{t.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 4: Customize ───────────────────────── */

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
    <div className="px-6 pt-16 pb-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Make it yours
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Pick a background and a theme color. You'll see it live behind this
          card. Change it anytime in Settings → Appearance.
        </p>
      </div>

      {/* Ambient picker */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="h-4 w-4 text-club" />
          <h3 className="text-sm font-semibold">Background</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {AMBIENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSetAmbient(p.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors",
                ambient === p.id
                  ? "border-club bg-club-muted"
                  : "border-border bg-card hover:bg-accent/40"
              )}
            >
              <AmbientPreviewMini effect={p.id} active={ambient === p.id} />
              <span className={cn("text-xs font-medium", ambient === p.id ? "text-club-ink" : "text-foreground")}>
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Theme color */}
      <div>
        <div className="flex items-center justify-between mb-3">
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
        <div className="flex flex-wrap gap-2">
          {THEME_COLOR_PRESETS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSetThemeColor(c.hex)}
              aria-label={`Theme color ${c.label}`}
              className={cn(
                "h-9 w-9 rounded-full border-2 transition-all",
                themeColor.toLowerCase() === c.hex.toLowerCase() && override
                  ? "border-foreground ring-2 ring-club/30"
                  : "border-card hover:scale-110"
              )}
              style={{ background: c.hex }}
            />
          ))}
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
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          </label>
        </div>
      </div>
    </div>
  )
}

/** Mini preview tile for each ambient effect. */
function AmbientPreviewMini({ effect, active }: { effect: AmbientEffect; active: boolean }) {
  const baseColor = "var(--club-accent, #10b981)"
  return (
    <div
      className={cn(
        "relative h-12 w-full overflow-hidden rounded-md",
        active ? "ring-1 ring-club/30" : ""
      )}
      style={{ background: "rgba(0,0,0,0.04)" }}
    >
      <div className="absolute inset-0" style={{ ["--amb" as string]: baseColor } as React.CSSProperties}>
        {effect === "none" && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">clean</div>}
        {effect === "aurora" && (
          <div className="absolute inset-0">
            <div className="absolute left-0 top-0 h-full w-1/2 blur-md" style={{ background: `linear-gradient(160deg, transparent, ${baseColor} 50%, transparent)` }} />
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
              <div key={i} className="rounded-full" style={{ width: 8 + (i % 2) * 4, height: 8 + (i % 2) * 4, background: `radial-gradient(circle at 40% 40%, ${baseColor}, transparent 65%)` }} />
            ))}
          </div>
        )}
        {effect === "mesh" && (
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse 60% 50% at 30% 30%, ${baseColor} 0%, transparent 70%)`,
            opacity: 0.5,
          }} />
        )}
        {effect === "waves" && (
          <div className="absolute inset-0 flex items-end">
            <div className="absolute bottom-0 left-0 right-0 h-1/2" style={{ background: `linear-gradient(to top, ${baseColor}, transparent)`, borderRadius: "50% 50% 0 0 / 30% 30% 0 0" }} />
          </div>
        )}
        {effect === "particles" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="absolute rounded-full" style={{ left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 25}%`, width: 8, height: 8, background: `radial-gradient(circle, ${baseColor}, transparent 70%)` }} />
            ))}
          </div>
        )}
        {effect === "stardust" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="absolute rounded-full" style={{ left: `${10 + (i * 12) % 80}%`, top: `${15 + (i * 19) % 70}%`, width: 1.5, height: 1.5, background: baseColor, boxShadow: `0 0 3px ${baseColor}` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 5: Ready ───────────────────────── */

function StepReady({ onViewDashboard }: { onViewDashboard: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Simple check in a circle. No rotation, no glow, no pulsing. */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-club">
          <Check className="h-7 w-7 text-club-foreground" strokeWidth={2.5} />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" style={{ fontFamily: "var(--font-display)" }}>
          You&apos;re in
        </h2>
        <p className="text-body text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
          That&apos;s the tour. Change your background or theme color anytime in
          Settings → Appearance. Welcome to ClubHub.
        </p>
        <Button size="default" variant="club" onClick={onViewDashboard} className="mt-2">
          <Rocket className="mr-1.5 h-4 w-4" /> Go to dashboard
        </Button>
      </motion.div>
    </div>
  )
}
