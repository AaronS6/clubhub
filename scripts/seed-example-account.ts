/**
 * ============================================================================
 * seed-example-account.ts
 * ============================================================================
 *
 * Creates a rich example account so you can explore ClubHub without having to
 * set everything up yourself.
 *
 *   Email:     alex@clubhub.example
 *   Password:  ClubHub2026!
 *
 * What gets created:
 *   - 1 executive account (Alex Rivera) — the "you" account
 *   - 1 club  (Robotics Club, accent green, code ROBOTIX)
 *   - 6 extra member accounts (so the member list, chat, and leaderboard feel alive)
 *   - 3 teams (Build, Programming, Outreach)
 *   - 4 announcements (1 pinned, 1 urgent, 2 regular) with reactions + comments
 *   - 6 tasks across teams (mix of not_started / in_progress / done) with subtasks
 *   - 3 meetings (1 upcoming, 1 recurring, 1 past) with RSVPs
 *   - Service hours: a mix of approved (for the leaderboard) + 1 pending
 *   - Club-wide chat conversation with a few messages
 *   - 2 badges, one awarded to Alex
 *   - 4 financial transactions (revenue + expense) so the balance chart has data
 *   - Activity log entries + a welcome notification
 *
 * Idempotent: re-running cleans up the example data first so you can run this
 * script repeatedly without duplicates.
 *
 * Usage:
 *   cd /home/z/my-project
 *   bun run scripts/seed-example-account.ts
 * ============================================================================
 */

import { db } from "../src/lib/db"
import { hashPassword } from "../src/lib/auth"
import { encryptClubPassword } from "../src/lib/club-crypto"
import sharp from "sharp"
import { saveImage, publicUrl } from "../src/lib/image-store"

const EXAMPLE_EMAIL = "alex@clubhub.example"
const EXAMPLE_PASSWORD = "ClubHub2026!"
const EXAMPLE_NAME = "Alex Rivera"
const CLUB_NAME = "Robotics Club"
const CLUB_CODE = "ROBOTIX"
const CLUB_PASSWORD = "robotix2026"
const CLUB_ACCENT = "#16a34a"

// Extra members so the club feels alive. These are real User rows (so they
// show up in the member list) but you don't need their passwords — they're
// just there to populate the experience.
const EXTRA_MEMBERS = [
  { name: "Maya Chen", email: "maya@clubhub.example", bio: "Lead programmer. Loves FRC." },
  { name: "Jordan Patel", email: "jordan@clubhub.example", bio: "Build team captain." },
  { name: "Sam Rodriguez", email: "sam@clubhub.example", bio: "Outreach coordinator." },
  { name: "Priya Sharma", email: "priya@clubhub.example", bio: "Electrical lead." },
  { name: "Tyler Nguyen", email: "tyler@clubhub.example", bio: "New member, eager to learn." },
  { name: "Emma Wilson", email: "emma@clubhub.example", bio: "Notebook + documentation." },
]

