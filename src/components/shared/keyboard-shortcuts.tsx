"use client"

import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { useAppStore, type View } from "@/lib/store"
import { toast } from "sonner"
import { useSearchShortcutHint } from "@/hooks/use-platform"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * ============================================================================
 * KeyboardShortcuts — app-wide g-chord navigation + cheat sheet (§ v7.2)
 * ============================================================================
 *
 * Gmail-style "g chords": press `g`, then within 800ms press a second key to
 * jump to a view:
 *
 *   g d → Dashboard        g t → Tasks          g c → Chat
 *   g m → Meetings         g a → Announcements  g n → Notes
 *   g h → Service Hours
 *
 * `?` (Shift+/) opens a cheat-sheet Dialog listing every shortcut; `Esc`
 * closes it (Radix handles that natively). The cheat sheet is also reachable
 * from the account menu ("Keyboard shortcuts") via the
 * `open-keyboard-shortcuts` window event — same custom-event pattern the
 * settings dialog and onboarding tour use.
 *
 * Guards:
 *  - Modifier keys (ctrl/meta/alt) held → ignore (don't fight browser/OS
 *    shortcuts like Cmd+G or Alt+D).
 *  - Focus in an input / textarea / select / contenteditable → ignore, so
 *    typing "g" in the chat composer never navigates.
 *  - Any Radix portal open (dialog / sheet / dropdown / popover — detected
 *    via `[data-state="open"]` or `role="dialog"` in the DOM) → ignore; the
 *    only key that still works is `Esc`, which those overlays handle
 *    themselves.
 *
 * All bookkeeping (the pending-g timer) lives in refs — no React state is
 * touched by the key listener except opening the (stable) cheat sheet.
 */

/** Window event that opens the cheat sheet (account menu dispatches it). */
export const OPEN_KEYBOARD_SHORTCUTS_EVENT = "open-keyboard-shortcuts"

/** How long the second key of a g-chord may arrive after the first `g`. */
const G_CHORD_WINDOW_MS = 800

/** The g-chord map — second key → destination. */
const G_CHORDS: Record<string, { view: View; label: string }> = {
  d: { view: "dashboard", label: "Dashboard" },
  t: { view: "tasks", label: "Tasks" },
  c: { view: "chat", label: "Chat" },
  m: { view: "meetings", label: "Meetings" },
  a: { view: "announcements", label: "Announcements" },
  n: { view: "notes", label: "Notes" },
  h: { view: "hours", label: "Service hours" },
}

/** Cheat-sheet rows, shared by the dialog so it can never drift from reality. */
const G_CHORD_ROWS: { keys: [string, string]; description: string }[] = [
  { keys: ["g", "d"], description: "Dashboard" },
  { keys: ["g", "t"], description: "Tasks" },
  { keys: ["g", "c"], description: "Chat" },
  { keys: ["g", "m"], description: "Meetings" },
  { keys: ["g", "a"], description: "Announcements" },
  { keys: ["g", "n"], description: "Notes" },
  { keys: ["g", "h"], description: "Service hours" },
]

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
}

/** Is any Radix overlay currently open (dialog, sheet, dropdown, popover)? */
function anyOverlayOpen(): boolean {
  return (
    !!document.querySelector('[data-state="open"]') ||
    !!document.querySelector('[role="dialog"]')
  )
}

/** One key cap — the app's <kbd> language (matches the platform-aware
 *  ⌘K / Ctrl K hint in the top bar). */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] justify-center items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground shadow-sm">
      {children}
    </kbd>
  )
}

