import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"

/**
 * Club storage report — the single source of truth for the storage meter
 * AND the 100% write-pause guard (src/lib/storage-guard.ts).
 *
 * Reports the club's REAL database footprint across ~10 categories with a
 * LIVE-CONTENT-ONLY rule: content that has been deleted-and-tombstoned
 * (chat messages with body = "", notes with blank title+content) contributes
 * ZERO bytes, so deleting content frees the number immediately.
 *
 * ── Quota ─────────────────────────────────────────────────────────────────
 * CLUB_STORAGE_LIMIT_BYTES is 15 MB (≈ 65,000 messages), shared by the whole
 * club. At 100%, storage-taking writes are PAUSED club-wide until an
 * executive clears some room — storage-guard.ts enforces it; the Storage
 * view explains it and offers the "increase capacity" path.
 *
 * ── Bytes math ────────────────────────────────────────────────────────────
 * String bytes = LENGTH(field) summed over each table's text columns, plus a
 * flat 150 bytes/row overhead estimate (COUNT(*) * 150) to account for ids,
 * timestamps and indexes. BLOB bytes = LENGTH(data) (byte-accurate in both
 * SQLite and Postgres).
 *
 * ── SQL portability ───────────────────────────────────────────────────────
 * Every query is a Prisma `$queryRaw` TAGGED TEMPLATE (pooler-safe: no
 * multi-statements, parameters stay bound). The SQL is dialect-portable
 * between SQLite (dev) and Postgres/Supabase (prod): quoted identifiers,
 * and only LENGTH / COALESCE / COUNT / CASE WHEN functions. Subqueries are
 * composed as `Prisma.sql` fragments — plain string interpolation of a
 * subquery into another tagged template does NOT work; Prisma.sql([...])
 * composition is the supported way to nest them.
 *
 * Postgres returns COUNT/SUM as BigInt while SQLite returns Number — every
 * aggregate is passed through num() before use, and again before JSON.
 */

/** 15 MB club quota (≈ 65,000 messages). At 100% new content is paused.
 *  Overridable via the CLUB_STORAGE_LIMIT_BYTES env var (bytes). */
export const CLUB_STORAGE_LIMIT_BYTES = Number(process.env.CLUB_STORAGE_LIMIT_BYTES) || 15 * 1024 * 1024

/** Flat per-row overhead estimate: ids, timestamps, foreign keys, indexes. */
const ROW_OVERHEAD_BYTES = 150

/** Postgres $queryRaw returns BigInt for COUNT/SUM; SQLite returns Number.
 *  This normalizes either (and NULL → 0) to a plain JSON-safe number. */
function num(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "bigint") return Number(v)
  return 0
}

/** One aggregate row from any of the category queries below. */
type AggRow = Record<string, unknown>

interface CategoryShape {
  id: string
  label: string
  bytes: number
  items: number
  detail: string
}

export interface StorageReport {
  quotaBytes: number
  usedBytes: number
  percent: number
  categories: CategoryShape[]
  excluded: {
    avatarsBytes: number
    notificationsBytes: number
    tombstonedMessages: number
    tombstonedNotes: number
  }
}

