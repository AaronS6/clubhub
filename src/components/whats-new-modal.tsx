"use client"

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Sparkles, X } from "lucide-react"
import {
  checkAndMarkVisited,
  shouldShowWhatsNew,
  ackWhatsNew,
  setWhatsNewNotif,
  OPEN_WHATS_NEW_EVENT,
} from "@/lib/whats-new"
import { APP_VERSION } from "@/lib/version"

/**
 * ============================================================================
 * WhatsNewModal — "v8.0 — storage, guides & a glow-up"
 * ============================================================================
 *
 * The v8 wave, in one announcement:
 *
 *   v8.0   real club storage — a live quota meter, a pause at 100% with a
 *          clear recovery loop, ranked safe-cleanup suggestions, and a
 *          capacity request path; the executive introduction guide (with
 *          the resume pill); a chat diet (denser messages, Enter-to-send
 *          keeps focus, ~60% less storage per message); the redesigned
 *          avatar-effect set; the notes "Make private" flow; visible
 *          ambient backgrounds; and a pile of mobile fixes.
 *
 * The DISPLAYED version is APP_VERSION ("8.0") — whats-new.ts's
 * WHATS_NEW_VERSION ("8.0") is the localStorage ack key; it moved from
 * "7.5.1" so everyone who closed the v7.5 notes sees these exactly once.
 *
 * Shown ONCE to returning visitors, centered on a blurred backdrop — never
 * full-screen. Always in the ClubHub editorial dark palette (#16130e /
 * #f0ebe0 / teal) so it reads as a "release moment" in both the app and the
 * public site.
 *
 * Closing it:
 *   - marks this release as acknowledged (won't auto-open again)
 *   - files the announcement into the notification bell as a local
 *     "What's new" notification — clicking that row re-opens this modal
 *     (open-whats-new window event), so the notes stay reachable forever.
 * ============================================================================
 */

const EASE = [0.22, 1, 0.36, 1] as const