export function KeyboardShortcuts() {
  const [sheetOpen, setSheetOpen] = useState(false)
  /** Platform-correct modifier for the search row: ⌘ on Mac/iPad, Ctrl on
   *  Windows/Linux; touch phones have no modifier keys, so they get a
   *  tap-the-icon row instead of a fake key combo. */
  const searchHint = useSearchShortcutHint()
  /** Timer for the pending first `g` of a chord (timeout id), null = idle. */
  const pendingGRef = useRef<number | null>(null)

  // ── The global key listener ─────────────────────────────────────────────
  useEffect(() => {
    function clearPendingG() {
      if (pendingGRef.current != null) {
        window.clearTimeout(pendingGRef.current)
        pendingGRef.current = null
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Never fight browser/OS shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // Key-repeat (holding a key) shouldn't re-arm the chord.
      if (e.repeat) return
      // Typing contexts own the keyboard.
      if (isTypingTarget(e.target)) return
      // Any open overlay (dialog/sheet/menu/popover) owns the keyboard — its
      // own Esc handling still applies; we simply stay out of the way.
      if (anyOverlayOpen()) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      // `?` opens the cheat sheet.
      if (e.key === "?") {
        clearPendingG()
        setSheetOpen(true)
        return
      }

      // First `g` of a chord — start the window (re-arms if already pending).
      if (key === "g" && pendingGRef.current == null) {
        pendingGRef.current = window.setTimeout(() => {
          pendingGRef.current = null
        }, G_CHORD_WINDOW_MS)
        return
      }

      // Second key of a chord (or an unrelated key that cancels it).
      if (pendingGRef.current != null) {
        clearPendingG()
        const chord = G_CHORDS[key]
        if (chord) {
          e.preventDefault()
          useAppStore.getState().setView(chord.view)
          // Subtle confirmation of the jump — reuses the app's toast infra.
          toast(chord.label, { description: "Keyboard shortcut" })
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      clearPendingG()
    }
  }, [])

  // ── Account-menu entry point (custom event, same pattern as settings) ───
  useEffect(() => {
    const handler = () => setSheetOpen(true)
    window.addEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, handler)
    return () => window.removeEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, handler)
  }, [])

  return (
    <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>g</Kbd>, then a key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* g-chords — two-column key / description layout */}
          <div>
            <p className="text-caption-medium uppercase tracking-wide mb-2">Jump to</p>
            <ul className="grid grid-cols-1 gap-1">
              {G_CHORD_ROWS.map(({ keys, description }) => (
                <li key={description} className="flex items-center justify-between gap-4 py-0.5">
                  <span className="flex items-center gap-1" aria-label={`${keys.join(" ")} — ${description}`}>
                    <Kbd>{keys[0]}</Kbd>
                    <span aria-hidden className="text-muted-foreground text-xs">then</span>
                    <Kbd>{keys[1]}</Kbd>
                  </span>
                  <span className="text-body text-muted-foreground text-right">{description}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* General */}
          <div>
            <p className="text-caption-medium uppercase tracking-wide mb-2">General</p>
            <ul className="grid grid-cols-1 gap-1">
              <li className="flex items-center justify-between gap-4 py-0.5">
                <Kbd>?</Kbd>
                <span className="text-body text-muted-foreground text-right">Open this cheat sheet</span>
              </li>
              {searchHint.kind === "touch" ? (
                <li className="flex items-center justify-between gap-4 py-0.5">
                  <span
                    className="flex items-center gap-1"
                    aria-label="Search — tap the search icon"
                  >
                    <Kbd>
                      <Search className="h-3 w-3" aria-hidden />
                    </Kbd>
                  </span>
                  <span className="text-body text-muted-foreground text-right">
                    Tap the search icon
                  </span>
                </li>
              ) : (
                <>
                  <li className="flex items-center justify-between gap-4 py-0.5">
                    <span className="flex items-center gap-1" aria-label={searchHint.ariaLabel}>
                      <Kbd>{searchHint.isApple ? "⌘" : "Ctrl"}</Kbd>
                      <Kbd>K</Kbd>
                    </span>
                    <span className="text-body text-muted-foreground text-right">Search this club</span>
                  </li>
                  <li className="flex items-center justify-between gap-4 py-0.5">
                    <Kbd>/</Kbd>
                    <span className="text-body text-muted-foreground text-right">Open search</span>
                  </li>
                </>
              )}
              <li className="flex items-center justify-between gap-4 py-0.5">
                <Kbd>Esc</Kbd>
                <span className="text-body text-muted-foreground text-right">Close dialogs and menus</span>
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
