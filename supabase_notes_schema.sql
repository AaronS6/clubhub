-- ═══════════════════════════════════════════════════════════════════════════
-- ClubHub — Notes feature + Main Goal schema migration
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/...
-- → SQL Editor → New query → paste → Run).
--
-- This adds the schema changes for:
--   1. Club.mainGoal (exec-set "what the club is working on")
--   2. Team.mainIdea (exec-set per-team sub-goal)
--   3. ClubNote table (the new Notes feature)
--   4. NoteTag table (Discord-forum-style custom tags)
--   5. NoteTagAssignment join table (note ↔ tag many-to-many)
--   6. NoteHeart table (per-user per-note likes)
--
-- All statements are idempotent — re-running won't error.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add mainGoal to Club (nullable — existing clubs get NULL = "no goal set")
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "mainGoal" TEXT;

-- 2. Add mainIdea to Team (nullable)
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "mainIdea" TEXT;

-- 3. ClubNote table
CREATE TABLE IF NOT EXISTS "ClubNote" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "sharedWith" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ClubNote_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (silent no-op if already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ClubNote_clubId_fkey'
    ) THEN
        ALTER TABLE "ClubNote"
        ADD CONSTRAINT "ClubNote_clubId_fkey"
        FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ClubNote_authorId_fkey'
    ) THEN
        ALTER TABLE "ClubNote"
        ADD CONSTRAINT "ClubNote_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "ClubNote_clubId_deletedAt_createdAt_idx"
    ON "ClubNote"("clubId", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "ClubNote_authorId_idx"
    ON "ClubNote"("authorId");

-- 4. NoteTag table (Discord-forum-style custom tags — members + execs both create)
CREATE TABLE IF NOT EXISTS "NoteTag" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NoteTag_clubId_fkey'
    ) THEN
        ALTER TABLE "NoteTag"
        ADD CONSTRAINT "NoteTag_clubId_fkey"
        FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE;
    END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "NoteTag_clubId_name_key"
    ON "NoteTag"("clubId", "name");
CREATE INDEX IF NOT EXISTS "NoteTag_clubId_idx"
    ON "NoteTag"("clubId");

-- 5. NoteTagAssignment join table (note ↔ tag)
CREATE TABLE IF NOT EXISTS "NoteTagAssignment" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteTagAssignment_pkey" PRIMARY KEY ("noteId", "tagId")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NoteTagAssignment_noteId_fkey'
    ) THEN
        ALTER TABLE "NoteTagAssignment"
        ADD CONSTRAINT "NoteTagAssignment_noteId_fkey"
        FOREIGN KEY ("noteId") REFERENCES "ClubNote"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NoteTagAssignment_tagId_fkey'
    ) THEN
        ALTER TABLE "NoteTagAssignment"
        ADD CONSTRAINT "NoteTagAssignment_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "NoteTag"("id") ON DELETE CASCADE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "NoteTagAssignment_tagId_idx"
    ON "NoteTagAssignment"("tagId");

-- 6. NoteHeart table (per-user per-note likes — unique on (noteId, userId) so
--    heart toggles are idempotent)
CREATE TABLE IF NOT EXISTS "NoteHeart" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteHeart_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NoteHeart_noteId_fkey'
    ) THEN
        ALTER TABLE "NoteHeart"
        ADD CONSTRAINT "NoteHeart_noteId_fkey"
        FOREIGN KEY ("noteId") REFERENCES "ClubNote"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NoteHeart_userId_fkey'
    ) THEN
        ALTER TABLE "NoteHeart"
        ADD CONSTRAINT "NoteHeart_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "NoteHeart_noteId_idx"
    ON "NoteHeart"("noteId");
CREATE UNIQUE INDEX IF NOT EXISTS "NoteHeart_noteId_userId_key"
    ON "NoteHeart"("noteId", "userId");

-- Done — verify with:
-- SELECT "mainGoal" IS NOT NULL FROM "Club" LIMIT 1;  -- should be a column
-- SELECT count(*) FROM "ClubNote";                    -- should be 0
-- SELECT count(*) FROM "NoteTag";                    -- should be 0
