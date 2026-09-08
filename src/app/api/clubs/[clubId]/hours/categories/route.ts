import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/hours/categories
 * Available to all members. Returns the list of service categories for the club.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const cats = await db.serviceCategory.findMany({
    where: { clubId },
    orderBy: { name: "asc" },
    include: { _count: { select: { serviceHours: true } } },
  })
  return json({
    categories: cats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      createdAt: cat.createdAt,
      hoursCount: cat._count.serviceHours,
    })),
    myRole: c.membership.role,
  })
}

/**
 * POST /api/clubs/[clubId]/hours/categories
 * Executive-only. Body: { name: string }
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { name } = body as any
  if (typeof name !== "string" || name.trim().length === 0) {
    return error("name is required", 400)
  }
  const trimmed = name.trim()
  if (trimmed.length > 60) return error("name too long (max 60 chars)", 400)

  // prevent exact duplicate names within a club (case-insensitive)
  const existing = await db.serviceCategory.findFirst({
    where: { clubId, name: { equals: trimmed } },
    select: { id: true },
  })
  if (existing) return error("A category with that name already exists", 409)

  const cat = await db.serviceCategory.create({ data: { clubId, name: trimmed } })
  return json({ category: cat }, 201)
}
