/**
 * Admin passcode required to create a new club.
 *
 * SECURITY: The value is read from the ADMIN_CLUB_PASSCODE env var. There is
 * NO hardcoded fallback — if the env var is not set, club creation will fail
 * with a clear error message. This prevents the passcode from leaking via
 * the source code or client bundle.
 *
 * Set ADMIN_CLUB_PASSCODE in your Render dashboard (or .env for local dev).
 */
export const ADMIN_PASSCODE: string | undefined = process.env.ADMIN_CLUB_PASSCODE

/** Returns the passcode or throws a clear error if not configured. */
export function requireAdminPasscode(): string {
  if (!ADMIN_PASSCODE) {
    throw new Error("ADMIN_CLUB_PASSCODE is not set. Configure it in your Render environment variables.")
  }
  return ADMIN_PASSCODE
}
