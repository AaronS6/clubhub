/**
 * Test helper: insert one message from ANOTHER member into a conversation
 * the example account (alex) belongs to, so /api/hub should report
 * unreadMessages = 1 until alex reads it. Idempotent-ish: only inserts
 * when the current unread count is 0.
 */
import { db } from "../src/lib/db"

async function main() {
  const alex = await db.user.findUnique({ where: { email: "alex@clubhub.example" } })
  if (!alex) throw new Error("alex not found — run seed-example-account first")

  const memberships = await db.conversationMember.findMany({
    where: { userId: alex.id },
    select: { conversationId: true, lastReadAt: true },
    take: 5,
  })
  if (memberships.length === 0) throw new Error("alex has no conversations")

  const conv = await db.conversation.findUnique({
    where: { id: memberships[0].conversationId },
    select: { id: true, clubId: true },
  })
  if (!conv) throw new Error("conversation vanished")

  // Another member of the same club (not alex) authors the message.
  const other = await db.clubMember.findFirst({
    where: { clubId: conv.clubId, userId: { not: alex.id }, status: "active" },
    select: { userId: true },
  })

  await db.message.create({
    data: {
      conversationId: conv.id,
      authorId: other?.userId ?? alex.id, // fallback: alex (own msg = no unread)
      body: "Hey team — quick reminder about the build session tonight!",
    },
  })
  await db.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } })

  console.log(`inserted message into conversation ${conv.id} (author: ${other ? "other member" : "alex(fallback)"})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
