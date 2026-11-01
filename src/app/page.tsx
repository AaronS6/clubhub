"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { useAppStore } from "@/lib/store"
import { AppShell } from "@/components/app-shell"
import { FeedSkeleton } from "@/components/shared/page-header"

// §9 — My Hub is the student's default landing view, so it stays eagerly
// imported (like the club dashboard: its initial-paint cost is lists, not
// charts). Both home views share the shell's keyed content wrapper.
import { HubView } from "@/components/views/hub-view"
import { DashboardView } from "@/components/views/dashboard-view"

// ---------------------------------------------------------------------------
// Lazy-loaded views
// ---------------------------------------------------------------------------
//
// Every non-default view is code-split via `next/dynamic` so its bundle is
// only fetched when the user navigates to it. The two home views stay eager
// because either can be the initial landing view (hub = default, club =
// deep link / restored context); lazy-loading them would just defer the
// first paint — a regression, not a win.
//
// `ssr: false` is intentional: these views are entirely client-side
// (TanStack Query + Zustand + socket.io) and the default `view` state is
// always "dashboard" on first paint (Zustand persist hydrates AFTER
// hydration), so the server-rendered HTML never needs to render these.
// This avoids any hydration mismatch while splitting each view into its own
// chunk. The chat view alone is ~2400 LOC + cmdk/emoji helpers, so this is a
// clear bundle-size win for the initial load.
//
// A content-shaped skeleton serves as the loading fallback for every view
// — matches the app's skeleton language (ghost page title + description +
// three feed-card ghosts) so the flash reads as "content loading", not
// "app missing". It renders inside the shell's keyed content wrapper
// (max-w-7xl + top padding + horizontal padding all come from there), so
// it aligns exactly with where real content lands. Modest by design: it
// should flash <400ms on fast connections.
function ViewLoader() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading view">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-md skeleton-shimmer" />
        <div className="h-4 w-64 rounded skeleton-shimmer" />
      </div>
      <FeedSkeleton count={3} />
    </div>
  )
}

// Chat renders in the shell's dedicated NON-scrollable full-height branch
// (iOS Safari keyboard fix), so its loading fallback can't lean on the
// standard shell wrapper for padding/max-width — it gets a self-contained
// centered spinner that fills the branch while the chunk streams in.
function ChatViewLoader() {
  return (
    <div
      className="flex flex-1 items-center justify-center text-muted-foreground"
      role="status"
      aria-label="Loading chat"
    >
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

const AnnouncementsView = dynamic(
  () => import("@/components/views/announcements-view").then((m) => m.AnnouncementsView),
  { loading: () => <ViewLoader />, ssr: false },
)
const HoursView = dynamic(
  () => import("@/components/views/hours-view").then((m) => m.HoursView),
  { loading: () => <ViewLoader />, ssr: false },
)
const ApprovalsView = dynamic(
  () => import("@/components/views/approvals-view").then((m) => m.ApprovalsView),
  { loading: () => <ViewLoader />, ssr: false },
)
const TasksView = dynamic(
  () => import("@/components/views/tasks-view").then((m) => m.TasksView),
  { loading: () => <ViewLoader />, ssr: false },
)
const MeetingsView = dynamic(
  () => import("@/components/views/meetings-view").then((m) => m.MeetingsView),
  { loading: () => <ViewLoader />, ssr: false },
)
const TeamsView = dynamic(
  () => import("@/components/views/teams-view").then((m) => m.TeamsView),
  { loading: () => <ViewLoader />, ssr: false },
)
const MembersView = dynamic(
  () => import("@/components/views/members-view").then((m) => m.MembersView),
  { loading: () => <ViewLoader />, ssr: false },
)
const ActivityView = dynamic(
  () => import("@/components/views/activity-view").then((m) => m.ActivityView),
  { loading: () => <ViewLoader />, ssr: false },
)
const FinancialsView = dynamic(
  () => import("@/components/views/financials-view").then((m) => m.FinancialsView),
  { loading: () => <ViewLoader />, ssr: false },
)
const NotesView = dynamic(
  () => import("@/components/views/notes-view").then((m) => m.NotesView),
  { loading: () => <ViewLoader />, ssr: false },
)
const ChatView = dynamic(
  () => import("@/components/views/chat-view").then((m) => m.ChatView),
  { loading: () => <ChatViewLoader />, ssr: false },
)
const NotificationsView = dynamic(
  () => import("@/components/views/notifications-view").then((m) => m.NotificationsView),
  { loading: () => <ViewLoader />, ssr: false },
)
const StorageView = dynamic(
  () => import("@/components/views/storage-view").then((m) => m.StorageView),
  { loading: () => <ViewLoader />, ssr: false },
)
const ClubSettingsView = dynamic(
  () => import("@/components/views/club-settings-view").then((m) => m.ClubSettingsView),
  { loading: () => <ViewLoader />, ssr: false },
)

// §9 — the My Hub variants of the shared pages (cross-club aggregation).
// Lazy-loaded: they're reached from the default hub home, so their chunks
// stream in parallel with the first interaction.
const HubCalendarView = dynamic(
  () => import("@/components/views/hub-calendar-view").then((m) => m.HubCalendarView),
  { loading: () => <ViewLoader />, ssr: false },
)
const HubTasksView = dynamic(
  () => import("@/components/views/hub-tasks-view").then((m) => m.HubTasksView),
  { loading: () => <ViewLoader />, ssr: false },
)
const HubUpdatesView = dynamic(
  () => import("@/components/views/hub-updates-view").then((m) => m.HubUpdatesView),
  { loading: () => <ViewLoader />, ssr: false },
)
const HubInboxView = dynamic(
  () => import("@/components/views/hub-inbox-view").then((m) => m.HubInboxView),
  { loading: () => <ViewLoader />, ssr: false },
)

export default function Home() {
  const view = useAppStore((s) => s.view)
  const context = useAppStore((s) => s.context)
  // §9 — the shared pages render their My Hub (aggregated) variant or the
  // club workspace variant depending on the active context. Club-only views
  // are unreachable in My Hub (the store's resolveView guard redirects them
  // to the hub home), so they need no hub branch.
  const isHub = context === "hub"
  return (
    <AppShell>
      {view === "dashboard" && (isHub ? <HubView /> : <DashboardView />)}
      {view === "meetings" && (isHub ? <HubCalendarView /> : <MeetingsView />)}
      {view === "tasks" && (isHub ? <HubTasksView /> : <TasksView />)}
      {view === "announcements" && (isHub ? <HubUpdatesView /> : <AnnouncementsView />)}
      {view === "chat" && (isHub ? <HubInboxView /> : <ChatView />)}
      {view === "hours" && !isHub && <HoursView />}
      {view === "approvals" && !isHub && <ApprovalsView />}
      {view === "teams" && !isHub && <TeamsView />}
      {view === "members" && !isHub && <MembersView />}
      {view === "activity" && !isHub && <ActivityView />}
      {view === "financials" && !isHub && <FinancialsView />}
      {view === "notes" && !isHub && <NotesView />}
      {view === "storage" && !isHub && <StorageView />}
      {view === "settings" && !isHub && <ClubSettingsView />}
      {view === "notifications" && <NotificationsView />}
    </AppShell>
  )
}
