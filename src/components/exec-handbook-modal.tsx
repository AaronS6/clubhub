"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, ExternalLink, FileText, ShieldAlert, X } from "lucide-react"
import { Loader2 } from "lucide-react"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"

/**
 * ============================================================================
 * ExecHandbookModal — the Executive Admin Handbook, in two modes.
 * ============================================================================
 *
 * 1) ACKNOWLEDGE (default) — shown EXACTLY ONCE PER CLUB LIFETIME: app-shell
 * mounts this for the first club where the viewer is an ACTIVE EXECUTIVE and
 * `club.handbookAcceptedAt` is still null (typically the club they just
 * created). Confirming POSTs /api/clubs/[clubId]/handbook-ack, which stamps
 * the flag in the DB — the popup can then never render again for that club,
 * even on another device or after a reinstall (the DB is the source of truth,
 * not localStorage).
 *
 * The dialog is intentionally NON-DISMISSIBLE until confirmed: no X button,
 * no scrim-click close, no Escape. It requires BOTH checkboxes:
 *   1. "Confirm and continue"
 *   2. "I have read the terms and conditions"
 * …before the "I confirm" button enables. This guarantees the handbook was
 * acknowledged exactly once (a dismissible popup could be skipped and then
 * never shown again — the opposite of what the exec needs).
 *
 * 2) REVIEW — a dismissible re-read opened from Settings → Security (execs
 * of the active club only, via the `open-exec-handbook` window event). Same
 * content and handbook link, but with an X button, scrim-click and Escape
 * dismissal and a plain "Close" footer — nothing to re-confirm. This is the
 * "I want to see that guide again" path for executives.
 *
 * Theme-aware (bg-card / text-foreground / ring-border) so it matches the
 * app shell light/dark theme like every other in-app modal.
 */

/** The Google Docs handbook link shown in the modal. */
export const HANDBOOK_URL =
  "https://docs.google.com/document/d/1yg5GPTyxDZLPX4hWYbY48bdEvXqKN0UM/edit?usp=sharing&ouid=109241968655027522695&rtpof=true&sd=true"

interface ExecHandbookModalProps {
  /** The club the handbook is being acknowledged for. */
  club: { clubId: string; clubName: string } | null
  /** "acknowledge" — the once-per-club, non-dismissible confirmation flow.
   *  "review" — dismissible re-read for executives (opened from Settings). */
  mode?: "acknowledge" | "review"
  /** Called with the club's id after the DB stamp succeeds — app-shell marks
   *  it confirmed for the session and refreshes memberships. */
  onConfirmed?: (clubId: string) => void
  /** Review mode only — any dismissal path (X, scrim, Escape, Close). */
  onClose?: () => void
}

