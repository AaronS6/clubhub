import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/chat/conversations/[conversationId]/export
 *
 * Exports the conversation's message history as a plain-text file. Accessible
 * to any member of the conversation (verified via ConversationMember) — no
 * exec requirement. Returns:
 *   Content-Type:        text/plain; charset=utf-8
 *   Content-Disposition: attachment; filename="<slug>.txt"
 *
 * Format:
 *   <Conversation name> — exported <YYYY-MM-DD HH:MM>
 *   ================================================================
 *
 *   [YYYY-MM-DD HH:MM] Author Name: message body
 *   [YYYY-MM-DD HH:MM] Author Name: 📌 pinned message body
 *   [YYYY-MM-DD HH:MM] Author Name: edited message (edited)
 *
 * - Soft-deleted messages are SKIPPED entirely.
 * - Edited messages are marked with " (edited)".
 * - Pinned messages are prefixed with "📌 ".
 * - Reactions are NOT included (kept simple per spec).
 * - Capped at the last 1000 messages to avoid huge payloads.
 */

const MAX_MESSAGES = 1000

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; conversationId: string }> },
) {
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

    // Fetch the most recent MAX_MESSAGES messages (oldest-first for export).
    // Skip soft-deleted messages entirely.
    const messages = await db.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_MESSAGES,
      include: {
        author: { select: { name: true } },
      },
    })
    messages.reverse()

    const title =
      conv.type === "direct"
        ? "Direct message"
        : conv.type === "club_wide"
          ? conv.name ?? "Club chat"
          : conv.name ?? "Group chat"

    const exportDate = new Date()
    const headerLines = [
      `${title} — exported ${formatDateTime(exportDate)}`,
      "================================================================",
      "",
    ]

    const bodyLines = messages.map((m) => {
      const stamp = formatDateTime(m.createdAt)
      const author = m.author.name
      const editedSuffix = m.editedAt ? " (edited)" : ""
      const pinnedPrefix = m.pinnedAt ? "📌 " : ""
      return `[${stamp}] ${author}: ${pinnedPrefix}${m.body}${editedSuffix}`
    })

    const text = [...headerLines, ...bodyLines, ""].join("\n")

    // Slugify the conversation title for the filename. Strip anything that's
    // not a letter, number, dash, or underscore; collapse runs of dashes;
    // lower-case; cap at 60 chars so we don't blow up filesystem limits.
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "conversation"
    const filename = `${slug}.txt`

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })

  } catch (err: any) {
    console.error("[clubs/chat/conversations/export GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to export data: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
