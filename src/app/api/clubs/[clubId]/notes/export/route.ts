import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"
import { buildVisibilityFilter, noteVisibleTo } from "@/app/api/clubs/[clubId]/notes/route"

/** GET /api/clubs/[clubId]/notes/export — stream a markdown bundle of all
 *  notes visible to the current user. Content-Disposition triggers a browser
 *  download. Bounded by the same visibility filter as the list endpoint —
 *  a member only ever exports notes they can read. */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  // Fetch notes + club name in parallel. Bounded by 500 (the per-club cap).
  // Viewer visibility is applied JS-side (SQLite has no JSON filters).
  const [allNotes, club] = await Promise.all([
    db.clubNote.findMany({
      where: buildVisibilityFilter(clubId, c.user.id),
      orderBy: { createdAt: "asc" },
      take: 500,
      include: {
        author: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    }),
    db.club.findUnique({ where: { id: clubId }, select: { name: true } }),
  ])
  const notes = allNotes.filter((n) => noteVisibleTo(n, c.user.id))

  const clubName = club?.name ?? "Club"
  const exportDate = new Date().toISOString()

  // Markdown assembly — kept simple so the file size scales linearly with
  // note count. No escaping: backticks in note content COULD conflict with
  // our ``` fences, but Discord-forum-style notes are short prose, not
  // code blocks — and a stray triple-backtick would at worst break markdown
  // rendering, not the export itself.
  const chunks: string[] = []
  chunks.push(`# ClubHub Notes — ${clubName}`)
  chunks.push(`Exported ${exportDate}`)
  chunks.push("")
  chunks.push(`_${notes.length} note${notes.length === 1 ? "" : "s"}_`)
  chunks.push("")

  for (const n of notes) {
    chunks.push("---")
    chunks.push("")
    chunks.push(`## ${n.title?.trim() || "Untitled"}`)
    chunks.push(`*By ${n.author?.name ?? "Unknown"}, ${n.createdAt.toISOString()}*`)
    const tagNames = n.tags.map((t) => t.tag?.name).filter(Boolean)
    if (tagNames.length > 0) {
      chunks.push(`Tags: ${tagNames.map((t) => `#${t}`).join(", ")}`)
    }
    if (n.isPrivate) chunks.push("_private_")
    chunks.push("")
    chunks.push(n.content)
    chunks.push("")
  }

  const markdown = chunks.join("\n")

  // Filename: lowercase club name + ISO date stamp. We strip characters that
  // are problematic in filenames on common OSes.
  const safeClub = clubName.replace(/[^\w-]+/g, "_").toLowerCase().slice(0, 40) || "club"
  const dateStamp = exportDate.slice(0, 10) // YYYY-MM-DD
  const filename = `clubhub-notes-${safeClub}-${dateStamp}.md`

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
