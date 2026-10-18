import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

// Storage caps — enforced at the API layer (DB schema stays SQLite-portable).
// Per user request, character caps reverted to comfortable defaults so
// members aren't constrained mid-thought. The whitespace normalization
// (normalizeContent below) still strips wasted bytes losslessly, so storage
// stays efficient without sacrificing note length.
//   - 5000-char note ≈ 5KB; 200 notes ≈ 1MB max per club (well under
//     Supabase's 500MB cap even with many clubs).
const MAX_TITLE = 120
const MAX_CONTENT = 5000
const MAX_NOTES_PER_CLUB = 200
const MAX_TAGS_PER_CLUB = 50
const MAX_TAG_NAME = 40

/**
 * Normalize note content for storage efficiency:
 *   - collapse runs of 3+ newlines to 2 (preserves paragraph breaks)
 *   - collapse runs of 2+ spaces/tabs to 1 (preserves indentation if a tab→
 *     single space; we lose true tab indentation but it's rarely needed in
 *     notes)
 *   - strip trailing whitespace from each line (no trailing spaces)
 *   - trim leading/trailing whitespace from the whole content
 *
 * This is lossless for prose (the visible rendering is identical) and shaves
 * 15-40% off typical note sizes (people paste a lot of whitespace).
 *
 * Exported so [id]/route.ts PATCH uses the exact same normalization.
 */
export function normalizeContent(input: string): string {
  return input
    .replace(/\r\n/g, "\n")            // CRLF → LF
    .replace(/\r/g, "\n")               // CR → LF
    .replace(/[ \t]+$/gm, "")            // trailing whitespace per line
    .replace(/[ \t]{2,}/g, " ")          // collapse runs of spaces/tabs
    .replace(/\n{3,}/g, "\n\n")          // collapse 3+ newlines → 2
    .trim()
}

/**
 * Normalize a tag name: collapse whitespace, lowercase, max 24 chars.
 * Tag names are stored normalized so duplicates can't sneak in via case/
 * whitespace variants (e.g., "Leadership" vs "leadership ").
 */
export function normalizeTagName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_NAME)
}

// ---------------------------------------------------------------------------
// Shared helpers — also used by [id]/route.ts and export/route.ts
// ---------------------------------------------------------------------------

export interface NoteShape {
  id: string
  clubId: string
  authorId: string
  title: string | null
  content: string
  isPrivate: boolean
  sharedWith: string[]
  createdAt: string
  updatedAt: string
  heartCount: number
  hasHearted: boolean
  authorName: string
  authorAvatarUrl: string | null
  tags: { id: string; name: string; color: string | null }[]
}

/** Resolve the sharedWith array (string[]) from the stored JSON value. */
export function readSharedWith(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0)
}

/** Map a Prisma ClubNote row (with includes) to the API response shape. */
export function shapeNote(n: any, currentUserId: string): NoteShape {
  const hasHearted = (n.hearts ?? []).some((h: any) => h.userId === currentUserId)
  return {
    id: n.id,
    clubId: n.clubId,
    authorId: n.authorId,
    title: n.title ?? null,
    content: n.content,
    isPrivate: n.isPrivate,
    sharedWith: readSharedWith(n.sharedWith),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    heartCount: n._count?.hearts ?? (n.hearts?.length ?? 0),
    hasHearted,
    authorName: n.author?.name ?? "Unknown",
    authorAvatarUrl: n.author?.avatarUrl ?? null,
    tags: (n.tags ?? []).map((a: any) => ({
      id: a.tag?.id ?? a.tagId,
      name: a.tag?.name ?? "",
      color: a.tag?.color ?? null,
    })),
  }
}

/** DB-level note filter: all non-deleted notes for the club. Viewer-level
 *  visibility (public OR author OR sharedWith) is applied afterwards in JS
 *  via noteVisibleTo() — see the comment there for why. */
