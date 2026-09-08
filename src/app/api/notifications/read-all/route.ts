import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

export async function POST() {
  const user = await getSessionUser()
  if (!user) return error("Unauthorized", 401)
  await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } })
  return json({ ok: true })
}
