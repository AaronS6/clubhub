# R7-MOBILE — Mobile optimization pass

**Task ID:** R7-MOBILE
**Agent:** full-stack-developer (mobile views)
**Scope:** Full mobile optimization on announcements, activity, teams, notifications, hours, members, meetings views + create-club dialog + NotificationBell in app-shell.

## What I found + fixed per view

### 1. Announcements (`announcements-view.tsx`)
- **Reaction bar:** emoji picker popover could overflow at 360px → added `max-w-[calc(100vw-1.5rem)]` to PopoverContent + `flex-wrap gap-1` on the emoji grid so 5 emojis wrap instead of forcing horizontal overflow. Bumped reaction badge tap target `h-7`→`h-8 min-h-8` and "React" trigger `h-7`→`h-8 min-h-8`. Emoji picker buttons `h-9 w-9`→`h-10 w-10`.
- **Comment row:** delete button was hover-only (`opacity-0 group-hover:opacity-100`) → invisible/unreachable on touch. Changed to `opacity-100 md:opacity-0 md:group-hover:opacity-100` so it's always visible on mobile. Bumped from `h-3 w-3` icon to `h-8 w-8` button with `h-3.5 w-3.5` icon. Avatar `h-7 w-7`→`h-8 w-8`. Added `truncate min-w-0` to author name so long names don't crowd the timestamp.
- **Action menu trigger:** `h-8 w-8`→`h-9 w-9` (36px touch target) with `-mr-1.5` to keep visual alignment.
- **Compose + Edit dialogs:** converted to full-screen mobile sheets via a shared `MOBILE_FULLSCREEN_DIALOG` className constant — fills `h-[100dvh]` on mobile, centered modal on `sm:`. Sticky header (border-b) + scrollable body (`flex-1 overflow-y-auto`) + sticky footer (`sticky bottom-0 bg-background border-t`) so Cancel/Submit stay reachable above the soft keyboard. `showCloseButton={false}` since the form has explicit Cancel.

### 2. Activity log (`activity-view.tsx`)
- **Already a stacked timeline list** (not a table) — the user assumed it was a dense table, but it was already mobile-friendly. Did NOT add a separate table/card split (would be redundant).
- **Filter Select:** `w-[180px]`→`w-[150px] sm:w-[220px]` for narrow viewports.
- **Refresh button:** `h-7`→`h-9` (touch target); icon `h-3`→`h-3.5`.
- **Timeline item meta row:** changed `flex flex-wrap items-center gap-2` → `flex flex-wrap items-center gap-x-2 gap-y-1` so the timestamp wraps to its own line on narrow screens (`w-full sm:w-auto sm:ml-auto`) rather than crowding the action chip. Added `min-w-0` + `truncate` to actor name.

### 3. Teams (`teams-view.tsx`)
- **Team card grid:** already `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` ✓ (no change needed).
- **Team card footer** (members/tasks/upcoming): `flex items-center justify-between` → `flex flex-wrap items-center gap-x-4 gap-y-1.5` so the 3 stats wrap on narrow screens instead of squishing.
- **Card menu trigger + detail-sheet close + roster remove button:** all `h-7 w-7`→`h-9 w-9` (36px touch).
- **CreateTeamDialog / EditTeamDialog / AddMembersDialog:** all converted to mobile full-screen sheets. AddMembersDialog: search input is now sticky at top of the body, candidate list scrolls, footer (N selected + Cancel/Add) sticky at bottom. Candidate rows `min-h-11` (44px tap target), avatar `h-7 w-7`→`h-8 w-8`.

### 4. Notifications bell (`app-shell.tsx` — NotificationBell only)
- **Refactored NotificationBell** to conditionally render a **bottom Sheet** on mobile (`useIsMobile()` hook, `<768px`) and the existing **Popover** on desktop. Extracted a `BellBody` component sharing the same header/list/footer markup so no duplication.
- Mobile Sheet: `side="bottom"`, `max-h-[90dvh]`, `rounded-t-xl`, drag handle bar, full-width. ScrollArea `max-h-[60vh] sm:max-h-[420px]`.
- **NotifRow mark-read button:** was hover-only `h-6 w-6 opacity-0 group-hover:opacity-100` → `h-8 w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100` (always visible on touch, 32px target).
- **Header/footer action buttons** (Mark all read, View all, Notification settings): added `min-h-9` for consistent touch targets; icon `h-3`→`h-3.5`.

### 5. Notifications view (`notifications-view.tsx`)
- **NotifListItem mark-read button:** same hover-only fix as NotifRow — `h-7 w-7 opacity-0 group-hover:opacity-100` → `h-8 w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`.
- The full NotificationsView was already responsive (`px-4 py-3 sm:px-5`, `flex flex-col sm:flex-row` footer). No other changes needed.

