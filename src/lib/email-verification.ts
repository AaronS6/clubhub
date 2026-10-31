import { randomInt } from "crypto"
import { db } from "@/lib/db"
import { sendEmail, renderEmailHtml } from "@/lib/email"

/**
 * Signup email verification — 6-digit codes emailed to new email+password
 * accounts. The account is gated (login refused with a distinguishable
 * error) until the code is entered. Google OAuth accounts are exempt —
 * Google proves email ownership at sign-in, so authOptions marks them
 * emailVerified directly.
 *
 * Codes live in the existing NextAuth `VerificationToken` table:
 *   identifier = email (lowercased)
 *   token      = 6-digit code (globally unique)
 *   expires    = now + VERIFICATION_CODE_TTL_MS
 */

/** How long a signup verification code stays valid. */
export const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000 // 15 minutes

/** Uniform 6-digit numeric code ("000000"–"999999") from crypto randomness. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

function normalize(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Issues a fresh verification code for an email — supersedes (deletes) any
 * previous code first. Returns the plain code so the caller can email it.
 *
 * `token` is globally unique, so two users could in principle draw the same
 * 6-digit code at the same moment; the insert is retried with a fresh code
 * if that 1-in-a-million collision happens.
 */
export async function issueVerificationCode(email: string): Promise<string> {
  const normalized = normalize(email)
  await db.verificationToken.deleteMany({ where: { identifier: normalized } })
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode()
    try {
      await db.verificationToken.create({
        data: {
          identifier: normalized,
          token: code,
          expires: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        },
      })
      return code
    } catch (e) {
      lastError = e
      const isTokenCollision =
        (e as { code?: string } | null)?.code === "P2002"
      if (!isTokenCollision) throw e
      // token collision — redraw
    }
  }
  throw lastError ?? new Error("Could not issue verification code")
}

export type ConsumeResult = "ok" | "expired" | "invalid"

/**
 * Validates (and burns) a verification code for an email. The found token
 * row is always deleted — a code is single-use, whether it matched, was
 * expired, or belonged to a different email.
 */
export async function consumeVerificationCode(
  email: string,
  code: string,
): Promise<ConsumeResult> {
  const normalized = normalize(email)
  const record = await db.verificationToken.findUnique({ where: { token: code } })
  if (!record || record.identifier !== normalized) return "invalid"
  await db.verificationToken.delete({ where: { id: record.id } }).catch(() => {})
  if (record.expires.getTime() < Date.now()) return "expired"
  return "ok"
}

/** Sends the verification-code email. Best-effort — never throws. */
export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<{ ok: boolean; reason?: string }> {
  const html = renderEmailHtml({
    title: "Verify your email",
    preheader: `Your ClubHub verification code is ${code}`,
    bodyLines: [
      "Welcome to ClubHub! Enter this code where you're signing up to finish creating your account:",
    ],
    codeText: code,
  })
  return sendEmail({ to, subject: `Your ClubHub verification code: ${code}`, html })
}
