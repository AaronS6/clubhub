/**
 * Shared DialogContent className that makes a Dialog full-screen on mobile
 * (slides up to fill the viewport, no rounding, no padding, flex column) and
 * a normal centered modal on sm+ screens (centered, rounded, padded, max-w-xl).
 *
 * Pair with a flex-col layout inside: a sticky header, scrollable body, and
 * shrink-0 footer so the action buttons stay reachable above the soft keyboard.
 *
 * The legacy `sm:grid` tail (used by the old per-file MOBILE_FULLSCREEN_DIALOG
 * constants) is intentionally dropped — every dialog renders correctly as a
 * flex column on desktop too, which is what we want for these form-style
 * dialogs where the body should scroll between a fixed header and footer.
 */
export const DIALOG_CLASS =
  "top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
  "sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-w-xl sm:rounded-lg sm:p-6 sm:gap-4"