### 6. Forms → full-screen sheets (§4)
Converted these content-heavy dialogs to mobile full-screen with sticky header/scrollable body/sticky footer:
- `create-club-dialog.tsx` — CreateClubDialog (also bumped accent color swatches `h-7 w-7`→`h-9 w-9`)
- `teams-view.tsx` — CreateTeamDialog, EditTeamDialog, AddMembersDialog
- `meetings-view.tsx` — CreateMeetingDialog, EditMeetingDialog, MeetingDetailDialog (read-only detail with sticky RSVP/Close footer)
- `announcements-view.tsx` — ComposeAnnouncementDialog, EditAnnouncementDialog
- `hours-view.tsx` — SubmitHoursDialog (proof upload row `flex`→`flex-wrap` so the "Replace file" button + status text wrap on narrow screens)
- `members-view.tsx` — ImportCsvDialog (both upload-form and results states; removed redundant inner `max-h-[60vh] overflow-y-auto` from ImportResults since the dialog body now handles scroll)

**Shared pattern:** each file defines a local `MOBILE_FULLSCREEN_DIALOG` constant:
```
"top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
"sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-w-lg sm:rounded-lg sm:p-6 sm:gap-4 sm:grid"
```
On mobile: fills viewport, flex column, no rounding, no padding (padding goes on inner sections). On sm+: restores the default centered modal via `sm:` overrides. `showCloseButton={false}` on all since each form has an explicit Cancel button.

### 7. Table-to-card collapsing (§6) — verification
- **Hours history** (`hours-view.tsx`): already had `hidden md:block` table + `md:hidden` stacked cards ✓. Bumped delete button touch targets in both.
- **Members list** (`members-view.tsx`): already had `hidden md:block` table + `md:hidden` cards ✓.
- **Activity log**: already a timeline list (not a table) — N/A.
- **Dashboard leaderboard**: OFF-LIMITS — did not touch. Visually verified it renders as a list.
- **CSV-import preview** (`members-view.tsx` ImportResults): not a table — uses `grid grid-cols-2 sm:grid-cols-4` stat cards + div-based list rows with `truncate`. Already responsive.

### 8. Touch target audit (§5)
Bumped every `h-7 w-7` (28px) icon-only button in the touched views to `h-9 w-9` (36px):
- announcements: AnnouncementMenu trigger, comment delete button
- teams: TeamCardMenu trigger, detail-sheet close, roster remove button
- hours: delete buttons (both desktop table + mobile card)
- members: 2× password visibility toggles, member-row actions trigger
- notifications (app-shell): mark-read buttons, header/footer link buttons
- create-club: accent color swatches (h-7 w-7 → h-9 w-9)
Hover-only opacity patterns converted to `opacity-100 md:opacity-0 md:group-hover:opacity-100` so touch users can reach delete/mark-read affordances.

## Files modified
1. `src/components/views/announcements-view.tsx` — reaction bar + comment row touch/visibility + Compose/Edit dialogs → mobile sheets
2. `src/components/views/activity-view.tsx` — filter width + refresh touch target + timeline meta row wrapping
3. `src/components/views/teams-view.tsx` — card footer wrap + 3× touch targets + 3 dialogs → mobile sheets
4. `src/components/views/notifications-view.tsx` — mark-read button visibility + touch target
5. `src/components/views/hours-view.tsx` — SubmitHoursDialog → mobile sheet + delete button touch targets
6. `src/components/views/members-view.tsx` — header actions wrap + ImportCsvDialog → mobile sheet + 3× touch targets
7. `src/components/views/meetings-view.tsx` — 3 dialogs → mobile sheets
8. `src/components/auth/create-club-dialog.tsx` — CreateClubDialog → mobile sheet + color swatch touch targets
9. `src/components/app-shell.tsx` — NotificationBell refactored to Sheet (mobile) / Popover (desktop) + BellBody extracted + NotifRow touch/visibility

## Flagged for main agent
- **Create Task dialog (`tasks-view.tsx`)** — OFF-LIMITS per the task rules. It's a content-heavy form (title, description, assignee, team, due date, status) that would benefit from the same mobile full-screen sheet treatment. The pattern is documented above (MOBILE_FULLSCREEN_DIALOG constant + sticky header/body/footer). Main agent should apply it when convenient.

## Validation
- `bun run lint` → 0 errors, 0 warnings.
- `bunx tsc --noEmit` → 1 error in `hours-view.tsx:464` (`apiUpload<{ url: string }>` generic) — **pre-existing** (called out in R5 worklog as unrelated; I did not touch the `handleFile` function, only the dialog layout around it).
- Dev server log: no compile errors on the routes exercised. Views compile on-demand when navigated to.
- Did NOT touch any off-limits file: `layout.tsx`, `tasks-view.tsx`, `dashboard-view.tsx`, `use-realtime-sync.ts`, `realtime-store.ts`, `realtime-server.ts`, `activity.ts`, `mini-services/realtime/index.ts`, `prisma/schema.prisma`, `next.config.ts`, any API route.
