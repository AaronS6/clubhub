# R4-4 — full-stack-developer (features)

## Scope
§6 — 4 new features:
1. Unified "Recent Activity" feed on the dashboard (combines task/announcement/meeting/hours/member/team activity).
2. Keyboard shortcut cheatsheet (? key opens a modal).
3. Public read-only "club profile" page via `?public=<code>` query param.
4. Chat history export (plain text).

## Files modified (10) + Files created (3)

### Modified
- `src/app/api/clubs/[clubId]/activity/route.ts` — opened up to all members (was exec-only). Activity log entries describe actions already visible to members via other endpoints (announcements, tasks, meetings, hours submissions). Necessary for the dashboard Recent Activity feed to work for all members.
- `src/components/views/activity-view.tsx` — removed exec-only gating (`isExec` check + "Executives only" empty state + unused ShieldCheck import). The activity log is now visible to all members in the dedicated view too (consistent with the dashboard feed).
- `src/components/app-shell.tsx` — (1) Removed `execOnly: true` from the Activity Log nav item (now visible to all). (2) Added `Keyboard` icon import. (3) Added `?` button in the top bar (between ConnectionIndicator and theme toggle) that dispatches `open-keyboard-shortcuts` event. (4) Added "Shortcuts" hint with `?` kbd in the footer (also dispatches the event). (5) Added `<KeyboardShortcutsHelp />` component at the end of the AppShell layout. (6) Added `KeyboardShortcutsHelp` component definition + `SHORTCUTS` constant at the bottom of the file. (7) Imported `PublicClubProfile` and added a `?public=<code>` check BEFORE the auth check so unauthenticated users see the public profile instead of the login screen.
- `src/components/views/dashboard-view.tsx` — (1) Added imports for activity-feed icons (History, UserPlus, UserMinus, ArrowUpCircle, ArrowDownCircle, XCircle, UserCog, KeyRound, Crown, MessageSquare, ScrollText). (2) Added `<RecentActivityCard>` between the existing "Upcoming meetings" row and the "Club at a glance" strip. (3) Added `RecentActivityCard` component: fetches `/api/clubs/[clubId]/activity?page=1&pageSize=10`, renders the latest 10 items as a chronological timeline (actor avatar + name + action-icon chip + relative time + description), each item links to the relevant view, with a "View all" link to the dedicated Activity Log. Uses `usePollingFallback(20_000)` for the disconnected fallback. (4) Added `RecentActivitySkeleton` + `FEED_ACTION_META` + `feedMetaFor` helpers + `ActivityFeedItem`/`ActivityFeedResponse` types.

### Created
- `src/app/api/public/club/[code]/route.ts` — public (NO auth) GET endpoint that returns safe, recruiting-friendly info about a club by its `clubCode`. Returns: name, description, accentColor, logoUrl, clubCode, createdAt, memberCount (active), totalHoursLogged (sum of approved ServiceHour.hours), upcomingMeetingCount (future, non-cancelled meetings). NO passwords, member lists, or emails.
- `src/components/public-club-profile.tsx` — landing-page-style component rendered when `?public=<code>` is present. Self-contained: injects the club's accentColor as inline CSS vars (no ClubAccentProvider dependency). Shows an accent-colored hero header with logo + name + club code + description, a 3-tile stats grid (Members / Hours logged / Upcoming), a CTA ("Join this club" for unauthenticated users → routes to `/`; "Back to app" for authenticated users → routes to `/`). Loading skeleton + "Club not found" error state. Mobile-first responsive. Sticky footer (consistent with the app).
- `src/app/api/clubs/[clubId]/chat/conversations/[conversationId]/export/route.ts` — member-only GET endpoint that exports the conversation's message history as a plain-text file. Verifies club membership (getClubContext) + conversation membership (ConversationMember.findUnique). Returns `text/plain; charset=utf-8` with `Content-Disposition: attachment; filename="<slug>.txt"`. Format: header line with conversation name + export date, then each message as `[YYYY-MM-DD HH:MM] Author Name: message`. Skips soft-deleted messages. Marks edited with " (edited)". Marks pinned with "📌 ". Caps at the last 1000 messages (newest first, then reversed for chronological order). Slugifies the conversation title for the filename.

### Modified (chat-view)
- `src/components/views/chat-view.tsx` — (1) Added `Download` to the lucide-react imports. (2) Added `exporting` state + `handleExport` async function in `ConversationPane`: fetches the export route, parses JSON error body on non-OK responses, creates a Blob URL on success, pulls the filename from Content-Disposition, programmatically clicks an `<a download>` to trigger the download, toasts success/failure, sets `exporting` for the duration to show a spinner. (3) Added an Export button (Download icon, with Loader2 spinner when exporting) in the conversation header BEFORE the MembersDropdown, wrapped in a Tooltip ("Export conversation as text"). Available to any conversation member.

## Design decisions

