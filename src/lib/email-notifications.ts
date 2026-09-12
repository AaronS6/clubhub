/**
 * sendEmailNotification — bridges in-app notifications to email.
 *
 * Best-effort: never throws. Called fire-and-forget from `notify()` /
 * `notifyClub()` in `src/lib/activity.ts` after the in-app row + realtime
 * push have already been written, so email failure can never break the
 * triggering API request.
 *
 * Behaviour:
 *   1. Load user (for email + name) + parse their notifPrefs.
 *   2. If `prefs.email[type]` is false → skip silently.
 *   3. If `prefs.emailMode === "digest"` → skip instant send; log that it
 *      would be queued for the daily digest (a separate scheduled concern).
 *   4. Otherwise ("instant") build a type-appropriate subject + body and
 *      call `sendEmail`.
 */

import { db } from "@/lib/db"
import { sendEmail, renderEmailHtml } from "@/lib/email"
import {
  isEmailEnabled,
  parsePrefsString,
  type NotifType,
} from "@/lib/notif-prefs"

/**
 * Set of notification types we know how to email about. Callers can ask
 * `shouldTryEmail(type)` to short-circuit fan-out (e.g. `notifyClub` for a
 * `new_announcement` should skip email entirely without doing N DB lookups).
 *
 * Only `hours_approved` is emailable — that's the only notification where
 * members reliably want an out-of-band signal. All other notification types
 * are in-app only (the dashboard / bell icon).
 */
export const EMAIL_TYPES: Set<NotifType> = new Set<NotifType>(["hours_approved"])

export function shouldTryEmail(type: string): boolean {
  return EMAIL_TYPES.has(type as NotifType)
}

export interface SendEmailNotificationInput {
  userId: string
  type: string
  message: string
  /** Absolute URL or relative path the email's CTA should link to. */
  linkUrl?: string
  /** Club name (used in the footer). */
  clubName?: string
}

/**
 * Best-effort: never throws. Returns void; failures are logged.
 */
export async function sendEmailNotification(
  input: SendEmailNotificationInput,
): Promise<void> {
  try {
    if (!EMAIL_TYPES.has(input.type as NotifType)) return
    const type = input.type as NotifType

    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true, notifPrefs: true },
    })
    if (!user || !user.email) return

    const prefs = parsePrefsString(user.notifPrefs)
    if (!isEmailEnabled(prefs, type)) {
      // User explicitly disabled email for this type.
      return
    }

    if (prefs.emailMode === "digest") {
      // Don't send now — daily digest is a separate scheduled concern.
      // (We log so it's visible that the notification was correctly routed.)
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[email] digest mode — queued for digest:",
          input.type,
          "to",
          user.email,
        )
      }
      return
    }

    const subject = buildSubject(type)
    const { title, bodyLines } = buildBody({
      type,
      message: input.message,
      userName: user.name,
    })

    const ctaUrl = resolveCtaUrl(input.linkUrl)
    const html = renderEmailHtml({
      title,
      preheader: input.message,
      bodyLines,
      ctaText: ctaUrl ? "Open in ClubHub" : undefined,
      ctaUrl: ctaUrl ?? undefined,
      clubName: input.clubName,
    })

    await sendEmail({
      to: user.email,
      subject,
      html,
    })
  } catch (e) {
    // Email is purely progressive enhancement — never break the caller.
    console.error("[email] sendEmailNotification failed:", e)
  }
}

function buildSubject(type: NotifType): string {
  switch (type) {
    case "hours_approved":
      return "Your service hours were approved"
    case "hours_rejected":
      return "Your service hours were rejected"
    case "task_assigned":
      return "A task was assigned to you"
    case "new_comment":
      return "New comment on your announcement"
    case "new_reaction":
      return "Someone reacted to your announcement"
    case "meeting_reminder":
      return "Meeting reminder"
    case "chat_message":
      return "New chat message"
    default:
      return "ClubHub notification"
  }
}

function buildBody({
  type,
  message,
  userName,
}: {
  type: NotifType
  message: string
  userName: string | null
}): { title: string; bodyLines: string[] } {
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "there"
  const intro: string[] = [`Hi ${firstName},`]
  const detail = message.trim() || "You have a new update in ClubHub."

  switch (type) {
    case "hours_approved":
      return {
        title: "Service hours approved",
        bodyLines: [...intro, detail, "Great work — keep it up!"],
      }
    case "hours_rejected":
      return {
        title: "Service hours need attention",
        bodyLines: [
          ...intro,
          detail,
          "If a comment was left by the reviewer, it'll appear alongside the entry. You can edit and resubmit at any time.",
        ],
      }
    case "task_assigned":
      return {
        title: "You have a new task",
        bodyLines: [
          ...intro,
          detail,
          "Open the task to see details, due date, and any subtasks.",
        ],
      }
    case "new_comment":
      return {
        title: "New comment on your announcement",
        bodyLines: [...intro, detail, "Reply directly from the announcement thread."],
      }
    case "new_reaction":
      return {
        title: "Someone reacted to your announcement",
        bodyLines: [...intro, detail],
      }
    case "meeting_reminder":
      return {
        title: "Upcoming meeting reminder",
        bodyLines: [...intro, detail, "See you there!"],
      }
    case "chat_message":
      return {
        title: "New chat message",
        bodyLines: [...intro, detail, "Open the chat to reply."],
      }
    default:
      return {
        title: "ClubHub notification",
        bodyLines: [...intro, detail],
      }
  }
}

function resolveCtaUrl(linkUrl: string | undefined): string | null {
  if (!linkUrl) return null
  // Allow either absolute URLs or relative paths starting with `/`.
  // For absolute URLs, ensure http(s) so we don't leak javascript: URLs.
  if (/^https?:\/\//i.test(linkUrl)) return linkUrl
  if (linkUrl.startsWith("/")) {
    const origin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL
    if (origin) return `${origin.replace(/\/$/, "")}${linkUrl}`
    return linkUrl
  }
  return null
}
