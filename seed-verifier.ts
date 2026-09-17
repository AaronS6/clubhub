import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"

const prisma = new PrismaClient()

// Replicate club-crypto fallback primary key (no env set in .env)
const ENC_KEY = crypto.createHash("sha256").update("clubhub-default-enc-key-v1").digest()

function encryptClubPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":")
}

function genCode(): string {
  // 6-char human-friendly code (no ambiguous chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = ""
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

async function main() {
  const email = "verifier@example.com"
  const password = "verify1234"

  // 1) Create / update the verifier user
  const hash = await bcrypt.hash(password, 10)
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    user = await prisma.user.create({
      data: { name: "Verifier", email, passwordHash: hash, emailVerified: true },
    })
    console.log("[seed] created user", user.email, user.id)
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: "Verifier", passwordHash: hash, emailVerified: true },
    })
    console.log("[seed] updated user", user.email, user.id)
  }

  // 2) Create / fetch clubs
  const clubs = [
    {
      name: "Robotics Club",
      description: "Build robots, win competitions, mentor new members.",
      accentColor: "#2563eb",
      joinPw: "robo1234",
    },
    {
      name: "Volunteer Corps",
      description: "Community service hours and outreach events.",
      accentColor: "#16a34a",
      joinPw: "volun1234",
    },
  ]

  const createdClubs: Record<string, { id: string }> = {}

  for (const c of clubs) {
    let club = await prisma.club.findFirst({ where: { name: c.name } })
    if (!club) {
      club = await prisma.club.create({
        data: {
          name: c.name,
          description: c.description,
          accentColor: c.accentColor,
          clubCode: genCode(),
          clubPasswordEnc: encryptClubPassword(c.joinPw),
          hoursGoal: 200,
          createdBy: user.id,
        },
      })
      console.log("[seed] created club", club.name, club.id, "code:", club.clubCode)
    } else {
      console.log("[seed] club exists", club.name, club.id)
    }
    createdClubs[c.name] = { id: club.id }
  }

  // 3) Memberships: exec of Robotics Club, member of Volunteer Corps
  async function ensureMember(clubId: string, role: "executive" | "member") {
    const existing = await prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId: user!.id } },
    })
    if (!existing) {
      await prisma.clubMember.create({
        data: { clubId, userId: user!.id, role, status: "active" },
      })
      console.log("[seed] membership", role, "for", user!.email, "in", clubId)
    } else {
      await prisma.clubMember.update({
        where: { id: existing.id },
        data: { role, status: "active" },
      })
      console.log("[seed] membership updated", role, "for", user!.email, "in", clubId)
    }
  }
  await ensureMember(createdClubs["Robotics Club"].id, "executive")
  await ensureMember(createdClubs["Volunteer Corps"].id, "member")

  // 4) A team in Robotics Club (for Fix 3) + verifier as team member
  const roboId = createdClubs["Robotics Club"].id
  let team = await prisma.team.findFirst({ where: { clubId: roboId, name: "Build Team" } })
  if (!team) {
    team = await prisma.team.create({
      data: {
        clubId: roboId,
        name: "Build Team",
        description: "Core build & prototyping crew for the competition robot.",
      },
    })
    console.log("[seed] created team", team.name, team.id)
  } else {
    console.log("[seed] team exists", team.name, team.id)
  }
  const tmExisting = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
  })
  if (!tmExisting) {
    await prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } })
    console.log("[seed] added verifier to team")
  }

  // A couple more members in Robotics Club so the roster looks populated (uses
  // existing demo users if present, else creates lightweight ones).
  const extraEmails = ["riley@demo.clubhub.test", "casey@demo.clubhub.test"]
  for (const e of extraEmails) {
    let m = await prisma.user.findUnique({ where: { email: e } })
    if (!m) {
      m = await prisma.user.create({
        data: { name: e.split("@")[0].replace(/^\w/, (c) => c.toUpperCase()), email: e, passwordHash: await bcrypt.hash("pw123456", 10), emailVerified: true },
      })
    }
    await ensureMember(roboId, "member")
    // ensure this extra user is a member of Robotics Club
    const ex = await prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId: roboId, userId: m.id } },
    })
    if (!ex) {
      await prisma.clubMember.create({ data: { clubId: roboId, userId: m.id, role: "member", status: "active" } })
    }
    const tmEx = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: m.id } },
    })
    if (!tmEx) {
      await prisma.teamMember.create({ data: { teamId: team.id, userId: m.id } })
      console.log("[seed] added", e, "to team")
    }
  }

  console.log("[seed] DONE")
}

main()
  .catch((e) => {
    console.error("[seed] ERROR:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
