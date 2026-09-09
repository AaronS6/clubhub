import { db } from "@/lib/db"
import { emitRealtime } from "@/lib/realtime-server"
import { sendEmailNotification, shouldTryEmail } from "@/lib/email-notifications"

/** Append an activity log entry. Best-effort, never throws to caller. */
export async function logActivity(input: {
  clubId: string
  actorUserId: string
  actionType: string
  targetType: string
  targetId?: string
  description: string
}) {
  try {
    await db.activityLog.create({ data: input })
  } catch (e) {
    // swallow logging errors
    console.error("logActivity failed", e)
  }
}

/** Create a notification for a user. Best-effort. Also pushes a realtime wake-up. */
export async function notify(input: {
  userId: string
  clubId?: string
  type: string
  message: string
  linkUrl?: string
}) {
  try {
    await db.notification.create({ data: input })
    await emitRealtime({
      kind: "user",
      userId: input.userId,
      event: "realtime:notification",
      data: { type: input.type, message: input.message, linkUrl: input.linkUrl },
    })
    // Email: best-effort, fire-and-forget. The in-app notification + realtime
    // push have already happened. sendEmailNotification will no-op silently
    // for types we don't email about (e.g. new_announcement, promoted, etc.)
    // or if the user has email disabled for this type. The shouldTryEmail
    // guard avoids the club-name lookup for non-emailable types.
    if (shouldTryEmail(input.type)) {
      fireEmailNotification({
        userId: input.userId,
        clubId: input.clubId,
        type: input.type,
        message: input.message,
        linkUrl: input.linkUrl,
      })
    }
  } catch (e) {
    console.error("notify failed", e)
  }
}

/** Notify all members of a club (optionally excluding a user). Pushes realtime wake-ups. */
export async function notifyClub(input: {
  clubId: string
  excludeUserId?: string
  type: string
  message: string
  linkUrl?: string
}) {
  try {
    const members = await db.clubMember.findMany({
      where: { clubId: input.clubId, status: "active", userId: { not: input.excludeUserId } },
      select: { userId: true },
    })
    if (members.length === 0) return
    await db.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        clubId: input.clubId,
        type: input.type,
        message: input.message,
        linkUrl: input.linkUrl,
      })),
    })
    // Realtime: ping each user's room + the club room (for live feed refresh)
    await emitRealtime({ kind: "club", clubId: input.clubId, event: "realtime:club", data: { type: input.type } })
    for (const m of members) {
      await emitRealtime({
        kind: "user",
        userId: m.userId,
        event: "realtime:notification",
        data: { type: input.type, message: input.message, linkUrl: input.linkUrl },
      })
    }
    // Email: best-effort, fire-and-forget per member. We fetch the club name
    // once (used in the email footer) before fanning out emails. The
    // shouldTryEmail guard avoids the entire fan-out + club lookup for
    // non-emailable types like `new_announcement`.
    if (shouldTryEmail(input.type) && members.length > 0) {
      fireEmailNotificationForClub({
        clubId: input.clubId,
        userIds: members.map((m) => m.userId),
        type: input.type,
        message: input.message,
        linkUrl: input.linkUrl,
      })
    }
  } catch (e) {
    console.error("notifyClub failed", e)
  }
}

/**
 * Fire-and-forget email notification for a single user. Looks up club name
 * (if clubId provided) before delegating to sendEmailNotification. Never
 * rejects the returned promise to the caller (i.e. the triggering API call).
 */
function fireEmailNotification(input: {
  userId: string
  clubId?: string
  type: string
  message: string
  linkUrl?: string
}) {
  const run = async () => {
    let clubName: string | undefined
    if (input.clubId) {
      try {
        const c = await db.club.findUnique({
          where: { id: input.clubId },
          select: { name: true },
        })
        clubName = c?.name ?? undefined
      } catch {
        // ignore — clubName is purely cosmetic in the footer
      }
    }
    await sendEmailNotification({
      userId: input.userId,
      type: input.type,
      message: input.message,
      linkUrl: input.linkUrl,
      clubName,
    })
  }
  run().catch((e) => {
    console.error("[email] fireEmailNotification failed:", e)
  })
}

/**
 * Fire-and-forget email notification fan-out for a club. Fetches the club
 * name once, then fires an independent email send per member. Each is
 * awaited sequentially inside the IIFE but the outer promise is never
 * awaited by the caller.
 */
function fireEmailNotificationForClub(input: {
  clubId: string
  userIds: string[]
  type: string
  message: string
  linkUrl?: string
}) {
  const run = async () => {
    let clubName: string | undefined
    try {
      const c = await db.club.findUnique({
        where: { id: input.clubId },
        select: { name: true },
      })
      clubName = c?.name ?? undefined
    } catch {
      // ignore
    }
    for (const userId of input.userIds) {
      try {
        await sendEmailNotification({
          userId,
          type: input.type,
          message: input.message,
          linkUrl: input.linkUrl,
          clubName,
        })
      } catch (e) {
        // each member's failure is independent — don't abort the rest
        console.error("[email] club fan-out member failed:", userId, e)
      }
    }
  }
  run().catch((e) => {
    console.error("[email] fireEmailNotificationForClub failed:", e)
  })
}
