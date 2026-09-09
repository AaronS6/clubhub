import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

// GET /api/clubs/[clubId]/chat/conversations/[conversationId]/pinned
// Returns pinned messages (pinnedAt not null, not deleted) for the pinned bar.
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string }> }) {
  try {
    const { clubId, conversationId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const conv = await db.conversation.findUnique({ where: { id: conversationId } })
    if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)

    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: c.user.id } },
    })
    if (!membership) return error("Not a member of this conversation", 403)

    const pinned = await db.message.findMany({
      where: { conversationId, pinnedAt: { not: null }, deletedAt: null },
      orderBy: { pinnedAt: "desc" },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      take: 20,
    })

    return json({
      pinned: pinned.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        pinnedAt: m.pinnedAt,
        author: {
          id: m.author.id,
          name: m.author.name,
          avatarUrl: m.author.avatarUrl ?? null,
        },
      })),
    })

  } catch (err: any) {
    console.error("[clubs/chat/conversations/pinned GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load pinned messages: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
