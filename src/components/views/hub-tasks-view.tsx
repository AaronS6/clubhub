"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  CheckSquare, CheckCircle2, Circle, Clock, Loader2, ChevronRight,
  ListFilter, Users,
} from "lucide-react"
import { api } from "@/lib/api/client"
import { usePollingFallback } from "@/lib/realtime-store"
import { openInClub } from "@/lib/hub-nav"
import type { HubTask } from "@/lib/hub-types"
import { ClubChip } from "@/components/shared/club-badge-chip"
import { cn } from "@/lib/utils"

/**
 * MY TASKS (My Hub context) — every task assigned to the signed-in student
 * across all their clubs, with club + status + deadline. Toggling a task
 * writes through the EXISTING club task API (members may update status);
 * clicking a row jumps to the task inside its club workspace. The club
 * workspace keeps the full kanban board — this page is the personal lens.
 */

type StatusFilter = "open" | "done" | "all"

interface HubTasksResponse {
  tasks: (HubTask & { updatedAt: string })[]
  clubs: { clubId: string; clubName: string; logoUrl: string | null; accentColor: string }[]
}

export function HubTasksView() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")
  const [clubFilter, setClubFilter] = useState<string | null>(null)

  const { data, isLoading } = useQuery<HubTasksResponse>({
    queryKey: ["hub-tasks", statusFilter],
    queryFn: () => api<HubTasksResponse>(`/api/hub/tasks?status=${statusFilter}`),
    refetchInterval: usePollingFallback(20_000),
    staleTime: 10_000,
  })

  const tasks = useMemo(
    () => (clubFilter ? data?.tasks.filter((t) => t.clubId === clubFilter) : data?.tasks) ?? [],
    [data, clubFilter]
  )

  const doneCount = tasks.filter((t) => t.status === "done").length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">My tasks</h1>
          <p className="text-body text-muted-foreground mt-1">
            Everything assigned to you.
          </p>
        </div>
        <StatusTabs value={statusFilter} onChange={setStatusFilter} />
      </header>

      {/* Club filter chips */}
      {data && data.clubs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by club">
          <FilterChip active={clubFilter === null} onClick={() => setClubFilter(null)}>
            All clubs
          </FilterChip>
          {data.clubs.map((c) => (
            <FilterChip
              key={c.clubId}
              active={clubFilter === c.clubId}
              onClick={() => setClubFilter(clubFilter === c.clubId ? null : c.clubId)}
            >
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: c.accentColor }} />
              {c.clubName}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Progress + list */}
      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading tasks">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4">
              <div className="h-5 w-5 rounded-full skeleton-shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-2/5 rounded skeleton-shimmer" />
                <div className="h-3 w-1/4 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyTasks statusFilter={statusFilter} />
      ) : (
        <>
          {statusFilter !== "open" && (
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-club transition-all duration-500"
                  style={{ width: `${Math.round((doneCount / Math.max(1, tasks.length)) * 100)}%` }}
                />
              </div>
              <span className="text-caption-medium tabular-nums text-muted-foreground">
                {doneCount} of {tasks.length} done
              </span>
            </div>
          )}
          <ul className="space-y-2">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function TaskRow({ task }: { task: HubTask & { updatedAt: string } }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: async (next: string) => {
      await api(`/api/clubs/${task.clubId}/tasks/${task.id}`, {
        method: "PATCH",
        json: { status: next },
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hub-tasks"] })
      qc.invalidateQueries({ queryKey: ["hub"] })
    },
  })

  const overdue = task.dueDate && task.status !== "done" && new Date(task.dueDate).getTime() < Date.now()
  const dueSoon =
    task.dueDate &&
    task.status !== "done" &&
    !overdue &&
    new Date(task.dueDate).getTime() < Date.now() + 3 * 24 * 3600 * 1000

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-card transition-[border-color,background-color] duration-150 hover:border-border hover:bg-accent/30"
      )}
    >
      <button
        type="button"
        aria-label={task.status === "done" ? `Reopen "${task.title}"` : `Mark "${task.title}" as done`}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(task.status === "done" ? "not_started" : "done")}
        className="mt-0.5 shrink-0 rounded-full text-muted-foreground/50 transition-colors hover:text-club focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
      >
        {toggle.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : task.status === "done" ? (
          <CheckCircle2 className="h-5 w-5 text-club" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      <button
        type="button"
        onClick={() => openInClub(task.clubId, "tasks", { type: "task", id: task.id })}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-lg"
      >
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cn("text-body-medium font-medium", task.status === "done" && "text-muted-foreground line-through")}>
            {task.title}
          </span>
          {task.status === "in_progress" && (
            <span className="rounded-full chip-progress px-2 py-0.5 text-[10px] font-medium">In progress</span>
          )}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          <ClubChip club={task.club} className="py-0" />
          {task.teamName && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {task.teamName}
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "font-medium text-danger-foreground",
                dueSoon && "font-medium text-warning-foreground"
              )}
            >
              <Clock className="h-3 w-3" />
              {overdue ? "Overdue · " : "Due "}
              {format(new Date(task.dueDate), "MMM d")}
            </span>
          )}
          {task.subtaskTotal > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-club"
                  style={{ width: `${(task.subtaskDone / task.subtaskTotal) * 100}%` }}
                />
              </span>
              <span className="tabular-nums">
                {task.subtaskDone}/{task.subtaskTotal}
              </span>
            </span>
          )}
        </span>
      </button>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </li>
  )
}

function StatusTabs({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const options: { value: StatusFilter; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "done", label: "Completed" },
    { value: "all", label: "All" },
  ]
  return (
    <div
      className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-0.5"
      role="tablist"
      aria-label="Task status filter"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-caption-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            value === o.value
              ? "bg-background font-semibold text-foreground shadow-card"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-caption-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "border-transparent bg-secondary font-semibold text-foreground"
          : "border-border/70 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function EmptyTasks({ statusFilter }: { statusFilter: StatusFilter }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-6 py-16 text-center shadow-card">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-success-subtle text-success-foreground">
        <CheckSquare className="h-5 w-5" />
      </div>
      <h3 className="text-card-title">
        {statusFilter === "open"
          ? "You're all caught up"
          : statusFilter === "done"
            ? "Nothing completed yet"
            : "No tasks"}
      </h3>
      <p className="text-body text-muted-foreground mt-1.5 max-w-sm">
        {statusFilter === "open"
          ? "No open tasks assigned to you."
          : "Tasks from your clubs will appear here."}
      </p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-muted-foreground/60">
        <ListFilter className="h-3.5 w-3.5" /> Open a club to see its full task board
      </p>
    </div>
  )
}
