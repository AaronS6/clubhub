import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/hub/conversations — the combined inbox: every conversation the
 * student is part of, across ALL their clubs, most recently active first.
 *
 * Each row carries the club identity (so the inbox can badge it), the
 * conversation title (group name, club name for club-wide, or the other
 * member for DMs), the last message, and an unread count computed against
 * the viewer's per-conversation `lastReadAt`.
 *
 * Opening a conversation happens through the EXISTING club chat (deep link
 * via openClubConversation) — this endpoint never exposes message bodies
 * beyond the preview line, and only for conversations the user is a member
 * of.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return error("Not authenticated", 401)

  // All my conversation memberships, most recently active first, capped so
  // the per-row unread queries stay bounded.
  const myMemberships = await db.conversationMember.findMany({
    where: { userId: user.id },
    orderBy: { conversation: { updatedAt: "desc" } },
    take: 60,
    select: {
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          type: true,
          name: true,
          updatedAt: true,
          clubId: true,
          club: { select: { id: true, name: true, logoUrl: true, accentColor: true } },
          members: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })

  const rows = await Promise.all(
    myMemberships.map(async (m) => {
      const conv = m.conversation
      const [lastMsg, unreadCount] = await Promise.all([
        db.message.findFirst({
          where: { conversationId: conv.id },
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true, authorId: true, deletedAt: true },
        }),
        db.message.count({
          where: {
            conversationId: conv.id,
            createdAt: { gt: m.lastReadAt },
            authorId: { not: user.id },
            deletedAt: null,
          },
        }),
      ])

      // Title: group name → club name (club-wide) → the other member (DM).
      let title = conv.name
      let otherUser: { id: string; name: string; avatarUrl: string | null } | null = null
      if (!title && conv.type === "direct") {
        const other = conv.members.find((mem) => mem.userId !== user.id)?.user ?? null
        otherUser = other ? { id: other.id, name: other.name, avatarUrl: other.avatarUrl } : null
        title = other?.name ?? "Direct message"
      } else if (!title) {
        title = conv.club.name
      }

      return {
        id: conv.id,
        clubId: conv.clubId,
        club: {
          clubId: conv.club.id,
          clubName: conv.club.name,
          logoUrl: conv.club.logoUrl,
          accentColor: conv.club.accentColor,
        },
        type: conv.type as "club_wide" | "group" | "direct",
        title,
        otherUser,
        memberCount: conv.members.length,
        lastMessage: lastMsg
          ? {
              body: lastMsg.body,
              createdAt: lastMsg.createdAt,
              authorId: lastMsg.authorId,
              isDeleted: !!lastMsg.deletedAt,
            }
          : null,
        unreadCount,
        updatedAt: conv.updatedAt,
      }
    })
  )

  // Most recently active first (updatedAt of the conversation).
  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return json({ conversations: rows })
}
