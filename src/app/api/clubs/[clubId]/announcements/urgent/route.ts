import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/announcements/urgent
 *
 * Returns the single most recent non-deleted announcement flagged `isUrgent`
 * for this club, or `null` if there isn't one. Used by the app-wide
 * dismissible banner in AppShell — we only show ONE banner at a time
 * (the latest), to avoid stacking.
 *
 * Any club member can read this; urgency is a publishing flag, not a secret.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const row = await db.announcement.findFirst({
      where: { clubId, isUrgent: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    })

    if (!row) return json({ announcement: null })

    return json({
      announcement: {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        author: { id: row.author.id, name: row.author.name },
      },
    })

  } catch (err: any) {
    console.error("[clubs/announcements/urgent GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load urgent announcements: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
