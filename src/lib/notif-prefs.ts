/**
 * Notification preferences schema + helpers.
 *
 * Prefs are stored as a JSON string on `User.notifPrefs` (Prisma SQLite can't
 * store native JSON / arrays of primitives, so we serialize). The shape:
 *
 *   {
 *     email: { <NotifType>: boolean, ... },        // whether to email for that type
 *     emailMode: "instant" | "digest",              // instant = send now; digest = queued
 *     inApp:  { <NotifType>: boolean, ... },        // whether to surface in-app (defaults all true)
 *   }
 *
 * New notif types appear automatically because `normalizePrefs` merges stored
 * prefs over a default object — missing keys fall through to the default.
 */

export type NotifType =
  | "hours_approved"
  | "hours_rejected"
  | "task_assigned"
  | "new_comment"
  | "new_reaction"
  | "meeting_reminder"
  | "new_announcement"
  | "chat_message"

export const ALL_NOTIF_TYPES: NotifType[] = [
  "hours_approved",
  "hours_rejected",
  "task_assigned",
  "new_comment",
  "new_reaction",
  "meeting_reminder",
  "new_announcement",
  "chat_message",
]

export interface NotifPrefs {
  email: Record<NotifType, boolean>
  emailMode: "instant" | "digest"
  inApp: Record<NotifType, boolean>
}

/** Human-friendly labels + descriptions for the UI. */
export const NOTIF_TYPE_META: Record<
  NotifType,
  { label: string; description: string }
> = {
  hours_approved: {
    label: "Hours approved",
    description: "When an executive approves your submitted service hours.",
  },
  hours_rejected: {
    label: "Hours rejected",
    description: "When an executive rejects your submitted service hours.",
  },
  task_assigned: {
    label: "Task assigned",
    description: "When someone assigns a task to you.",
  },
  new_comment: {
    label: "New comment",
    description: "When someone comments on your announcement.",
  },
  new_reaction: {
    label: "New reaction",
    description: "When someone reacts to your announcement. (Low signal.)",
  },
  meeting_reminder: {
    label: "Meeting reminder",
    description: "Reminders before meetings you should attend.",
  },
  new_announcement: {
    label: "New announcement",
    description: "When a new announcement is posted in any of your clubs.",
  },
  chat_message: {
    label: "Chat messages",
    description: "When someone sends you a direct or group chat message.",
  },
}

/**
 * Default prefs. `new_reaction` is OFF for email (low-signal) and
 * `new_announcement` is OFF for email (clubs post often — too noisy).
 * In-app defaults are all ON.
 */
export function getDefaultPrefs(): NotifPrefs {
  const email: Record<NotifType, boolean> = {
    hours_approved: true,
    hours_rejected: true,
    task_assigned: true,
    new_comment: true,
    new_reaction: false,
    meeting_reminder: true,
    new_announcement: false,
    chat_message: false,
  }
  const inApp: Record<NotifType, boolean> = {
    hours_approved: true,
    hours_rejected: true,
    task_assigned: true,
    new_comment: true,
    new_reaction: true,
    meeting_reminder: true,
    new_announcement: true,
    chat_message: true,
  }
  return { email, emailMode: "instant", inApp }
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean"
}

function normalizeFlagMap(
  raw: unknown,
  fallback: Record<NotifType, boolean>,
): Record<NotifType, boolean> {
  const out = { ...fallback }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    for (const t of ALL_NOTIF_TYPES) {
      if (isBoolean(r[t])) out[t] = r[t] as boolean
    }
  }
  return out
}

/**
 * Merge stored prefs over defaults. Tolerates: missing fields, wrong types,
 * completely empty/invalid JSON, legacy keys. Always returns a complete
 * NotifPrefs object so callers can read any key without checking.
 */
export function normalizePrefs(raw: unknown): NotifPrefs {
  const defaults = getDefaultPrefs()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults
  }
  const r = raw as Record<string, unknown>
  return {
    email: normalizeFlagMap(r.email, defaults.email),
    emailMode: r.emailMode === "digest" ? "digest" : "instant",
    inApp: normalizeFlagMap(r.inApp, defaults.inApp),
  }
}

/** Parse the raw notifPrefs JSON string from the DB. Always returns normalized prefs. */
export function parsePrefsString(raw: string | null | undefined): NotifPrefs {
  if (!raw) return getDefaultPrefs()
  try {
    const parsed = JSON.parse(raw)
    return normalizePrefs(parsed)
  } catch {
    return getDefaultPrefs()
  }
}

/** True if the user wants email for the given notif type. */
export function isEmailEnabled(prefs: NotifPrefs, type: NotifType): boolean {
  return Boolean(prefs.email[type])
}

/** True if the user wants in-app for the given notif type. */
export function isInAppEnabled(prefs: NotifPrefs, type: NotifType): boolean {
  return Boolean(prefs.inApp[type])
}

/**
 * Deep merge a partial patch over existing prefs. Only known keys are kept;
 * unknown keys are dropped. Returns a fully-normalized prefs object.
 */
export function mergePrefs(
  current: NotifPrefs,
  patch: unknown,
): NotifPrefs {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return current
  }
  const p = patch as Record<string, unknown>
  const next: NotifPrefs = {
    email: { ...current.email },
    emailMode: p.emailMode === "digest" ? "digest" : p.emailMode === "instant" ? "instant" : current.emailMode,
    inApp: { ...current.inApp },
  }
  if (p.email && typeof p.email === "object") {
    for (const t of ALL_NOTIF_TYPES) {
      if (isBoolean((p.email as Record<string, unknown>)[t])) {
        next.email[t] = (p.email as Record<string, boolean>)[t]
      }
    }
  }
  if (p.inApp && typeof p.inApp === "object") {
    for (const t of ALL_NOTIF_TYPES) {
      if (isBoolean((p.inApp as Record<string, unknown>)[t])) {
        next.inApp[t] = (p.inApp as Record<string, boolean>)[t]
      }
    }
  }
  return next
}
