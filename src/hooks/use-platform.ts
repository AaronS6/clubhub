import * as React from "react"

/**
 * ============================================================================
 * Platform detection for keyboard-shortcut labels (§ v8.0)
 * ============================================================================
 *
 * The global search shortcut accepts EITHER modifier (global-search.tsx
 * listens for `metaKey || ctrlKey`), so the key combo always works — only
 * the *label* we show changes per platform:
 *
 *   Apple (macOS / iPad) → "⌘K"
 *   PC (Windows / Linux / Chromebook / Android tablet) → "Ctrl K"
 *   Touch phones (iPhone / Android phone) → no key combo at all; callers
 *   render a touch-appropriate affordance ("Search anything", the search
 *   icon, …) instead of a fake key combination.
 *
 * Detection notes:
 *  - iPadOS 13+ reports `navigator.platform === "MacIntel"`, so a Mac
 *    platform string paired with touch points is treated as iPad — still
 *    Apple, since hardware keyboards are common there and ⌘K works.
 *  - `navigator.platform` is deprecated but universally supported; the
 *    Chromium `navigator.userAgentData.platform` is preferred when present.
 *  - Everything is read ONCE at first client render (a platform can't
 *    change without a reload). None of the consuming UI renders in SSR
 *    HTML — the header search trigger, the onboarding modal, and the
 *    shortcuts cheat sheet are all client-only — so there is no hydration
 *    mismatch to worry about.
 */

/** Platform family that drives which shortcut label is correct. */
export type PlatformKind = "apple" | "pc" | "touch"

export interface SearchShortcutHint {
  /** Platform family for the current device. */
  kind: PlatformKind
  /** Compact pill label: "⌘K" on Apple, "Ctrl K" on PC, null on touch. */
  label: string | null
  /** True when the ⌘ (Command) glyph is the right modifier to show. */
  isApple: boolean
  /** Screen-reader phrasing for the full combo ("Command K" / "Control K"). */
  ariaLabel: string
}

/** Pure detection — safe to call anywhere on the client. */
export function detectPlatformKind(): PlatformKind {
  if (typeof navigator === "undefined") return "apple" // SSR default; consumers never render server-side

  const ua = (navigator.userAgent ?? "").toLowerCase()
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = String(nav.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase()
  const touchPoints =
    typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0

  // Phones: no modifier keys without a hardware keyboard — touch UI.
  const isIPhone = ua.includes("iphone")
  const isAndroidPhone = ua.includes("android") && ua.includes("mobile")
  if (isIPhone || isAndroidPhone) return "touch"

  // iPad hides as a Mac (MacIntel + touch points) or says "ipad" directly.
  const isIPad = ua.includes("ipad") || (platform.includes("mac") && touchPoints > 1)
  if (platform.includes("mac") || isIPad) return "apple"

  // Windows, Linux, Chromebooks, Android tablets — Ctrl is the modifier.
  return "pc"
}

/** Resolve the search-shortcut label for the current platform. */
export function getSearchShortcutHint(): SearchShortcutHint {
  const kind = detectPlatformKind()
  if (kind === "apple") {
    return { kind, label: "⌘K", isApple: true, ariaLabel: "Command K — search this club" }
  }
  if (kind === "pc") {
    return { kind, label: "Ctrl K", isApple: false, ariaLabel: "Control K — search this club" }
  }
  return { kind, label: null, isApple: false, ariaLabel: "Search this club" }
}

/**
 * Hook version — resolves once at first client render. Use this in any
 * component that needs to show (or branch on) the search shortcut.
 */
export function useSearchShortcutHint(): SearchShortcutHint {
  const [hint] = React.useState<SearchShortcutHint>(getSearchShortcutHint)
  return hint
}