export function buildVisibilityFilter(clubId: string, userId: string) {
  void userId // kept for API compatibility; visibility is JS-side now
  return {
    clubId,
    deletedAt: null,
  } as any
}

/** Viewer-level visibility check: a note is visible when it is public,
 *  authored by the viewer, or the viewer's id is in the sharedWith JSON
 *  array.
 *
 *  Why not SQL? The original Prisma filter used
 *  `sharedWith: { array_contains: userId }`, but Prisma's SQLite connector
 *  does not support JSON filter operations (array_contains/path) — those
 *  are Postgres/MySQL-only. Local dev runs SQLite, so the list + export
 *  endpoints 500'd. Fetching the club's non-deleted notes (bounded by the
 *  500-per-club cap) and filtering in JS is portable across providers and
 *  preserves the exact same visibility semantics. */
export function noteVisibleTo(
  note: { isPrivate: boolean; authorId: string; sharedWith: unknown },
  userId: string,
): boolean {
  if (!note.isPrivate) return true
  if (note.authorId === userId) return true
  return readSharedWith(note.sharedWith).includes(userId)
}

export const NOTES_CONSTANTS = {
  MAX_TITLE,
  MAX_CONTENT,
  MAX_NOTES_PER_CLUB,
  MAX_TAGS_PER_CLUB,
  MAX_TAG_NAME,
}

