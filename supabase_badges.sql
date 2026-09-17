-- ============================================================================
-- Custom Badges — production SQL for Supabase / PostgreSQL
-- ============================================================================
--
-- Run this in the Supabase SQL Editor (or any Postgres database) to create
-- the Badge + MemberBadge tables that back the manual badge award system.
--
-- These match the Prisma models in `prisma/schema.prisma` exactly —
-- column names, types, indexes, foreign keys, and the @@unique constraint
-- on MemberBadge(badgeId, userId) are all mirrored here. Prisma's `cuid()`
-- IDs are generated in JS, so the columns are `text` with `PRIMARY KEY`
-- (the app supplies the value on insert).
--
-- Foreign keys reference the existing `Club` and `User` tables by their
-- `id` text columns. If you renamed those tables in production, adjust the
-- REFERENCES clauses accordingly.
--
-- Idempotent: DROP IF EXISTS first so re-running won't error.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Badge — a custom awardable badge defined by an executive for a club.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "MemberBadge" CASCADE;
DROP TABLE IF EXISTS "Badge" CASCADE;

CREATE TABLE "Badge" (
  "id"          text PRIMARY KEY,
  "clubId"      text NOT NULL,
  "name"        text NOT NULL,
  "description" text,
  "emoji"       text NOT NULL DEFAULT '🏆',
  "createdAt"   timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy"   text NOT NULL,

  CONSTRAINT "Badge_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE,
  CONSTRAINT "Badge_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "Badge_clubId_idx" ON "Badge"("clubId");

-- ---------------------------------------------------------------------------
-- MemberBadge — an award of a badge to a member. (badgeId, userId) is unique.
-- ---------------------------------------------------------------------------

CREATE TABLE "MemberBadge" (
  "id"        text PRIMARY KEY,
  "badgeId"   text NOT NULL,
  "userId"    text NOT NULL,
  "clubId"    text NOT NULL,
  "awardedBy" text NOT NULL,
  "awardedAt" timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT "MemberBadge_badgeId_userId_key"
    UNIQUE ("badgeId", "userId"),

  CONSTRAINT "MemberBadge_badgeId_fkey"
    FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE,
  CONSTRAINT "MemberBadge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "MemberBadge_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE,
  CONSTRAINT "MemberBadge_awardedBy_fkey"
    FOREIGN KEY ("awardedBy") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "MemberBadge_clubId_userId_idx" ON "MemberBadge"("clubId", "userId");

-- ---------------------------------------------------------------------------
-- Helpful read paths:
--   * All badges for a club            — covered by Badge_clubId_idx
--   * All badges awarded to a member   — covered by MemberBadge_clubId_userId_idx
--                                        (also useful for cross-club lookups
--                                         by userId — see below)
--   * All awards of a single badge     — covered by MemberBadge_badgeId_userId_key
--                                        (badgeId is the leading column)
-- ---------------------------------------------------------------------------

CREATE INDEX "MemberBadge_userId_idx" ON "MemberBadge"("userId");