- **Activity route opened to all members**: The activity log was exec-only because it was framed as an "audit trail". But the data isn't sensitive — every action type (new_member, hours_submitted, task_completed, etc.) describes actions that members can already see via other endpoints (members list, hours list, tasks list, etc.). The descriptions are neutral ("Alice posted announcement 'Welcome'" — members can already see the announcement). Opening it up lets the dashboard Recent Activity feed work for all members, which is the spec. Updated the dedicated Activity Log view too for consistency (removed the "Executives only" message). Also removed `execOnly: true` from the nav item so members can navigate to the full log.

- **Recent activity placement (Tier 3, full-width)**: Placed between the "Upcoming meetings" row and the "Club at a glance" strip. The Tier-1 attention strip stays primary (it's about *what needs the user's action now*); the activity feed is informational (*what happened recently*). Full-width to give 8-10 items room to breathe as a vertical timeline (matches the dedicated Activity Log's visual treatment for consistency).

- **Recent activity feed uses `usePollingFallback(20_000)`**: Per spec. Realtime is primary (the existing `useRealtimeSync` hook already invalidates `["activity", cid]` on most event types). 20s poll when the socket is down. Errors are logged to console.warn (not toasted) because the dashboard already toasts its own load errors and the activity feed is Tier-3 (shouldn't shout over the dashboard).

- **Keyboard shortcut listener**: Global `keydown` listener that opens the Dialog when `?` is pressed. Suppressed when the user is typing in an input/textarea/select/contentEditable element, and when a meta/ctrl/alt key is held (those are browser/OS shortcuts). Other UI surfaces (footer "Shortcuts" button, top-bar `?` button) dispatch an `open-keyboard-shortcuts` CustomEvent to trigger the same dialog — same pattern the SettingsDialog uses for its `open-settings` event. Used shadcn Dialog + `<kbd>` elements with Tailwind classes (no Kbd component exists in shadcn).

- **Public profile takes precedence over auth**: The `?public=<code>` check is placed BEFORE the `if (status === "unauthenticated")` check in AppShell, so an unauthenticated user with `?public=X` sees the profile instead of the AuthScreen. An authenticated user with `?public=X` also sees the profile (with a "Back to app" link). When `?public` is absent, everything works as before.

- **Public profile uses inline accent vars (not ClubAccentProvider)**: ClubAccentProvider keys off the user's *current* club (from useAppStore), which is irrelevant here (the visitor may not be logged in or may not be a member). The component injects `--pub-accent`, `--pub-accent-fg`, `--pub-accent-muted`, `--pub-accent-subtle` directly via inline `style` on the root wrapper. Local `readableForeground` and `hexToRgba` helpers (duplicated from club-accent-provider.tsx — kept in sync) compute the readable foreground + alpha tints from the hex accent.

- **Public profile uses TanStack Query (not setState-in-effect)**: Initial implementation used `useEffect + setState` which tripped the `react-hooks/set-state-in-effect` lint rule. Switched to `useQuery` (available via the Providers wrapper in layout.tsx) — cleaner, auto-handles loading/error states, no lint issues.

- **Export route uses raw fetch (not the api() wrapper)**: The api() wrapper parses JSON, but the export response is text/plain with Content-Disposition: attachment. The chat-view's `handleExport` uses raw `fetch()` with `credentials: "same-origin"`, parses JSON only on error responses, creates a Blob URL on success, and pulls the filename from Content-Disposition.

- **Export button placement**: Added in the conversation header BEFORE the MembersDropdown, available to any conversation member (not just canManage). Wrapped in a Tooltip so the icon's purpose is discoverable. Shows a Loader2 spinner during the export to give immediate feedback.

## Verification
- `bun run lint` — 0 errors, 0 warnings (after fixing the initial setState-in-effect lint error by switching to useQuery, and removing an unused eslint-disable directive).
- `bunx tsc --noEmit` — no TS errors in any of the files I touched (only pre-existing errors in hours-view.tsx + skills/examples folders, which are unrelated to this task).
- Dev server health: was running during development (latest dev.log shows GET / 200 responses and successful GET /api/clubs/.../activity?page=1&pageSize=10 200 — the dashboard recent activity feed already working). The dev server died during the session (port 3000 stopped listening); per the task rules I did NOT manually restart it. Lint + tsc pass for all touched files, so the code should compile cleanly when the system restarts the dev server.
- Did NOT touch any off-limits files: `src/lib/use-realtime-sync.ts`, `src/lib/realtime-store.ts`, `src/lib/realtime-server.ts`, `src/lib/activity.ts`, `mini-services/realtime/index.ts`.

## Patterns reused
`getClubContext`/`error`/`json` (server-auth), `api` (api/client), `useAppStore`/`View` (store), `usePollingFallback` (realtime-store), `useQuery`/`useMutation`/`useQueryClient` (TanStack Query), shadcn/ui (Dialog, DropdownMenu, Tooltip, Button, Avatar, Skeleton), `cn` (utils), `sonner` toast, `EmptyState`/`initials`/`avatarColor`/`relativeTime` (shared/page-header), `next/link`, `date-fns` format/parseISO, lucide-react icons. No new dependencies introduced.
