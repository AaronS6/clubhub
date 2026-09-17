-- ============================================================================
-- SECURITY FIX: Enable Row-Level Security (RLS) on ALL tables
-- ============================================================================
--
-- Run this in the Supabase SQL Editor to fix the "Table publicly accessible"
-- and "Sensitive data publicly accessible" critical security warnings.
--
-- WHY: Supabase exposes tables via its auto-generated REST/Realtime API using
-- the `anon` and `authenticated` keys. Without RLS, anyone with your project
-- URL can read, edit, and delete ALL data.
--
-- HOW THIS WORKS WITH OUR APP:
-- Our app NEVER talks to Supabase directly from the browser. All database
-- access goes through our Next.js API routes → Prisma → Supabase using the
-- connection string (which uses the `service_role` key via the pooler).
-- The `service_role` key BYPASSES RLS entirely, so our app continues to work
-- normally. RLS only blocks direct browser access via Supabase's anon API.
--
-- This script:
-- 1. Enables RLS on every table (blocks anon/authenticated key access)
-- 2. Creates NO policies (so NO direct browser access is possible)
-- 3. The service_role key (used by Prisma) bypasses RLS — app works fine
--
-- Run once. Safe to re-run (uses IF NOT EXISTS / ALTER TABLE ... ENABLE).
-- ============================================================================

-- Enable RLS on ALL tables (no policies = no direct access from anon/authenticated keys)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Club" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClubMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceHour" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subtask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingRsvp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageReaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Badge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberBadge" ENABLE ROW LEVEL SECURITY;

-- Also force RLS (prevents even table owners from bypassing it via the anon key).
-- The service_role key still bypasses — that's by design (Prisma uses it).
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Club" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClubMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ServiceCategory" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ServiceHour" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementReaction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementComment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Subtask" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TaskComment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MeetingRsvp" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ConversationMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MessageReaction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Badge" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MemberBadge" FORCE ROW LEVEL SECURITY;

-- Drop any existing policies (in case any were auto-created)
-- This ensures NO direct access is possible via anon/authenticated keys
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "enable_all" ON %I;', t);
  END LOOP;
END $$;

-- Verify: this query should return 'true' for every table
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