/** Full club storage report — the exact math the Storage view displays. */
export async function getClubStorageReport(clubId: string): Promise<StorageReport> {
  // ── Reusable subquery fragments (Prisma.sql composition) ──────────────
  // All conversations of this club.
  const convIds = Prisma.sql`(SELECT "id" FROM "Conversation" WHERE "clubId" = ${clubId})`
  // All messages inside those conversations.
  const msgIds = Prisma.sql`(SELECT "id" FROM "Message" WHERE "conversationId" IN ${convIds})`
  // All announcements of this club.
  const annIds = Prisma.sql`(SELECT "id" FROM "Announcement" WHERE "clubId" = ${clubId})`
  // All tasks of this club.
  const taskIds = Prisma.sql`(SELECT "id" FROM "Task" WHERE "clubId" = ${clubId})`
  // All notes of this club.
  const noteIds = Prisma.sql`(SELECT "id" FROM "ClubNote" WHERE "clubId" = ${clubId})`
  // All meetings of this club.
  const meetingIds = Prisma.sql`(SELECT "id" FROM "Meeting" WHERE "clubId" = ${clubId})`
  // All teams of this club.
  const teamIds = Prisma.sql`(SELECT "id" FROM "Team" WHERE "clubId" = ${clubId})`
  // All badges of this club.
  const badgeIds = Prisma.sql`(SELECT "id" FROM "Badge" WHERE "clubId" = ${clubId})`
  // All userIds with a membership (any status) in this club.
  const memberUserIds = Prisma.sql`(SELECT "userId" FROM "ClubMember" WHERE "clubId" = ${clubId})`
  // A message is a TOMBSTONE when its body has been blanked (the delete
  // handler blanks + stamps deletedAt; the sweeper backfills legacy rows).
  const liveMessage = Prisma.sql`COALESCE("body",'') <> ''`
  // A note is a TOMBSTONE when it is live prose (title OR content non-blank)
  // AND not soft-deleted. Blank+deletedAt rows contribute nothing.
  const liveNote = Prisma.sql`(COALESCE("title",'') <> '' OR "content" <> '') AND "deletedAt" IS NULL`

  // ── The ~10 category queries, all fired in parallel ────────────────────
  // (the images query rides in the same batch with a .catch ensureSchema
  // guard — the StoredImage table is newer than some deployments, so a
  // missing table must degrade to zeros instead of 500-ing the route)
  const [
    chatRow,
    annRow,
    taskRow,
    noteRow,
    meetingRow,
    peopleRow,
    financeRow,
    activityRow,
    profileRow,
    excludedRow,
    imagesRow,
  ] = await Promise.all([
      // CHAT — messages (tombstones contribute 0 bytes + are excluded from
      // item counts) + reactions + conversations + conversation members.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(CASE WHEN COALESCE("body",'') = '' THEN 0 ELSE LENGTH("body") END), 0)
             FROM "Message" WHERE "conversationId" IN ${convIds}) AS "messageBytes",
          (SELECT COUNT(*) FROM "Message" WHERE "conversationId" IN ${convIds} AND ${liveMessage}) AS "messageCount",
          (SELECT COUNT(*) FROM "MessageReaction" WHERE "messageId" IN ${msgIds}) AS "reactionCount",
          (SELECT COALESCE(SUM(LENGTH("emoji")), 0) FROM "MessageReaction" WHERE "messageId" IN ${msgIds}) AS "reactionBytes",
          (SELECT COUNT(*) FROM "Conversation" WHERE "clubId" = ${clubId}) AS "conversationCount",
          (SELECT COALESCE(SUM(LENGTH(COALESCE("name",''))), 0) FROM "Conversation" WHERE "clubId" = ${clubId}) AS "conversationBytes",
          (SELECT COUNT(*) FROM "ConversationMember" WHERE "conversationId" IN ${convIds}) AS "convMemberCount"
      `),

      // ANNOUNCEMENTS — soft-deleted rows are KEPT (restore feature), so all
      // rows count: they genuinely occupy database bytes.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(LENGTH(COALESCE("title",'')) + LENGTH(COALESCE("body",''))), 0)
             FROM "Announcement" WHERE "clubId" = ${clubId}) AS "announcementBytes",
          (SELECT COUNT(*) FROM "Announcement" WHERE "clubId" = ${clubId}) AS "announcementCount",
          (SELECT COUNT(*) FROM "AnnouncementComment" WHERE "announcementId" IN ${annIds}) AS "commentCount",
          (SELECT COALESCE(SUM(LENGTH(COALESCE("body",''))), 0)
             FROM "AnnouncementComment" WHERE "announcementId" IN ${annIds}) AS "commentBytes",
          (SELECT COUNT(*) FROM "AnnouncementReaction" WHERE "announcementId" IN ${annIds}) AS "reactionCount",
          (SELECT COALESCE(SUM(LENGTH("emoji")), 0) FROM "AnnouncementReaction" WHERE "announcementId" IN ${annIds}) AS "reactionBytes"
      `),

      // TASKS — soft-deleted rows are KEPT (restore feature), all rows count.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(LENGTH(COALESCE("title",'')) + LENGTH(COALESCE("description",''))), 0)
             FROM "Task" WHERE "clubId" = ${clubId}) AS "taskBytes",
          (SELECT COUNT(*) FROM "Task" WHERE "clubId" = ${clubId}) AS "taskCount",
          (SELECT COUNT(*) FROM "Subtask" WHERE "taskId" IN ${taskIds}) AS "subtaskCount",
          (SELECT COALESCE(SUM(LENGTH("title")), 0) FROM "Subtask" WHERE "taskId" IN ${taskIds}) AS "subtaskBytes",
          (SELECT COUNT(*) FROM "TaskComment" WHERE "taskId" IN ${taskIds}) AS "commentCount",
          (SELECT COALESCE(SUM(LENGTH(COALESCE("body",''))), 0) FROM "TaskComment" WHERE "taskId" IN ${taskIds}) AS "commentBytes"
      `),

      // NOTES — tombstoned notes (blank title+content, or deletedAt set)
      // contribute 0 bytes and are excluded from item counts.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(CASE WHEN ${liveNote} THEN LENGTH(COALESCE("title",'')) + LENGTH("content") ELSE 0 END), 0)
             FROM "ClubNote" WHERE "clubId" = ${clubId}) AS "noteBytes",
          (SELECT COUNT(*) FROM "ClubNote" WHERE "clubId" = ${clubId} AND ${liveNote}) AS "noteCount",
          (SELECT COUNT(*) FROM "NoteTag" WHERE "clubId" = ${clubId}) AS "tagCount",
          (SELECT COALESCE(SUM(LENGTH("name") + LENGTH(COALESCE("color",''))), 0)
             FROM "NoteTag" WHERE "clubId" = ${clubId}) AS "tagBytes",
          (SELECT COUNT(*) FROM "NoteTagAssignment" WHERE "noteId" IN ${noteIds}) AS "assignmentCount",
          (SELECT COUNT(*) FROM "NoteHeart" WHERE "noteId" IN ${noteIds}) AS "heartCount"
      `),

      // MEETINGS — cancelled meetings are kept rows; all count.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(LENGTH("title") + LENGTH(COALESCE("description",'')) + LENGTH("location") + LENGTH(COALESCE("recurrenceRule",''))), 0)
             FROM "Meeting" WHERE "clubId" = ${clubId}) AS "meetingBytes",
          (SELECT COUNT(*) FROM "Meeting" WHERE "clubId" = ${clubId}) AS "meetingCount",
          (SELECT COUNT(*) FROM "MeetingRsvp" WHERE "meetingId" IN ${meetingIds}) AS "rsvpCount"
      `),

      // PEOPLE — members (any status), teams, badges, join requests.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "ClubMember" WHERE "clubId" = ${clubId}) AS "memberCount",
          (SELECT COUNT(*) FROM "Team" WHERE "clubId" = ${clubId}) AS "teamCount",
          (SELECT COALESCE(SUM(LENGTH("name") + LENGTH(COALESCE("description",'')) + LENGTH(COALESCE("mainIdea",''))), 0)
             FROM "Team" WHERE "clubId" = ${clubId}) AS "teamBytes",
          (SELECT COUNT(*) FROM "TeamMember" WHERE "teamId" IN ${teamIds}) AS "teamMemberCount",
          (SELECT COUNT(*) FROM "Badge" WHERE "clubId" = ${clubId}) AS "badgeCount",
          (SELECT COALESCE(SUM(LENGTH("name") + LENGTH(COALESCE("description",'')) + LENGTH("emoji")), 0)
             FROM "Badge" WHERE "clubId" = ${clubId}) AS "badgeBytes",
          (SELECT COUNT(*) FROM "MemberBadge" WHERE "badgeId" IN ${badgeIds}) AS "awardCount",
          (SELECT COUNT(*) FROM "JoinRequest" WHERE "clubId" = ${clubId}) AS "joinRequestCount",
          (SELECT COALESCE(SUM(LENGTH(COALESCE("message",'')) + LENGTH("status")), 0)
             FROM "JoinRequest" WHERE "clubId" = ${clubId}) AS "joinRequestBytes"
      `),

      // FINANCE — transactions + service hours + hour categories.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(LENGTH("type") + LENGTH("category") + LENGTH(COALESCE("description",''))), 0)
             FROM "ClubTransaction" WHERE "clubId" = ${clubId}) AS "transactionBytes",
          (SELECT COUNT(*) FROM "ClubTransaction" WHERE "clubId" = ${clubId}) AS "transactionCount",
          (SELECT COALESCE(SUM(LENGTH("reasonText") + LENGTH(COALESCE("proofFileUrl",'')) + LENGTH(COALESCE("reviewComment",'')) + LENGTH("status")), 0)
             FROM "ServiceHour" WHERE "clubId" = ${clubId}) AS "hourBytes",
          (SELECT COUNT(*) FROM "ServiceHour" WHERE "clubId" = ${clubId}) AS "hourCount",
          (SELECT COUNT(*) FROM "ServiceCategory" WHERE "clubId" = ${clubId}) AS "categoryCount",
          (SELECT COALESCE(SUM(LENGTH("name")), 0) FROM "ServiceCategory" WHERE "clubId" = ${clubId}) AS "categoryBytes"
      `),

      // ACTIVITY LOG.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(LENGTH("actionType") + LENGTH("targetType") + LENGTH(COALESCE("targetId",'')) + LENGTH("description")), 0) AS "activityBytes",
          COUNT(*) AS "activityCount"
        FROM "ActivityLog" WHERE "clubId" = ${clubId}
      `),

      // PROFILE — the Club row itself (name, description, code, settings).
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(
            LENGTH(COALESCE("name",'')) + LENGTH(COALESCE("description",'')) +
            LENGTH(COALESCE("logoUrl",'')) + LENGTH(COALESCE("bannerUrl",'')) +
            LENGTH(COALESCE("clubCode",'')) + LENGTH(COALESCE("clubPasswordEnc",'')) +
            LENGTH(COALESCE("joinMode",'')) + LENGTH(COALESCE("accentColor",'')) +
            LENGTH(COALESCE("mainGoal",''))
          ), 0) AS "profileBytes",
          COUNT(*) AS "clubCount"
        FROM "Club" WHERE "id" = ${clubId}
      `),

      // EXCLUDED from quota but reported for transparency: member avatars
      // (personal), personal notifications, and tombstoned-but-kept rows.
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          (SELECT COALESCE(SUM(LENGTH("avatarUrl")), 0) FROM "User"
             WHERE "avatarUrl" IS NOT NULL AND "id" IN ${memberUserIds}) AS "avatarsBytes",
          (SELECT COUNT(*) FROM "Notification" WHERE "userId" IN ${memberUserIds}) AS "notificationCount",
          (SELECT COALESCE(SUM(LENGTH("message") + LENGTH(COALESCE("linkUrl",'')) + LENGTH("type")), 0)
             FROM "Notification" WHERE "userId" IN ${memberUserIds}) AS "notificationsBytes",
          (SELECT COUNT(*) FROM "Message" WHERE "conversationId" IN ${convIds}
             AND (COALESCE("body",'') = '' OR "deletedAt" IS NOT NULL)) AS "tombstonedMessages",
          (SELECT COUNT(*) FROM "ClubNote" WHERE "clubId" = ${clubId}
             AND ("deletedAt" IS NOT NULL OR (COALESCE("title",'') = '' AND "content" = ''))) AS "tombstonedNotes"
      `),

      // IMAGES — StoredImage rows for this club (logo + banner bytes; member
      // avatars are keyed by userId and reported under `excluded` instead).
      // .catch = ensureSchema guard (see above).
      db.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(LENGTH("data")), 0) AS "bytes",
          COUNT(*) AS "items",
          COUNT(CASE WHEN "key" = ${clubId + "-logo"} THEN 1 END) AS "logoCount",
          COUNT(CASE WHEN "key" = ${clubId + "-banner"} THEN 1 END) AS "bannerCount"
        FROM "StoredImage"
        WHERE "key" IN (${clubId + "-logo"}, ${clubId + "-banner"})
      `).catch(() => [] as AggRow[]),
    ])

  // ── Assemble categories ─────────────────────────────────────────────────
  const chat = chatRow[0] ?? {}
  const ann = annRow[0] ?? {}
  const task = taskRow[0] ?? {}
  const note = noteRow[0] ?? {}
  const meeting = meetingRow[0] ?? {}
  const people = peopleRow[0] ?? {}
  const finance = financeRow[0] ?? {}
  const activity = activityRow[0] ?? {}
  const profile = profileRow[0] ?? {}
  const excludedRaw = excludedRow[0] ?? {}
  const images = imagesRow[0] ?? {}
  const imagesBytes = num(images.bytes)
  const imagesItems = num(images.items)
  const imageParts = [num(images.logoCount) > 0 ? "logo" : null, num(images.bannerCount) > 0 ? "banner" : null].filter(
    Boolean,
  ) as string[]

  const plural = (n: number, singular: string, pluralWord = singular + "s") =>
    `${n.toLocaleString("en-US")} ${n === 1 ? singular : pluralWord}`

  const chatMessages = num(chat.messageCount)
  const chatConversations = num(chat.conversationCount)
  const chatItems =
    chatMessages + num(chat.reactionCount) + chatConversations + num(chat.convMemberCount)
  const annCount = num(ann.announcementCount)
  const taskCount = num(task.taskCount)
  const noteCount = num(note.noteCount)
  const meetingCount = num(meeting.meetingCount)
  const memberCount = num(people.memberCount)

  const categories: CategoryShape[] = [
    {
      id: "images",
      label: "Images",
      bytes: imagesBytes + imagesItems * ROW_OVERHEAD_BYTES,
      items: imagesItems,
      detail: imageParts.length > 0 ? `Club ${imageParts.join(" + ")}` : "No logo or banner yet",
    },
    {
      id: "chat",
      label: "Chat",
      bytes:
        num(chat.messageBytes) +
        num(chat.reactionBytes) +
        num(chat.conversationBytes) +
        chatItems * ROW_OVERHEAD_BYTES,
      items: chatItems,
      detail: `${plural(chatMessages, "message")} · ${plural(chatConversations, "conversation")}${
        num(chat.reactionCount) > 0 ? ` · ${plural(num(chat.reactionCount), "reaction")}` : ""
      }`,
    },
    {
      id: "announcements",
      label: "Announcements",
      bytes:
        num(ann.announcementBytes) +
        num(ann.commentBytes) +
        num(ann.reactionBytes) +
        (annCount + num(ann.commentCount) + num(ann.reactionCount)) * ROW_OVERHEAD_BYTES,
      items: annCount + num(ann.commentCount) + num(ann.reactionCount),
      detail: `${plural(annCount, "announcement")} · ${plural(num(ann.commentCount), "comment")}`,
    },
    {
      id: "tasks",
      label: "Tasks",
      bytes:
        num(task.taskBytes) +
        num(task.subtaskBytes) +
        num(task.commentBytes) +
        (taskCount + num(task.subtaskCount) + num(task.commentCount)) * ROW_OVERHEAD_BYTES,
      items: taskCount + num(task.subtaskCount) + num(task.commentCount),
      detail: `${plural(taskCount, "task")} · ${plural(num(task.subtaskCount), "subtask")}`,
    },
    {
      id: "notes",
      label: "Notes",
      bytes:
        num(note.noteBytes) +
        num(note.tagBytes) +
        (noteCount + num(note.tagCount) + num(note.assignmentCount) + num(note.heartCount)) *
          ROW_OVERHEAD_BYTES,
      items: noteCount + num(note.tagCount) + num(note.assignmentCount) + num(note.heartCount),
      detail: `${plural(noteCount, "note")} · ${plural(num(note.tagCount), "tag")}${
        num(note.heartCount) > 0 ? ` · ${plural(num(note.heartCount), "heart")}` : ""
      }`,
    },
    {
      id: "meetings",
      label: "Meetings",
      bytes: num(meeting.meetingBytes) + (meetingCount + num(meeting.rsvpCount)) * ROW_OVERHEAD_BYTES,
      items: meetingCount + num(meeting.rsvpCount),
      detail: `${plural(meetingCount, "meeting")} · ${plural(num(meeting.rsvpCount), "RSVP")}`,
    },
    {
      id: "people",
      label: "People",
      bytes:
        num(people.teamBytes) +
        num(people.badgeBytes) +
        num(people.joinRequestBytes) +
        (memberCount +
          num(people.teamCount) +
          num(people.teamMemberCount) +
          num(people.badgeCount) +
          num(people.awardCount) +
          num(people.joinRequestCount)) *
          ROW_OVERHEAD_BYTES,
      items:
        memberCount +
        num(people.teamCount) +
        num(people.teamMemberCount) +
        num(people.badgeCount) +
        num(people.awardCount) +
        num(people.joinRequestCount),
      detail: `${plural(memberCount, "member")} · ${plural(num(people.teamCount), "team")} · ${plural(
        num(people.badgeCount),
        "badge",
      )}`,
    },
    {
      id: "finance",
      label: "Finance",
      bytes:
        num(finance.transactionBytes) +
        num(finance.hourBytes) +
        num(finance.categoryBytes) +
        (num(finance.transactionCount) + num(finance.hourCount) + num(finance.categoryCount)) *
          ROW_OVERHEAD_BYTES,
      items: num(finance.transactionCount) + num(finance.hourCount) + num(finance.categoryCount),
      detail: `${plural(num(finance.transactionCount), "transaction")} · ${plural(
        num(finance.hourCount),
        "hour entry",
        "hour entries",
      )}`,
    },
    {
      id: "activity",
      label: "Activity log",
      bytes: num(activity.activityBytes) + num(activity.activityCount) * ROW_OVERHEAD_BYTES,
      items: num(activity.activityCount),
      detail: plural(num(activity.activityCount), "log entry", "log entries"),
    },
    {
      id: "profile",
      label: "Club profile",
      bytes: num(profile.profileBytes) + num(profile.clubCount) * ROW_OVERHEAD_BYTES,
      items: num(profile.clubCount),
      detail: "Name, description, code & settings",
    },
  ]

  const usedBytes = categories.reduce((sum, cat) => sum + cat.bytes, 0)
  // 2-decimal precision so tiny usage shows 0.11 instead of rounding to 0.
  const percent = Math.round((usedBytes / CLUB_STORAGE_LIMIT_BYTES) * 10000) / 100

  return {
    quotaBytes: CLUB_STORAGE_LIMIT_BYTES,
    usedBytes,
    percent,
    categories,
    excluded: {
      avatarsBytes: num(excludedRaw.avatarsBytes),
      notificationsBytes: num(excludedRaw.notificationsBytes),
      tombstonedMessages: num(excludedRaw.tombstonedMessages),
      tombstonedNotes: num(excludedRaw.tombstonedNotes),
    },
  }
}
