"use client"

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import {
  checkAndMarkVisited,
  shouldShowWhatsNew,
  ackWhatsNew,
  setWhatsNewNotif,
  OPEN_WHATS_NEW_EVENT,
  WHATS_NEW_VERSION,
} from "@/lib/whats-new"

/**
 * ============================================================================
 * WhatsNewModal — the "What's new in v7.5" announcement
 * ============================================================================
 *
 * Shown ONCE to returning visitors (the first time they come back after
 * this release), centered on a blurred backdrop — never full-screen. Always in
 * the ClubHub editorial dark palette (#16130e / #f0ebe0 / teal) so it reads
 * as a "release moment" in both the app and the public site.
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
          aria-label={`ClubHub v${WHATS_NEW_VERSION} — what's new`}
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
                  ClubHub v{WHATS_NEW_VERSION} — your school, your photos.
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
                The public landing page got its biggest visual refresh yet —
                it now runs on real photos taken at North by students, and
                every section got a polish pass.
              </p>

              <p className="mt-5 text-xs font-bold tracking-[0.18em] uppercase text-[#f0ebe0]/45">
                Here&apos;s what&apos;s new in v{WHATS_NEW_VERSION}
              </p>
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="📸" title="Your photos, front and center">
                  The landing page now runs on photos taken at North by
                  students — club fairs, sign-up tables, snack socials, cake
                  decorating — in a new “Club life, actually.” photo wall.
                </ReleaseNote>
                <ReleaseNote emoji="🎨" title="A cleaner, calmer landing">
                  The whole-team photo anchors the hero over the gym&apos;s NORTH
                  wall, the how-it-works steps show real moments, and the
                  auto-scrolling strip became a gallery that lets you actually
                  look.
                </ReleaseNote>
                <ReleaseNote emoji="⌨️" title="Keyboard shortcuts">
                  Carried over from the last release: press <Kbd>g</Kbd> then{" "}
                  <Kbd>c</Kbd> to jump to chat, and <Kbd>?</Kbd> brings up the
                  full cheat sheet.
                </ReleaseNote>
              </div>

              <div className="mt-6 rounded-xl border border-club/25 bg-club/[0.07] p-4">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-club">
                  Our goal
                </p>
                <p className="mt-2 text-sm text-[#f0ebe0]/80 leading-relaxed">
                  We want ClubHub to be more than just a place where executives
                  post announcements or manage tasks. We want it to be a place
                  where students can discover new interests, find communities,
                  get involved, and keep their club activities organized in one
                  place.
                </p>
                <p className="mt-2 text-sm text-[#f0ebe0]/60 leading-relaxed">
                  Every release — big or small — is a step toward that vision,
                  and there&apos;s still plenty more we&apos;d love to build.
                </p>
              </div>

              <p className="mt-5 text-sm text-[#f0ebe0]/75 leading-relaxed">
                A huge thank-you to everyone who&apos;s been using ClubHub so far.
              </p>
              <p className="mt-2 text-sm text-[#f0ebe0]/75 leading-relaxed">
                Go check out ClubHub v{WHATS_NEW_VERSION} and let us know what
                you think! 👀
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
                You can find these notes anytime in your notifications.
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

/** Tiny key cap — inline <kbd> styling for shortcut mentions in note copy. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-[1.25rem] min-w-[1.25rem] translate-y-[-1px] items-center justify-center rounded border border-[#f0ebe0]/20 bg-[#f0ebe0]/[0.08] px-1 font-mono text-[0.7rem] font-semibold text-[#f0ebe0]/85">
      {children}
    </kbd>
  )
}