export function WhatsNewModal() {
  const [open, setOpen] = useState(false)

  // Auto-open: the first time a RETURNING visitor opens the site after this
  // release. Brand-new visitors just get marked (they'll be "returning" the
  // next time something ships).
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(OPEN_WHATS_NEW_EVENT, handler as EventListener)
    // Defer to a microtask — no synchronous setState inside the effect body
    // (React 19 lint rule).
    Promise.resolve().then(() => {
      const returning = checkAndMarkVisited()
      if (returning && shouldShowWhatsNew()) setOpen(true)
    })
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, handler as EventListener)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    ackWhatsNew()
    // File it into the notifications area as a local notification.
    setWhatsNewNotif(true)
  }, [])

  // "Pick your effect" — acknowledge the release AND hand the user straight
  // to Settings → Profile, where the avatar-effect picker lives (same
  // open-settings CustomEvent the bell/other surfaces use; the app shell
  // routes it to the dialog on the requested tab).
  const openEffectsInSettings = useCallback(() => {
    close()
    window.dispatchEvent(
      new CustomEvent("open-settings", { detail: { tab: "profile" } })
    )
  }, [close])

  // Escape closes; body scroll lock while open (same pattern as the
  // onboarding tour).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="fixed inset-0 z-[210] flex items-center justify-center p-4 sm:p-6"
          style={{ background: "rgba(10,9,7,0.45)", backdropFilter: "blur(12px) saturate(130%)" }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`ClubHub v${APP_VERSION} — what's new`}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.42, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[86dvh] flex flex-col overflow-hidden rounded-2xl border border-[#f0ebe0]/12 bg-[#16130e] text-[#f0ebe0] shadow-2xl"
          >
            {/* Ambient teal glow — a quiet release-moment cue. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-40"
              style={{
                background:
                  "radial-gradient(420px 160px at 50% -60px, rgba(11,138,95,0.28), transparent 70%)",
              }}
            />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-3 px-6 sm:px-8 pt-6 sm:pt-7 pb-1 shrink-0">
              <div>
                <p className="text-[0.6875rem] font-bold tracking-[0.22em] uppercase text-club">
                  What&apos;s new
                </p>
                <h2
                  className="mt-1.5 text-2xl sm:text-[1.75rem] font-black tracking-tighter leading-[1.05]"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  v{APP_VERSION} — storage, guides &amp; a glow-up.
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close what's new"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[#f0ebe0]/15 text-[#f0ebe0]/70 hover:text-club hover:border-club/60 hover:bg-club/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Scrollable body ────────────────────────────────────────── */}
            <div className="overflow-y-auto scrollbar-thin px-6 sm:px-8 pb-6 pt-3">
              <p className="text-sm text-[#f0ebe0]/75 leading-relaxed">
                Storage you can see, guides that never get lost, a leaner
                chat, and redesigned avatar effects.
              </p>

              {/* ── v8.0 — storage becomes real ─────────────────────────── */}
              <SectionLabel version="v8.0" label="Storage becomes real" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="📊" title="Your club's storage, visible">
                  A live meter of the club&apos;s 15 MB quota, by category.
                </ReleaseNote>
                <ReleaseNote emoji="⏸️" title="A full pause, not a crash">
                  At 100%, new posts pause club-wide until an exec clears
                  room. Nothing is lost.
                </ReleaseNote>
                <ReleaseNote emoji="🧹" title="Cleanup that doesn't hurt">
                  Ranked, safe-to-clear suggestions — never financial
                  records. Deleting frees space instantly.
                </ReleaseNote>
                <ReleaseNote emoji="📬" title="Need more room?">
                  &ldquo;Increase storage capacity&rdquo; on the Storage page
                  reaches the ClubHub team.
                </ReleaseNote>
              </div>

              {/* ── v8.0 — the guides ───────────────────────────────────── */}
              <SectionLabel version="v8.0" label="Guides that never get lost" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🛡️" title="The executive guide">
                  An eight-stop tour of every admin power, with demos and
                  one-tap jumps.
                </ReleaseNote>
                <ReleaseNote emoji="📍" title="Pause it, resume anytime">
                  Leave mid-tour and it waits in a pill up top — resume on
                  the exact step.
                </ReleaseNote>
              </div>

              {/* ── v8.0 — chat diet ────────────────────────────────────── */}
              <SectionLabel version="v8.0" label="A leaner chat" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="💬" title="More messages on screen">
                  Tighter bubbles and spacing — timestamps and reactions
                  intact.
                </ReleaseNote>
                <ReleaseNote emoji="⌨️" title="Keep typing after Enter">
                  Enter sends without stealing your cursor.
                </ReleaseNote>
                <ReleaseNote emoji="🪶" title="Chat weighs ~60% less">
                  Hidden per-message overhead is gone — old extras cleaned
                  up too.
                </ReleaseNote>
              </div>

              {/* ── v8.0 — avatar effects, redesigned ───────────────────── */}
              <div className="mt-7">
                <SectionLabel version="v8.0" label="Avatar effects, redesigned" />
              </div>
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <div className="py-3.5 first:pt-1 last:pb-1">
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden className="text-sm leading-none">💫</span>
                    <h3 className="text-sm font-bold tracking-tight">
                      All nine effects, rebuilt
                    </h3>
                  </div>
                  <p className="mt-1.5 text-sm text-[#f0ebe0]/65 leading-relaxed">
                    Ring, glow, starlight, comet, petals, glitch, sunset,
                    aurora, halo — bigger and clearer in the picker.
                  </p>
                  <button
                    type="button"
                    onClick={openEffectsInSettings}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-none border border-club/50 bg-club/10 px-3 h-9 text-xs font-bold tracking-wide uppercase text-club hover:bg-club/20 hover:border-club/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Choose your effect
                  </button>
                </div>
              </div>

              {/* ── v8.0 · the rest ──────────────────────────────────── */}
              <SectionLabel version="v8.0" label="And the rest" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🔒" title="Private notes, plainly">
                  A &ldquo;Make private&rdquo; button with a who-can-see
                  chooser.
                </ReleaseNote>
                <ReleaseNote emoji="🌌" title="Backgrounds that show up">
                  Genuinely visible, with live preview tiles in Settings.
                </ReleaseNote>
                <ReleaseNote emoji="📱" title="Mobile, smoothed out">
                  Overflow fixes, keyboard fixes, general polish.
                </ReleaseNote>
              </div>

              <div className="mt-6 rounded-xl border border-club/25 bg-club/[0.07] p-4">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-club">
                  Our goal
                </p>
                <p className="mt-2 text-sm text-[#f0ebe0]/80 leading-relaxed">
                  ClubHub should be more than announcements — a place
                  students find their people and stay organized.
                </p>
              </div>

              <p className="mt-5 text-sm text-[#f0ebe0]/75 leading-relaxed">
                Thank you for using ClubHub.
              </p>
              <p className="mt-2 text-sm text-[#f0ebe0]/75 leading-relaxed">
                Explore what&apos;s new in v{APP_VERSION} and tell us what
                you think.
              </p>
              <p className="mt-4 text-xs text-[#f0ebe0]/45 font-medium">
                — The ClubHub Team | Aaron Shan
              </p>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div
              className="shrink-0 border-t border-[#f0ebe0]/10 bg-[#f0ebe0]/[0.03] px-6 sm:px-8 py-4"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <button
                type="button"
                onClick={close}
                className="w-full h-11 rounded-none bg-club text-club-foreground text-sm font-bold tracking-wide uppercase hover:brightness-110 active:scale-[0.99] transition-[filter,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Let&apos;s go
              </button>
              <p className="mt-2.5 text-center text-xs text-[#f0ebe0]/40">
                Reopen these notes anytime from your notifications.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** One release-note row: emoji + bold title + body copy. */
function ReleaseNote({
  emoji,
  title,
  children,
}: {
  emoji: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="py-3.5 first:pt-1 last:pb-1">
      <div className="flex items-baseline gap-2">
        <span aria-hidden className="text-sm leading-none">{emoji}</span>
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      </div>
      <p className="mt-1.5 text-sm text-[#f0ebe0]/65 leading-relaxed">{children}</p>
    </div>
  )
}

/** Section label for one wave of the release story — e.g. "v8.0 · Storage". */
function SectionLabel({ version, label }: { version: string; label: string }) {
  return (
    <p className="mt-7 text-xs font-bold tracking-[0.18em] uppercase">
      <span className="text-club">{version}</span>
      <span className="text-[#f0ebe0]/45">{" · "}{label}</span>
    </p>
  )
}
