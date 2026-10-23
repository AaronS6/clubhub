import { db } from "../src/lib/db"
async function check() {
  try {
    const clubs = await db.club.findMany({ take: 1, select: { id: true, mainGoal: true } })
    console.log("✓ Club.mainGoal queryable, sample:", JSON.stringify(clubs[0] ?? "none"))
    const teams = await db.team.findMany({ take: 1, select: { id: true, mainIdea: true } })
    console.log("✓ Team.mainIdea queryable, sample:", JSON.stringify(teams[0] ?? "none"))
    const notes = await db.clubNote.findMany({ take: 1 })
    console.log("✓ ClubNote table queryable, count:", notes.length)
    const tags = await db.noteTag.findMany({ take: 1 })
    console.log("✓ NoteTag table queryable, count:", tags.length)
    const hearts = await db.noteHeart.findMany({ take: 1 })
    console.log("✓ NoteHeart table queryable, count:", hearts.length)
  } catch (e: any) {
    console.log("✗ Prisma error:", e.message)
    if (e.code) console.log("  code:", e.code)
  }
  process.exit(0)
}
check()
