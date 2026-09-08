/**
 * Admin passcode required to create a new club.
 *
 * SECURITY: The literal value is read from the `ADMIN_CLUB_PASSCODE` env var
 * at runtime (falling back to a default ONLY in dev). It is NEVER imported
 * into client-side code — the client sends the user-entered passcode to the
 * API, which compares it server-side. This keeps the real value out of the
 * client JS bundle.
 *
 * Set ADMIN_CLUB_PASSCODE in your production .env to override the default.
 */
export const ADMIN_PASSCODE =
  process.env.ADMIN_CLUB_PASSCODE || "buildtogether12$"
