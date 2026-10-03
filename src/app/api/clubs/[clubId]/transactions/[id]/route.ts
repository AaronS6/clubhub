import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can manage finances", 403)

  const body = await req.json().catch(() => null)
  if (!body) return error("Invalid input", 400)
  const { type, amount, category, description } = body as {
    type?: string; amount?: number; category?: string; description?: string
  }

  const data: any = {}
  if (type !== undefined) {
    if (type !== "revenue" && type !== "expense") return error("Invalid type", 400)
    data.type = type
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) return error("Invalid amount", 400)
    data.amount = amount
  }
  if (category !== undefined) data.category = category.trim()
  if (description !== undefined) data.description = description?.trim() || null

  const tx = await db.clubTransaction.update({
    where: { id },
    data: data,
    include: { creator: { select: { name: true } } },
  })
  return json({ transaction: tx })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can manage finances", 403)

  await db.clubTransaction.delete({ where: { id } })
  return json({ ok: true })
}
