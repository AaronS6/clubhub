/**
 * App version — shown as small text on the signup page.
 *
 * Bumped by .1 on each user-facing update. Started at 1.0.
 *
 * Convention: when the user says "I updated" / asks for a new round of
 * changes, increment the minor by .1 (1.0 → 1.1 → 1.2 → …). Major bumps
 * (2.0, 3.0) are for deliberate breaking/relaunch moments.
 *
 * 7.0 → 7.4 in one hop: the 7.1–7.3 rounds (chat polish, iOS keyboard fix,
 * shortcuts, shimmer skeletons, landing stats + FAQ) shipped together.
 * 7.5: landing photo overhaul — the page now runs on student-submitted
 * photos (club life wall, photo step cards, new hero).
 * 8.0: the "runs itself" wave — real club storage (live quota meter, 100%
 * write-pause with recovery, safe cleanup suggestions, capacity requests),
 * the executive introduction guide with a resume pill, a chat diet (denser
 * messages, Enter-to-send keeps focus, ~60% less storage per message), the
 * redesigned v8 avatar-effect set, the notes "Make private" flow, visible
 * ambient backgrounds, and a pile of mobile fixes.
 * 9.0: the relaunch — My Hub + one unified navigation. A student's default
 * view is now their personal cross-club home (Your Week, Recent Updates,
 * My Tasks, My Clubs, activity stats), with Home / Calendar / My Tasks /
 * Updates / Messages as SHARED pages that aggregate across every club they
 * belong to. Individual club workspaces keep every existing feature behind
 * the same five-item nav; a prominent context switcher (plus the MY CLUBS
 * list) moves between My Hub and each club. Every aggregated item deep-links
 * to its original club location, with real browser back/forward and
 * refresh-safe context.
 * 9.0.1: compact glass navigation for touchscreens — icons only, drag across
 * buttons to switch pages, softer reflections and smoother spring transitions.
 */
export const APP_VERSION = "9.0.1"
