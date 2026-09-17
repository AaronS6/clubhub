/**
 * Shared DialogContent className that makes a Dialog full-screen on mobile
 * (slides up to fill the viewport, no rounding, no padding, flex column) and
 * a centered modal on sm+ screens (centered, rounded, padded, max-w-xl).
 *
 * Both mobile AND desktop use a constrained height (100dvh mobile, 85vh
 * desktop) with a flex-column layout: sticky header, scrollable body
 * (min-h-0), and a floating action button. This keeps the action button
 * reachable even when the body content is taller than the viewport.
 *
 * Pair with a flex-col layout inside: a shrink-0 header, a flex-1 min-h-0
 * overflow-y-auto body, and a floating/absolute action button.
 */
export const DIALOG_CLASS =
  "top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
  "sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-[85dvh] sm:max-w-xl sm:rounded-lg sm:p-6 sm:gap-4"
