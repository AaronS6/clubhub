import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/**
 * GET /api/public/clubs
 *
 * Public, UNAUTHENTICATED directory endpoint powering the landing page's
 * "Explore clubs" section. Returns ONLY clubs whose executives opted into
 * public discovery (`Club.isListedPublic = true`).
 *
 * Optional `?q=` performs a case-insensitive search over the club name,
 * description, and club code (the closest thing ClubHub has to a public
 * "tag"). SQLite's LIKE is case-insensitive for ASCII, which covers club
 * names/descriptions fine.
 *
 * Returned fields are strictly public-safe — the same policy as
 * /api/public/club/[code]: no passwords, no member lists, no emails, no
 * club internals. Just recruiting-friendly identity info:
 *   name, description, logoUrl, bannerUrl, bannerFocalY, accentColor,
 *   clubCode, createdAt, memberCount.
 *
 * Bounded to 100 clubs — a school has no reason to have more, and the cap
 * keeps the payload + query cheap. Ordered by member count (most active
 * first) so the directory surfaces lively clubs at the top.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get("q") ?? "").trim()

    const where: any = { isListedPublic: true }
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { description: { contains: q } },
        { clubCode: { contains: q.toUpperCase() } },
      ]
    }

    const clubs = await db.club.findMany({
      where,
      select: {
        name: true,
        description: true,
        logoUrl: true,
        bannerUrl: true,
        bannerFocalY: true,
        accentColor: true,
        clubCode: true,
        joinMode: true,
        createdAt: true,
        _count: { select: { members: { where: { status: "active" } } } },
      },
      orderBy: [{ members: { _count: "desc" } }, { createdAt: "desc" }],
      take: 100,
    })

    return NextResponse.json({
      clubs: clubs.map((c) => ({
        name: c.name,
        description: c.description,
        logoUrl: c.logoUrl,
        bannerUrl: c.bannerUrl,
        bannerFocalY: c.bannerFocalY,
        accentColor: c.accentColor,
        clubCode: c.clubCode,
        joinMode: c.joinMode === "request" ? "request" : "code",
        createdAt: c.createdAt,
        memberCount: c._count.members,
      })),
    })
  } catch (e) {
    console.error("[public/clubs] GET failed:", e)
    return NextResponse.json({ error: "Failed to load clubs" }, { status: 500 })
  }
}