async function main() {
  console.log("Seeding example account...")

  // ── Idempotent cleanup ───────────────────────────────────────────────────
  // Find any existing example users (by email domain) and the example club,
  // then cascade-delete. This lets the script be re-run safely.
  const existingUsers = await db.user.findMany({
    where: { email: { endsWith: "@clubhub.example" } },
    select: { id: true },
  })
  if (existingUsers.length > 0) {
    console.log(`   cleaning up ${existingUsers.length} existing example users...`)
    // Deleting users cascades to memberships, hours, announcements, etc.
    // But the Club is created-by a user, so we delete the club first if it
    // exists (its cascade handles club-scoped rows).
    const existingClub = await db.club.findFirst({ where: { name: CLUB_NAME } })
    if (existingClub) {
      // DB-backed demo images seed with a fresh club id each run — delete
      // the old club's StoredImage rows so re-seeds don't orphan bytes.
      await db.storedImage.deleteMany({
        where: { key: { in: [`${existingClub.id}-banner`, `${existingClub.id}-logo`] } },
      })
      await db.club.delete({ where: { id: existingClub.id } })
    }
    await db.user.deleteMany({ where: { id: { in: existingUsers.map((u) => u.id) } } })
  }

  // ── 1. Create the example user (Alex — the "you" account) ───────────────
  console.log(`   creating user: ${EXAMPLE_NAME} <${EXAMPLE_EMAIL}>`)
  const alex = await db.user.create({
    data: {
      name: EXAMPLE_NAME,
      email: EXAMPLE_EMAIL,
      passwordHash: await hashPassword(EXAMPLE_PASSWORD),
      emailVerified: true,
      bio: "President of the Robotics Club. Building robots since freshman year.",
    },
  })

  // ── 2. Create the club with Alex as executive ───────────────────────────
  console.log(`   creating club: ${CLUB_NAME} (code ${CLUB_CODE})`)
  const club = await db.club.create({
    data: {
      name: CLUB_NAME,
      description:
        "We design, build, and compete with robots in the FIRST Robotics Competition. " +
        "New members welcome — no experience required.",
      accentColor: CLUB_ACCENT,
      // bannerUrl/logoUrl are set right after creation — the demo images are
      // seeded through the PRODUCTION DB-backed image pipeline below
      // (StoredImage rows + /api/club-images/{key} URLs, the same path real
      // exec uploads take) so they can never be lost to a filesystem wipe.
      bannerFocalY: 0.6,
      // Listed in the public landing-page directory (see
      // seed-public-clubs.ts for the extra demo clubs).
      isListedPublic: true,
      clubCode: CLUB_CODE,
      clubPasswordEnc: encryptClubPassword(CLUB_PASSWORD),
      hoursGoal: 200,
      createdBy: alex.id,
      members: { create: { userId: alex.id, role: "executive" } },
    },
  })

  // ── 2b. Demo banner + logo via the production DB image pipeline ─────────
  // The banner is processed exactly like a real exec upload (1280×720 cover,
  // JPEG q62 mozjpeg) and stored as a StoredImage row; the logo is a crisp
  // branded robot-glyph tile (pure vector shapes — no font dependency)
  // rasterized at the real logo size (256×256 q80). Both serve through
  // /api/club-images/{key}?v=1 so the club switcher shows a branded tile and
  // a sandbox/depoy disk wipe can never blank them.
  console.log("   seeding banner + logo through the DB image pipeline…")
  const bannerKey = `${club.id}-banner`
  const bannerBytes = await sharp("public/banners/robotics-banner.jpg")
    .resize(1280, 720, { fit: "cover", position: "centre" })
    .jpeg({ quality: 62, mozjpeg: true })
    .toBuffer()
  await saveImage("club-image", bannerKey, bannerBytes)

  const logoKey = `${club.id}-logo`
  const logoSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
      `<rect width="256" height="256" rx="56" fill="${CLUB_ACCENT}"/>` +
      `<circle cx="128" cy="52" r="10" fill="#ffffff"/>` +
      `<rect x="118" y="58" width="20" height="20" fill="#ffffff"/>` +
      `<rect x="58" y="78" width="140" height="94" rx="28" fill="#ffffff"/>` +
      `<circle cx="98" cy="122" r="14" fill="${CLUB_ACCENT}"/>` +
      `<circle cx="158" cy="122" r="14" fill="${CLUB_ACCENT}"/>` +
      `<rect x="98" y="148" width="60" height="10" rx="5" fill="${CLUB_ACCENT}"/>` +
      `<rect x="34" y="104" width="16" height="42" rx="8" fill="#ffffff"/>` +
      `<rect x="206" y="104" width="16" height="42" rx="8" fill="#ffffff"/>` +
      `</svg>`,
  )
  const logoBytes = await sharp(logoSvg)
    .resize(256, 256, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
  await saveImage("club-image", logoKey, logoBytes)

  await db.club.update({
    where: { id: club.id },
    data: {
      bannerUrl: publicUrl("club-image", bannerKey, 1),
      logoUrl: publicUrl("club-image", logoKey, 1),
    },
  })

  // ── 3. Create extra member users and add them to the club ───────────────
  console.log(`   creating ${EXTRA_MEMBERS.length} extra members...`)
  const extraUsers: { id: string; name: string }[] = []
  for (const m of EXTRA_MEMBERS) {
    const u = await db.user.create({
      data: {
        name: m.name,
        email: m.email,
        passwordHash: await hashPassword("dummy-password-123"),
        emailVerified: true,
        bio: m.bio,
      },
    })
    extraUsers.push({ id: u.id, name: u.name })
    await db.clubMember.create({
      data: { clubId: club.id, userId: u.id, role: "member" },
    })
  }
  const [maya, jordan, sam, priya, tyler, emma] = extraUsers

  // ── 4. Service categories + hours ──────────────────────────────────────
  console.log("   seeding service hours + categories...")
  const catBuild = await db.serviceCategory.create({ data: { clubId: club.id, name: "Build Sessions" } })
  const catOutreach = await db.serviceCategory.create({ data: { clubId: club.id, name: "Outreach" } })
  const catComp = await db.serviceCategory.create({ data: { clubId: club.id, name: "Competition" } })

  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  // Approved hours across members (drives the leaderboard)
  const hoursRows = [
    { user: alex,    hours: 12, days: 3,  cat: catBuild,    reason: "Built the drive train and mounted the gearboxes." },
    { user: alex,    hours: 8,  days: 10, cat: catOutreach, reason: "Ran the booth at the middle school STEM night." },
    { user: maya,    hours: 14, days: 2,  cat: catComp,     reason: "Autonomous mode programming session." },
    { user: jordan,  hours: 10, days: 5,  cat: catBuild,    reason: "Welded the frame and installed the intake." },
    { user: sam,     hours: 6,  days: 7,  cat: catOutreach, reason: "Drafted sponsorship letters and sent to 12 local businesses." },
    { user: priya,   hours: 9,  days: 4,  cat: catBuild,    reason: "Wired the PDP and programmed the motor controllers." },
    { user: tyler,   hours: 4,  days: 6,  cat: catBuild,    reason: "Helped inventory the parts cabinet." },
    { user: emma,    hours: 5,  days: 8,  cat: catOutreach, reason: "Wrote the first draft of the engineering notebook." },
  ]
  for (const h of hoursRows) {
    await db.serviceHour.create({
      data: {
        clubId: club.id,
        userId: h.user.id,
        categoryId: h.cat.id,
        dateOfService: daysAgo(h.days),
        hours: h.hours,
        reasonText: h.reason,
        status: "approved",
        reviewedBy: alex.id,
        reviewedAt: daysAgo(h.days - 1),
        reviewComment: "Great work!",
      },
    })
  }
  // One PENDING entry — so the Approvals view + the hours "+pending" sub-line have data
  await db.serviceHour.create({
    data: {
      clubId: club.id,
      userId: tyler.id,
      categoryId: catBuild.id,
      dateOfService: daysAgo(1),
      hours: 3,
      reasonText: "Helped test the claw mechanism after school.",
      status: "pending",
    },
  })

  // ── 5. Teams ────────────────────────────────────────────────────────────
  console.log("   creating teams...")
  const teamBuild = await db.team.create({
    data: { clubId: club.id, name: "Build Team", description: "Designs and assembles the robot." },
  })
  const teamProg = await db.team.create({
    data: { clubId: club.id, name: "Programming Team", description: "Writes autonomous + teleop code." },
  })
  const teamOut = await db.team.create({
    data: { clubId: club.id, name: "Outreach Team", description: "Sponsorships, demos, notebook." },
  })
  // Team memberships
  await db.teamMember.create({ data: { teamId: teamBuild.id, userId: jordan.id } })
  await db.teamMember.create({ data: { teamId: teamBuild.id, userId: priya.id } })
  await db.teamMember.create({ data: { teamId: teamBuild.id, userId: tyler.id } })
  await db.teamMember.create({ data: { teamId: teamProg.id, userId: maya.id } })
  await db.teamMember.create({ data: { teamId: teamProg.id, userId: alex.id } })
  await db.teamMember.create({ data: { teamId: teamOut.id, userId: sam.id } })
  await db.teamMember.create({ data: { teamId: teamOut.id, userId: emma.id } })

  // ── 6. Tasks (with subtasks) across teams ───────────────────────────────
  console.log("   creating tasks...")
  const task1 = await db.task.create({
    data: {
      clubId: club.id, teamId: teamBuild.id, title: "Finish the drive train",
      description: "Mount gearboxes, tension chains, and test under load.",
      assignedToUserId: jordan.id, dueDate: daysAgo(-5), status: "in_progress",
      createdById: alex.id,
    },
  })
  await db.subtask.create({ data: { taskId: task1.id, title: "Mount gearboxes to frame" } })
  await db.subtask.create({ data: { taskId: task1.id, title: "Tension the chains", isDone: true } })
  await db.subtask.create({ data: { taskId: task1.id, title: "Test drive under load" } })

  const task2 = await db.task.create({
    data: {
      clubId: club.id, teamId: teamProg.id, title: "Write autonomous routine",
      description: "Score 2 notes in auto, then dock on the chain.",
      assignedToUserId: maya.id, dueDate: daysAgo(-10), status: "in_progress",
      createdById: alex.id,
    },
  })
  await db.subtask.create({ data: { taskId: task2.id, title: "Path-follow to note pile" } })
  await db.subtask.create({ data: { taskId: task2.id, title: "Intake + score logic" } })

  const task3 = await db.task.create({
    data: {
      clubId: club.id, teamId: teamBuild.id, title: "Wire the PDP",
      description: "Route power to all motors and the radio.",
      assignedToUserId: priya.id, dueDate: daysAgo(-2), status: "done",
      createdById: alex.id,
    },
  })
  await db.subtask.create({ data: { taskId: task3.id, title: "Label all wires", isDone: true } })

  const task4 = await db.task.create({
    data: {
      clubId: club.id, teamId: teamOut.id, title: "Send sponsorship packets",
      description: "Mail the sponsorship packet to 12 local businesses.",
      assignedToUserId: sam.id, dueDate: daysAgo(-7), status: "in_progress",
      createdById: alex.id,
    },
  })

  const task5 = await db.task.create({
    data: {
      clubId: club.id, title: "Update the engineering notebook",
      assignedToUserId: emma.id, dueDate: daysAgo(-14), status: "not_started",
      createdById: alex.id,
    },
  })

  const task6 = await db.task.create({
    data: {
      clubId: club.id, teamId: teamBuild.id, title: "Inventory the parts cabinet",
      assignedToUserId: tyler.id, dueDate: daysAgo(1), status: "done",
      createdById: alex.id,
    },
  })

  // ── 7. Meetings (with RSVPs) ────────────────────────────────────────────
  console.log("   creating meetings...")
  const upcomingMeeting = await db.meeting.create({
    data: {
      clubId: club.id, title: "Weekly Build Session",
      description: "Bring your laptops. We'll finish the drive train and start on the claw.",
      location: "Lab 204", startTime: daysAgo(-3), endTime: daysAgo(-3),
      createdById: alex.id,
    },
  })
  await db.meetingRsvp.create({ data: { meetingId: upcomingMeeting.id, userId: alex.id, status: "going" } })
  await db.meetingRsvp.create({ data: { meetingId: upcomingMeeting.id, userId: jordan.id, status: "going" } })
  await db.meetingRsvp.create({ data: { meetingId: upcomingMeeting.id, userId: maya.id, status: "going" } })
  await db.meetingRsvp.create({ data: { meetingId: upcomingMeeting.id, userId: sam.id, status: "maybe" } })
  await db.meetingRsvp.create({ data: { meetingId: upcomingMeeting.id, userId: tyler.id, status: "not_going" } })

  const recurringMeeting = await db.meeting.create({
    data: {
      clubId: club.id, title: "Strategy Review (recurring)",
      description: "Weekly strategy session before competitions.",
      location: "Room 12", startTime: daysAgo(-7), endTime: daysAgo(-7),
      isRecurring: true, recurrenceRule: "weekly", createdById: alex.id,
    },
  })

  const pastMeeting = await db.meeting.create({
    data: {
      clubId: club.id, title: "Season Kickoff",
      description: "Welcomed new members, went over the game manual.",
      location: "Auditorium", startTime: daysAgo(14), endTime: daysAgo(14),
      createdById: alex.id,
    },
  })
  await db.meetingRsvp.create({ data: { meetingId: pastMeeting.id, userId: alex.id, status: "going" } })
  await db.meetingRsvp.create({ data: { meetingId: pastMeeting.id, userId: maya.id, status: "going" } })

  // ── 8. Announcements (pinned + urgent + regular) with reactions/comments ─
  console.log("   creating announcements...")
  const ann1 = await db.announcement.create({
    data: {
      clubId: club.id, authorId: alex.id, isPinned: true,
      title: "Welcome to the 2026 season!",
      body:
        "Hey team! Welcome to ClubHub — this is where we'll post updates, track hours, " +
        "and coordinate builds. **First build session is Thursday at 4pm in Lab 204.** " +
        "If you're new, introduce yourself in the chat!",
    },
  })
  await db.announcementReaction.create({ data: { announcementId: ann1.id, userId: maya.id, emoji: "🎉" } })
  await db.announcementReaction.create({ data: { announcementId: ann1.id, userId: jordan.id, emoji: "👍" } })
  await db.announcementReaction.create({ data: { announcementId: ann1.id, userId: sam.id, emoji: "🚀" } })
  await db.announcementComment.create({
    data: { announcementId: ann1.id, authorId: emma.id, body: "Excited for the season! Notebook is ready." },
  })
  await db.announcementComment.create({
    data: { announcementId: ann1.id, authorId: tyler.id, body: "First meeting — can't wait!" },
  })

  const ann2 = await db.announcement.create({
    data: {
      clubId: club.id, authorId: alex.id, isUrgent: true,
      title: "URGENT: Lab access cards needed",
      body:
        "If you don't have a lab access card yet, see Ms. Park in the front office BEFORE Thursday. " +
        "You won't be able to enter Lab 204 without one.",
    },
  })

  const ann3 = await db.announcement.create({
    data: {
      clubId: club.id, authorId: sam.id,
      title: "Sponsorship update",
      body:
        "We heard back from two local businesses — both interested in sponsoring us! " +
        "I'll share details at the strategy review. Thanks everyone for the support.",
    },
  })
  await db.announcementReaction.create({ data: { announcementId: ann3.id, userId: alex.id, emoji: "🙌" } })
  await db.announcementReaction.create({ data: { announcementId: ann3.id, userId: priya.id, emoji: "🎉" } })

  const ann4 = await db.announcement.create({
    data: {
      clubId: club.id, authorId: maya.id,
      title: "Autonomous code is on GitHub",
      body:
        "Pushed the first draft of the autonomous routine to our GitHub repo. " +
        "Please review the path-follow code — I want to merge by Friday.",
    },
  })

  // ── 9. Chat: club-wide conversation + messages ─────────────────────────
  console.log("   creating chat conversation + messages...")
  const convo = await db.conversation.create({
    data: { clubId: club.id, type: "club_wide", createdBy: alex.id },
  })
  await db.conversationMember.create({ data: { conversationId: convo.id, userId: alex.id } })
  for (const u of extraUsers) {
    await db.conversationMember.create({ data: { conversationId: convo.id, userId: u.id } })
  }
  const msgs = [
    { author: alex,   body: "Hey team! Welcome to the chat. Use this for quick questions.", mins: 240 },
    { author: emma,   body: "Thanks Alex! Notebook is up to date through last build.", mins: 220 },
    { author: jordan, body: "Drive train is almost done — need one more session.", mins: 180 },
    { author: maya,   body: "I'll push the auto code tonight. Watch the repo!", mins: 120 },
    { author: sam,    body: "Got a sponsor reply — will share at strategy review.", mins: 60 },
    { author: tyler,  body: "First build session was awesome. Thanks for the help everyone!", mins: 30 },
  ]
  for (const m of msgs) {
    await db.message.create({
      data: { conversationId: convo.id, authorId: m.author.id, body: m.body, createdAt: new Date(now.getTime() - m.mins * 60 * 1000) },
    })
  }

  // ── 10. Badges + one award to Alex ─────────────────────────────────────
  console.log("   creating badges...")
  const badgeFounder = await db.badge.create({
    data: { clubId: club.id, name: "Founder", description: "Club founder.", emoji: "🌟", createdBy: alex.id },
  })
  const badge100 = await db.badge.create({
    data: { clubId: club.id, name: "100 Hours", description: "Logged 100+ service hours.", emoji: "💯", createdBy: alex.id },
  })
  await db.memberBadge.create({
    data: { badgeId: badgeFounder.id, userId: alex.id, clubId: club.id, awardedBy: alex.id },
  })

  // ── 11. Financial transactions ──────────────────────────────────────────
  console.log("   creating financial transactions...")
  await db.clubTransaction.create({
    data: { clubId: club.id, type: "revenue", amount: 500, category: "Sponsorship", description: "Local hardware store sponsorship", date: daysAgo(20), createdBy: alex.id },
  })
  await db.clubTransaction.create({
    data: { clubId: club.id, type: "revenue", amount: 320, category: "Fundraiser", description: "Bake sale proceeds", date: daysAgo(12), createdBy: alex.id },
  })
  await db.clubTransaction.create({
    data: { clubId: club.id, type: "expense", amount: 180, category: "Supplies", description: "Aluminum stock + fasteners", date: daysAgo(9), createdBy: alex.id },
  })
  await db.clubTransaction.create({
    data: { clubId: club.id, type: "expense", amount: 75, category: "Transportation", description: "Van rental for demo", date: daysAgo(4), createdBy: alex.id },
  })

  // ── 12. Activity log + welcome notification ────────────────────────────
  console.log("   creating activity log + notification...")
  await db.activityLog.create({
    data: { clubId: club.id, actorUserId: alex.id, actionType: "club_created", targetType: "club", targetId: club.id, description: `${alex.name} created the club "${club.name}"` },
  })
  await db.notification.create({
    data: {
      userId: alex.id, clubId: club.id, type: "new_announcement",
      message: `Welcome to ClubHub, ${alex.name}! Your Robotics Club is ready to go.`,
      linkUrl: "?view=dashboard",
    },
  })

  // ── Done ───────────────────────────────────────────────────────────────
  console.log("")
  console.log("Example account created successfully!")
  console.log("")
  console.log("   Login with:")
  console.log(`     Email:    ${EXAMPLE_EMAIL}`)
  console.log(`     Password: ${EXAMPLE_PASSWORD}`)
  console.log("")
  console.log(`   Club:      ${CLUB_NAME}`)
  console.log(`   Club code: ${CLUB_CODE}`)
  console.log(`   Join pass: ${CLUB_PASSWORD}`)
  console.log("")
  console.log(`   Seeded: 1 club, ${1 + EXTRA_MEMBERS.length} members, 3 teams, 6 tasks,`)
  console.log(`           3 meetings, 4 announcements, ${hoursRows.length + 1} hours entries,`)
  console.log("           6 chat messages, 2 badges, 4 transactions.")
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error("Seed failed:", e)
    db.$disconnect()
    process.exit(1)
  })
