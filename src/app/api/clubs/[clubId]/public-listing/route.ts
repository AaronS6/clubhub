import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/public-listing
 * Returns { isListedPublic } for the club settings UI (exec-only read; the
 * public directory API exposes listing state only for opted-in clubs).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const club = await db.club.findUnique({
      where: { id: clubId },
      select: { isListedPublic: true },
    })
    if (!club) return error("Club not found", 404)

    return NextResponse.json({ isListedPublic: club.isListedPublic })
  } catch (e) {
    console.error("[public-listing] GET failed:", e)
    return NextResponse.json({ error: "Failed to read public listing" }, { status: 500 })
  }
}

/**
 * PATCH /api/clubs/[clubId]/public-listing
 * JSON { isListedPublic: boolean }
 *
 * Executive-only toggle controlling whether the club appears in the public
 * landing-page directory ("Explore clubs"). The public club profile by code
 * remains reachable either way — the club code gates discovery, which is the
 * existing convention. This only controls directory LISTING.
 *
 * Server-side role check via getClubContext — members get 403.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const body = await req.json().catch(() => null)
    const isListedPublic = body?.isListedPublic
    if (typeof isListedPublic !== "boolean") {
      return NextResponse.json(
        { error: "isListedPublic must be a boolean" },
        { status: 400 },
      )
    }

    await db.club.update({
      where: { id: clubId },
      data: { isListedPublic },
    })

    return NextResponse.json({ ok: true, isListedPublic })
  } catch (e) {
    console.error("[public-listing] PATCH failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update public listing" },
      { status: 500 },
    )
  }
}
