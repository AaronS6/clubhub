// Demo content for the two public demo clubs (Photography Club, Debate
// Society) so the cross-club "My Hub" experience has real data to aggregate.
// Mirrors the content style of scripts/seed-example-account.ts. Idempotent:
// wipes this script's own rows first (matched by a marker in the text).
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const OWNED_TITLES = [
  "Golden-hour walk at Burnaby Mountain",
  `Photo contest: "Campus in Autumn"`,
  "Weekly photo walk",
  "Print & mount workshop",
  "Pick top 10 photos for the display case",
  `Motion revealed Friday: "Social media harms democracy"`,
  "Regional qualifier team announced",
  "Practice debate: qualifier prep",
  "Exec check-in",
  "Summarize evidence packet #3",
]

function daysFromNow(d: number, hour = 16, minute = 30) {
  const dt = new Date()
  dt.setDate(dt.getDate() + d)
  dt.setHours(hour, minute, 0, 0)
  return dt
}

async function main() {
  const alex = await db.user.findUnique({ where: { email: "alex@clubhub.example" } })
  if (!alex) throw new Error("Run scripts/seed-example-account.ts first")

  const photos = await db.club.findUnique({ where: { clubCode: "PHOTOS1" } })
  const debate = await db.club.findUnique({ where: { clubCode: "DEBATE" } })
  if (!photos || !debate) throw new Error("Run scripts/seed-public-clubs.ts first")

  const clubIds = [photos.id, debate.id]

  // Idempotency: clear this script's previous rows.
  await db.announcement.deleteMany({ where: { clubId: { in: clubIds }, title: { in: OWNED_TITLES } } })
  await db.meeting.deleteMany({ where: { clubId: { in: clubIds }, title: { in: OWNED_TITLES } } })
  await db.task.deleteMany({ where: { clubId: { in: clubIds }, title: { in: OWNED_TITLES } } })
  await db.serviceHour.deleteMany({ where: { clubId: { in: clubIds }, userId: alex.id, reasonText: {
          in: [
            "Documented the club fair booth photography",
            "Event photography for the Grade 8 welcome assembly",
          ],
        } } })

  const photosMembers = await db.clubMember.findMany({
    where: { clubId: photos.id, status: "active" },
    select: { userId: true },
  })
  const debateMembers = await db.clubMember.findMany({
    where: { clubId: debate.id, status: "active" },
    select: { userId: true },
  })
  // An author that is an actual member (first member, else Alex).
  const photosAuthor = photosMembers[0]?.userId ?? alex.id
  const debateAuthor = debateMembers[0]?.userId ?? alex.id

  await Promise.all([
    // ── Photography Club ──────────────────────────────────────────────
    db.announcement.create({
      data: {
        clubId: photos.id,
        authorId: photosAuthor,
        title: "Golden-hour walk at Burnaby Mountain",
        body: "Bring any camera — phones welcome. We'll hike the trail before sunset and share shots in the club chat afterwards. Dress warm; tripods optional.",
        tag: "Event",
        accent: "teal",
        createdAt: daysFromNow(-2, 9, 5),
      },
    }),
    db.announcement.create({
      data: {
        clubId: photos.id,
        authorId: photosAuthor,
        title: `Photo contest: "Campus in Autumn"`,
        body: "Submit up to two photos by the end of the month. The winning shot becomes the club banner for November and earns the Shutterbug badge.",
        tag: "Contest",
        accent: "violet",
        isPinned: true,
        createdAt: daysFromNow(-5, 13, 20),
      },
    }),
    db.meeting.create({
      data: {
        clubId: photos.id,
        title: "Weekly photo walk",
        description: "Meet at the fountain — we'll decide the route based on the light.",
        location: "Meet at the fountain",
        startTime: daysFromNow(1, 15, 45),
        endTime: daysFromNow(1, 17, 0),
        createdById: photosAuthor,
      },
    }),
    db.meeting.create({
      data: {
        clubId: photos.id,
        title: "Print & mount workshop",
        description: "Hands-on session mounting prints for the display case.",
        location: "Room 216",
        startTime: daysFromNow(6, 15, 30),
        endTime: daysFromNow(6, 17, 0),
        createdById: photosAuthor,
      },
    }),
    db.task.create({
      data: {
        clubId: photos.id,
        title: "Pick top 10 photos for the display case",
        description: "Shortlist from the shared album and note the photographer for each.",
        assignedToUserId: alex.id,
        dueDate: daysFromNow(3, 23, 59),
        status: "not_started",
        createdById: photosAuthor,
      },
    }),
    db.serviceHour.create({
      data: {
        clubId: photos.id,
        userId: alex.id,
        dateOfService: daysFromNow(-9, 10, 0),
        hours: 3,
        reasonText: "Documented the club fair booth photography",
        status: "approved",
        reviewedBy: photosAuthor,
        reviewedAt: daysFromNow(-7, 12, 0),
      },
    }),
    db.serviceHour.create({
      data: {
        clubId: photos.id,
        userId: alex.id,
        dateOfService: daysFromNow(-1, 10, 0),
        hours: 2,
        reasonText: "Event photography for the Grade 8 welcome assembly",
        status: "pending",
      },
    }),

    // ── Debate Society ────────────────────────────────────────────────
    db.announcement.create({
      data: {
        clubId: debate.id,
        authorId: debateAuthor,
        title: `Motion revealed Friday: "Social media harms democracy"`,
        body: "Proposition speakers, prepare two constructive arguments. Evidence packets are in the shared drive. Cross-ex drills start promptly.",
        tag: "Prep",
        accent: "amber",
        createdAt: daysFromNow(-1, 8, 15),
      },
    }),
    db.announcement.create({
      data: {
        clubId: debate.id,
        authorId: debateAuthor,
        title: "Regional qualifier team announced",
        body: "Congratulations to everyone who tried out. Full list is posted outside Room 112 — first practice for the traveling team is this week.",
        tag: "Team",
        isUrgent: false,
        createdAt: daysFromNow(-4, 17, 45),
      },
    }),
    db.meeting.create({
      data: {
        clubId: debate.id,
        title: "Practice debate: qualifier prep",
        description: "Full round with timed rebuttals. Bring your evidence packets.",
        location: "Room 112",
        startTime: daysFromNow(2, 15, 30),
        endTime: daysFromNow(2, 17, 0),
        createdById: debateAuthor,
      },
    }),
    db.meeting.create({
      data: {
        clubId: debate.id,
        title: "Exec check-in",
        description: "Travel logistics and permission forms for the regional round.",
        location: "Library seminar room",
        startTime: daysFromNow(9, 15, 0),
        endTime: daysFromNow(9, 16, 0),
        createdById: debateAuthor,
      },
    }),
    db.task.create({
      data: {
        clubId: debate.id,
        title: "Summarize evidence packet #3",
        description: "Five bullet points max — focus on the strongest stats for the proposition.",
        assignedToUserId: alex.id,
        dueDate: daysFromNow(-1, 23, 59),
        status: "in_progress",
        createdById: debateAuthor,
      },
    }),
  ])

  console.log("Seeded demo content for Photography Club + Debate Society")
}

main().finally(() => db.$disconnect())
