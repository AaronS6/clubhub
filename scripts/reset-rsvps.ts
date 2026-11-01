/**
 * Test helper: reset Alex's RSVPs and add a third upcoming meeting so the
 * hero's advance flow (respond → 2s hold → next event expands in) can be
 * exercised end-to-end in the browser.
 */
import { db } from "../src/lib/db"

async function main() {
  const alex = await db.user.findUnique({ where: { email: "alex@clubhub.example" } })
  if (!alex) throw new Error("alex not found")

  // 1. Clear Alex's RSVPs on upcoming meetings (delete MeetingRsvp rows).
  const del = await db.meetingRsvp.deleteMany({ where: { userId: alex.id } })
  console.log(`deleted ${del.count} RSVP rows for alex`)

  // 2. Ensure three upcoming meetings exist in Robotics Club.
  const club = await db.club.findFirst({
    where: { name: "Robotics Club" },
    select: { id: true },
  })
  if (!club) throw new Error("Robotics Club not found")

  const existing = await db.meeting.findMany({
    where: { clubId: club.id, startTime: { gte: new Date() }, cancelledAt: null },
    orderBy: { startTime: "asc" },
    select: { id: true, title: true, startTime: true },
  })
  console.log("existing upcoming:", existing.map((m) => `${m.title} @ ${m.startTime.toISOString()}`))

  if (existing.length < 3) {
    const d1 = new Date(); d1.setDate(d1.getDate() + 1); d1.setHours(16, 0, 0, 0)
    const d2 = new Date(); d2.setDate(d2.getDate() + 2); d2.setHours(17, 30, 0, 0)
    await db.meeting.create({
      data: {
        clubId: club.id,
        createdById: alex.id,
        title: "Outreach Workshop",
        description: "Prep demo materials for the elementary school visit.",
        location: "Room 9",
        startTime: d1,
        endTime: new Date(d1.getTime() + 90 * 60000),
      },
    })
    await db.meeting.create({
      data: {
        clubId: club.id,
        createdById: alex.id,
        title: "Design Review",
        description: "Review the new arm CAD with the build team.",
        location: "Lab 204",
        startTime: d2,
        endTime: new Date(d2.getTime() + 60 * 60000),
      },
    })
    console.log("created 2 extra meetings (Outreach Workshop, Design Review)")
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
