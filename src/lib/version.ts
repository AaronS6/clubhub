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
 * 7.5 stays "7.5" (no display bump) when the release notes were expanded to
 * recap the entire v7.0 → 7.5 wave as "the biggest update in ClubHub
 * history" — only whats-new.ts's ACK KEY moved to "7.5.1" so the expanded
 * modal re-arms once for people who already closed the shorter notes.
 */
export const APP_VERSION = "7.5"
