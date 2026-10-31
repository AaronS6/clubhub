-- ═══════════════════════════════════════════════════════════════════════════
-- ClubHub — MASTER SCHEMA SYNC (Supabase / PostgreSQL)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS IS
--   The ONE script to run in the Supabase SQL Editor
--   (Dashboard → SQL Editor → New query → paste → Run) whenever the app is
--   redeployed. It brings the production schema back in line with
--   prisma/schema.prisma, no matter how far it has drifted.
--
-- WHY IT EXISTS
--   `prisma db push` cannot run against the Supabase pooler (prepared
--   statements), so production schema changes ship as hand-written SQL.
--   Missing columns make Prisma throw P2022 ("column does not exist") on
--   every query that touches the table — e.g. User.avatarDecoration killed
--   /api/auth/session and every user-reading route until this sync ran.
--
-- HOW IT WORKS
--   1. Creates any missing feature tables (JoinRequest, ClubTransaction,
--      Badge, MemberBadge, ClubNote, NoteTag, NoteTagAssignment, NoteHeart,
--      StoredImage).
--   2. Adds EVERY column of EVERY table with ADD COLUMN IF NOT EXISTS —
--      existing columns are skipped, missing ones are healed (with Prisma's
--      defaults so NOT NULL is safe on populated tables).
--   3. Creates missing indexes and foreign keys (guarded, re-runnable).
--   4. Enables + forces Row-Level Security on every table (the app connects
--      with the service_role key, which bypasses RLS — only browser access
--      via the anon key is blocked).
--
-- SAFETY
--   • 100% idempotent — re-running never errors and never changes data.
--   • NEVER drops anything (unlike supabase_badges.sql, which DROPs first —
--     do not re-run that file on a database that has real badges in it).
--   • Expects the base tables (User, Club, …) from supabase_schema.sql to
--     exist — every deployment has them (the app booted at least once).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FEATURE TABLES (only created if missing)
-- ═══════════════════════════════════════════════════════════════════════════

-- JoinRequest — joinMode = "request" clubs (approve/decline applicants)
CREATE TABLE IF NOT EXISTS "JoinRequest" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- ClubTransaction — financials (revenue / expense entries)
CREATE TABLE IF NOT EXISTS "ClubTransaction" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "type" TEXT NOT NULL,                -- "revenue" | "expense"
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubTransaction_pkey" PRIMARY KEY ("id")
);

-- Badge — exec-defined custom badges
CREATE TABLE IF NOT EXISTS "Badge" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '🏆',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- MemberBadge — a badge award (badgeId, userId) unique
CREATE TABLE IF NOT EXISTS "MemberBadge" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "awardedBy" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberBadge_pkey" PRIMARY KEY ("id")
);

-- ClubNote — member-authored markdown notes
CREATE TABLE IF NOT EXISTS "ClubNote" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "sharedWith" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ClubNote_pkey" PRIMARY KEY ("id")
);

-- NoteTag — per-club custom tags
CREATE TABLE IF NOT EXISTS "NoteTag" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("id")
);

-- NoteTagAssignment — note ↔ tag many-to-many
CREATE TABLE IF NOT EXISTS "NoteTagAssignment" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteTagAssignment_pkey" PRIMARY KEY ("noteId", "tagId")
);

-- NoteHeart — per-user per-note likes
CREATE TABLE IF NOT EXISTS "NoteHeart" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteHeart_pkey" PRIMARY KEY ("id")
);

-- StoredImage — DB-backed image store (club logos, banners, avatars)
-- Replaced the old disk-based uploads: processed JPEG bytes (sharp) live in
-- BYTEA, keyed `{clubId}-logo` / `{clubId}-banner` / `{userId}`. Served via
-- /api/club-images/[...] and /api/avatars/[id] with immutable ?v= caching.
CREATE TABLE IF NOT EXISTS "StoredImage" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,               -- "avatar" | "club-image"
    "data" BYTEA NOT NULL,              -- processed JPEG bytes
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("key")
);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. COLUMN HEALERS — every column of every table (no-ops where they exist)
--    Prisma reads ALL scalar columns on un-select-ed queries, so a single
--    missing column anywhere 500s the whole feature. This section is the
--    drift-killer.
-- ═══════════════════════════════════════════════════════════════════════════

