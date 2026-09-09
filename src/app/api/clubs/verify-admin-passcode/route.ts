import { NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUser } from "@/lib/server-auth"
import { ADMIN_PASSCODE } from "@/lib/admin-passcode"

/**
 * POST /api/clubs/verify-admin-passcode
 * Body: { adminPasscode: string }
 *
 * Verifies the admin passcode for club creation WITHOUT exposing the real
 * value to the client. The client sends what the user typed; the server
 * compares it and returns `{ valid: boolean }`. This keeps the passcode
 * literal out of the client JS bundle (the create-club dialog no longer
 * imports ADMIN_PASSCODE directly).
 */
const schema = z.object({
  adminPasscode: z.string().max(100),
})

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ valid: false }, { status: 400 })
    }
    return NextResponse.json({ valid: parsed.data.adminPasscode === ADMIN_PASSCODE })

  } catch (err: any) {
    console.error("[clubs/verify-admin-passcode POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to verify admin passcode: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
