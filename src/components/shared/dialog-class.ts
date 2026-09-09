/**
 * Shared dialog className — full-screen on mobile, centered modal on desktop.
 *
 * DESIGN:
 * - Mobile (< sm): full viewport height, no rounding, no padding (the form
 *   body handles its own padding). This prevents the "cramped dialog" issue
 *   where content overflows on narrow screens.
 * - Desktop (≥ sm): centered modal, max-w-xl (36rem = 576px — wider than
 *   the old max-w-lg which was too narrow for date/time pickers side by
 *   side), auto height, rounded, padded.
 * - Uses flex-col with a sticky header, scrollable body, and sticky footer
 *   so action buttons stay reachable above the soft keyboard on mobile.
 */
export const DIALOG_CLASS =
  "top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
  "sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-w-xl sm:rounded-lg sm:p-6 sm:gap-4"