export function ExecHandbookModal({
  club,
  mode = "acknowledge",
  onConfirmed,
  onClose,
}: ExecHandbookModalProps) {
  const review = mode === "review"
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Track the club this instance confirmed so the exit animation doesn't
  // flash empty content while the parent swaps/removes the modal.
  const shownClubRef = useRef<string | null>(null)
  if (club) shownClubRef.current = club.clubId
  const shownClubName = useRef<string>("")
  if (club) shownClubName.current = club.clubName

  // Reset the checkboxes whenever a NEW club's handbook is presented.
  useEffect(() => {
    if (club) {
      setConfirmChecked(false)
      setTermsChecked(false)
      setSaveError(null)
    }
  }, [club?.clubId])

  const open = !!club
  const canConfirm = confirmChecked && termsChecked && !saving

  async function handleConfirm() {
    if (!club || !canConfirm || !onConfirmed) return
    setSaving(true)
    setSaveError(null)
    try {
      await api(`/api/clubs/${club.clubId}/handbook-ack`, { method: "POST" })
      onConfirmed(club.clubId)
    } catch (err: any) {
      setSaveError(err?.message ?? "Couldn't save your confirmation — try again.")
    } finally {
      setSaving(false)
    }
  }

  // Keyboard: in ACKNOWLEDGE mode Escape is intentionally IGNORED
  // (non-dismissible) and Enter confirms once both checkboxes are ticked.
  // In REVIEW mode Escape closes. The listener runs in the CAPTURE phase on
  // document so stopPropagation() blocks the Escape before it can reach any
  // Radix dialog underneath (the settings dialog this was opened from).
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && review && onClose) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      } else if (e.key === "Enter" && !review && canConfirm) {
        e.preventDefault()
        void handleConfirm()
      }
    },
    [review, canConfirm, club?.clubId, onClose, onConfirmed],
  )
  useEffect(() => {
    if (!open) return
    document.addEventListener("keydown", handleKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKey, true)
      document.body.style.overflow = prev
    }
  }, [open, handleKey])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center p-3 sm:items-center sm:p-6">
          {/* Scrim — click-through disabled in ACKNOWLEDGE mode (the modal
              must be confirmed); in REVIEW mode clicking it closes. */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={review ? onClose : undefined}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="handbook-title"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-card text-foreground shadow-2xl ring-1 ring-border"
          >
            {/* Header */}
            <div className="flex items-start gap-3.5 border-b border-border px-5 py-4 sm:px-6">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="handbook-title" className="text-base font-semibold leading-tight sm:text-lg">
                  ClubHub Executive Admin Handbook
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {review ? (
                    <>For <span className="font-semibold text-foreground">{shownClubName.current}</span> executives.</>
                  ) : (
                    <>Required once for <span className="font-semibold text-foreground">{shownClubName.current}</span>.</>
                  )}
                </p>
              </div>
              {/* Review mode only — dismissible via X (acknowledge mode has
                  none: it must be confirmed). Big touch target, quiet style. */}
              {review && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close handbook"
                  className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4.5 w-4.5" aria-hidden />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="max-h-[52dvh] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
              <p className="text-sm leading-relaxed text-foreground/90">
                As a ClubHub executive, you&apos;re responsible for managing your
                club&apos;s workspace, supporting members, and keeping records
                accurate. Before using the admin features, please take a few
                minutes to read our Executive Admin Handbook.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The guide covers your responsibilities, member management,
                service-hour reviews, record keeping, and important policies
                every executive should understand.
              </p>

              {/* The important warning callout */}
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
                <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <p className="text-[13px] leading-relaxed text-foreground/90">
                  <span className="font-bold">Important:</span> ClubHub does{" "}
                  <span className="font-bold">NOT</span> submit service hours to
                  your school. Members must export their records and submit them
                  through their school&apos;s own process. School requirements and
                  eligibility rules still apply.
                </p>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-foreground/90">
                {review
                  ? "A quick reference while you run your club — jump back here anytime from Settings → Security."
                  : "Please read the handbook before continuing."}
              </p>

              {/* Handbook link */}
              <a
                href={HANDBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3 ring-1 ring-border transition-colors hover:bg-club-subtle hover:ring-club/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-club-subtle text-club">
                    <FileText className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">
                      Read the ClubHub Executive Admin Handbook
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      docs.google.com · opens in a new tab
                    </span>
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>

              {/* Checkboxes — acknowledge mode only (review mode is a re-read,
                  nothing left to confirm). */}
              {!review && (
                <div className="mt-5 space-y-3">
                  <HandbookCheck
                    id="handbook-confirm"
                    checked={confirmChecked}
                    onChange={setConfirmChecked}
                    label="Confirm and continue"
                  />
                  <HandbookCheck
                    id="handbook-terms"
                    checked={termsChecked}
                    onChange={setTermsChecked}
                    label="I have read the terms and conditions"
                  />
                </div>
              )}

              {saveError && (
                <p className="mt-3 text-[13px] font-medium text-destructive">{saveError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3.5 sm:px-6">
              <p className="hidden text-xs text-muted-foreground sm:block">
                {review
                  ? "Re-readable anytime — Settings → Security."
                  : "Shown once per club — you won't see this again."}
              </p>
              {review ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 select-none items-center justify-center gap-2 rounded-full bg-club px-6 text-[15px] font-semibold text-white shadow-lg shadow-club/30 transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  Close
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={cn(
                    "inline-flex h-11 select-none items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-all active:scale-[0.98]",
                    canConfirm
                      ? "bg-club text-white shadow-lg shadow-club/30 hover:brightness-110"
                      : "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Confirming…
                    </>
                  ) : (
                    <>
                      {confirmChecked && termsChecked && <Check className="h-4 w-4" aria-hidden />}
                      I confirm
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** One row of the two required checkboxes — big touch targets, accent when on. */
function HandbookCheck({
  id,
  checked,
  onChange,
  label,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        checked
          ? "border-club/50 bg-club-subtle"
          : "border-border bg-background hover:bg-accent/60",
      )}
    >
      <span className="relative grid h-5.5 w-5.5 place-items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-border bg-background transition-colors checked:border-club checked:bg-club focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <Check
          aria-hidden
          className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
          strokeWidth={3.5}
        />
      </span>
      <span className={cn("text-sm font-medium", checked ? "text-foreground" : "text-foreground/80")}>
        {label}
      </span>
    </label>
  )
}
