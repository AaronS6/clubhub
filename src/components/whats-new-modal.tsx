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
} from "@/lib/whats-new"
import { APP_VERSION } from "@/lib/version"

/**
 * What's New for v9.0.2, followed by the v9.0.1 and v9.0 release history.
 * APP_VERSION is the displayed version; WHATS_NEW_VERSION controls the
 * once-per-release acknowledgement. Closing files the notes in notifications.
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
                  v{APP_VERSION} — steadier photo updates.
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
                A small fix to make changing your profile photo feel steadier.
              </p>

              <SectionLabel version="v9.0.2" label="Profile photo fix" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🖼️" title="Steadier photo repositioning">
                  Removed the resize animation that could cause flashing when
                  opening the photo cropper. Your photo loads into a stable
                  frame before you start repositioning it.
                </ReleaseNote>
                <ReleaseNote emoji="✅" title="Ready before you save">
                  Confirm becomes available once the photo and crop are ready.
                  Choosing a different photo clears the previous crop, and an
                  unreadable image now shows a message instead of loading forever.
                </ReleaseNote>
              </div>

              <SectionLabel version="v9.0.1" label="A smoother way to move" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🫧" title="A smaller glass bar">
                  A compact, floating navigation bar with icons only,
                  soft reflections and a subtle accent marker. Designed to
                  look clear in both light and dark mode.
                </ReleaseNote>
                <ReleaseNote emoji="👆" title="Slide to switch">
                  On a touchscreen, slide your finger across Home, Calendar,
                  Tasks, Messages and More. The glass selection follows your
                  finger — lift it to open the selected page or menu.
                  Tapping still works too.
                </ReleaseNote>
                <ReleaseNote emoji="✨" title="Smoother motion, quieter details">
                  The selection settles gently into place, with softer press
                  feedback and cleaner transitions between icons. Reduced
                  motion preferences are respected.
                </ReleaseNote>
                <ReleaseNote emoji="📱" title="Compact without the cramped taps">
                  Comfortable touch targets and space above your device&rsquo;s
                  home indicator keep the bar easy to use. Screen readers
                  still announce every button, and PC navigation works as before.
                </ReleaseNote>
              </div>

              {/* –– v9.0 — My Hub –––––––––––––––––––––––––––– */}
              <SectionLabel version="v9.0" label="My Hub — your clubs, one home" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🏡" title="Your default view">
                  My Hub opens first: what&rsquo;s happening across your clubs,
                  what you need to do, and what deserves attention — all on
                  one page.
                </ReleaseNote>
                <ReleaseNote emoji="📅" title="Your week, every club">
                  Meetings and events from all your clubs in one agenda,
                  badged with each club&rsquo;s colors. Click anything to jump
                  straight to it.
                </ReleaseNote>
                <ReleaseNote emoji="✅" title="My Tasks, everywhere">
                  Every task assigned to you across your clubs, with due
                  dates, progress, and one-tap completion.
                </ReleaseNote>
                <ReleaseNote emoji="📣" title="Updates in one feed">
                  Announcements from every club, newest first — each clearly
                  labeled with the club that posted it.
                </ReleaseNote>
                <ReleaseNote emoji="💬" title="A combined inbox">
                  Club channels, group chats and DMs from all your clubs,
                  with unread counts — open any conversation in its club.
                </ReleaseNote>
              </div>

              {/* –– v9.0 — one navigation ––––––––––––––––––––––––––– */}
              <SectionLabel version="v9.0" label="One navigation system" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🧭" title="Five destinations, always in place">
                  Home, Calendar, My Tasks, Updates and Messages sit in
                  exactly the same spot — in My Hub and inside every club.
                </ReleaseNote>
                <ReleaseNote emoji="🔀" title="Switch contexts instantly">
                  The context switcher up top (and the My Clubs list) moves
                  between My Hub and any club in one click.
                </ReleaseNote>
                <ReleaseNote emoji="⬅️" title="Real back and forward">
                  Your navigation is real browser history now — back, forward
                  and refresh all keep exactly where you were.
                </ReleaseNote>
                <ReleaseNote emoji="🔍" title="Search across your clubs">
                  In My Hub, the search bar finds your tasks, updates,
                  meetings and messages across every club at once.
                </ReleaseNote>
                <ReleaseNote emoji="📱" title="Mobile, reimagined">
                  A context pill up top and Home / Calendar / Tasks /
                  Messages in the bottom bar — club switching stays one tap
                  away.
                </ReleaseNote>
              </div>

              {/* –– v9.0 — unchanged where it matters –––––––––––––––––––– */}
              <SectionLabel version="v9.0" label="Everything you know, still here" />
              <div className="mt-3 divide-y divide-[#f0ebe0]/8">
                <ReleaseNote emoji="🛠️" title="Club workspaces, untouched">
                  Every existing feature — members, teams, hours, approvals,
                  finances, storage — lives where it always did, inside each
                  club.
                </ReleaseNote>
                <ReleaseNote emoji="🔗" title="Deep links to the original">
                  Nothing is duplicated: every My Hub item opens the real
                  thing inside its club, right where it lives.
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
                Explore what&rsquo;s new in v{APP_VERSION} and tell us what
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

/** Section label for one wave of the release story — e.g. "v9.0 · My Hub". */
function SectionLabel({ version, label }: { version: string; label: string }) {
  return (
    <p className="mt-7 text-xs font-bold tracking-[0.18em] uppercase">
      <span className="text-club">{version}</span>
      <span className="text-[#f0ebe0]/45">{" · "}{label}</span>
    </p>
  )
}
