import { db } from "@/lib/db"

/**
 * Announcement poll helpers — shared by the announcements list/create routes
 * and the vote endpoint so every surface returns the exact same poll shape.
 *
 * Summary shape (consumed by the announcements-view frontend):
 *   {
 *     id, allowMultiple,
 *     options: [{ id, text, voteCount }],
 *     totalVotes,   // votes cast across all options
 *     voterCount,   // unique voters
 *     myOptionIds,  // options the requesting user voted for
 *   }
 */

export interface PollOptionSummary {
  id: string
  text: string
  voteCount: number
}

export interface PollSummary {
  id: string
  allowMultiple: boolean
  options: PollOptionSummary[]
  totalVotes: number
  voterCount: number
  myOptionIds: string[]
}

/** Load a poll + all option/vote rows, then fold them into a summary. */
export async function getPollSummary(
  announcementId: string,
  userId: string,
): Promise<PollSummary | null> {
  const poll = await db.announcementPoll.findUnique({
    where: { announcementId },
    include: {
      options: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          text: true,
          votes: { select: { userId: true } },
        },
      },
    },
  })
  if (!poll) return null

  let totalVotes = 0
  const voters = new Set<string>()
  const myOptionIds: string[] = []
  const options: PollOptionSummary[] = poll.options.map((o) => {
    totalVotes += o.votes.length
    for (const v of o.votes) {
      voters.add(v.userId)
      if (v.userId === userId) myOptionIds.push(o.id)
    }
    return { id: o.id, text: o.text, voteCount: o.votes.length }
  })

  return {
    id: poll.id,
    allowMultiple: poll.allowMultiple,
    options,
    totalVotes,
    voterCount: voters.size,
    myOptionIds,
  }
}

/** Validate + normalize a poll payload from the announcement-create body.
 *  Returns null when invalid (with a reason via the thrown Error message). */
export function parsePollInput(raw: unknown): {
  options: string[]
  allowMultiple: boolean
} | null {
  if (!raw || typeof raw !== "object") return null
  const optionsRaw = (raw as { options?: unknown }).options
  const allowMultipleRaw = (raw as { allowMultiple?: unknown }).allowMultiple
  if (!Array.isArray(optionsRaw)) return null

  const options = optionsRaw
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .map((o) => o.slice(0, 80))

  if (options.length < 2 || options.length > 10) return null
  const allowMultiple = allowMultipleRaw === true
  return { options, allowMultiple }
}
