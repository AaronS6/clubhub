/**
 * Announcement customization — shared between the API (validation of the
 * accent key) and the feed/composer (visual classes + tag presets).
 *
 * ACCENT KEYS are stable strings stored on the Announcement row. Adding a
 * color = add one entry here (API validation picks up new keys automatically).
 */

// Keys allowed in the DB / API. `null` (or missing) = no accent (default).
export const ANNOUNCEMENT_ACCENT_KEYS = [
  "emerald",
  "amber",
  "rose",
  "violet",
  "teal",
  "gray",
] as const

export type AnnouncementAccent = (typeof ANNOUNCEMENT_ACCENT_KEYS)[number]

export const MAX_ANNOUNCEMENT_TAG_LENGTH = 24

/** Preset tag chips offered in the composer (free text also allowed). */
export const ANNOUNCEMENT_TAG_PRESETS = [
  "Event",
  "Meeting",
  "Reminder",
  "Fundraiser",
  "Update",
  "Social",
  "Tryouts",
] as const

/**
 * Visual map — Tailwind classes per accent. Static strings so the Tailwind
 * scanner picks them up.
 */
export const ANNOUNCEMENT_ACCENTS: Record<
  AnnouncementAccent,
  {
    label: string
    /** composer swatch dot */
    swatch: string
    /** 2px card left strip */
    strip: string
    /** tag pill bg + text */
    pill: string
    /** active composer chip ring */
    active: string
  }
> = {
  emerald: {
    label: "Green",
    swatch: "bg-emerald-500",
    strip: "border-l-emerald-500",
    pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    active: "ring-emerald-500/60",
  },
  amber: {
    label: "Amber",
    swatch: "bg-amber-500",
    strip: "border-l-amber-500",
    pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    active: "ring-amber-500/60",
  },
  rose: {
    label: "Red",
    swatch: "bg-rose-500",
    strip: "border-l-rose-500",
    pill: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    active: "ring-rose-500/60",
  },
  violet: {
    label: "Purple",
    swatch: "bg-violet-500",
    strip: "border-l-violet-500",
    pill: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    active: "ring-violet-500/60",
  },
  teal: {
    label: "Teal",
    swatch: "bg-teal-500",
    strip: "border-l-teal-500",
    pill: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    active: "ring-teal-500/60",
  },
  gray: {
    label: "Gray",
    swatch: "bg-zinc-500",
    strip: "border-l-zinc-500",
    pill: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
    active: "ring-zinc-500/60",
  },
}

export function isAccentKey(v: unknown): v is AnnouncementAccent {
  return (
    typeof v === "string" &&
    (ANNOUNCEMENT_ACCENT_KEYS as readonly string[]).includes(v)
  )
}
