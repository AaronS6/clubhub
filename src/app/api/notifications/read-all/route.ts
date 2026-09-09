import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)
    await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } })
    return json({ ok: true })

  } catch (err: any) {
    console.error("[notifications/read-all POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to mark all notifications read: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
