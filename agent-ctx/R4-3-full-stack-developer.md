# R4-3 — full-stack-developer (perf + security)

## Scope
§4 performance (lazy-load, pagination caps, reconnect sanity) + §5 security/permissions audit + rate-limiting for bulk import / announcement / meeting creation.

## Files modified
- `src/app/page.tsx` — lazy-load all non-default views via `next/dynamic` with `ssr: false` + spinner fallback. Dashboard stays eager (default view; recharts needed on initial paint). Chat view (~2400 LOC) is the biggest win.
- `src/app/api/clubs/[clubId]/tasks/route.ts` — added `take: 200` on tasks query, `take: 200` on convenience teams query, `take: 500` on convenience members query.
- `src/app/api/clubs/[clubId]/teams/route.ts` — added `take: 200` on main teams query, `take: 200` on per-team members, `take: 50` on per-team tasks, `take: 50` on per-team upcoming meetings.
- `src/app/api/clubs/[clubId]/members/route.ts` — added `take: 500` on members, `take: 5000` on team membership rows.
- `src/app/api/clubs/[clubId]/hours/route.ts` — added `take: 500` on service-hour items query (exec `?scope=all` could grow unbounded over years).
- `src/app/api/clubs/[clubId]/chat/conversations/[conversationId]/messages/route.ts` — **SECURITY FIX**: the `allMembers` query was missing `conversationId` in its `where` clause, so it returned every `ConversationMember` row in the DB (across all conversations) where `userId != author`. This leaked conversation name + message preview to users who weren't members of the conversation. Renamed `allMembers` → `otherMembers`, scoped the where by `conversationId`.
- `src/app/api/clubs/[clubId]/members/import/route.ts` — added rate limit (5 imports/min/club, keyed by `clubId` so a compromised exec can't bypass by switching accounts). Returns 429 + Retry-After.
- `src/app/api/clubs/[clubId]/announcements/route.ts` — added rate limit on POST (30 announcements/min/user, generous but bounds the spam surface). 429 + Retry-After.
- `src/app/api/clubs/[clubId]/meetings/route.ts` — added rate limit on POST (30 meetings/min/user; recurring creates up to 9 rows each, so caps DB writes at ~270/min worst case). 429 + Retry-After.

## Audit results (no fix needed)
- §4.3 reconnect backoff: socket.io uses `reconnectionDelay: 1000` as the BASE delay (socket.io multiplies by randomization each retry up to `reconnectionDelayMax` default 5s). Sane — not stuck at 1s.
- §5.4 message PATCH (edit): author-only, club + conversation membership verified.
- §5.4 message DELETE: author/owner/exec, club + conversation membership verified.
- §5.4 message pin PATCH: exec/owner-only, club + conversation membership verified.
- §5.4 password GET/PATCH: exec-only (R4-2 already verified).
- §5.4 badges GET: any member; badges are auto-computed (no manual "award" endpoint exists, so no exec-only check needed).
- §5.4 import POST: exec-only + now rate-limited.
- §5.4 search GET: any member, queries bounded by `take: 8` per category.
- §5.4 dashboard GET: any member, all sub-queries bounded (3/5/3/200/5).
- §5.5 messages GET: getClubContext + conv.clubId check + ConversationMember check. ✓
- §5.5 conversations GET: getClubContext + scopes ConversationMember by userId + clubId. ✓
- §5.5 pinned GET: getClubContext + conv.clubId check + ConversationMember check. ✓
- §5.6 chat message POST: already rate-limited (30/min/user/conversation). ✓
- §4.2 meetings GET: already has `take: 200`. ✓
- §4.2 announcements GET: paginated (PAGE_SIZE=20). ✓
- §4.2 activity GET: paginated (default 50, max 200). ✓
- §4.2 messages GET: paginated (PAGE_SIZE=50). ✓
- §4.2 notifications GET: paginated (default 50, max 200). ✓

## Items flagged for coordination (did NOT edit — file off-limits per task rules)
- **Global search lazy-load**: `src/components/global-search.tsx` is mounted in `src/components/app-shell.tsx` (line 290). It bundles cmdk (`CommandDialog`) + a 435-LOC component that's only opened on Cmd+K. Lazy-loading it would be a clear win — replace `import { GlobalSearch, openGlobalSearch } from "@/components/global-search"` with `next/dynamic` for the component, and keep the `openGlobalSearch` export by extracting the imperative opener into a tiny separate module (or inlining it in app-shell). Both `global-search.tsx` and `app-shell.tsx` are off-limits to R4-3.
- **Dashboard chart sub-component lazy-load**: `src/components/views/dashboard-view.tsx` imports `recharts` at the top level. Splitting the chart into its own file and lazy-loading it with `ssr: false` would defer recharts. BUT dashboard is the default view, so the chart IS needed on initial paint — lazy-loading would just defer the chart render, not eliminate the bundle. Marginal win at best, possibly a regression (chart appears later). Recommended to NOT do it. `dashboard-view.tsx` is off-limits anyway.

## Verification
- `bun run lint` — 0 errors, 0 warnings.
- All touched routes compile cleanly (curl returns 403 = auth check working as expected, no compile errors).
- `GET /` returns 200 with the new lazy-load page structure; no hydration errors in dev.log.
- Reconnect backoff re-verified by reading `src/lib/realtime-client.ts` — base delay 1s, infinite attempts, socket.io applies exponential backoff up to default 5s max.

## Patterns reused
`getClubContext`/`json`/`error` (server-auth), `rateLimit` (rate-limit), `next/dynamic` (built-in), `Loader2` (lucide-react). No new dependencies introduced.
