# R5-UI — full-stack-developer (nav + UI)

## Task
Navigation restructure (profile top-left, club switcher bottom, tiered nav) + UI bug fixes (search outline, presence dot, notif settings length) + remove dashboard recent activity + polish auth screen (no gradients) + admin passcode for club creation + verify promote flow + responsive/scroll polish.

## Files Modified
1. `src/components/app-shell.tsx` — NAV restructured into 3 tiers; ClubSwitcher moved to sidebar bottom; UserMenu moved to topBar left (new `compact` mode); search trigger given `h-9` + clean focus ring; NotificationsTab rewritten as compact 1-row-per-type table; gradient removed from no-clubs onboarding.
2. `src/components/views/members-view.tsx` — wrapped 3 avatars (MemberRow, MemberMobileCard, MemberDetailSheet) in `relative inline-flex` spans; moved presence dot OUT of `<Avatar>` (which has `overflow-hidden`) onto the wrapper so it renders fully.
3. `src/components/views/dashboard-view.tsx` — removed `<RecentActivityCard>` render call (kept the component definition for easy re-enablement); added `min-w-0` to root div.
4. `src/components/auth/auth-screen.tsx` — removed all `bg-gradient-*` classes; replaced with flat `bg-club-subtle/60`; added accent pill badge, tightened spacing, added `ArrowRight` to toggle links, removed unused Card imports.
5. `src/components/auth/create-club-dialog.tsx` — added `adminPasscode` field (password input in `bg-club-subtle` callout with ShieldCheck icon) + client-side validation.
6. `src/app/api/clubs/route.ts` — added `adminPasscode` to zod schema + server-side 403 check before any DB writes.

## Files Created
1. `src/lib/admin-passcode.ts` — exports `ADMIN_PASSCODE = "buildtogether12$"` (single source of truth, shared between client dialog + server route).

## Verification
- `bun run lint` → 0 errors, 0 warnings.
- `bunx tsc --noEmit` → no errors in any touched file (pre-existing errors in examples/skills/dashboard-route/hours-view are unrelated).
- Promote/demote flow verified by reading `members/route.ts` PATCH + `members-view.tsx` MemberRow — already works end-to-end (exec-only gate, role update, activity log, realtime emit). No changes needed.
- Off-limits files respected: did NOT touch `use-realtime-sync.ts`, `realtime-store.ts`, `realtime-server.ts`, `prisma/schema.prisma`, `next.config.ts`, or any API route other than `clubs/route.ts` (explicitly authorized).
- Dev server (port 3000) appears to have stopped mid-session; per task rules I did NOT restart it. Last dev.log entries show all 200 responses, no compile errors.
