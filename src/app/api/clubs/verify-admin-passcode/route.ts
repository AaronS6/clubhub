import { NextResponse } from "next/server"
import { timingSafeEqual, createHash } from "crypto"
import { z } from "zod"
import { getSessionUser } from "@/lib/server-auth"
import { requireAdminPasscode } from "@/lib/admin-passcode"
import { rateLimit, tooManyRequests } from "@/lib/rate-limit"

/**
 * POST /api/clubs/verify-admin-passcode
 * Body: { adminPasscode: string }
 *
 * Verifies the admin passcode for club creation WITHOUT exposing the real
 * value to the client. The client sends what the user typed; the server
 * compares it and returns `{ valid: boolean }`. This keeps the passcode
 * literal out of the client JS bundle (the create-club dialog no longer
 * imports ADMIN_PASSCODE directly).
 *
 * Hardened: rate-limited per user (10 tries / 15 min) so the passcode can't
 * be brute-forced through this endpoint, and compared in constant time via
 * SHA-256 digests (timingSafeEqual needs equal-length buffers; hashing both
 * sides fixes that and removes length leakage).
 */
const schema = z.object({
  adminPasscode: z.string().max(100),
})

const VERIFY_LIMIT = 10
const VERIFY_WINDOW = 15 * 60_000

/** Constant-time string equality (hash both sides → equal-length digests). */
function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest()
  const db = createHash("sha256").update(b, "utf8").digest()
  return timingSafeEqual(da, db)
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Brute-force guard BEFORE the comparison (also burns no CPU when limited).
  const rl = rateLimit(`passcode:user:${user.id}`, VERIFY_LIMIT, VERIFY_WINDOW)
  if (!rl.ok) return tooManyRequests(rl.retryAfterMs)

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
  return NextResponse.json({ valid: safeEqual(parsed.data.adminPasscode, requireAdminPasscode()) })
}
