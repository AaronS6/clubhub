import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    const club = await db.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        accentColor: true,
        clubCode: true,
        hoursGoal: true,
        createdAt: true,
        _count: { select: { members: { where: { status: "active" } } } },
      },
    })
    if (!club) return error("Club not found", 404)
    return json({ club, myRole: c.membership.role })

  } catch (err: any) {
    console.error("[clubs GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load club: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

const updateSchema = {
  name: (s: string) => s.length >= 1 && s.length <= 80,
  description: (s: string) => s.length <= 1000,
  accentColor: (s: string) => /^#[0-9a-fA-F]{6}$/.test(s),
  hoursGoal: (n: number) => typeof n === "number" && n >= 0 && n <= 100000,
  logoUrl: (s: string | null) => s === null || typeof s === "string",
}

export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Only executives can edit club settings", 403)
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const data: Record<string, any> = {}
    for (const [k, v] of Object.entries(body)) {
      const fn = (updateSchema as any)[k]
      if (fn && fn(v)) data[k] = v
    }
    if (Object.keys(data).length === 0) return error("No valid fields to update", 400)
    const updated = await db.club.update({ where: { id: clubId }, data, select: { id: true, name: true, description: true, accentColor: true, logoUrl: true, hoursGoal: true } })
    return json({ club: updated })

  } catch (err: any) {
    console.error("[clubs PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to update club: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
