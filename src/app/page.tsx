"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { useAppStore } from "@/lib/store"
import { AppShell } from "@/components/app-shell"

// The dashboard is the default landing view, so it stays eagerly imported —
// its recharts dependency is needed on initial paint anyway.
import { DashboardView } from "@/components/views/dashboard-view"

// ---------------------------------------------------------------------------
// Lazy-loaded views
// ---------------------------------------------------------------------------
//
// Every non-default view is code-split via `next/dynamic` so its bundle is
// only fetched when the user navigates to it. The dashboard view stays eager
// because it's the initial landing view (lazy-loading it would just defer
// the chart render — a regression, not a win).
//
// `ssr: false` is intentional: these views are entirely client-side
// (TanStack Query + Zustand + socket.io) and the default `view` state is
// always "dashboard" on first paint (Zustand persist hydrates AFTER
// hydration), so the server-rendered HTML never needs to render these.
// This avoids any hydration mismatch while splitting each view into its own
// chunk. The chat view alone is ~2400 LOC + cmdk/emoji helpers, so this is
// a clear bundle-size win for the initial load.
//
// A tiny centered spinner serves as the loading fallback for every view —
// small enough to not flash on fast connections, visible enough to indicate
// progress on slow ones.
function ViewLoader() {
  return (
    <div
      className="flex h-[60vh] w-full items-center justify-center"
      role="status"
      aria-label="Loading view"
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
const ChatView = dynamic(
  () => import("@/components/views/chat-view").then((m) => m.ChatView),
  { loading: () => <ViewLoader />, ssr: false },
)
const NotificationsView = dynamic(
  () => import("@/components/views/notifications-view").then((m) => m.NotificationsView),
  { loading: () => <ViewLoader />, ssr: false },
)

export default function Home() {
  const view = useAppStore((s) => s.view)
  return (
    <AppShell>
      {view === "dashboard" && <DashboardView />}
      {view === "announcements" && <AnnouncementsView />}
      {view === "hours" && <HoursView />}
      {view === "approvals" && <ApprovalsView />}
      {view === "tasks" && <TasksView />}
      {view === "meetings" && <MeetingsView />}
      {view === "teams" && <TeamsView />}
      {view === "members" && <MembersView />}
      {view === "activity" && <ActivityView />}
      {view === "chat" && <ChatView />}
      {view === "notifications" && <NotificationsView />}
    </AppShell>
  )
}
