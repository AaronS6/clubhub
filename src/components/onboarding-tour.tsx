"use client"

import {
  useCallback, useEffect, useRef, useState,
  type ChangeEvent, type CSSProperties, type ReactNode,
} from "react"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
  ArrowLeft, ArrowRight, Bell, CalendarDays, Camera, Check, CheckSquare, Clock,
  Command, Loader2, Megaphone, MessageSquare, Palette, Rocket, Search, ShieldCheck,
  Sparkles, Target, Trophy, Users, Wallet, Wand2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DECORATION_IDS, DECORATION_LABELS, DecoratedAvatar, toDecorationId,
  type DecorationId,
} from "@/components/shared/decorated-avatar"
import { AvatarCropper } from "@/components/profile/avatar-cropper"
import {
  AMBIENT_PRESETS, THEME_COLOR_PRESETS, useCustomizationStore, type AmbientEffect,
} from "@/lib/customization-store"
import { useAppStore } from "@/lib/store"
import { useSearchShortcutHint } from "@/hooks/use-platform"
import { api, apiUpload } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { AmbientPreviewMini } from "@/components/shared/ambient-preview-mini"

/**
 * ============================================================================
 * OnboardingTour — the first-run introduction guide ("guided setup")
 * ============================================================================
 *
 * A CENTERED MODAL CARD, never a full-screen takeover. The page stays visible
 * (dimmed + softly blurred) around the card: on sm+ screens the card floats
 * in the middle (max-w-2xl, ~85dvh max height); on mobile it slides up as a
 * bottom-aligned sheet (rounded-t-3xl, safe-area padding) that still leaves
 * the top of the page visible above it.
 *
 * Steps (same order for everyone — role only gates the club-goal section):
 *   1  Welcome        — decorated-avatar showcase + what this guide is
 *   2  Add your photo — upload → inline crop (react-easy-crop) → save to
 *                       /api/me/avatar, then pick a Discord-style outer
 *                       decoration (DecoratedAvatar previews, saved via
 *                       PATCH /api/me { avatarDecoration }).
 *   3  What's inside  — the 8 member tools, staggered grid
 *   4  Set your goal  — personal service-hours goal for EVERYONE, plus a
 *                       club-wide goal for executives. Debounced optimistic
 *                       saves via /my-goal + club PATCH, prefilled from GET.
 *   5  Make it yours  — LIVE ambient + theme-color preview on hover
 *   6  You're ready   — recap chips + "Go to dashboard"
 *
 * Goal save flow (ported verbatim from the previous tour):
 *   - GET  /api/clubs/[clubId]/my-goal prefills personal + club goals (and
 *     confirms the role) when the tour opens / the goal step becomes active.
 *   - PATCH /api/clubs/[clubId]/my-goal { goal } saves the personal goal.
 *   - PATCH /api/clubs/[clubId] { hoursGoal } saves the club-wide goal
 *     (executives only).
 *   - Saves are debounced (0.9s) + flushed on Continue/Exit, show a tiny
 *     inline Saving…/Saved chip, invalidate the ["dashboard", clubId] query,
 *     and surface failures as a quiet toast — never blocking advancement.
 *
 * Decoration save flow (new):
 *   - PATCH /api/me { avatarDecoration } fires ~0.5s after a tile is picked
 *     (optimistic preview applies instantly) and is flushed when advancing
 *     past the step / closing the tour. Failures → soft toast, never block.
 *   - After the avatar blob upload (POST /api/me/avatar) + `update()` the
 *     session refreshes so the new photo shows app-wide; the cropper + file
 *     input stay live so the user can keep adjusting or re-saving.
 *
 * This renders INSIDE the app (mounted by app-shell with ZERO props), so it
 * stays theme-aware: bg-card / border-border / text-foreground / bg-club etc.
 * — never hardcode a palette here. Club accent tinting via the --club-* vars.
 *
 * Motion: entrances are fade + rise, step transitions cross-fade + slide
 * (AnimatePresence mode="wait", each phase ≤ 250ms). Under
 * prefers-reduced-motion every framer duration collapses to 0 and CSS keyframe
 * accents freeze (globals.css).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Steps & content data
// ---------------------------------------------------------------------------

type StepId = "welcome" | "photo" | "tools" | "goal" | "customize" | "ready"

const STEP_ORDER: readonly StepId[] = [
  "welcome", "photo", "tools", "goal", "customize", "ready",
]

const FEATURES = [
  { icon: Megaphone, title: "Announcements", desc: "Pinned news and updates." },
  { icon: Clock, title: "Service Hours", desc: "Log, track, and export hours." },
  { icon: CheckSquare, title: "Tasks", desc: "Kanban boards and assignments." },
  { icon: CalendarDays, title: "Meetings", desc: "RSVP and calendar export." },
  { icon: MessageSquare, title: "Chat", desc: "Real-time groups and DMs." },
  { icon: Users, title: "Teams", desc: "Sub-groups with roles." },
  { icon: Wallet, title: "Financials", desc: "Income, expenses, balance." },
  { icon: Trophy, title: "Badges", desc: "Awards and leaderboard." },
] as const

// Goal picker presets (hours).
const PERSONAL_PRESETS = [10, 25, 50, 100] as const
const CLUB_PRESETS = [50, 100, 250, 500] as const
const MAX_GOAL = 10000
const SAVE_DEBOUNCE_MS = 900
const DECO_SAVE_DEBOUNCE_MS = 500

/** Client-side avatar upload cap (matches the server's 5MB limit). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Motion — variant factories so every duration can collapse under
// prefers-reduced-motion (transform/opacity only; nothing repaints).
// ---------------------------------------------------------------------------

const EASE = [0.22, 1, 0.36, 1] as const

const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.16, ease: EASE } },
}

/** Step-content transition (AnimatePresence mode="wait"): gentle slide+fade. */
const makeStepVariants = (reduce: boolean): Variants => ({
  enter: { opacity: 0, y: reduce ? 0 : 16 },
  visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.25, ease: EASE } },
  exit: { opacity: 0, y: reduce ? 0 : -10, transition: { duration: reduce ? 0 : 0.15, ease: EASE } },
})

