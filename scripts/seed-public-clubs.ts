/**
 * ============================================================================
 * seed-public-clubs.ts
 * ============================================================================
 *
 * Adds two extra DEMO clubs that are listed in the public directory so the
 * landing page's "Explore clubs" section feels alive (real banners, real
 * descriptions, real member counts). The main example club (Robotics) is
 * created by seed-example-account.ts — this script only adds the extra
 * public-directory clubs and flags the Robotics Club as listed.
 *
 * Clubs created (idempotent — re-running cleans them up first):
 *   - Photography Club   (code PHOTOS1, accent amber,  banner /banners/photography-banner.jpg)
 *   - Debate Society     (code DEBATE,  accent indigo, banner /banners/debate-banner.jpg)
 *
 * Both are exec-owned by the example account (alex@clubhub.example) with a
 * couple of example members so the member counts look real. Join passwords
 * are printed here for demo convenience.
 *
 * Usage:
 *   cd /home/z/my-project
 *   bun run scripts/seed-public-clubs.ts
 * ============================================================================
 */

import { db } from "../src/lib/db"
import { hashPassword } from "../src/lib/auth"
import { encryptClubPassword } from "../src/lib/club-crypto"

const OWNER_EMAIL = "alex@clubhub.example"

const PUBLIC_CLUBS = [
  {
    name: "Photography Club",
    code: "PHOTOS1",
    password: "photos2026",
    accent: "#d97706",
    banner: "/banners/photography-banner.jpg",
    joinMode: "code",
    description:
      "From darkroom fundamentals to street-walk shoots — we explore photography together and run the school's annual photo exhibition. Cameras provided, no experience needed.",
    members: [
      { name: "Lena Kowalski", email: "lena@clubhub.example", bio: "Film photography enthusiast." },
      { name: "Marcus Webb", email: "marcus@clubhub.example", bio: "Sports and action shots." },
      { name: "Aisha Bello", email: "aisha@clubhub.example", bio: "Portrait photographer." },
    ],
  },
  {
    name: "Debate Society",
    code: "DEBATE",
    password: "debate2026",
    accent: "#6366f1",
    banner: "/banners/debate-banner.jpg",
    joinMode: "request",
    description:
      "Weekly practice rounds, regional tournaments, and public-speaking workshops. Learn to build an argument, think on your feet, and win the room. All levels welcome.",
    members: [
      { name: "Rohan Mehta", email: "rohan@clubhub.example", bio: "Policy debate lead." },
      { name: "Chloe Fontaine", email: "chloe@clubhub.example", bio: "Loves rebuttals." },
    ],
  },
]

async function main() {
  console.log("Seeding public-directory clubs...")

  const owner = await db.user.findUnique({ where: { email: OWNER_EMAIL } })
  if (!owner) {
    console.error(`Owner account ${OWNER_EMAIL} not found — run seed-example-account.ts first.`)
    process.exit(1)
  }

  // ── Idempotent cleanup: remove previous versions of these demo clubs ──
  for (const c of PUBLIC_CLUBS) {
    const existing = await db.club.findUnique({ where: { clubCode: c.code } })
    if (existing) {
      await db.club.delete({ where: { id: existing.id } })
      console.log(`   cleaned up existing ${c.name}`)
    }
  }
  // Clean up the extra demo member users (cascade removes memberships).
  const emails = PUBLIC_CLUBS.flatMap((c) => c.members.map((m) => m.email))
  await db.user.deleteMany({ where: { email: { in: emails } } })

  // Make sure the main example club is listed publicly too.
  await db.club.updateMany({
    where: { clubCode: "ROBOTIX" },
    data: { isListedPublic: true },
  })

  for (const c of PUBLIC_CLUBS) {
    const club = await db.club.create({
      data: {
        name: c.name,
        description: c.description,
        accentColor: c.accent,
        bannerUrl: c.banner,
        bannerFocalY: 0.5,
        isListedPublic: true,
        joinMode: c.joinMode,
        clubCode: c.code,
        clubPasswordEnc: encryptClubPassword(c.password),
        createdBy: owner.id,
        members: { create: { userId: owner.id, role: "executive" } },
      },
    })

    for (const m of c.members) {
      const u = await db.user.create({
        data: {
          name: m.name,
          email: m.email,
          passwordHash: await hashPassword(`${c.password}!`),
          emailVerified: true,
          bio: m.bio,
          memberships: { create: { clubId: club.id, role: "member" } },
        },
      })
      void u
    }

    console.log(`   created ${c.name} (code ${c.code}, ${c.members.length + 1} members)`)
  }

  console.log("\nPublic directory clubs seeded:")
  for (const c of PUBLIC_CLUBS) {
    console.log(
      `   ${c.name} — code ${c.code}, ${
        c.joinMode === "request" ? "REQUEST-TO-JOIN mode" : `join pass "${c.password}"`
      }`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .then(() => process.exit(0))
