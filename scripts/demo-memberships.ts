// Add the demo user (alex@clubhub.example) as an active member of the two
// public demo clubs so the My Hub cross-club experience has real data to
// aggregate (mirrors exactly what POST /api/clubs/join would write).
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const alex = await db.user.findUnique({ where: { email: "alex@clubhub.example" } })
  if (!alex) throw new Error("Run scripts/seed-example-account.ts first")
  const clubs = await db.club.findMany({
    where: { clubCode: { in: ["PHOTOS1", "DEBATE"] } },
    select: { id: true, name: true, clubCode: true },
  })
  for (const club of clubs) {
    const existing = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId: club.id, userId: alex.id } },
    })
    if (existing) {
      await db.clubMember.update({
        where: { id: existing.id },
        data: { status: "active" },
      })
      console.log(`${club.name}: membership re-activated`)
      continue
    }
    await db.clubMember.create({
      data: { clubId: club.id, userId: alex.id, role: "member", status: "active" },
    })
    console.log(`${club.name}: Alex added as member`)
  }
  const total = await db.clubMember.count({ where: { userId: alex.id, status: "active" } })
  console.log(`Alex now active in ${total} clubs`)
}

main().finally(() => db.$disconnect())
