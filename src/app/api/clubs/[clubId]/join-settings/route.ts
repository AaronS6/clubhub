import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/join-settings
 * Returns { joinMode } for the exec settings UI ("code" | "request").
 * Exec-only read (members see the mode through public surfaces anyway, but
 * the settings card itself is exec-gated).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const club = await db.club.findUnique({
      where: { id: clubId },
      select: { joinMode: true },
    })
    if (!club) return error("Club not found", 404)

    return NextResponse.json({
      joinMode: club.joinMode === "request" ? "request" : "code",
    })
  } catch (e) {
    console.error("[join-settings] GET failed:", e)
    return error(e instanceof Error ? e.message : "Failed to read join settings", 500)
  }
}

/**
 * PATCH /api/clubs/[clubId]/join-settings
 * JSON { joinMode: "code" | "request" }
 *
 * Executive-only toggle for HOW new members join:
 *   - "code"    (default): students enter the club code + join password.
 *   - "request": students send a join request and executives approve or
 *                decline each one from Members → Join requests.
 *
 * Switching to "request" keeps the password stored (so switching back is
 * lossless). Server-side role check — members get 403.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const body = await req.json().catch(() => null)
    const joinMode = body?.joinMode
    if (joinMode !== "code" && joinMode !== "request") {
      return NextResponse.json(
        { error: 'joinMode must be "code" or "request"' },
        { status: 400 },
      )
    }

    await db.club.update({ where: { id: clubId }, data: { joinMode } })

    return NextResponse.json({ ok: true, joinMode })
  } catch (e) {
    console.error("[join-settings] PATCH failed:", e)
    return error(e instanceof Error ? e.message : "Failed to update join settings", 500)
  }
}