-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarDecoration" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifPrefs" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Session
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);

-- VerificationToken
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "identifier" TEXT;
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "token" TEXT;
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);

-- Club
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "bannerUrl" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "bannerFocalY" DOUBLE PRECISION;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "isListedPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "joinMode" TEXT NOT NULL DEFAULT 'code';
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#16a34a';
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "clubCode" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "clubPasswordEnc" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "hoursGoal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "mainGoal" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "handbookAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- JoinRequest
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "reviewedByUserId" TEXT;

-- ClubMember
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClubMember" ADD COLUMN IF NOT EXISTS "personalHoursGoal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ServiceCategory
ALTER TABLE "ServiceCategory" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ServiceCategory" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "ServiceCategory" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "ServiceCategory" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ServiceHour
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "dateOfService" TIMESTAMP(3);
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "hours" DOUBLE PRECISION;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "reasonText" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "proofFileUrl" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ServiceHour" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- Announcement
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "isUrgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "accent" TEXT;   -- card accent color key (emerald|amber|rose|violet|teal|gray), null = default
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "tag" TEXT;      -- short category label pill (≤24 chars)
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AnnouncementReaction
ALTER TABLE "AnnouncementReaction" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "AnnouncementReaction" ADD COLUMN IF NOT EXISTS "announcementId" TEXT;
ALTER TABLE "AnnouncementReaction" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "AnnouncementReaction" ADD COLUMN IF NOT EXISTS "emoji" TEXT;
ALTER TABLE "AnnouncementReaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AnnouncementComment
ALTER TABLE "AnnouncementComment" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "AnnouncementComment" ADD COLUMN IF NOT EXISTS "announcementId" TEXT;
ALTER TABLE "AnnouncementComment" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
ALTER TABLE "AnnouncementComment" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "AnnouncementComment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnnouncementComment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Team
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "mainIdea" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- TeamMember
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Subtask
ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "isDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- TaskComment
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Meeting
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "startTime" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "endTime" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "recurrenceRule" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- MeetingRsvp
ALTER TABLE "MeetingRsvp" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "MeetingRsvp" ADD COLUMN IF NOT EXISTS "meetingId" TEXT;
ALTER TABLE "MeetingRsvp" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "MeetingRsvp" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'maybe';
ALTER TABLE "MeetingRsvp" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "actionType" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ConversationMember
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

