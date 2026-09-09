import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role === "executive") {
      const execCount = await db.clubMember.count({
        where: { clubId, status: "active", role: "executive" },
      })
      if (execCount <= 1) return error("Cannot leave: you are the only executive. Promote another member first.", 400)
    }
    await db.clubMember.update({
      where: { id: c.membership.id },
      data: { status: "removed" },
    })
    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "member_left",
      targetType: "user",
      targetId: c.user.id,
      description: `${c.user.name} left the club`,
    })
    await emitClubEvent(clubId, "new_member", { userId: c.user.id, left: true })
    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/leave POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to leave club: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
