import type { View } from "@/lib/store"
import type { LucideIcon } from "lucide-react"
import {
  CheckCircle2,
  XCircle,
  ListChecks,
  CalendarDays,
  Megaphone,
  MessageSquare,
  SmilePlus,
  ArrowUpCircle,
  ArrowDownCircle,
  UserPlus,
  Bell,
} from "lucide-react"

/**
 * Notification type metadata — drives the bell dropdown + full NotificationsView.
 *
 * Each type maps to:
 *   - icon:      lucide icon component
 *   - label:     short human label ("Hours approved")
 *   - view:      which View to navigate to when clicked
 *   - tone:      semantic color bucket for the icon tile (Tailwind classes
 *                applied to a small muted circle). Mirrors the StatusBadge
 *                palette used elsewhere so the bell feels consistent.
 *   - getLinkUrl?: optional override that builds a deep-link from the
 *                notification payload. The notification's own `linkUrl`
 *                (when present) always wins — see `targetViewFor` below.
 *
 * The schema comment on `Notification.type` lists: hours_approved |
 * hours_rejected | new_announcement | task_assigned | meeting_reminder |
 * new_comment | new_reaction | promoted | demoted | new_member.
 * `chat_message` is added here in anticipation of the chat module emitting
 * notifications; if the type is unknown we fall back to a generic Bell icon.
 */
export type NotifTone =
  | "approved"
  | "rejected"
  | "task"
  | "meeting"
  | "announcement"
  | "comment"
  | "reaction"
  | "promote"
  | "demote"
  | "member"
  | "chat"
  | "neutral"

export interface NotifMeta {
  icon: LucideIcon
  label: string
  view: View
  tone: NotifTone
  /** Optional builder for a deep-link URL when the type carries context. */
  getLinkUrl?: (n: { linkUrl?: string | null; clubId?: string | null; id: string }) => string
}

const META: Record<string, NotifMeta> = {
  hours_approved: {
    icon: CheckCircle2,
    label: "Hours approved",
    view: "hours",
    tone: "approved",
  },
  hours_rejected: {
    icon: XCircle,
    label: "Hours rejected",
    view: "hours",
    tone: "rejected",
  },
  task_assigned: {
    icon: ListChecks,
    label: "Task assigned",
    view: "tasks",
    tone: "task",
  },
  meeting_reminder: {
    icon: CalendarDays,
    label: "Meeting reminder",
    view: "meetings",
    tone: "meeting",
  },
  new_announcement: {
    icon: Megaphone,
    label: "New announcement",
    view: "announcements",
    tone: "announcement",
  },
  new_comment: {
    icon: MessageSquare,
    label: "New comment",
    view: "announcements",
    tone: "comment",
  },
  new_reaction: {
    icon: SmilePlus,
    label: "New reaction",
    view: "announcements",
    tone: "reaction",
  },
  promoted: {
    icon: ArrowUpCircle,
    label: "Promoted",
    view: "members",
    tone: "promote",
  },
  demoted: {
    icon: ArrowDownCircle,
    label: "Demoted",
    view: "members",
    tone: "demote",
  },
  new_member: {
    icon: UserPlus,
    label: "New member",
    view: "members",
    tone: "member",
  },
  chat_message: {
    icon: MessageSquare,
    label: "Chat message",
    view: "chat",
    tone: "chat",
  },
}

const FALLBACK_META: NotifMeta = {
  icon: Bell,
  label: "Notification",
  view: "dashboard",
  tone: "neutral",
}

/** Lookup with graceful fallback for unknown types. */
export function notifMeta(type: string | null | undefined): NotifMeta {
  if (!type) return FALLBACK_META
  return META[type] ?? FALLBACK_META
}

/**
 * Tailwind class string for the small muted icon circle, colored by tone.
 * Pairs a soft tinted background with a matching strong foreground so the
 * icon is readable in both light and dark mode. Tints map to the same
 * semantic palette used by StatusBadge (emerald=approved, red=rejected,
 * sky=comment, etc.) so the bell feels consistent with the rest of the UI.
 */
export function notifToneClasses(tone: NotifTone): string {
  switch (tone) {
    case "approved":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
    case "task":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
    case "meeting":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
    case "announcement":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
    case "comment":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
    case "reaction":
      return "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300"
    case "promote":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    case "demote":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
    case "member":
      return "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
    case "chat":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
    case "neutral":
    default:
      return "bg-muted text-muted-foreground"
  }
}

/**
 * Resolve the destination for a click. Prefers the notification's own
 * `linkUrl` (which already encodes the target, e.g. `?view=tasks`). Falls
 * back to the type's default `view`. Returns both pieces so the caller can
 * both navigate (setView) and remember a deep-link if needed.
 *
 * Note: in v1 we only navigate to the right View; deep-linking to a
 * specific item is a future enhancement.
 */
export function targetViewFor(n: {
  type?: string | null
  linkUrl?: string | null
}): { view: View; linkUrl?: string } {
  const meta = notifMeta(n.type)
  if (n.linkUrl) {
    // linkUrl may be like "?view=tasks" or "/?view=tasks" — try to extract a View.
    try {
      const url = new URL(n.linkUrl, "http://localhost")
      const v = url.searchParams.get("view") as View | null
      if (v) return { view: v, linkUrl: n.linkUrl }
    } catch {
      // not a URL — fall through to default view
    }
  }
  if (meta.getLinkUrl) {
    return { view: meta.view, linkUrl: meta.getLinkUrl({ linkUrl: n.linkUrl, id: "" }) }
  }
  return { view: meta.view }
}

/** Convenience list of all known types (used by the filter Select). */
export const ALL_NOTIF_TYPE_KEYS = Object.keys(META)