-- MessageReaction
ALTER TABLE "MessageReaction" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "MessageReaction" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
ALTER TABLE "MessageReaction" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "MessageReaction" ADD COLUMN IF NOT EXISTS "emoji" TEXT;
ALTER TABLE "MessageReaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Badge
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "emoji" TEXT NOT NULL DEFAULT '🏆';
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- MemberBadge
ALTER TABLE "MemberBadge" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "MemberBadge" ADD COLUMN IF NOT EXISTS "badgeId" TEXT;
ALTER TABLE "MemberBadge" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "MemberBadge" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "MemberBadge" ADD COLUMN IF NOT EXISTS "awardedBy" TEXT;
ALTER TABLE "MemberBadge" ADD COLUMN IF NOT EXISTS "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ClubTransaction
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClubTransaction" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ClubNote
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "sharedWith" JSONB;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClubNote" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- NoteTag
ALTER TABLE "NoteTag" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "NoteTag" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "NoteTag" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "NoteTag" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "NoteTag" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "NoteTag" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- NoteTagAssignment
ALTER TABLE "NoteTagAssignment" ADD COLUMN IF NOT EXISTS "noteId" TEXT;
ALTER TABLE "NoteTagAssignment" ADD COLUMN IF NOT EXISTS "tagId" TEXT;
ALTER TABLE "NoteTagAssignment" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- NoteHeart
ALTER TABLE "NoteHeart" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "NoteHeart" ADD COLUMN IF NOT EXISTS "noteId" TEXT;
ALTER TABLE "NoteHeart" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "NoteHeart" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- StoredImage (healer — no-op on databases where section 1 just created it)
ALTER TABLE "StoredImage" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "StoredImage" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "StoredImage" ADD COLUMN IF NOT EXISTS "data" BYTEA;
ALTER TABLE "StoredImage" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StoredImage" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StoredImage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. INDEXES (only created if missing)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "Club_clubCode_key" ON "Club"("clubCode");
CREATE INDEX IF NOT EXISTS "ClubMember_userId_idx" ON "ClubMember"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClubMember_clubId_userId_key" ON "ClubMember"("clubId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "JoinRequest_clubId_userId_key" ON "JoinRequest"("clubId", "userId");
CREATE INDEX IF NOT EXISTS "JoinRequest_clubId_status_idx" ON "JoinRequest"("clubId", "status");
CREATE INDEX IF NOT EXISTS "ServiceHour_clubId_status_idx" ON "ServiceHour"("clubId", "status");
CREATE INDEX IF NOT EXISTS "ServiceHour_clubId_userId_status_idx" ON "ServiceHour"("clubId", "userId", "status");
CREATE INDEX IF NOT EXISTS "ServiceHour_clubId_submittedAt_idx" ON "ServiceHour"("clubId", "submittedAt");
CREATE INDEX IF NOT EXISTS "ServiceHour_userId_idx" ON "ServiceHour"("userId");
CREATE INDEX IF NOT EXISTS "Announcement_clubId_createdAt_idx" ON "Announcement"("clubId", "createdAt");
CREATE INDEX IF NOT EXISTS "AnnouncementReaction_announcementId_idx" ON "AnnouncementReaction"("announcementId");
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementReaction_announcementId_userId_key" ON "AnnouncementReaction"("announcementId", "userId");
CREATE INDEX IF NOT EXISTS "AnnouncementComment_announcementId_createdAt_idx" ON "AnnouncementComment"("announcementId", "createdAt");
CREATE INDEX IF NOT EXISTS "Team_clubId_idx" ON "Team"("clubId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "Task_clubId_status_idx" ON "Task"("clubId", "status");
CREATE INDEX IF NOT EXISTS "Task_clubId_assignedToUserId_idx" ON "Task"("clubId", "assignedToUserId");
CREATE INDEX IF NOT EXISTS "Task_assignedToUserId_idx" ON "Task"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "Task_teamId_idx" ON "Task"("teamId");
CREATE INDEX IF NOT EXISTS "Subtask_taskId_idx" ON "Subtask"("taskId");
CREATE INDEX IF NOT EXISTS "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "Meeting_clubId_startTime_idx" ON "Meeting"("clubId", "startTime");
CREATE UNIQUE INDEX IF NOT EXISTS "MeetingRsvp_meetingId_userId_key" ON "MeetingRsvp"("meetingId", "userId");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "ActivityLog_clubId_createdAt_idx" ON "ActivityLog"("clubId", "createdAt");
CREATE INDEX IF NOT EXISTS "Conversation_clubId_updatedAt_idx" ON "Conversation"("clubId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ConversationMember_userId_idx" ON "ConversationMember"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "Badge_clubId_idx" ON "Badge"("clubId");
CREATE UNIQUE INDEX IF NOT EXISTS "MemberBadge_badgeId_userId_key" ON "MemberBadge"("badgeId", "userId");
CREATE INDEX IF NOT EXISTS "MemberBadge_clubId_userId_idx" ON "MemberBadge"("clubId", "userId");
CREATE INDEX IF NOT EXISTS "MemberBadge_userId_idx" ON "MemberBadge"("userId");
CREATE INDEX IF NOT EXISTS "ClubTransaction_clubId_date_idx" ON "ClubTransaction"("clubId", "date");
CREATE INDEX IF NOT EXISTS "ClubNote_clubId_deletedAt_createdAt_idx" ON "ClubNote"("clubId", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "ClubNote_authorId_idx" ON "ClubNote"("authorId");
CREATE UNIQUE INDEX IF NOT EXISTS "NoteTag_clubId_name_key" ON "NoteTag"("clubId", "name");
CREATE INDEX IF NOT EXISTS "NoteTag_clubId_idx" ON "NoteTag"("clubId");
CREATE INDEX IF NOT EXISTS "NoteTagAssignment_tagId_idx" ON "NoteTagAssignment"("tagId");
CREATE INDEX IF NOT EXISTS "NoteHeart_noteId_idx" ON "NoteHeart"("noteId");
CREATE UNIQUE INDEX IF NOT EXISTS "NoteHeart_noteId_userId_key" ON "NoteHeart"("noteId", "userId");


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FOREIGN KEYS for the feature tables (guarded — no-op if they exist)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- JoinRequest
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_clubId_fkey') THEN
        ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_userId_fkey') THEN
        ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_reviewedByUserId_fkey') THEN
        ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_reviewedByUserId_fkey"
            FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Badge
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Badge_clubId_fkey') THEN
        ALTER TABLE "Badge" ADD CONSTRAINT "Badge_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Badge_createdBy_fkey') THEN
        ALTER TABLE "Badge" ADD CONSTRAINT "Badge_createdBy_fkey"
            FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    -- MemberBadge
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberBadge_badgeId_fkey') THEN
        ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_badgeId_fkey"
            FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberBadge_userId_fkey') THEN
        ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberBadge_clubId_fkey') THEN
        ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberBadge_awardedBy_fkey') THEN
        ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_awardedBy_fkey"
            FOREIGN KEY ("awardedBy") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    -- ClubTransaction
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubTransaction_clubId_fkey') THEN
        ALTER TABLE "ClubTransaction" ADD CONSTRAINT "ClubTransaction_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubTransaction_createdBy_fkey') THEN
        ALTER TABLE "ClubTransaction" ADD CONSTRAINT "ClubTransaction_createdBy_fkey"
            FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- ClubNote
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubNote_clubId_fkey') THEN
        ALTER TABLE "ClubNote" ADD CONSTRAINT "ClubNote_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClubNote_authorId_fkey') THEN
        ALTER TABLE "ClubNote" ADD CONSTRAINT "ClubNote_authorId_fkey"
            FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    -- NoteTag
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteTag_clubId_fkey') THEN
        ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_clubId_fkey"
            FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE;
    END IF;

    -- NoteTagAssignment
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteTagAssignment_noteId_fkey') THEN
        ALTER TABLE "NoteTagAssignment" ADD CONSTRAINT "NoteTagAssignment_noteId_fkey"
            FOREIGN KEY ("noteId") REFERENCES "ClubNote"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteTagAssignment_tagId_fkey') THEN
        ALTER TABLE "NoteTagAssignment" ADD CONSTRAINT "NoteTagAssignment_tagId_fkey"
            FOREIGN KEY ("tagId") REFERENCES "NoteTag"("id") ON DELETE CASCADE;
    END IF;

    -- NoteHeart
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteHeart_noteId_fkey') THEN
        ALTER TABLE "NoteHeart" ADD CONSTRAINT "NoteHeart_noteId_fkey"
            FOREIGN KEY ("noteId") REFERENCES "ClubNote"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteHeart_userId_fkey') THEN
        ALTER TABLE "NoteHeart" ADD CONSTRAINT "NoteHeart_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
END$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ROW-LEVEL SECURITY on every table (idempotent)
--    The app connects with the service_role key (bypasses RLS); this only
--    blocks direct browser access via Supabase's anon key.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    END LOOP;
END$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. VERIFY — all of these should come back clean
-- ═══════════════════════════════════════════════════════════════════════════

-- The column that broke the session callback should now exist:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'User' AND column_name = 'avatarDecoration';

-- All 32 tables present:
SELECT count(*) AS table_count FROM pg_tables WHERE schemaname = 'public';

-- RLS on everywhere (rowsecurity + forcerowsecurity both true):
-- NOTE: pg_tables has no "forcerowsecurity" column — read both flags from
-- pg_class (relrowsecurity / relforcerowsecurity) instead.
SELECT c.relname AS tablename,
       c.relrowsecurity AS rowsecurity,
       c.relforcerowsecurity AS forcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