const makeFadeUp = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : 10 },
  visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.34, ease: EASE } },
})

const makeStagger = (reduce: boolean): { container: Variants; child: Variants } => ({
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: reduce ? 0 : 0.04, delayChildren: 0.03 } },
  },
  child: {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.26, ease: EASE } },
  },
})

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Clamp a goal into the API-legal 0–10000 range (NaN → 0). */
function clampGoal(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(MAX_GOAL, Math.round(n)))
}

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong. Please try again."
}

const pad2 = (n: number) => String(n).padStart(2, "0")

const HEADLINE_STYLE = { fontFamily: "var(--font-display)", letterSpacing: "-0.03em" } as const

const EYEBROW_CLS = "text-[0.65rem] font-bold tracking-[0.22em] uppercase text-club mb-2.5"

/** Shared content rhythm inside the modal body. */
const STEP_SHELL_CLS = "mx-auto w-full max-w-xl px-5 py-6 sm:px-8 sm:py-8"

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface MyGoalResponse {
  personalGoal: number
  clubGoal: number
  role: "member" | "executive"
}
interface GoalSaveResponse { goal: number }
interface ClubGoalSaveResponse { club: { hoursGoal: number | null } }

// ============================================================================

export function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  // Stores
  const setOnboardingCompleted = useCustomizationStore((s) => s.setOnboardingCompleted)
  const setAmbient = useCustomizationStore((s) => s.setAmbient)
  const setThemeColor = useCustomizationStore((s) => s.setThemeColor)
  const setView = useAppStore((s) => s.setView)
  const clubId = useAppStore((s) => s.currentClubId)
  const storeRole = useAppStore((s) => s.currentClub?.role)
  const queryClient = useQueryClient()
  const { data: session, update } = useSession()

  const reduce = !!useReducedMotion()

  // ── Goal state ────────────────────────────────────────────────────────────
  // `personalInput` / `clubInput` are the raw strings shown in the inputs (so
  // typing feels natural); the numeric state below drives ring/preview/save.
  // `goalsRef` mirrors the numeric goals so `flushGoalSaves` can always read
  // the freshest value, even in the same tick as a state update (Skip).
  const [personalGoal, setPersonalGoalState] = useState(0)
  const [clubGoal, setClubGoalState] = useState(0)
  const [personalInput, setPersonalInput] = useState("0")
  const [clubInput, setClubInput] = useState("0")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [remoteRole, setRemoteRole] = useState<"member" | "executive" | null>(null)

  const goalsRef = useRef({ personal: 0, club: 0 })
  // `initialGoals` (state) mirrors `initialRef` so the dirty flags below can
  // be computed during render without touching a ref (react-hooks/refs);
  // the ref stays the synchronous source of truth inside callbacks/effects.
  const [initialGoals, setInitialGoals] = useState({ personal: 0, club: 0 })
  const initialRef = useRef({ personal: 0, club: 0 }) // server-truth, for dirty math
  const commitInitial = useCallback((next: { personal: number; club: number }) => {
    initialRef.current = next
    setInitialGoals(next)
  }, [])
  const personalEditedRef = useRef(false)
  const clubEditedRef = useRef(false)
  const prefetchedRef = useRef(false)
  const chipResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Photo + decoration state ──────────────────────────────────────────────
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarSaved, setAvatarSaved] = useState(false)
  const [decoration, setDecoration] = useState<DecorationId>("none")
  const savedDecoRef = useRef<DecorationId>("none") // last value persisted to /api/me

  const isExec = storeRole === "executive" || remoteRole === "executive"

  const total = STEP_ORDER.length
  const index = Math.min(stepIndex, total - 1)
  const stepId = STEP_ORDER[index]

  const dirtyPersonal = personalGoal !== initialGoals.personal
  const dirtyClub = isExec && clubGoal !== initialGoals.club
  const goalDirty = dirtyPersonal || dirtyClub

  const avatarSrc = avatarPreview ?? session?.user?.image ?? null
  const userName = session?.user?.name || "You"

  // ── Goal setters (state + always-current ref) ─────────────────────────────

  const setPersonalValue = useCallback((next: number, syncInput = true) => {
    goalsRef.current = { ...goalsRef.current, personal: next }
    setPersonalGoalState(next)
    if (syncInput) setPersonalInput(String(next))
  }, [])

  const setClubValue = useCallback((next: number, syncInput = true) => {
    goalsRef.current = { ...goalsRef.current, club: next }
    setClubGoalState(next)
    if (syncInput) setClubInput(String(next))
  }, [])

  const pickPersonal = useCallback((n: number) => {
    personalEditedRef.current = true
    setPersonalValue(n)
  }, [setPersonalValue])

  const pickClub = useCallback((n: number) => {
    clubEditedRef.current = true
    setClubValue(n)
  }, [setClubValue])

  const handlePersonalInput = useCallback((raw: string) => {
    personalEditedRef.current = true
    const clean = raw.replace(/[^\d]/g, "").slice(0, 5)
    setPersonalInput(clean)
    setPersonalValue(clampGoal(parseInt(clean, 10)), false)
  }, [setPersonalValue])

  const handleClubInput = useCallback((raw: string) => {
    clubEditedRef.current = true
    const clean = raw.replace(/[^\d]/g, "").slice(0, 5)
    setClubInput(clean)
    setClubValue(clampGoal(parseInt(clean, 10)), false)
  }, [setClubValue])

  // ── Goal save pipeline ────────────────────────────────────────────────────

  const markSaved = useCallback(() => {
    setSaveState("saved")
    if (chipResetRef.current) clearTimeout(chipResetRef.current)
    chipResetRef.current = setTimeout(() => setSaveState("idle"), 2600)
  }, [])

  const savePersonal = useCallback(async (goal: number) => {
    if (!clubId || goal === initialRef.current.personal) return
    setSaveState("saving")
    try {
      await api<GoalSaveResponse>(`/api/clubs/${clubId}/my-goal`, {
        method: "PATCH",
        json: { goal },
      })
      commitInitial({ ...initialRef.current, personal: goal })
      void queryClient.invalidateQueries({ queryKey: ["dashboard", clubId] })
      markSaved()
    } catch (err) {
      setSaveState("idle")
      toast.error("Couldn't save your goal", { description: errMsg(err) })
    }
  }, [clubId, queryClient, markSaved, commitInitial])

  const saveClub = useCallback(async (goal: number) => {
    if (!clubId || !isExec || goal === initialRef.current.club) return
    setSaveState("saving")
    try {
      await api<ClubGoalSaveResponse>(`/api/clubs/${clubId}`, {
        method: "PATCH",
        json: { hoursGoal: goal },
      })
      commitInitial({ ...initialRef.current, club: goal })
      void queryClient.invalidateQueries({ queryKey: ["dashboard", clubId] })
      markSaved()
    } catch (err) {
      setSaveState("idle")
      toast.error("Couldn't save the club goal", { description: errMsg(err) })
    }
  }, [clubId, isExec, queryClient, markSaved, commitInitial])

  /** Fire any pending goal saves immediately (non-blocking). */
  const flushGoalSaves = useCallback(() => {
    if (!clubId) return
    const g = goalsRef.current
    if (g.personal !== initialRef.current.personal) void savePersonal(g.personal)
    if (isExec && g.club !== initialRef.current.club) void saveClub(g.club)
  }, [clubId, isExec, savePersonal, saveClub])

  // Debounced optimistic autosave — personal goal.
  useEffect(() => {
    if (!open || !clubId) return
    if (personalGoal === initialRef.current.personal) return
    const t = setTimeout(() => { void savePersonal(personalGoal) }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [open, clubId, personalGoal, savePersonal])

  // Debounced optimistic autosave — club goal (executives only).
  useEffect(() => {
    if (!open || !clubId || !isExec) return
    if (clubGoal === initialRef.current.club) return
    const t = setTimeout(() => { void saveClub(clubGoal) }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [open, clubId, isExec, clubGoal, saveClub])

  // ── Goal prefill (GET /my-goal) ───────────────────────────────────────────
  // Runs when the tour opens and retries when the goal step becomes active
  // if the first attempt failed. Never overwrites values the user touched.

  const fetchGoal = useCallback(async () => {
    if (!clubId || prefetchedRef.current) return
    try {
      const d = await api<MyGoalResponse>(`/api/clubs/${clubId}/my-goal`)
      prefetchedRef.current = true
      const personal = clampGoal(d?.personalGoal ?? 0)
      const club = clampGoal(d?.clubGoal ?? 0)
      commitInitial({ personal, club })
      if (!personalEditedRef.current) setPersonalValue(personal)
      if (!clubEditedRef.current) setClubValue(club)
      if (d?.role === "executive" || d?.role === "member") setRemoteRole(d.role)
    } catch {
      // Quiet — the picker still works with 0 defaults; saving retries on change.
    }
  }, [clubId, setPersonalValue, setClubValue, commitInitial])

  useEffect(() => {
    if (!open) return
    // Async IIFE so the (post-await) setStates inside fetchGoal are not
    // treated as synchronous setState calls in the effect body.
    void (async () => {
      await fetchGoal()
    })()
    panelRef.current?.focus()
  }, [open, fetchGoal])

  useEffect(() => {
    if (!open || stepId !== "goal") return
    void (async () => {
      await fetchGoal()
    })()
  }, [open, stepId, fetchGoal])

  // ── Decoration save pipeline ──────────────────────────────────────────────
  // Optimistic on select (the preview flips instantly), persisted via
  // PATCH /api/me { avatarDecoration } ~0.5s later and flushed on advance /
  // close. Failures surface as a soft toast and never block advancement.

  const saveDecoration = useCallback(async (id: DecorationId) => {
    try {
      await api("/api/me", { method: "PATCH", json: { avatarDecoration: id } })
      savedDecoRef.current = id
      // Refresh the session so the account-menu avatar picks up the effect.
      await update({ avatarDecoration: id })
    } catch (err) {
      toast.error("Couldn't save your avatar effect", { description: errMsg(err) })
    }
  }, [update])

  useEffect(() => {
    if (!open) return
    if (decoration === savedDecoRef.current) return
    const t = setTimeout(() => { void saveDecoration(decoration) }, DECO_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [open, decoration, saveDecoration])

  const flushDecorationSave = useCallback(() => {
    if (decoration !== savedDecoRef.current) void saveDecoration(decoration)
  }, [decoration, saveDecoration])

  const selectDecoration = useCallback((id: DecorationId) => {
    setDecoration(id)
  }, [])

  // ── Photo pipeline ────────────────────────────────────────────────────────

  const handleLivePreview = useCallback((dataUrl: string) => {
    setAvatarPreview(dataUrl)
  }, [])

  /** "Save photo" in the inline cropper — upload the 512×512 JPEG blob,
   *  then refresh the session so the avatar updates app-wide. */
  const handleCropped = useCallback(async (blob: Blob, previewUrl: string) => {
    setAvatarPreview(previewUrl)
    setAvatarSaving(true)
    try {
      const fd = new FormData()
      fd.append("file", blob, "avatar.jpg")
      const res = await apiUpload<{ avatarUrl: string }>("/api/me/avatar", fd)
      setAvatarPreview(res.avatarUrl)
      setAvatarSaved(true)
      await update({ image: res.avatarUrl })
      toast.success("Photo saved")
    } catch (err) {
      toast.error("Couldn't save your photo", { description: errMsg(err) })
    } finally {
      setAvatarSaving(false)
    }
  }, [update])

  const pickCropFile = useCallback((f: File) => {
    setCropFile(f)
  }, [])

  // ── Open / close / navigation ─────────────────────────────────────────────

  // Replay trigger (account menu / first-club-join). The handler re-reads the
  // freshest session values so the decoration prefill is correct on replay.
  useEffect(() => {
    const initialDeco = toDecorationId(session?.user?.avatarDecoration)
    const handler = () => {
      setStepIndex(0)
      setDecoration(initialDeco)
      savedDecoRef.current = initialDeco
      setOpen(true)
    }
    window.addEventListener("open-onboarding-tour", handler as EventListener)
    return () => window.removeEventListener("open-onboarding-tour", handler as EventListener)
  }, [session?.user?.avatarDecoration])

  const close = useCallback(() => {
    flushGoalSaves() // don't lose a goal set moments before exiting
    flushDecorationSave() // …or an effect picked moments before exiting
    if (chipResetRef.current) clearTimeout(chipResetRef.current)
    // Reset step bookkeeping so the next replay starts clean.
    prefetchedRef.current = false
    personalEditedRef.current = false
    clubEditedRef.current = false
    setRemoteRole(null)
    setSaveState("idle")
    setCropFile(null)
    setAvatarPreview(null)
    setAvatarSaving(false)
    setAvatarSaved(false)
    setOpen(false)
    setOnboardingCompleted(true)
  }, [flushGoalSaves, flushDecorationSave, setOnboardingCompleted])

  const next = useCallback(() => {
    if (stepId === "goal") flushGoalSaves()
    if (stepId === "photo") flushDecorationSave()
    if (index < total - 1) setStepIndex(index + 1)
    else close()
  }, [stepId, index, total, close, flushGoalSaves, flushDecorationSave])

  const back = useCallback(() => {
    if (index > 0) setStepIndex(index - 1)
  }, [index])

  /** "Skip for now" — discard pending personal edits and continue without
   *  saving them. Any club-goal edits an exec made still save. */
  const skipGoal = useCallback(() => {
    setPersonalValue(initialRef.current.personal)
    if (index < total - 1) setStepIndex(index + 1)
    else close()
  }, [setPersonalValue, index, total, close])

  const skipPhoto = useCallback(() => {
    flushDecorationSave()
    if (index < total - 1) setStepIndex(index + 1)
    else close()
  }, [index, total, close, flushDecorationSave])

  const goToDashboard = useCallback(() => {
    close()
    setView("dashboard")
  }, [close, setView])

  // ── Keyboard nav + scroll lock ────────────────────────────────────────────
  // Escape closes; ArrowRight/Enter = next; ArrowLeft = back. While typing in
  // the goal inputs, arrow keys keep their native text-cursor behavior, and
  // Enter on a focused button (or the crop zoom slider) lets that control act
  // natively — no double advance.

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return }
      const target = e.target instanceof HTMLElement ? e.target : null
      const inTextField = !!target?.closest("input, textarea, select, [contenteditable='true']")
      if (e.key === "Enter") {
        if (target?.closest("button, a, [role='button']")) return
        next()
      } else if (e.key === "ArrowRight") {
        if (inTextField) return
        next()
      } else if (e.key === "ArrowLeft") {
        if (inTextField) return
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
  }, [open, close, next, back])

  const stepVariants = makeStepVariants(reduce)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-3 sm:items-center sm:p-6">
          {/* Scrim — dims + soft-blurs the page, which stays visible AROUND
              the card. No blur on the panel itself (cheap to animate). */}
          <motion.div
            aria-hidden
            variants={scrimVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* The modal card — centered on sm+, bottom sheet on mobile.
              NEVER fullscreen: max-w-2xl wide, max 85dvh tall, and the
              container padding keeps real page visible on every side. */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="ClubHub introduction tour"
            initial={{ opacity: 0, y: reduce ? 0 : 26, scale: reduce ? 1 : 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 18, scale: reduce ? 1 : 0.985 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
            className="relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border/70 bg-card shadow-2xl outline-none will-change-transform sm:rounded-3xl"
          >
            {/* Header: wordmark + counter + close, then the animated progress */}
            <header className="shrink-0">
              <div className="flex items-center gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
                <span
                  className="min-w-0 truncate text-sm font-semibold leading-none text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  ClubHub
                  <span className="ml-2 hidden text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:inline">
                    Setup guide
                  </span>
                </span>
                <div className="flex-1" />
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {pad2(index + 1)}
                  <span className="opacity-50"> / {pad2(total)}</span>
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Skip introduction"
                  className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Animated progress bar — scaleX (transform-only) fill. */}
              <div className="mt-3 h-1 w-full overflow-hidden bg-muted/70" aria-hidden>
                <motion.div
                  className="h-full w-full origin-left bg-club"
                  initial={false}
                  animate={{ scaleX: (index + 1) / total }}
                  transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                />
              </div>
            </header>

            {/* Scrollable step body */}
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepId}
                  variants={stepVariants}
                  initial="enter"
                  animate="visible"
                  exit="exit"
                >
                  {stepId === "welcome" && <StepWelcome reduce={reduce} />}
                  {stepId === "photo" && (
                    <StepPhoto
                      name={userName}
                      avatarSrc={avatarSrc}
                      decoration={decoration}
                      cropFile={cropFile}
                      saving={avatarSaving}
                      saved={avatarSaved}
                      onPickFile={pickCropFile}
                      onLivePreview={handleLivePreview}
                      onCropped={handleCropped}
                      onSelectDecoration={selectDecoration}
                      onSkip={skipPhoto}
                    />
                  )}
                  {stepId === "tools" && <StepTools reduce={reduce} />}
                  {stepId === "goal" && (
                    <StepGoal
                      personalGoal={personalGoal}
                      personalInput={personalInput}
                      clubGoal={clubGoal}
                      clubInput={clubInput}
                      isExec={isExec}
                      saveState={saveState}
                      onPickPersonal={pickPersonal}
                      onPersonalInput={handlePersonalInput}
                      onPersonalBlur={() => setPersonalInput(String(personalGoal))}
                      onPickClub={pickClub}
                      onClubInput={handleClubInput}
                      onClubBlur={() => setClubInput(String(clubGoal))}
                      onSkip={skipGoal}
                    />
                  )}
                  {stepId === "customize" && (
                    <StepCustomize
                      onSetAmbient={setAmbient}
                      onSetThemeColor={setThemeColor}
                    />
                  )}
                  {stepId === "ready" && (
                    <StepReady
                      personalGoal={personalGoal}
                      clubGoal={clubGoal}
                      isExec={isExec}
                      photoAdded={avatarSaved}
                      decoration={decoration}
                      reduce={reduce}
                      onViewDashboard={goToDashboard}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer nav — 44px touch targets throughout */}
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

              <StepDots count={total} active={index} reduce={reduce} />

              {stepId === "ready" ? (
                <Button
                  variant="club"
                  onClick={goToDashboard}
                  className="h-11 min-w-[8.5rem] focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <Rocket className="h-4 w-4" /> Go to dashboard
                </Button>
              ) : (
                <Button
                  variant="club"
                  onClick={next}
                  className="h-11 min-w-[8.5rem] focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {stepId === "goal" && goalDirty ? "Save goal" : "Continue"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ───────────────────────── Footer dots ───────────────────────── */

/** Step dots that stretch (scaleX — transform-only) as steps complete. */
function StepDots({
  count, active, reduce,
}: {
  count: number
  active: number
  reduce: boolean
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ scaleX: i === active ? 2.6 : 1, opacity: i <= active ? 1 : 0.35 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
          className={cn("h-1.5 w-1.5 rounded-full", i <= active ? "bg-club" : "bg-muted-foreground/50")}
        />
      ))}
    </div>
  )
}

/* ───────────────────────── Shared step header ───────────────────────── */

function StepHeader({
  eyebrow, title, children, className,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
  className?: string
}) {
  const fadeUp = makeFadeUp(!!useReducedMotion())
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className={cn("mb-5 max-w-xl sm:mb-6", className)}>
      <p className={EYEBROW_CLS}>{eyebrow}</p>
      <h2
        className="text-[1.9rem] font-semibold leading-[1.06] text-foreground sm:text-[2.3rem]"
        style={HEADLINE_STYLE}
      >
        {title}
      </h2>
      {children ? (
        <div className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
      ) : null}
    </motion.div>
  )
}

/* ─────────────── Step 1: Welcome (decoration showcase) ─────────────── */

/** Sample members showing off avatar decorations — the star of the member
 *  side of the app. One staggered entrance, then still (the decorations
 *  themselves are the real product's ambient effects, so they keep gently
 *  animating — that's the feature being previewed, not decoration). */
const WELCOME_DECO: { id: DecorationId; name: string }[] = [
  { id: "sparkles", name: "Ava" },
  { id: "aura", name: "Maya" },
  { id: "orbit", name: "Noah" },
  { id: "halo", name: "Priya" },
  { id: "petals", name: "Lena" },
]

function WelcomeDecorRow({ reduce }: { reduce: boolean }) {
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
            "radial-gradient(360px 170px at 50% -30%, color-mix(in srgb, var(--club) 12%, transparent), transparent 72%)",
        }}
      />

      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="relative flex items-center justify-center gap-3.5 px-8 pb-2 pt-7 sm:gap-4 sm:pt-8"
      >
        {WELCOME_DECO.map((d) => (
          <motion.span key={d.id} variants={stagger.child} className="relative">
            <DecoratedAvatar
              decoration={d.id}
              name={d.name}
              className="h-11 w-11 sm:h-[3.25rem] sm:w-[3.25rem]"
              avatarClassName="ring-2 ring-card shadow-card"
            />
          </motion.span>
        ))}
      </motion.div>

      <div className="relative mt-3 border-t border-border/60 bg-muted/30 px-4 py-2.5 text-center">
        <p className="text-xs text-muted-foreground">
          Your photo and a decoration are next.
        </p>
      </div>
    </motion.div>
  )
}

function StepWelcome({ reduce }: { reduce: boolean }) {
  const fadeUp = makeFadeUp(reduce)
  return (
    <div className={STEP_SHELL_CLS}>
      <WelcomeDecorRow reduce={reduce} />

      <motion.h2
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-6 text-[2rem] font-semibold leading-[1.05] text-foreground sm:text-[2.5rem]"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
      >
        One home for your club.
      </motion.h2>

      <motion.p
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-3 max-w-md leading-relaxed text-muted-foreground"
      >
        Everything your club runs, in one place. Takes about a minute.
      </motion.p>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-club" />
          Replay from your account menu
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

/* ───────────────────────── Step 2: Add your photo ─────────────────────────
   The star step: file picker (≤5MB) → inline crop (react-easy-crop, live
   circular preview) → POST /api/me/avatar → Discord-style decoration picker
   (DecoratedAvatar tiles, saved via PATCH /api/me). */

function StepPhoto({
  name, avatarSrc, decoration, cropFile, saving, saved,
  onPickFile, onLivePreview, onCropped, onSelectDecoration, onSkip,
}: {
  name: string
  avatarSrc: string | null
  decoration: DecorationId
  cropFile: File | null
  saving: boolean
  saved: boolean
  onPickFile: (f: File) => void
  onLivePreview: (dataUrl: string) => void
  onCropped: (blob: Blob, previewUrl: string) => void
  onSelectDecoration: (id: DecorationId) => void
  onSkip: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fadeUp = makeFadeUp(!!useReducedMotion())

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    // Clear the input value so picking the SAME file again still fires.
    e.target.value = ""
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("That image is over 5MB")
      return
    }
    onPickFile(f)
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex items-start gap-5">
        <StepHeader eyebrow="Your profile" title="Add your photo." className="flex-1">
          Crop it, then pick an avatar effect.
        </StepHeader>
        <img
          src="/landing/tour-avatar.jpg"
          alt=""
          aria-hidden
          className="hidden h-24 w-32 shrink-0 rounded-xl border border-border/60 object-cover shadow-card sm:block"
        />
      </div>

      {/* ── Upload / crop card ── */}
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        aria-label="Profile photo"
        className="rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5"
      >
        {/* Live preview circle (shows the crop while you drag) + picker info */}
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="shrink-0">
            {/* key on decoration → a soft pop replays when the effect changes */}
            <DecoratedAvatar
              key={decoration}
              decoration={decoration}
              src={avatarSrc}
              name={name}
              className="ch-tour-pop h-20 w-20"
              avatarClassName="border-2 border-card shadow-card"
            />
          </div>
          <div className="min-w-0 flex-1">
            {saved ? (
              <>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Check className="h-4 w-4 text-club" /> Photo saved
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Pick an effect below, or replace it anytime.
                </p>
              </>
            ) : cropFile ? (
              <>
                <p className="text-sm font-semibold text-foreground">Frame it your way</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Drag, zoom, rotate — the circle previews live.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">Put a face to your name</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  It shows in chat, approvals, and the leaderboard.
                </p>
              </>
            )}
            {cropFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1.5 inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Camera className="h-3.5 w-3.5" />
                {saved ? "Replace photo" : "Choose a different photo"}
              </button>
            )}
          </div>
        </div>

        {/* The inline cropper (or the initial picker button) */}
        {cropFile ? (
          <div className="mt-4">
            <AvatarCropper
              file={cropFile}
              saving={saving}
              confirmLabel={saved ? "Update photo" : "Save photo"}
              onLivePreview={onLivePreview}
              onCropped={onCropped}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-club/40 hover:bg-club-subtle hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Camera className="h-5 w-5 text-club" />
            <span className="text-sm font-medium">Choose a photo</span>
            <span className="text-xs opacity-70">PNG or JPG · up to 5MB</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
          aria-label="Choose a profile photo"
        />

        <button
          type="button"
          onClick={onSkip}
          className="mt-3 inline-flex h-11 items-center rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Skip for now
        </button>
      </motion.section>

      {/* ── Decoration picker (avatar effects — the v8 set) ── */}
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        aria-label="Avatar decoration"
        className="mt-4 rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5"
      >
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-club" />
          <h3 className="text-sm font-semibold text-foreground">Dress it up</h3>
        </div>
        <p className="mb-3.5 text-xs leading-relaxed text-muted-foreground">
          It animates everywhere. Change it anytime.
        </p>
        <div className="grid grid-cols-4 gap-2.5">
          {DECORATION_IDS.map((id) => {
            const active = decoration === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectDecoration(id)}
                className={cn(
                  "relative flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 transition-[border-color,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  active
                    ? "border-club bg-club-muted shadow-card ring-1 ring-club/30"
                    : "border-border/70 bg-card hover:border-club/30 hover:shadow-card",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-club text-club-foreground"
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                )}
                <DecoratedAvatar
                  decoration={id}
                  src={avatarSrc}
                  name={name}
                  className="h-14 w-14"
                  avatarClassName="border-2 border-card"
                />
                <span className="text-center text-[0.625rem] font-medium leading-tight text-foreground/80">
                  {DECORATION_LABELS[id]}
                </span>
              </button>
            )
          })}
        </div>
      </motion.section>
    </div>
  )
}

/* ───────────────────────── Step 3: What's inside ───────────────────────── */

function StepTools({ reduce }: { reduce: boolean }) {
  const stagger = makeStagger(reduce)
  return (
    <div className={STEP_SHELL_CLS}>
      <StepHeader eyebrow="For members" title="What's inside.">
        Eight tools every member gets.
      </StepHeader>

      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        {FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <motion.div
              key={f.title}
              variants={stagger.child}
              whileHover={reduce ? undefined : { y: -3 }}
              className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-card/70 p-3 transition-colors hover:border-club/30 sm:p-3.5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-club-muted text-club shadow-card">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight text-foreground">{f.title}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{f.desc}</div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

/* ───────────────────────── Step 4: Set your goal ───────────────────────── */

function StepGoal({
  personalGoal, personalInput, clubGoal, clubInput, isExec, saveState,
  onPickPersonal, onPersonalInput, onPersonalBlur,
  onPickClub, onClubInput, onClubBlur, onSkip,
}: {
  personalGoal: number
  personalInput: string
  clubGoal: number
  clubInput: string
  isExec: boolean
  saveState: "idle" | "saving" | "saved"
  onPickPersonal: (n: number) => void
  onPersonalInput: (raw: string) => void
  onPersonalBlur: () => void
  onPickClub: (n: number) => void
  onClubInput: (raw: string) => void
  onClubBlur: () => void
  onSkip: () => void
}) {
  const fadeUp = makeFadeUp(!!useReducedMotion())
  return (
    <div className={STEP_SHELL_CLS}>
      <StepHeader eyebrow="Service hours" title="Set your goal.">
        Every hour you log moves the needle.
      </StepHeader>

      {/* ── Personal goal — for everyone ── */}
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        aria-label="Your personal service-hours goal"
        className="rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-club" />
            Your personal goal
          </h3>
          <SaveStateChip state={saveState} />
        </div>

        <GoalPicker
          presets={PERSONAL_PRESETS}
          goal={personalGoal}
          input={personalInput}
          ariaLabel="Personal goal in hours"
          onPick={onPickPersonal}
          onInput={onPersonalInput}
          onBlurNormalize={onPersonalBlur}
        />

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <GoalRing goal={personalGoal} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {personalGoal > 0 ? `0h of ${personalGoal}h logged` : "No goal yet"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {personalGoal > 0
                ? "Log hours and watch it fill."
                : "Pick a preset or type any number."}
            </p>
            <button
              type="button"
              onClick={onSkip}
              className="-ml-1 mt-2 inline-flex h-11 items-center rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Skip for now
            </button>
          </div>
        </div>
      </motion.section>

      {/* ── Club goal — executives only ── */}
      {isExec && (
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          aria-label="Club-wide service-hours goal"
          className="mt-4 rounded-2xl border border-club/25 bg-club-subtle p-4 sm:p-5"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-club" />
            Club goal
          </h3>
          <p className="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">
            A shared target every member sees. Change it in Members.
          </p>

          <GoalPicker
            presets={CLUB_PRESETS}
            goal={clubGoal}
            input={clubInput}
            ariaLabel="Club-wide goal in hours"
            onPick={onPickClub}
            onInput={onClubInput}
            onBlurNormalize={onClubBlur}
          />
        </motion.section>
      )}
    </div>
  )
}

/** Preset chips + custom-hours input. 44px touch targets throughout. */
function GoalPicker({
  presets, goal, input, ariaLabel, onPick, onInput, onBlurNormalize,
}: {
  presets: readonly number[]
  goal: number
  input: string
  ariaLabel: string
  onPick: (n: number) => void
  onInput: (raw: string) => void
  onBlurNormalize: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => {
        const active = goal === p
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            aria-label={`${p} hours`}
            onClick={() => onPick(p)}
            className={cn(
              "h-11 min-w-[4.5rem] rounded-xl border px-4 text-sm font-semibold tabular-nums transition-[background-color,border-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              active
                ? "border-club bg-club text-club-foreground shadow-card"
                : "border-border/80 bg-card text-foreground hover:border-club/40 hover:bg-club-muted",
            )}
          >
            {p}h
          </button>
        )
      })}
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onBlur={onBlurNormalize}
          aria-label={ariaLabel}
          placeholder="0"
          className="h-11 w-24 rounded-xl pr-8 font-medium tabular-nums focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
        >
          h
        </span>
      </div>
    </div>
  )
}

/** Goal-size dial: the arc previews the target (fills to goal/100), the
 *  center number is the goal itself, and the caption carries the literal
 *  progress copy ("0h of 25h"). Decorative — text states the truth. */
function GoalRing({ goal }: { goal: number }) {
  const R = 46
  const C = 2 * Math.PI * R
  const frac = Math.min(1, goal / 100)
  return (
    <div
      className="relative h-28 w-28 shrink-0"
      role="img"
      aria-label={goal > 0 ? `${goal} hour goal` : "No goal set"}
    >
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="56" cy="56" r={R} fill="none" strokeWidth="10" style={{ stroke: "var(--club-accent-muted)" }} />
        <circle
          cx="56"
          cy="56"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          style={{
            stroke: "var(--club-accent)",
            strokeDashoffset: C * (1 - frac),
            transition: "stroke-dashoffset 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={goal}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="text-2xl font-semibold tabular-nums text-foreground"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
        >
          {goal}
        </motion.span>
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">hours</span>
      </div>
    </div>
  )
}

/** Tiny inline saving/saved indicator (aria-live, never blocks). */
function SaveStateChip({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium",
        state === "saving" ? "bg-muted text-muted-foreground" : "bg-club-muted text-club-ink",
      )}
    >
      {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      {state === "saving" ? "Saving…" : "Saved"}
    </motion.span>
  )
}

/* ───────────────────────── Step 5: Make it yours ─────────────────────────
   LIVE preview: hovering/focusing an ambient or color swatch applies the
   change immediately via the customization store, so the ambient wash and
   accent AROUND this modal shift in real time. The committed value is
   whatever the user last hovered (or clicked) — "preview by hover, commit
   by click" with the same end state. Store wiring is identical to the
   previous tour step. */

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
    <div className={STEP_SHELL_CLS}>
      <StepHeader eyebrow="Personalize" title="Make it yours.">
        Hover to preview live. Change anytime in Settings.
      </StepHeader>

      {/* Ambient picker */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-club" />
          <h3 className="text-sm font-semibold text-foreground">Background</h3>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
                  "group relative flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-[border-color,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  isActive
                    ? "border-club bg-club-muted ring-1 ring-club/30 shadow-card"
                    : "border-border/70 bg-card hover:border-club/25 hover:shadow-card",
                )}
              >
                <AmbientPreviewMini effect={p.id} active={isActive} />
                <span className={cn("text-xs font-medium transition-colors", isActive ? "text-club-ink" : "text-foreground")}>
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Theme color */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-club" />
            <h3 className="text-sm font-semibold text-foreground">Theme color</h3>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
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
                  "h-11 w-11 rounded-full border-2 transition-[box-shadow,transform,border-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  isActive
                    ? "scale-110 border-foreground ring-2 ring-club/30"
                    : "border-card hover:scale-110",
                )}
                style={{ background: c.hex }}
              />
            )
          })}
          <label
            className="relative flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border transition-colors hover:border-club/30 hover:bg-accent/40"
            title="Pick a custom color"
            aria-label="Pick a custom color"
          >
            <input
              type="color"
              value={themeColor}
              onChange={(e) => onSetThemeColor(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <Palette className="h-4 w-4 text-muted-foreground" />
          </label>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Step 6: You're ready ───────────────────────── */

function StepReady({
  personalGoal, clubGoal, isExec, photoAdded, decoration, reduce, onViewDashboard,
}: {
  personalGoal: number
  clubGoal: number
  isExec: boolean
  photoAdded: boolean
  decoration: DecorationId
  reduce: boolean
  onViewDashboard: () => void
}) {
  // Platform-correct search hint: ⌘K on Mac/iPad, Ctrl K on Windows/Linux,
  // plain words on touch phones (they have no modifier keys).
  const searchHint = useSearchShortcutHint()
  const goalLabel =
    personalGoal > 0
      ? `${personalGoal}h goal set`
      : isExec && clubGoal > 0
        ? `${clubGoal}h club goal set`
        : null
  const decoLabel = decoration !== "none" ? `${DECORATION_LABELS[decoration]} effect on` : null

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-5 py-8 text-center sm:px-8">
      <motion.div
        initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
        className="relative mb-5"
      >
        <div aria-hidden className="absolute inset-0 -z-10 rounded-full" style={{ boxShadow: "0 0 0 12px var(--club-accent-subtle)" }} />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-club shadow-card-hover">
          <Check className="h-8 w-8 text-club-foreground" strokeWidth={2.5} />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.08, duration: reduce ? 0 : 0.4, ease: EASE }}
        className="text-[2.1rem] font-semibold leading-[1.05] text-foreground sm:text-[2.5rem]"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
      >
        You&rsquo;re in.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.14, duration: reduce ? 0 : 0.4, ease: EASE }}
        className="mt-3 max-w-sm leading-relaxed text-muted-foreground"
      >
        That&rsquo;s the tour. Change the look anytime in Settings → Appearance.
      </motion.p>

      {/* Recap chips */}
      {(goalLabel || photoAdded || decoLabel) && (
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.2, duration: reduce ? 0 : 0.4, ease: EASE }}
          className="mt-5 flex flex-wrap items-center justify-center gap-2"
        >
          {photoAdded && (
            <span className="inline-flex items-center gap-2 rounded-full border border-club/30 bg-club-muted px-3.5 py-1.5 text-xs font-medium text-club-ink">
              <Check className="h-3.5 w-3.5 shrink-0" /> Photo added
            </span>
          )}
          {decoLabel && (
            <span className="inline-flex items-center gap-2 rounded-full border border-club/30 bg-club-muted px-3.5 py-1.5 text-xs font-medium text-club-ink">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> {decoLabel}
            </span>
          )}
          {goalLabel && (
            <span className="inline-flex items-center gap-2 rounded-full border border-club/30 bg-club-muted px-3.5 py-1.5 text-xs font-medium text-club-ink">
              <Check className="h-3.5 w-3.5 shrink-0" /> {goalLabel}
            </span>
          )}
        </motion.div>
      )}

      {/* Warm send-off illustration */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.24, duration: reduce ? 0 : 0.4, ease: EASE }}
        className="relative mt-6 w-full overflow-hidden rounded-2xl border border-border/60 shadow-card"
      >
        <img
          src="/landing/tour-welcome.jpg"
          alt=""
          aria-hidden
          className="h-28 w-full object-cover sm:h-32"
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent" />
        <p className="absolute inset-x-0 bottom-0 p-3.5 text-xs font-medium text-white/90 drop-shadow-sm">
          See you around the club.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.28, duration: reduce ? 0 : 0.4, ease: EASE }}
        className="mt-6"
      >
        <Button
          size="lg"
          variant="club"
          onClick={onViewDashboard}
          className="h-12 min-w-[12rem] text-base focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Rocket className="mr-1.5 h-4 w-4" /> Go to dashboard
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 0.38, duration: reduce ? 0 : 0.4 }}
        className="mt-6 grid w-full max-w-md grid-cols-3 gap-x-4 gap-y-2 text-xs text-muted-foreground"
      >
        <div className="flex items-center justify-center gap-1.5">
          {searchHint.isApple ? (
            <Command className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Search className="h-3.5 w-3.5" aria-hidden />
          )}
          {searchHint.kind === "touch" ? "Search anything" : `${searchHint.label} search`}
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
