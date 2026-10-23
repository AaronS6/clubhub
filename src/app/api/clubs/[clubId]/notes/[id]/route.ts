import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import {
  shapeNote,
  normalizeContent,
  NOTES_CONSTANTS,
} from "@/app/api/clubs/[clubId]/notes/route"

const { MAX_TITLE, MAX_CONTENT } = NOTES_CONSTANTS

// ---------------------------------------------------------------------------
// PATCH /api/clubs/[clubId]/notes/[id] — edit note (author only)
//   Execs can delete but NOT edit others' notes — by design, so an exec's
//   personal framing never accidentally rewrites a member's note.
// ---------------------------------------------------------------------------

export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const note = await db.clubNote.findFirst({ where: { id, clubId, deletedAt: null } })
  if (!note) return error("Note not found", 404)
  if (note.authorId !== c.user.id)
    return error("Only the author can edit this note", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { title, content, tagIds, isPrivate, sharedWith } = body as {
    title?: string | null
    content?: string
    tagIds?: string[]
    isPrivate?: boolean
    sharedWith?: string[]
  }

  const data: any = {}

  if (title !== undefined) {
    if (title === null) {
      data.title = null
    } else {
      if (typeof title !== "string") return error("Title must be a string", 400)
      // Normalize title: collapse whitespace, cap at MAX_TITLE.
      const normalizedTitle = title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE)
      data.title = normalizedTitle.length === 0 ? null : normalizedTitle
    }
  }
  if (content !== undefined) {
    if (typeof content !== "string") return error("Content must be a string", 400)
    // Normalize BEFORE length check — same as POST. Trailing whitespace gets
    // stripped, 3+ newlines collapse to 2, etc. (see normalizeContent docs).
    const normalized = normalizeContent(content)
    if (normalized.length === 0) return error("Content cannot be empty", 400)
    if (normalized.length > MAX_CONTENT)
      return error(`Content must be ${MAX_CONTENT} characters or fewer (after whitespace normalization)`, 400)
    data.content = normalized
  }
  if (isPrivate !== undefined) {
    data.isPrivate = !!isPrivate
  }
  if (sharedWith !== undefined) {
    if (!Array.isArray(sharedWith)) return error("sharedWith must be an array", 400)
    const cleaned = sharedWith.filter((u): u is string => typeof u === "string" && u.length > 0)
    if (new Set(cleaned).size !== cleaned.length)
      return error("Duplicate member in sharedWith", 400)
    if (cleaned.length > 0) {
      const validMembers = await db.clubMember.findMany({
        where: { clubId, status: "active", userId: { in: cleaned } },
        select: { userId: true },
      })
      if (validMembers.length !== cleaned.length)
        return error("One or more sharedWith users are not active members of this club", 400)
    }
    // When the note is public, sharedWith is irrelevant — store SQL NULL via
    // Prisma.JsonNull (the Prisma sentinel for "set this Json? column to NULL"
    // — plain null means JSON null and won't compile).
    const effectivePrivate = isPrivate !== undefined ? !!isPrivate : note.isPrivate
    data.sharedWith = effectivePrivate ? cleaned : Prisma.JsonNull
  }

  // Tag updates: replace the entire assignment set if tagIds was provided.
  const parsedTagIds = Array.isArray(tagIds)
    ? tagIds.filter((t): t is string => typeof t === "string" && t.length > 0)
    : null
  if (parsedTagIds !== null) {
    if (new Set(parsedTagIds).size !== parsedTagIds.length)
      return error("Duplicate tag in request", 400)
    if (parsedTagIds.length > 0) {
      const validTags = await db.noteTag.findMany({
        where: { id: { in: parsedTagIds }, clubId },
        select: { id: true },
      })
      if (validTags.length !== parsedTagIds.length)
        return error("One or more tags do not belong to this club", 400)
    }
  }

  // Apply edits + tag swaps in a transaction.
  await db.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.clubNote.update({ where: { id: note.id }, data })
    }
    if (parsedTagIds !== null) {
      await tx.noteTagAssignment.deleteMany({ where: { noteId: note.id } })
      if (parsedTagIds.length > 0) {
        await tx.noteTagAssignment.createMany({
          data: parsedTagIds.map((tagId) => ({ noteId: note.id, tagId })),
        })
      }
    }
  })

  const fresh = await db.clubNote.findUnique({
    where: { id: note.id },
    include: {
      author: { select: { name: true, avatarUrl: true } },
      hearts: { where: { userId: c.user.id }, select: { userId: true } },
      _count: { select: { hearts: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  })

  await emitClubEvent(clubId, "note_updated", { noteId: note.id })

  return json({ note: fresh ? shapeNote(fresh, c.user.id) : null })
}

// ---------------------------------------------------------------------------
// DELETE /api/clubs/[clubId]/notes/[id] — soft-delete (author OR exec)
//   Soft-delete sets deletedAt; the note becomes invisible everywhere. The
//   cleanup script (out of scope) can hard-delete notes with deletedAt set
//   after a retention window.
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const note = await db.clubNote.findFirst({ where: { id, clubId, deletedAt: null } })
  if (!note) return error("Note not found", 404)
  const isAuthor = note.authorId === c.user.id
  const isExec = c.membership.role === "executive"
  if (!isAuthor && !isExec)
    return error("You can only delete your own notes (execs can delete any)", 403)

  await db.clubNote.update({ where: { id: note.id }, data: { deletedAt: new Date() } })

  await emitClubEvent(clubId, "note_deleted", { noteId: note.id })

  return json({ ok: true })
}
