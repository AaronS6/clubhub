import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

export async function POST(_req: Request, ctx: { params: Promise<{ notifId: string }> }) {
  const { notifId } = await ctx.params
  const user = await getSessionUser()
  if (!user) return error("Unauthorized", 401)
  await db.notification.updateMany({ where: { id: notifId, userId: user.id }, data: { isRead: true } })
  return json({ ok: true })
}
