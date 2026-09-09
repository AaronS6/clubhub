import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/search?q=<query>
 * Requires active membership of the club. Returns categorized matches for
 * members, tasks, announcements, and meetings within this club.
 *
 * Notes:
 *   - SQLite's LIKE is ASCII-case-insensitive by default, so we use plain
 *     `contains` (no `mode: 'insensitive'`, which SQLite does not support).
 *   - q must be at least 1 char (after trim); empty/whitespace returns empty arrays.
 *   - Soft-deleted tasks/announcements and cancelled meetings are excluded.
 *   - Each category is capped at 8 results.
 */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const url = new URL(req.url)
    const qRaw = (url.searchParams.get("q") ?? "").trim()
    if (!qRaw) {
      return json({ members: [], tasks: [], announcements: [], meetings: [] })
    }
    // Bounded to a sane length to avoid pathological LIKE patterns.
    const q = qRaw.slice(0, 200)
    const LIMIT = 8

    const [members, tasks, announcements, meetings] = await Promise.all([
      db.clubMember.findMany({
        where: {
          clubId,
          status: "active",
          OR: [
            { user: { name: { contains: q } } },
            { user: { email: { contains: q } } },
          ],
        },
        take: LIMIT,
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        orderBy: [{ role: "desc" }, { joinedAt: "asc" }],
      }),
      db.task.findMany({
        where: {
          clubId,
          deletedAt: null,
          title: { contains: q },
        },
        take: LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      }),
      db.announcement.findMany({
        where: {
          clubId,
          deletedAt: null,
          title: { contains: q },
        },
        take: LIMIT,
        select: {
          id: true,
          title: true,
          createdAt: true,
          isPinned: true,
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      }),
      db.meeting.findMany({
        where: {
          clubId,
          cancelledAt: null,
          title: { contains: q },
        },
        take: LIMIT,
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          location: true,
        },
        orderBy: { startTime: "asc" },
      }),
    ])

    return json({
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl ?? null,
        role: m.role as "member" | "executive",
        type: "member" as const,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
        type: "task" as const,
      })),
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        createdAt: a.createdAt,
        isPinned: a.isPinned,
        type: "announcement" as const,
      })),
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        startTime: m.startTime,
        endTime: m.endTime,
        location: m.location,
        type: "meeting" as const,
      })),
    })

  } catch (err: any) {
    console.error("[clubs/search GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to search club: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
