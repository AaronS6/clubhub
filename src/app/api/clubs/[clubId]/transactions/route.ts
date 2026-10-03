import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const transactions = await db.clubTransaction.findMany({
    where: { clubId },
    orderBy: { date: "desc" },
    include: { creator: { select: { name: true } } },
    take: 200,
  })
  return json({ transactions })
}

export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can manage finances", 403)

  const body = await req.json().catch(() => null)
  if (!body) return error("Invalid input", 400)
  const { type, amount, category, description, date } = body as {
    type?: string; amount?: number; category?: string; description?: string; date?: string
  }
  if (type !== "revenue" && type !== "expense") return error("Type must be 'revenue' or 'expense'", 400)
  if (typeof amount !== "number" || amount <= 0) return error("Amount must be a positive number", 400)
  if (!category?.trim()) return error("Category is required", 400)

  const tx = await db.clubTransaction.create({
    data: {
      clubId,
      type,
      amount,
      category: category.trim(),
      description: description?.trim() || null,
      date: date ? new Date(date) : new Date(),
      createdBy: c.user.id,
    },
    include: { creator: { select: { name: true } } },
  })
  await logActivity({ clubId, actorUserId: c.user.id, actionType: "finance_recorded", targetType: "transaction", description: `Recorded ${type} of $${amount} (${category})` })
  return json({ transaction: tx })
}
