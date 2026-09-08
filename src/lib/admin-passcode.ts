/**
 * Admin passcode required to create a new club.
 *
 * This is a hardcoded constant — NOT stored in the DB. The intent is a simple
 * gating mechanism so that only people who know the shared passcode can spin
 * up new clubs (cuts down on test/junk clubs). Both the client (the
 * create-club dialog) and the server (the clubs POST route) check against
 * this same constant, so client-side validation is just UX — the server is
 * the source of truth.
 */
export const ADMIN_PASSCODE = "buildtogether12$"
