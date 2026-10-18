import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/server-auth"
import { issueRealtimeTicket } from "@/lib/realtime-ticket"

/**
 * GET /api/realtime/ticket
 *
 * Returns a short-lived (10 min) HMAC ticket the browser hands to the
 * socket.io mini-service on its "auth" event. The mini-service verifies the
 * ticket (shared REALTIME_TOKEN) and only then joins the socket into
 * `user:{id}` + `club:{id}` rooms — closing the old hole where a client
 * could claim ANY userId / clubIds and eavesdrop on other clubs' realtime
 * streams.
 *
 * The club list is derived SERVER-SIDE from the session user's ACTIVE
 * memberships — the client never chooses which rooms it may join.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    select: { clubId: true },
  })

  return NextResponse.json(
    issueRealtimeTicket(user.id, memberships.map((m) => m.clubId)),
    { headers: { "Cache-Control": "no-store" } },
  )
}
