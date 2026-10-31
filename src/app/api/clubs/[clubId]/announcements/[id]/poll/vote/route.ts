import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { rateLimit } from "@/lib/rate-limit"
import { getPollSummary } from "@/lib/announcement-poll"

// 60 votes per user per minute — covers enthusiastic single/multi-choice
// toggling without letting a script hammer the write path.
const VOTE_LIMIT = 60
const VOTE_WINDOW = 60_000

/**
 * POST /api/clubs/[clubId]/announcements/[id]/poll/vote
 * Body: { optionIds: string[] }
 *
 * Semantics (Telegram-style):
 *   - Single-choice poll (allowMultiple=false): exactly ONE option id
 *     replaces any previous vote (re-vote = switch). Empty array removes
 *     the user's vote entirely.
 *   - Multi-choice poll (allowMultiple=true): the array IS the new vote set
 *     (replacing the old one); empty array removes all of the user's votes.
 *
 * All optionIds must belong to this poll. The response returns the fresh
 * poll summary (same shape as the list/create endpoints).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ clubId: string; id: string }> },
) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const rl = rateLimit(`poll-vote:${c.user.id}`, VOTE_LIMIT, VOTE_WINDOW)
  if (!rl.ok) return error("Slow down a moment", 429)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const optionIdsRaw = body.optionIds
  if (!Array.isArray(optionIdsRaw) || optionIdsRaw.some((o) => typeof o !== "string")) {
    return error("optionIds must be an array of strings", 400)
  }
  const optionIds = [...new Set(optionIdsRaw as string[])] // dedupe

  const announcement = await db.announcement.findUnique({
    where: { id },
    select: { id: true, clubId: true, deletedAt: true },
  })
  if (!announcement || announcement.clubId !== clubId || announcement.deletedAt) {
    return error("Announcement not found", 404)
  }

  const poll = await db.announcementPoll.findUnique({
    where: { announcementId: id },
    select: {
      id: true,
      allowMultiple: true,
      options: { select: { id: true } },
    },
  })
  if (!poll) return error("This announcement has no poll", 400)

  const validIds = new Set(poll.options.map((o) => o.id))
  if (optionIds.some((oid) => !validIds.has(oid))) {
    return error("Unknown poll option", 400)
  }
  if (!poll.allowMultiple && optionIds.length > 1) {
    return error("This poll only allows one choice", 400)
  }

  // Replace the user's votes: delete every vote of theirs on THIS poll, then
  // create the new set. (SQLite serializes writes; the delete→create gap is
  // never observed by readers as data loss — worst case a read between the
  // two sees the old OR new set, both valid states.)
  await db.announcementPollVote.deleteMany({
    where: {
      userId: c.user.id,
      option: { pollId: poll.id },
    },
  })
  if (optionIds.length > 0) {
    await db.announcementPollVote.createMany({
      data: optionIds.map((optionId) => ({ optionId, userId: c.user.id })),
    })
  }

  // Best-effort: let other members' feeds refresh their poll counts.
  void emitClubEvent(clubId, "announcement_poll_vote", { announcementId: id })

  const summary = await getPollSummary(id, c.user.id)
  return json({ poll: summary })
}
