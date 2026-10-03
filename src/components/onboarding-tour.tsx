"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion"
import {
  Sparkles, ArrowRight, ArrowLeft, X, Check, Palette, Wand2,
  Megaphone, Clock, CheckSquare, CalendarDays, MessageSquare,
  Users, Wallet, Bell, Zap, Trophy, Rocket, Heart, Play, Pause,
  LayoutDashboard, Star, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AMBIENT_PRESETS, THEME_COLOR_PRESETS, useCustomizationStore, type AmbientEffect,
} from "@/lib/customization-store"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * ============================================================================
 * OnboardingTour — the cinematic first-run introduction
 * ============================================================================
 *
 * A 6-step guided tour shown the FIRST time a user joins/creates a club, and
 * replayable anytime from the account menu ("Replay introduction guide").
 *
 *   Step 0  Cinematic Intro   — full-screen animated brand reveal
 *   Step 1  What it does       — auto-playing animated feature demos
 *   Step 2  Power features    — 3 hero features with rich visual demos
 *   Step 3  Power tips          — pro tips with staggered reveal
 *   Step 4  Customize           — immersive live preview picker
 *   Step 5  You're all set      — confetti finale + CTA
 *
 * Design language:
 *   - Glassmorphism cards (backdrop-blur, subtle border, layered shadows)
 *   - Framer Motion for every transition (spring physics, parallax, stagger)
 *   - Animated "video-like" demos using pure CSS (no real video files)
 *   - Progress bar with animated fill
 *   - Keyboard nav (Esc/←/→/Enter)
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

  // Listen for the open-onboarding-tour event
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

  // Keyboard nav
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

  // Progress spring
  const progress = useSpring(step / (TOTAL_STEPS - 1), { stiffness: 120, damping: 20 })

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-6"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)" }}
        >
          <TourCard
            step={step}
            total={TOTAL_STEPS}
            progress={progress}
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
  step, total, progress, onClose, onNext, onBack, onSetAmbient, onSetThemeColor, onViewDashboard,
}: {
  step: number
  total: number
  progress: any
  onClose: () => void
  onNext: () => void
  onBack: () => void
  onSetAmbient: (a: AmbientEffect) => void
  onSetThemeColor: (hex: string) => void
  onViewDashboard: () => void
}) {
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.92, opacity: 0, y: 20 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-3xl overflow-hidden sm:rounded-2xl rounded-none border border-white/10 bg-card/80 backdrop-blur-2xl shadow-2xl"
      style={{ maxHeight: "100dvh" }}
    >
      {/* Top progress bar — animated spring fill */}
      <div className="absolute top-0 left-0 right-0 h-1 z-30 bg-foreground/10">
        <motion.div
          className="h-full bg-gradient-to-r from-club via-club to-club/60"
          style={{ scaleX: progress, transformOrigin: "left" }}
        />
      </div>

      {/* Close + step counter */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-3">
        <span className="text-caption text-muted-foreground tabular-nums hidden sm:block">
          {step + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip introduction"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step content — cinematic transitions */}
      <div className="overflow-y-auto" style={{ maxHeight: "100dvh" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && <StepCinematicIntro />}
            {step === 1 && <StepFeatureShowcase />}
            {step === 2 && <StepPowerFeatures />}
            {step === 3 && <StepPowerTips />}
            {step === 4 && <StepCustomize onSetAmbient={onSetAmbient} onSetThemeColor={onSetThemeColor} />}
            {step === 5 && <StepFinale onViewDashboard={onViewDashboard} />}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav — glassmorphism bar */}
        <div className="flex items-center justify-between border-t border-white/5 bg-card/60 backdrop-blur-xl px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={step === 0} className="text-muted-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {step < total - 1 ? (
            <Button size="sm" variant="club" onClick={onNext} className="shadow-lg shadow-club/20">
              Continue <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" variant="club" onClick={onViewDashboard} className="shadow-lg shadow-club/20">
              <Rocket className="mr-1 h-4 w-4" /> Enter ClubHub
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ───────────────────────── Step 0: Cinematic Intro ───────────────────────── */

function StepCinematicIntro() {
  return (
    <div className="relative flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center min-h-[70vh] overflow-hidden">
      {/* Animated background orbs */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 1 }}
      >
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{
              width: 300 + i * 80,
              height: 300 + i * 80,
              left: `${20 + i * 25}%`,
              top: `${10 + i * 15}%`,
              background: i === 0 ? "var(--club)" : i === 1 ? "var(--club)" : "var(--club)",
              opacity: 0.15,
            }}
            animate={{
              x: [0, 30, -20, 0],
              y: [0, -25, 15, 0],
              scale: [1, 1.1, 0.95, 1],
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>

      {/* Animated brand mark */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotateY: 180 }}
        animate={{ scale: 1, opacity: 1, rotateY: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-8"
      >
        <div className="relative h-32 w-32">
          {/* Pulsing rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-3xl border-2"
              style={{ borderColor: "var(--club)" }}
              animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
            />
          ))}
          {/* Core */}
          <motion.div
            className="absolute inset-4 rounded-2xl bg-club flex items-center justify-center shadow-2xl"
            style={{ boxShadow: "0 0 60px var(--club)" }}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-12 w-12 text-club-foreground" />
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        <p className="text-caption font-medium text-club mb-3 tracking-[0.2em] uppercase">
          Welcome to
        </p>
        <h1
          className="text-5xl sm:text-6xl font-bold tracking-tight mb-5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ClubHub
        </h1>
        <p className="text-body text-muted-foreground max-w-md mx-auto leading-relaxed">
          The all-in-one home for clubs. Announcements, service hours, tasks,
          meetings, chat, and more — built for the people who run things.
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="mt-10 flex items-center gap-2 text-caption text-muted-foreground"
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Zap className="h-4 w-4 text-club" />
        </motion.div>
        <span>Takes ~90 seconds · replayable anytime</span>
      </motion.div>
    </div>
  )
}

/* ───────────────────────── Step 1: Feature Showcase (auto-playing) ───────────────────────── */

const FEATURES = [
  { icon: Megaphone, title: "Announcements", desc: "Pin urgent news, react with emoji, threaded replies.", color: "#f97316", demo: "announcement" },
  { icon: Clock, title: "Service Hours", desc: "Log hours, track goals, get executive approval, export.", color: "#10b981", demo: "hours" },
  { icon: CheckSquare, title: "Tasks", desc: "Kanban + list, assign teammates, subtasks, comments.", color: "#0ea5e9", demo: "tasks" },
  { icon: CalendarDays, title: "Meetings", desc: "RSVP, attendees, calendar export (.ics), recap notes.", color: "#a855f7", demo: "meetings" },
  { icon: MessageSquare, title: "Chat", desc: "Real-time DMs + group chats, pin messages, reactions.", color: "#ec4899", demo: "chat" },
  { icon: Wallet, title: "Financials", desc: "Track income & expenses, see the club balance over time.", color: "#eab308", demo: "financials" },
  { icon: Users, title: "Teams & Members", desc: "Sub-groups, role permissions, member import.", color: "#14b8a6", demo: "teams" },
  { icon: Trophy, title: "Badges & Leaderboard", desc: "Earn badges for milestones, climb the leaderboard.", color: "#ef4444", demo: "badges" },
]

function StepFeatureShowcase() {
  const [visible, setVisible] = useState(0)
  useEffect(() => {
    if (visible < FEATURES.length) {
      const t = setTimeout(() => setVisible(v => v + 1), 90)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <div className="px-6 pt-16 pb-8 sm:pt-20">
      <div className="text-center mb-8">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-caption font-medium text-club mb-2 tracking-[0.15em] uppercase"
        >
          Everything in one place
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          What ClubHub does
        </motion.h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon
          const isShown = i < visible
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={isShown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 text-center hover:border-club/40 transition-colors"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                style={{ background: `${f.color}20`, color: f.color }}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-body-medium font-semibold">{f.title}</div>
                <div className="text-caption text-muted-foreground mt-1 leading-relaxed">{f.desc}</div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 2: Power Features (animated demos) ───────────────────────── */

const POWER_FEATURES = [
  {
    icon: Bell,
    title: "Notifications that work for you",
    body: "Each notification type — announcements, tasks, hours, chat — has its own channel. Email, push, or both. You're in control.",
    visual: <NotificationsDemo />,
  },
  {
    icon: Zap,
    title: "Real-time everything",
    body: "Chat, typing indicators, presence dots, and announcements update live. No refresh needed. The green dot means you're connected.",
    visual: <RealtimeDemo />,
  },
  {
    icon: Trophy,
    title: "Track your impact",
    body: "Service hours, badges, and the leaderboard celebrate your contributions. Watch your stats grow over the season.",
    visual: <LeaderboardDemo />,
  },
]

function StepPowerFeatures() {
  return (
    <div className="px-6 pt-16 pb-8 sm:pt-20">
      <div className="text-center mb-8">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-caption font-medium text-club mb-2 tracking-[0.15em] uppercase"
        >
          Built for clubs
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Features you'll love
        </motion.h2>
      </div>
      <div className="space-y-4">
        {POWER_FEATURES.map((f, i) => {
          const Icon = f.icon
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-club-muted text-club">
                <Icon className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-muted-foreground/60 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                </div>
                <p className="text-body text-muted-foreground leading-relaxed mb-3">{f.body}</p>
                {/* Animated visual demo */}
                <div className="rounded-xl border border-white/5 bg-background/30 overflow-hidden">
                  {f.visual}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Animated "video-like" demos (pure CSS, no real video files) ── */

function NotificationsDemo() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % 4), 1200)
    return () => clearInterval(t)
  }, [])
  const types = ["New announcement", "Task assigned", "Hours approved", "New message"]
  return (
    <div className="p-4 space-y-2">
      {types.map((t, i) => (
        <motion.div
          key={t}
          animate={{
            opacity: active === i ? 1 : 0.4,
            x: active === i ? 0 : 0,
            scale: active === i ? 1 : 0.98,
          }}
          transition={{ duration: 0.3 }}
          className={cn(
            "flex items-center gap-3 rounded-lg p-2.5 transition-colors",
            active === i ? "bg-club-muted/60 border border-club/30" : "bg-transparent"
          )}
        >
          <div className={cn("h-2 w-2 rounded-full", active === i ? "bg-club" : "bg-muted-foreground/40")} />
          <span className="text-caption-medium">{t}</span>
          {active === i && (
            <motion.span
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className="ml-auto text-caption text-club font-medium"
            >
              now
            </motion.span>
          )}
        </motion.div>
      ))}
    </div>
  )
}

function RealtimeDemo() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="h-2.5 w-2.5 rounded-full bg-club"
        />
        <span className="text-caption-medium text-club font-medium">Live · connected</span>
      </div>
      <div className="space-y-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-lg bg-muted/40 p-2.5 text-caption"
        >
          <span className="font-medium">Maya:</span> Pushed the auto code 🚀
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="rounded-lg bg-club-muted/40 p-2.5 text-caption"
        >
          <span className="font-medium">Jordan:</span> Drive train is done ✅
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 1.8, duration: 1.5, repeat: Infinity }}
          className="text-caption text-muted-foreground italic px-1"
        >
          Maya is typing…
        </motion.div>
      </div>
    </div>
  )
}

function LeaderboardDemo() {
  const rows = [
    { rank: 1, name: "Alex Rivera", hours: "20h", avatar: "AR", color: "#f59e0b" },
    { rank: 2, name: "Maya Chen", hours: "14h", avatar: "MC", color: "#94a3b8" },
    { rank: 3, name: "Jordan Patel", hours: "10h", avatar: "JP", color: "#a78a7d" },
  ]
  return (
    <div className="p-4 space-y-2">
      {rows.map((r, i) => (
        <motion.div
          key={r.rank}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.2 }}
          className={cn(
            "flex items-center gap-3 rounded-lg p-2.5",
            r.rank === 1 ? "bg-club-muted/40" : "bg-muted/30"
          )}
        >
          <span className="text-lg font-bold w-6 text-center" style={{ color: r.color }}>
            {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"}
          </span>
          <div className="h-7 w-7 rounded-full bg-club/20 flex items-center justify-center text-caption font-medium">
            {r.avatar}
          </div>
          <span className="text-caption-medium flex-1">{r.name}</span>
          <span className="text-caption font-semibold tabular-nums">{r.hours}</span>
        </motion.div>
      ))}
    </div>
  )
}

/* ───────────────────────── Step 3: Power Tips ───────────────────────── */

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

function StepPowerTips() {
  return (
    <div className="px-6 pt-16 pb-8 sm:pt-20">
      <div className="text-center mb-8">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-caption font-medium text-club mb-2 tracking-[0.15em] uppercase"
        >
          Pro tips
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Three things that make it click
        </motion.h2>
      </div>
      <div className="space-y-3">
        {TIPS.map((t, i) => {
          const Icon = t.icon
          return (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 hover:border-club/30 transition-colors"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-club-muted text-club">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-muted-foreground/60 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-lg font-semibold">{t.title}</h3>
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

/* ───────────────────────── Step 4: Customize (immersive) ───────────────────────── */

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
    <div className="px-6 pt-16 pb-8 sm:pt-20">
      <div className="text-center mb-8">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-caption font-medium text-club mb-2 tracking-[0.15em] uppercase"
        >
          Make it yours
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Customize your space
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-body text-muted-foreground mt-3 max-w-md mx-auto"
        >
          Pick a background effect and a theme color. You'll see it live behind
          this card. Change it anytime in Settings → Appearance.
        </motion.p>
      </div>

      {/* Ambient picker */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="h-4 w-4 text-club" />
          <h3 className="text-body-medium font-semibold">Background effect</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {AMBIENT_PRESETS.map((p, i) => (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => onSetAmbient(p.id)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
                ambient === p.id
                  ? "border-club bg-club-muted/40 ring-2 ring-club/40 shadow-lg shadow-club/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
            >
              <AmbientPreviewMini effect={p.id} active={ambient === p.id} />
              <span className={cn("text-caption-medium font-medium", ambient === p.id ? "text-club-ink" : "text-foreground")}>
                {p.label}
              </span>
              {ambient === p.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-club flex items-center justify-center"
                >
                  <Check className="h-3 w-3 text-club-foreground" strokeWidth={3} />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Theme color picker */}
      <div>
        <div className="flex items-center justify-between mb-3">
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
        <div className="flex flex-wrap gap-2.5">
          {THEME_COLOR_PRESETS.map((c, i) => (
            <motion.button
              key={c.id}
              type="button"
              onClick={() => onSetThemeColor(c.hex)}
              aria-label={`Theme color ${c.label}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "relative h-10 w-10 rounded-full border-2 transition-all",
                themeColor.toLowerCase() === c.hex.toLowerCase() && override
                  ? "border-foreground ring-2 ring-club/40 scale-110"
                  : "border-card/50"
              )}
              style={{ background: c.hex, boxShadow: themeColor.toLowerCase() === c.hex.toLowerCase() && override ? `0 0 16px ${c.hex}` : "none" }}
            >
              {themeColor.toLowerCase() === c.hex.toLowerCase() && override && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />
                </motion.div>
              )}
            </motion.button>
          ))}
          {/* Custom color input */}
          <label
            className="relative h-10 w-10 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors overflow-hidden"
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
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-caption text-muted-foreground mt-3"
          >
            Your theme color overrides the club's accent everywhere.
          </motion.p>
        )}
      </div>
    </div>
  )
}

/** Mini live preview of an ambient effect for the picker tiles. */
function AmbientPreviewMini({ effect, active }: { effect: AmbientEffect; active: boolean }) {
  const baseColor = "var(--club-accent, #10b981)"
  return (
    <div
      className={cn(
        "relative h-14 w-full overflow-hidden rounded-lg",
        active ? "ring-1 ring-club/30" : ""
      )}
      style={{ background: "rgba(0,0,0,0.08)" }}
    >
      <div className="absolute inset-0" style={{ ["--amb" as string]: baseColor } as React.CSSProperties}>
        {effect === "none" && <div className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground/50">clean</div>}
        {effect === "aurora" && (
          <div className="absolute inset-0">
            <motion.div
              className="absolute -inset-x-4 top-0 h-10 blur-md"
              style={{ background: `linear-gradient(90deg, transparent, ${baseColor}, transparent)` }}
              animate={{ x: [-20, 20, -20] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        )}
        {effect === "blobs" && (
          <div className="absolute inset-0">
            <motion.div
              className="absolute left-1 top-1 h-7 w-7 rounded-full blur-md"
              style={{ background: baseColor, opacity: 0.5 }}
              animate={{ scale: [1, 1.2, 1], x: [0, 4, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <motion.div
              className="absolute right-1 bottom-1 h-7 w-7 rounded-full blur-md"
              style={{ background: baseColor, opacity: 0.4 }}
              animate={{ scale: [1, 1.3, 1], x: [0, -4, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }}
            />
          </div>
        )}
        {effect === "bubbles" && (
          <div className="absolute inset-0 flex items-end gap-0.5 px-1 pb-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="rounded-full"
                style={{ background: baseColor, opacity: 0.5, width: 4 + (i % 2) * 2, height: 4 + (i % 2) * 2 }}
                animate={{ y: [10, -2, 10] }}
                transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
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
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{ left: `${15 + i * 18}%`, width: 2, height: 2, background: baseColor, boxShadow: `0 0 4px ${baseColor}` }}
                animate={{ y: [15, 2, 15], opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2 + i * 0.2, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        )}
        {effect === "stardust" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{ left: `${10 + (i * 16) % 80}%`, top: `${15 + (i * 23) % 70}%`, width: 2, height: 2, background: baseColor, boxShadow: `0 0 3px ${baseColor}` }}
                animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── Step 5: Finale ───────────────────────── */

function StepFinale({ onViewDashboard }: { onViewDashboard: () => void }) {
  const confetti = useRef<{ left: number; delay: number; color: string; rot: number }[]>(null as any)
  if (!confetti.current) {
    const colors = ["#10b981", "#f97316", "#a855f7", "#ec4899", "#eab308", "#0ea5e9", "#14b8a6"]
    confetti.current = Array.from({ length: 60 }).map(() => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 720 - 360,
    }))
  }
  return (
    <div className="relative px-6 pt-20 pb-16 text-center overflow-hidden min-h-[70vh] flex flex-col items-center justify-center">
      {/* Confetti burst */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.current.map((c, i) => (
          <motion.div
            key={i}
            initial={{ y: -20, opacity: 1, rotate: 0, x: 0 }}
            animate={{ y: "110vh", opacity: 0, rotate: c.rot, x: (c.left - 50) * 4 }}
            transition={{ duration: 3, delay: c.delay, ease: "easeIn" }}
            className="absolute top-0 h-3.5 w-2.5 rounded-sm"
            style={{ left: `${c.left}%`, background: c.color }}
          />
        ))}
      </div>

      {/* Pulsing glow behind the check */}
      <motion.div
        className="absolute"
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="h-32 w-32 rounded-full bg-club blur-3xl" />
      </motion.div>

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22,  1, 0.36, 1] }}
        className="relative z-10"
      >
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-club text-club-foreground shadow-2xl" style={{ boxShadow: "0 0 80px var(--club)" }}>
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <Check className="h-12 w-12" strokeWidth={3} />
          </motion.div>
        </div>
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
          You&apos;re all set
        </h2>
        <p className="text-body text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
          That&apos;s the tour. You can revisit this anytime from your account
          menu, and change your background or theme color in Settings →
          Appearance. Welcome to ClubHub.
        </p>

        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center justify-center gap-2 text-caption text-muted-foreground"
        >
          <Heart className="h-4 w-4 text-club fill-club" />
          <span>Built for the people who run things.</span>
          <Heart className="h-4 w-4 text-club fill-club" />
        </motion.div>
      </motion.div>
    </div>
  )
}