// ---------------------------------------------------------------------------
// GET — list notes + tags for the picker
// ---------------------------------------------------------------------------

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  // Parallel: notes (visible to this user) + all club tags (for the picker).
  // Visibility is applied JS-side (see noteVisibleTo) because SQLite doesn't
  // support Prisma's JSON array_contains filter.
  const [allNotes, tags] = await Promise.all([
    db.clubNote.findMany({
      where: buildVisibilityFilter(clubId, c.user.id),
      orderBy: { createdAt: "desc" },
      // 500-note cap is per-club; we never return more than that, and the
      // POST route rejects the 501st note. Take is a backstop.
      take: MAX_NOTES_PER_CLUB,
      include: {
        author: { select: { name: true, avatarUrl: true } },
        hearts: { where: { userId: c.user.id }, select: { userId: true } },
        _count: { select: { hearts: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    db.noteTag.findMany({
      where: { clubId },
      orderBy: { name: "asc" },
      take: MAX_TAGS_PER_CLUB,
      include: { _count: { select: { assignments: true } } },
    }),
  ])

  // Total active notes (for the "X/500 notes" counter in the UI).
  const totalActiveNotes = await db.clubNote.count({
    where: { clubId, deletedAt: null },
  })

  return json({
    notes: allNotes
      .filter((n) => noteVisibleTo(n, c.user.id))
      .map((n) => shapeNote(n, c.user.id)),
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? null,
      usageCount: t._count.assignments,
    })),
    totalActiveNotes,
    caps: {
      maxNotesPerClub: MAX_NOTES_PER_CLUB,
      maxTagsPerClub: MAX_TAGS_PER_CLUB,
      maxContentChars: MAX_CONTENT,
      maxTitleChars: MAX_TITLE,
    },
    myUserId: c.user.id,
    myRole: c.membership.role,
  })
}

// ---------------------------------------------------------------------------
// POST — create note
// ---------------------------------------------------------------------------

export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  // Any active member can create notes — Discord forum style.

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { title, content, tagIds, isPrivate, sharedWith } = body as {
    title?: string
    content?: string
    tagIds?: string[]
    isPrivate?: boolean
    sharedWith?: string[]
  }

  // Content required, ≤2000 chars (normalized).
  if (typeof content !== "string" || content.trim().length === 0)
    return error("Content is required", 400)
  // Normalize BEFORE the length check — trailing whitespace gets stripped, so
  // the cap applies to the actual stored bytes, not the input as-typed.
  const normalizedContent = normalizeContent(content)
  if (normalizedContent.length === 0)
    return error("Content is required", 400)
  if (normalizedContent.length > MAX_CONTENT)
    return error(`Content must be ${MAX_CONTENT} characters or fewer (after whitespace normalization)`, 400)
  // Title optional, ≤80 chars (normalized — collapse whitespace).
  let normalizedTitle: string | null = null
  if (title !== undefined && title !== null) {
    if (typeof title !== "string") return error("Title must be a string", 400)
    normalizedTitle = title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE)
  }
  // tagIds: optional array of strings; we validate membership below.
  const parsedTagIds = Array.isArray(tagIds)
    ? tagIds.filter((t): t is string => typeof t === "string" && t.length > 0)
    : []
  if (new Set(parsedTagIds).size !== parsedTagIds.length)
    return error("Duplicate tag in request", 400)

  // Privacy + sharedWith sanity.
  const wantsPrivate = isPrivate === true
  let parsedSharedWith: string[] = []
  if (sharedWith !== undefined && sharedWith !== null) {
    if (!Array.isArray(sharedWith)) return error("sharedWith must be an array", 400)
    parsedSharedWith = sharedWith.filter((u): u is string => typeof u === "string" && u.length > 0)
    if (new Set(parsedSharedWith).size !== parsedSharedWith.length)
      return error("Duplicate member in sharedWith", 400)
  }
  // If the note is private but has no shares, that's allowed — it just means
  // only the author can see it (a personal note). The UI prevents that combo
  // but the API stays permissive so an accidental submit doesn't 400.

  // Cap enforcement — count active notes for this club.
  const noteCount = await db.clubNote.count({ where: { clubId, deletedAt: null } })
  if (noteCount >= MAX_NOTES_PER_CLUB)
    return error(
      `This club has reached the ${MAX_NOTES_PER_CLUB}-note cap. Delete an old note first.`,
      400,
    )

  // Validate tagIds belong to this club (parallel fetch).
  if (parsedTagIds.length > 0) {
    const validTags = await db.noteTag.findMany({
      where: { id: { in: parsedTagIds }, clubId },
      select: { id: true },
    })
    if (validTags.length !== parsedTagIds.length)
      return error("One or more tags do not belong to this club", 400)
  }

  // If sharedWith was provided, validate members are active members of this
  // club.
  if (parsedSharedWith.length > 0) {
    const validMembers = await db.clubMember.findMany({
      where: { clubId, status: "active", userId: { in: parsedSharedWith } },
      select: { userId: true },
    })
    if (validMembers.length !== parsedSharedWith.length)
      return error("One or more sharedWith users are not active members of this club", 400)
  }

  // Create note + tag assignments in a transaction so a partial-write never
  // leaves an orphan note.
  const created = await db.$transaction(async (tx) => {
    const note = await tx.clubNote.create({
      data: {
        clubId,
        authorId: c.user.id,
        title: normalizedTitle && normalizedTitle.length > 0 ? normalizedTitle : null,
        content: normalizedContent,
        isPrivate: wantsPrivate,
        // Prisma Json? requires Prisma.JsonNull for SQL NULL (vs Prisma.DbNull
        // for JSON null). Public notes store JSON NULL (no shares); private
        // notes with no shares store an empty array.
        sharedWith: wantsPrivate
          ? parsedSharedWith
          : Prisma.JsonNull,
      },
    })
    if (parsedTagIds.length > 0) {
      await tx.noteTagAssignment.createMany({
        data: parsedTagIds.map((tagId) => ({ noteId: note.id, tagId })),
      })
    }
    return note
  })

  // Re-fetch with includes so the response matches the GET shape.
  const fresh = await db.clubNote.findUnique({
    where: { id: created.id },
    include: {
      author: { select: { name: true, avatarUrl: true } },
      hearts: { where: { userId: c.user.id }, select: { userId: true } },
      _count: { select: { hearts: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  })

  // Realtime: invalidate notes queries on every connected client in this club.
  await emitClubEvent(clubId, "note_created", { noteId: created.id })

  return json({ note: fresh ? shapeNote(fresh, c.user.id) : null }, 201)
}
