import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

/** POST /api/clubs/[clubId]/notes/[id]/heart — toggle heart.
 *  Idempotent-ish: if a heart exists, delete it; if not, create it.
 *  Returns the new hearted state + count so the UI can update optimistically. */
export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const note = await db.clubNote.findFirst({ where: { id, clubId, deletedAt: null } })
  if (!note) return error("Note not found", 404)

  // Visibility check: a private note only lets author + sharedWith users
  // heart it. (Public notes can be hearted by any active member.)
  if (note.isPrivate && note.authorId !== c.user.id) {
    const sharedList: string[] = Array.isArray(note.sharedWith)
      ? note.sharedWith.filter((x): x is string => typeof x === "string")
      : []
    if (!sharedList.includes(c.user.id)) return error("Note not found", 404)
  }

  const existing = await db.noteHeart.findUnique({
    where: { noteId_userId: { noteId: note.id, userId: c.user.id } },
  })

  let hearted: boolean
  if (existing) {
    await db.noteHeart.delete({ where: { id: existing.id } })
    hearted = false
  } else {
    await db.noteHeart.create({ data: { noteId: note.id, userId: c.user.id } })
    hearted = true
  }

  const heartCount = await db.noteHeart.count({ where: { noteId: note.id } })

  // Realtime: notify other viewers in the club to re-fetch the heart counts.
  await emitClubEvent(clubId, "note_hearted", { noteId: note.id })

  return json({ hearted, heartCount })
}
