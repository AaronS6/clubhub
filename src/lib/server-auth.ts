import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { db } from "@/lib/db"

export interface ClubContext {
  user: { id: string; name: string; email: string; avatarUrl?: string }
  membership: {
    id: string
    role: "member" | "executive"
    status: string
    clubId: string
  }
  club: {
    id: string
    name: string
    accentColor: string
    logoUrl: string | null
  }
}

/** Returns the session user or null. */
export async function getSessionUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })
  return user
}

/**
 * Returns the session user + their active club memberships in a SINGLE db
 * query (via include). Used by `/api/me` — the bootstrap endpoint that gates
 * the entire app's loading screen — so it needs to be as fast as possible.
 * Replaces the previous pattern of getSessionUser() + a separate
 * clubMember.findMany() (2 sequential round-trips).
 */
export async function getSessionUserWithMemberships() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      memberships: {
        where: { status: "active" },
        include: {
          club: {
            select: { id: true, name: true, logoUrl: true, accentColor: true, clubCode: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  })
  return user
}

/**
 * Returns the session user + their membership for a given club, or null if
 * they are not an active member of that club.
 */
export async function getClubContext(clubId: string): Promise<ClubContext | null> {
  const user = await getSessionUser()
  if (!user) return null
  const membership = await db.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId: user.id } },
    include: { club: { select: { id: true, name: true, accentColor: true, logoUrl: true } } },
  })
  if (!membership || membership.status !== "active") return null
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? undefined,
    },
    membership: {
      id: membership.id,
      role: membership.role as "member" | "executive",
      status: membership.status,
      clubId: membership.clubId,
    },
    club: membership.club,
  }
}

export function requireExecutive(ctx: ClubContext) {
  return ctx.membership.role === "executive"
}

/** Standard JSON response helper. */
export function json<T>(data: T, status = 200) {
  return Response.json(data, { status })
}

export function error(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}
