import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { normalizeTagName, NOTES_CONSTANTS } from "@/app/api/clubs/[clubId]/notes/route"

const { MAX_TAGS_PER_CLUB, MAX_TAG_NAME } = NOTES_CONSTANTS

// Hex color regex — must be a 7-char string (#RRGGBB). Optional.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** GET /api/clubs/[clubId]/tags — list all custom tags for this club with
 *  usage counts. Any active member can read this (it powers the tag picker
 *  in the notes composer). */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const tags = await db.noteTag.findMany({
    where: { clubId },
    orderBy: { name: "asc" },
    take: MAX_TAGS_PER_CLUB,
    include: { _count: { select: { assignments: true } } },
  })

  const totalTags = await db.noteTag.count({ where: { clubId } })

  return json({
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? null,
      usageCount: t._count.assignments,
    })),
    totalTags,
    caps: { maxTagsPerClub: MAX_TAGS_PER_CLUB, maxTagNameChars: MAX_TAG_NAME },
    myRole: c.membership.role,
  })
}

/** POST /api/clubs/[clubId]/tags — create a tag (any active member, Discord
 *  forum style). Validates name ≤40 chars, max 50 tags per club, unique name
 *  within the club (case-insensitive). */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { name, color } = body as { name?: string; color?: string }

  if (typeof name !== "string" || name.trim().length === 0)
    return error("Tag name is required", 400)
  // Normalize: collapse whitespace, cap at MAX_TAG_NAME (24 chars).
  const normalizedName = normalizeTagName(name)
  if (normalizedName.length === 0)
    return error("Tag name is required", 400)
  if (name.length > MAX_TAG_NAME && normalizedName.length === MAX_TAG_NAME)
    return error(`Tag name must be ${MAX_TAG_NAME} characters or fewer`, 400)

  if (color !== undefined && color !== null && color !== "") {
    if (typeof color !== "string" || !HEX_COLOR_RE.test(color))
      return error("Color must be a 7-character hex string like #1f7a4d", 400)
  }

  // Cap enforcement.
  const tagCount = await db.noteTag.count({ where: { clubId } })
  if (tagCount >= MAX_TAGS_PER_CLUB)
    return error(
      `This club has reached the ${MAX_TAGS_PER_CLUB}-tag cap. Remove an unused tag first.`,
      400,
    )

  // Unique name (case-insensitive). SQLite doesn't support
  // `mode: "insensitive"` on string filters, so we fetch all tag names for
  // the club (bounded by the 30-tag cap) and do the case-insensitive
  // comparison in JS. Postgres production also benefits — the @@unique
  // constraint is case-sensitive, so this pre-check is the only thing that
  // prevents "Ideas" + "ideas" duplicates.
  const existingTags = await db.noteTag.findMany({
    where: { clubId },
    select: { name: true },
    take: MAX_TAGS_PER_CLUB,
  })
  const lowerNormalized = normalizedName.toLowerCase()
  if (existingTags.some((t) => t.name.toLowerCase() === lowerNormalized)) {
    return error("A tag with that name already exists", 400)
  }

  try {
    const tag = await db.noteTag.create({
      data: {
        clubId,
        name: normalizedName,
        color: color && color.trim() !== "" ? color.trim() : null,
        createdBy: c.user.id,
      },
      include: { _count: { select: { assignments: true } } },
    })

    await emitClubEvent(clubId, "note_tag_created", { tagId: tag.id })

    return json(
      {
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color ?? null,
          usageCount: tag._count.assignments,
        },
      },
      201,
    )
  } catch (e: any) {
    // Race condition: another member created the same name between our
    // pre-check and our insert. Fall back to the friendly message.
    if (e?.code === "P2002") return error("A tag with that name already exists", 400)
    throw e
  }
}
