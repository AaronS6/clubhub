"use client"

import { useCallback, useEffect, useState } from "react"
import type { NotifItem } from "@/components/views/notifications-view"

/**
 * ============================================================================
 * What's New (release notes) — v8.0 · “storage, guides & a glow-up”
 * ============================================================================
 *
 * A one-time, client-side announcement system:
 *
 *   1. A RETURNING visitor (anyone who has opened ClubHub before — flag in
 *      localStorage) sees the "What's new in v8.0" modal once, centered
 *      with a blurred backdrop.
 *   2. When they close it, a persistent local notification ("What's new in
 *      v8.0") appears in the notification bell + Notifications view.
 *   3. Clicking that notification re-opens the modal — anytime, forever.
 *
 * Everything lives in localStorage — no DB rows, no API calls, no cost on
 * the free tier. The notification row is synthesized client-side with type
 *      "release_notes" (see notif-meta.ts) and never stored server-side.
 *
 * Version bump: when the next release ships, bump WHATS_NEW_VERSION here
 *      (and APP_VERSION) and the whole cycle repeats automatically for
 *      returning visitors — anyone holding an older ack key sees the new
 *      notes exactly once.
 *
 * NOTE: WHATS_NEW_VERSION is the ACK KEY, not the display version. It moved
 *      to "8.0" so everyone who closed the v7.5 notes sees the v8.0 notes
 *      exactly once. Everything USER-FACING displays APP_VERSION ("8.0")
 *      from lib/version — never this key.
 * ============================================================================
 */

/** The release this announcement covers — the localStorage ack-key version.
 * "8.0" ≠ a display version you'll see anywhere else; see the note above. */
export const WHATS_NEW_VERSION = "8.0"

const VISITED_KEY = "clubhub-visited"
/** Marks the CURRENT browsing session so reloads (login/signup do a full
 *  reload) don't count as "coming back" — only a genuinely new session does. */
const SESSION_KEY = "clubhub-whats-new-session"
const ACK_KEY = "clubhub-whats-new-ack"
const NOTIF_KEY = "clubhub-whats-new-notif"

/** Fired when the local notification flag changes (bell re-renders). */
export const WHATS_NEW_NOTIF_CHANGED = "whats-new-notif-changed"
/** Fired to programmatically open the modal (bell row click). */
export const OPEN_WHATS_NEW_EVENT = "open-whats-new"

// ── localStorage helpers (all fail silently in private mode) ────────────────

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function removeLS(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Has this browser opened ClubHub in a PREVIOUS browsing session? Marks the
 * visit either way. A "browsing session" is scoped via sessionStorage, so
 * reloads (the app reloads after login/signup) don't count as coming back —
 * only genuinely returning (new session, old visitor) does.
 */
export function checkAndMarkVisited(): boolean {
  try {
    const visitedBefore = localStorage.getItem(VISITED_KEY) === "1"
    const sameSession = sessionStorage.getItem(SESSION_KEY) === "1"
    localStorage.setItem(VISITED_KEY, "1")
    sessionStorage.setItem(SESSION_KEY, "1")
    return visitedBefore && !sameSession
  } catch {
    return false
  }
}

/** Should the modal auto-open for this visitor? (Returning + not acked.) */
export function shouldShowWhatsNew(): boolean {
  return readLS(ACK_KEY) !== WHATS_NEW_VERSION
}

/** The visitor has seen (and closed) this release's announcement. */
export function ackWhatsNew() {
  writeLS(ACK_KEY, WHATS_NEW_VERSION)
}

/** Show the local "What's new" notification in the bell? */
export function hasWhatsNewNotif(): boolean {
  return readLS(NOTIF_KEY) === "1"
}

/** Turn the local notification on (modal closed) or off (cleared). */
export function setWhatsNewNotif(on: boolean) {
  if (on) writeLS(NOTIF_KEY, "1")
  else removeLS(NOTIF_KEY)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WHATS_NEW_NOTIF_CHANGED))
  }
}

// ── Synthetic notification item (shared shape with server rows) ────────────

export const RELEASE_NOTES_NOTIF_ID = "local-release-notes-v8-0"

export function buildReleaseNotesNotif(): NotifItem {
  return {
    id: RELEASE_NOTES_NOTIF_ID,
    type: "release_notes",
    message: "ClubHub v8.0 — storage, guides & a glow-up. Tap to see what's new",
    linkUrl: null,
    isRead: true,
    createdAt: new Date().toISOString(),
    clubId: null,
  }
}

// ── React hook — reactive access for the bell + notifications view ──────────

/**
 * Returns the local release-notes notification row when it should be shown,
 * plus a dismiss function. Re-renders when the flag changes (the modal
 * dispatches WHATS_NEW_NOTIF_CHANGED on close).
 */
export function useWhatsNewNotif(): {
  notif: NotifItem | null
  dismiss: () => void
} {
  const [on, setOn] = useState(false)

  useEffect(() => {
    const sync = () => setOn(hasWhatsNewNotif())
    // Defer the initial read to a microtask so we never call setState
    // synchronously inside the effect body (React 19 lint rule).
    Promise.resolve().then(sync)
    window.addEventListener(WHATS_NEW_NOTIF_CHANGED, sync as EventListener)
    return () => window.removeEventListener(WHATS_NEW_NOTIF_CHANGED, sync as EventListener)
  }, [])

  const dismiss = useCallback(() => {
    setWhatsNewNotif(false)
    setOn(false)
  }, [])

  return {
    notif: on ? buildReleaseNotesNotif() : null,
    dismiss,
  }
}

/** Open the What's New modal from anywhere (bell row, notifications view). */
export function openWhatsNew() {
  window.dispatchEvent(new CustomEvent(OPEN_WHATS_NEW_EVENT))
}
