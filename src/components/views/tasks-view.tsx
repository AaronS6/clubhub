"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus,
  Calendar,
  Check,
  CheckCircle2,
  ListChecks,
  MessageSquare,
  Trash2,
  GripVertical,
  Users,
  Filter,
  X,
  Loader2,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react"

import { api } from "@/lib/api/client"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { usePollingFallback, useRemoteChange } from "@/lib/realtime-store"
import {
  PageHeader,
  EmptyState,
  TasksEmptyIllustration,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { StatusPill } from "@/components/shared/status-pill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskStatus = "not_started" | "in_progress" | "done"

interface TaskUser {
  id: string
  name: string
  avatarUrl?: string | null
}
interface TaskTeam {
  id: string
  name: string
}
interface Subtask {
  id: string
  title: string
  isDone: boolean
  createdAt: string
}
interface TaskComment {
  id: string
  body: string
  createdAt: string
  authorId: string
  author: { id: string; name: string; avatarUrl?: string | null }
}
interface Task {
  id: string
  clubId: string
  teamId: string | null
  title: string
  description: string | null
  assignedToUserId: string | null
  assignee: TaskUser | null
  team: TaskTeam | null
  creator: { id: string; name: string }
  dueDate: string | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
  createdById: string
  subtasks: Subtask[]
  commentCount: number
}

interface TasksListResponse {
  tasks: Task[]
  teams: TaskTeam[]
  members: TaskUser[]
  myUserId: string
  myRole: "member" | "executive"
}

interface CommentsResponse {
  comments: TaskComment[]
  myUserId: string
  myRole: "member" | "executive"
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUSES: { id: TaskStatus; label: string; badge: "not_started" | "in_progress" | "done" }[] = [
  { id: "not_started", label: "Not Started", badge: "not_started" },
  { id: "in_progress", label: "In Progress", badge: "in_progress" },
  { id: "done", label: "Done", badge: "done" },
]

// Linear-style column accents: warm amber for not-started, sky-blue for
// in-progress, emerald for done. The opacity is kept low so the column
// background stays calm and the status dot/badge carries the signal.
const COLUMN_ACCENT: Record<TaskStatus, string> = {
  not_started: "bg-amber-500/20 dark:bg-amber-500/25",
  in_progress: "bg-sky-500/20 dark:bg-sky-500/25",
  done: "bg-emerald-500/20 dark:bg-emerald-500/25",
}

// Left-edge accent bar per status — colored 3px strip on the card's left
// edge so the status is readable at a glance without reading the badge text.
const CARD_ACCENT: Record<TaskStatus, string> = {
  not_started: "border-l-[3px] border-l-amber-400",
  in_progress: "border-l-[3px] border-l-sky-400",
  done: "border-l-[3px] border-l-emerald-400",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate).getTime() < Date.now()
}

function toDateInputValue(d: string | null): string {
  if (!d) return ""
  const date = new Date(d)
  if (isNaN(date.getTime())) return ""
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function formatDueDate(d: string | null): string {
  if (!d) return "—"
  const date = new Date(d)
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}

function subtaskProgress(subtasks: Subtask[]): string {
  if (subtasks.length === 0) return ""
  const done = subtasks.filter((s) => s.isDone).length
  return `${done}/${subtasks.length}`
}

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------

function UserAvatar({
  user,
  size = "sm",
}: {
  user?: { name: string; avatarUrl?: string | null } | null
  size?: "sm" | "md"
}) {
  const sz = size === "sm" ? "size-6" : "size-8"
  if (!user) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-dashed border-muted-foreground/40 bg-muted text-muted-foreground",
          sz,
          "text-[10px] font-medium"
        )}
        title="Unassigned"
        aria-label="Unassigned"
      >
        <Users className="size-3" />
      </span>
    )
  }
  return (
    <Avatar className={sz}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
      <AvatarFallback className="text-[10px] font-medium">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function TasksView() {
  const currentClubId = useAppStore((s) => s.currentClubId)
  const currentClub = useAppStore((s) => s.currentClub)

  const [tab, setTab] = React.useState<"board" | "list">("board")
  const [teamFilter, setTeamFilter] = React.useState<string>("all")
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")

  const [newTaskOpen, setNewTaskOpen] = React.useState(false)
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null)

  const queryClient = useQueryClient()

  const queryKey = React.useMemo(
    () => ["tasks", currentClubId ?? ""],
    [currentClubId]
  )

  const { data, isLoading, isError, error, refetch } = useQuery<TasksListResponse>({
    queryKey,
    queryFn: () =>
      api<TasksListResponse>(`/api/clubs/${currentClubId}/tasks`),
    enabled: !!currentClubId,
    staleTime: 30_000,
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(5000),
  })

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey])

  // Apply client-side filters as query params so the server returns filtered data.
  const filteredTasks = React.useMemo(() => {
    if (!data?.tasks) return []
    return data.tasks.filter((t) => {
      if (teamFilter !== "all" && t.teamId !== teamFilter) return false
      if (assigneeFilter === "me") {
        if (t.assignedToUserId !== data.myUserId) return false
      } else if (assigneeFilter !== "all" && t.assignedToUserId !== assigneeFilter) {
        return false
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return false
      return true
    })
  }, [data, teamFilter, assigneeFilter, statusFilter])

  const isExec = data?.myRole === "executive"

  // Drag state for DragOverlay
  const [draggedId, setDraggedId] = React.useState<string | null>(null)
  const draggedTask = React.useMemo(
    () => data?.tasks.find((t) => t.id === draggedId) ?? null,
    [data, draggedId]
  )

  // DnD sensors — critical for mobile usability:
  // - PointerSensor (distance: 6px) for mouse/trackpad — desktop drag doesn't
  //   conflict with page scroll.
  // - TouchSensor (delay: 200ms, tolerance: 8px) for touch — a DELAY-based
  //   constraint means a quick tap/scroll gesture is never mistaken for a
  //   drag, but a deliberate press-and-hold reliably starts one. Without
  //   this, a 6px distance constraint on touch means the moment a finger
  //   moves slightly while scrolling, dnd-kit hijacks the gesture and the
  //   user can't scroll the board.
  // - KeyboardSensor for accessibility.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const updateStatusMutation = useMutation({
    mutationFn: (vars: { taskId: string; status: TaskStatus }) =>
      api(`/api/clubs/${currentClubId}/tasks/${vars.taskId}`, {
        method: "PATCH",
        json: { status: vars.status },
      }),
    onSuccess: () => {
      invalidate()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      invalidate()
    },
  })

  function handleDragStart(e: DragStartEvent) {
    setDraggedId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setDraggedId(null)
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const allTasks = data?.tasks ?? []
    const dragged = allTasks.find((t) => t.id === activeId)
    if (!dragged) return

    // Determine target status.
    let targetStatus: TaskStatus | null = null
    if (STATUSES.some((s) => s.id === overId)) {
      targetStatus = overId as TaskStatus
    } else {
      const overTask = allTasks.find((t) => t.id === overId)
      if (overTask) targetStatus = overTask.status
    }
    if (!targetStatus || targetStatus === dragged.status) return

    // Optimistic update: immediately mutate query cache to move the card.
    queryClient.setQueryData<TasksListResponse>(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        tasks: old.tasks.map((t) =>
          t.id === activeId ? { ...t, status: targetStatus! } : t
        ),
      }
    })

    updateStatusMutation.mutate({
      taskId: activeId,
      status: targetStatus,
    })
  }

  if (!currentClubId || !currentClub) {
    return (
      <div className="p-8 text-muted-foreground">
        Select a club to manage tasks.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* §37 — Sticky page header on desktop. Wraps PageHeader in a sticky,
          backdrop-blurred bar so it stays visible while scrolling long task
          lists. Hidden on mobile to avoid double-stacking with the mobile tab
          switcher. */}
      <div className="hidden sm:block sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <PageHeader
          title="Tasks"
          description="Track club work, subtasks, and assignments."
          actions={
            isExec ? (
              <Button variant="club" onClick={() => setNewTaskOpen(true)} size="sm">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New Task</span>
              </Button>
            ) : null
          }
        />
      </div>
      {/* Mobile (non-sticky) header so the New Task button stays reachable */}
      <div className="sm:hidden">
        <PageHeader
          title="Tasks"
          description="Track club work, subtasks, and assignments."
          actions={
            isExec ? (
              <Button variant="club" onClick={() => setNewTaskOpen(true)} size="sm">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New Task</span>
              </Button>
            ) : null
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" />
          <span className="hidden sm:inline">Filters</span>
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-full sm:w-44" size="sm">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {data?.teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-full sm:w-44" size="sm">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            {data?.members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tab === "list" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="hidden sm:block sm:ml-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "board" | "list")}>
            <TabsList>
              <TabsTrigger value="board" aria-label="Board view">
                <LayoutGrid className="size-4" />
                <span className="hidden md:inline ml-1">Board</span>
              </TabsTrigger>
              <TabsTrigger value="list" aria-label="List view">
                <ListIcon className="size-4" />
                <span className="hidden md:inline ml-1">List</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* §33 — Active filter chips. Show each active filter as a removable pill
          above the list so the user can see what's filtered and clear them in
          one tap. Mirrors the convention used in Linear/Notion. */}
      {(teamFilter !== "all" ||
        assigneeFilter !== "all" ||
        statusFilter !== "all") && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          {teamFilter !== "all" && (
            <button
              type="button"
              onClick={() => setTeamFilter("all")}
              className="inline-flex items-center gap-1 rounded-full bg-club-muted px-2.5 py-1 text-xs text-club hover:bg-club-muted/70 transition-colors"
            >
              {data?.teams.find((t) => t.id === teamFilter)?.name ?? "Team"}
              <X className="size-3" />
            </button>
          )}
          {assigneeFilter !== "all" && (
            <button
              type="button"
              onClick={() => setAssigneeFilter("all")}
              className="inline-flex items-center gap-1 rounded-full bg-club-muted px-2.5 py-1 text-xs text-club hover:bg-club-muted/70 transition-colors"
            >
              {assigneeFilter === "me"
                ? "Assigned to me"
                : data?.members.find((m) => m.id === assigneeFilter)?.name ?? "Assignee"}
              <X className="size-3" />
            </button>
          )}
          {tab === "list" && statusFilter !== "all" && (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="inline-flex items-center gap-1 rounded-full bg-club-muted px-2.5 py-1 text-xs text-club hover:bg-club-muted/70 transition-colors"
            >
              {STATUSES.find((s) => s.id === statusFilter)?.label ?? "Status"}
              <X className="size-3" />
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTeamFilter("all")
              setAssigneeFilter("all")
              setStatusFilter("all")
            }}
            className="h-7 text-muted-foreground hover:text-foreground px-2"
          >
            <X className="size-3.5" />
            Clear all
          </Button>
        </div>
      )}

      {/* Mobile tab switcher */}
      <div className="sm:hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "board" | "list")}>
          <TabsList className="w-full">
            <TabsTrigger value="board" className="flex-1">
              <LayoutGrid className="size-4" />
              <span className="ml-1">Board</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="flex-1">
              <ListIcon className="size-4" />
              <span className="ml-1">List</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Body */}
      {isError ? (
        <EmptyState
          icon={<X className="h-8 w-8" />}
          title="Couldn't load tasks"
          description={error instanceof Error ? error.message : "Try again."}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : isLoading ? (
        <TasksLoadingSkeleton variant={tab} />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          illustration={<TasksEmptyIllustration />}
          title={isExec ? "No tasks yet" : "No tasks match your filters"}
          description={
            isExec
              ? "Create one to get started."
              : "Try clearing filters or check back later."
          }
          action={
            isExec ? (
              <Button variant="club" onClick={() => setNewTaskOpen(true)} size="sm">
                <Plus className="size-4" />
                New Task
              </Button>
            ) : null
          }
        />
      ) : tab === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggedId(null)}
        >
          <BoardView
            tasks={filteredTasks}
            onOpenTask={setDetailTaskId}
            isExec={!!isExec}
            myUserId={data?.myUserId}
            clubId={currentClubId}
          />
          <DragOverlay>
            {draggedTask ? (
              <TaskCardContent task={draggedTask} dragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <ListView
          tasks={filteredTasks}
          onOpenTask={setDetailTaskId}
          onStatusChange={(taskId, status) =>
            updateStatusMutation.mutate({ taskId, status })
          }
          isExec={!!isExec}
          myUserId={data?.myUserId}
        />
      )}

      {/* New task dialog */}
      <NewTaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        clubId={currentClubId}
        teams={data?.teams ?? []}
        members={data?.members ?? []}
        onCreated={() => invalidate()}
      />

      {/* Detail sheet */}
      <TaskDetailSheet
        taskId={detailTaskId}
        clubId={currentClubId}
        open={!!detailTaskId}
        onOpenChange={(open) => {
          if (!open) setDetailTaskId(null)
        }}
        onChanged={() => invalidate()}
        teams={data?.teams ?? []}
        members={data?.members ?? []}
        myUserId={data?.myUserId}
        isExec={!!isExec}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board view
// ---------------------------------------------------------------------------

function BoardView({
  tasks,
  onOpenTask,
  isExec,
  myUserId,
  clubId,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
  isExec: boolean
  myUserId?: string
  clubId?: string
}) {
  return (
    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-3 sm:gap-4">
      {STATUSES.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status.id)
        return (
          <BoardColumn
            key={status.id}
            status={status}
            tasks={columnTasks}
            onOpenTask={onOpenTask}
            isExec={isExec}
            myUserId={myUserId}
            clubId={clubId}
          />
        )
      })}
    </div>
  )
}

function BoardColumn({
  status,
  tasks,
  onOpenTask,
  isExec,
  myUserId,
  clubId,
}: {
  status: { id: TaskStatus; label: string; badge: "not_started" | "in_progress" | "done" }
  tasks: Task[]
  onOpenTask: (id: string) => void
  isExec: boolean
  myUserId?: string
  clubId?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  const ids = React.useMemo(() => tasks.map((t) => t.id), [tasks])
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col card-quiet rounded-xl p-3 transition-all duration-150",
        COLUMN_ACCENT[status.id],
        isOver && "ring-2 ring-club/40 bg-club/5"
      )}
      aria-label={`${status.label} column`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <StatusPill status={status.badge} />
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
            {status.id === "done" && <Check className="size-3" />}
            {tasks.length}
            {status.id === "done" && <span className="hidden sm:inline">done</span>}
          </span>
        </div>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[60px] flex-col gap-2">
          {tasks.length === 0 ? (
            <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 text-xs text-muted-foreground">
              Drop tasks here
            </div>
          ) : (
            tasks.map((t) => (
              <SortableTaskCard
                key={t.id}
                task={t}
                onOpen={onOpenTask}
                isExec={isExec}
                myUserId={myUserId}
                clubId={clubId}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableTaskCard({
  task,
  onOpen,
  isExec,
  myUserId,
  clubId,
}: {
  task: Task
  onOpen: (id: string) => void
  isExec: boolean
  myUserId?: string
  clubId?: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-none"
      {...attributes}
    >
      <TaskCardContent
        task={task}
        isExec={isExec}
        onOpen={() => onOpen(task.id)}
        myUserId={myUserId}
        clubId={clubId}
        dragListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  )
}

function TaskCardContent({
  task,
  isExec,
  onOpen,
  dragging,
  myUserId,
  clubId,
  dragListeners,
  isDragging,
}: {
  task: Task
  isExec?: boolean
  onOpen?: () => void
  dragging?: boolean
  myUserId?: string
  clubId?: string
  dragListeners?: ReturnType<typeof useSortable>["listeners"]
  isDragging?: boolean
}) {
  const overdue = isOverdue(task.dueDate) && task.status !== "done"
  // Briefly highlight when this card was just touched by another user's
  // realtime action (create/move/edit/delete) so the change is perceptible.
  const flash = useRemoteChange("task", task.id)
  const qc = useQueryClient()

  // Can delete if exec OR the assignee (matches the API's server-side check).
  const canDelete = isExec || (myUserId && task.assignedToUserId === myUserId)

  const deleteMutation = useMutation({
    mutationFn: () =>
      api(`/api/clubs/${clubId}/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", clubId] })
      const undo = async () => {
        try {
          await api(`/api/clubs/${clubId}/tasks/${task.id}/restore`, { method: "POST" })
          toast.success(`Restored "${task.title}"`)
          qc.invalidateQueries({ queryKey: ["tasks", clubId] })
        } catch (e: any) {
          toast.error(e.message || "Couldn't restore the task")
        }
      }
      toast(`Deleted "${task.title}"`, {
        duration: 5000,
        action: { label: "Undo", onClick: undo },
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) =>
      api(`/api/clubs/${clubId}/tasks/${task.id}`, {
        method: "PATCH",
        json: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", clubId] }),
    onError: (e: Error) => toast.error(e.message),
  })

  // Prevent button clicks from triggering the card's onClick (open detail).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
      {...(dragListeners ?? {})}
      className={cn(
        "group card-quiet rounded-xl cursor-grab p-3 text-left transition-all duration-150 hover:shadow-sm hover:border-club/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        CARD_ACCENT[task.status],
        dragging && "shadow-xl -rotate-2 scale-[1.02] cursor-grabbing ring-2 ring-club/40",
        isDragging && "shadow-xl -rotate-2 scale-[1.02] cursor-grabbing ring-2 ring-club/40",
        flash && "ring-2 ring-club/50 shadow-md animate-in fade-in-50 zoom-in-95 duration-300"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle — visual indicator only. The whole card receives the
            dnd-kit listeners (see the spread above) so the entire surface is
            draggable; this grip icon just hints at affordance. */}
        {dragListeners && (
          <span
            className="mt-0.5 flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100 touch-none pointer-events-none"
            aria-hidden
          >
            <GripVertical className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-body-medium leading-tight">{task.title}</p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-caption">
              {task.description}
            </p>
          )}
        </div>
        {/* Delete button — visible on hover (desktop) or always (mobile).
            Exec OR assignee can delete. 44px tap target. onPointerDown stops
            propagation so clicking delete doesn't start a card drag. */}
        {canDelete && clubId && (
          <button
            type="button"
            title="Delete task"
            className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
            aria-label="Delete task"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              stop(e)
              deleteMutation.mutate()
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.team && (
          <Badge variant="outline" className="text-[10px]">
            {task.team.name}
          </Badge>
        )}
        {task.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3" />
            {subtaskProgress(task.subtasks)}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="size-3" />
            {task.commentCount}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <UserAvatar user={task.assignee} />
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                overdue ? "text-red-600 font-medium dark:text-red-400" : "text-muted-foreground"
              )}
            >
              <Calendar className="size-3" />
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>

      {/* Mobile-only status dropdown — a foolproof fallback to drag-and-drop
          on touch devices. Shown below the md breakpoint only; desktop keeps
          pure drag-and-drop. */}
      {clubId && (
        <div className="mt-2 md:hidden" onClick={stop} onPointerDown={stop}>
          <Select
            value={task.status}
            onValueChange={(v) => statusMutation.mutate(v as TaskStatus)}
            disabled={statusMutation.isPending}
          >
            <SelectTrigger className="h-8 text-xs" aria-label="Change task status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ListView({
  tasks,
  onOpenTask,
  onStatusChange,
  isExec,
  myUserId,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  isExec: boolean
  myUserId?: string
}) {
  return (
    <div className="card-quiet rounded-xl p-0 overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <Table className="[&_tr]:h-10 [&_td]:py-1.5 [&_td]:px-3 [&_th]:h-9 [&_th]:py-1.5 [&_th]:px-3">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Title</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="hidden md:table-cell">Team</TableHead>
              <TableHead className="hidden sm:table-cell">Due</TableHead>
              <TableHead className="min-w-[160px]">Status</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => {
              const overdue = isOverdue(t.dueDate) && t.status !== "done"
              const canChangeStatus =
                isExec || t.assignedToUserId === myUserId
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors duration-150"
                  onClick={() => onOpenTask(t.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="truncate">{t.title}</span>
                      {t.subtasks.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {subtaskProgress(t.subtasks)} subtasks
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar user={t.assignee} />
                      <span className="text-sm">
                        {t.assignee?.name ?? (
                          <span className="text-muted-foreground italic">
                            Unassigned
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.team ? (
                      <Badge variant="outline" className="text-xs">
                        {t.team.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {t.dueDate ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-sm",
                          overdue
                            ? "text-red-600 font-medium dark:text-red-400"
                            : "text-muted-foreground"
                        )}
                      >
                        <Calendar className="size-3" />
                        {formatDueDate(t.dueDate)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={t.status}
                      onValueChange={(v) =>
                        onStatusChange(t.id, v as TaskStatus)
                      }
                      disabled={!canChangeStatus}
                    >
                      <SelectTrigger size="sm" className="h-8 w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      aria-label="Open task details"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenTask(t.id)
                      }}
                    >
                      <ListChecks className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TasksLoadingSkeleton({ variant }: { variant: "board" | "list" }) {
  if (variant === "list") {
    return (
      <div className="card-quiet p-4">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STATUSES.map((s) => (
        <div
          key={s.id}
          className={cn(
            "card-quiet p-3",
            COLUMN_ACCENT[s.id]
          )}
        >
          <Skeleton className="mb-3 h-5 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New task dialog
// ---------------------------------------------------------------------------

function NewTaskDialog({
  open,
  onOpenChange,
  clubId,
  teams,
  members,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  teams: TaskTeam[]
  members: TaskUser[]
  onCreated: () => void
}) {
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [teamId, setTeamId] = React.useState<string>("none")
  const [assigneeId, setAssigneeId] = React.useState<string>("none")
  const [dueDate, setDueDate] = React.useState<string>("")
  const [titleError, setTitleError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setTitle("")
      setDescription("")
      setTeamId("none")
      setAssigneeId("none")
      setDueDate("")
      setTitleError(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () => {
      const body: any = { title }
      if (description.trim()) body.description = description.trim()
      if (teamId !== "none") body.teamId = teamId
      if (assigneeId !== "none") body.assignedToUserId = assigneeId
      if (dueDate) body.dueDate = new Date(dueDate).toISOString()
      return api(`/api/clubs/${clubId}/tasks`, { method: "POST", json: body })
    },
    onSuccess: () => {
      toast.success("Task created")
      onCreated()
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setTitleError("Title is required")
      return
    }
    setTitleError(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS}>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              Add a task to track club work. You can edit details later.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (titleError) setTitleError(null)
                }}
                placeholder="e.g. Plan spring fundraiser"
                autoFocus
                maxLength={200}
                required
                aria-invalid={!!titleError}
                className={titleError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {titleError && (
                <p className="text-xs text-red-500 mt-1">{titleError}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="task-desc">Description (optional)</Label>
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add details, context, links…"
                rows={3}
                maxLength={5000}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="task-team">Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger id="task-team" className="w-full">
                    <SelectValue placeholder="No team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="task-assignee">Assignee</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger id="task-assignee" className="w-full">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="task-due">Due date (optional)</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="club" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Task detail sheet
// ---------------------------------------------------------------------------

function TaskDetailSheet({
  taskId,
  clubId,
  open,
  onOpenChange,
  onChanged,
  teams,
  members,
  myUserId,
  isExec,
}: {
  taskId: string | null
  clubId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
  teams: TaskTeam[]
  members: TaskUser[]
  myUserId?: string
  isExec: boolean
}) {
  // We rely on the parent list query for the task data — when mutations happen,
  // the parent's invalidation refetches this list and the task object updates.
  const queryClient = useQueryClient()
  const task = React.useMemo(() => {
    if (!taskId) return null
    return (
      queryClient.getQueryData<TasksListResponse>(["tasks", clubId])?.tasks.find(
        (t) => t.id === taskId
      ) ?? null
    )
  }, [taskId, clubId, queryClient, open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="truncate">
            {task?.title ?? "Task details"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit task details, manage subtasks and comments.
          </SheetDescription>
        </SheetHeader>
        {task ? (
          <ScrollArea className="flex-1">
            <TaskDetailBody
              key={task.id}
              task={task}
              clubId={clubId}
              teams={teams}
              members={members}
              myUserId={myUserId}
              isExec={isExec}
              onChanged={onChanged}
            />
          </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetailBody({
  task,
  clubId,
  teams,
  members,
  myUserId,
  isExec,
  onChanged,
}: {
  task: Task
  clubId: string
  teams: TaskTeam[]
  members: TaskUser[]
  myUserId?: string
  isExec: boolean
  onChanged: () => void
}) {
  const invalidateAll = React.useCallback(() => {
    onChanged()
  }, [onChanged])

  // Editable fields (exec only)
  const [title, setTitle] = React.useState(task.title)
  const [description, setDescription] = React.useState(task.description ?? "")
  const [teamId, setTeamId] = React.useState(task.teamId ?? "none")
  const [assigneeId, setAssigneeId] = React.useState(
    task.assignedToUserId ?? "none"
  )
  const [dueDate, setDueDate] = React.useState(
    toDateInputValue(task.dueDate)
  )
  const [status, setStatus] = React.useState<TaskStatus>(task.status)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  React.useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? "")
    setTeamId(task.teamId ?? "none")
    setAssigneeId(task.assignedToUserId ?? "none")
    setDueDate(toDateInputValue(task.dueDate))
    setStatus(task.status)
  }, [task])

  const canEdit = isExec
  const canChangeStatus = isExec || task.assignedToUserId === myUserId
  // The assignee or an executive may delete a task (the API enforces the same).
  const canDelete = isExec || task.assignedToUserId === myUserId

  const patchMutation = useMutation({
    mutationFn: (patch: Record<string, any>) =>
      api(`/api/clubs/${clubId}/tasks/${task.id}`, {
        method: "PATCH",
        json: patch,
      }),
    onSuccess: () => {
      toast.success("Task updated")
      invalidateAll()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function saveField(field: string, value: any) {
    if (!isExec) return
    // Coalesce "none" sentinels back to null for foreign-key fields.
    if (field === "teamId" || field === "assignedToUserId") {
      if (value === "none") value = null
    }
    if (field === "dueDate") {
      value = value ? new Date(value).toISOString() : null
    }
    patchMutation.mutate({ [field]: value })
  }

  const deleteMutation = useMutation({
    mutationFn: () =>
      api(`/api/clubs/${clubId}/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      // Close the confirm dialog.
      setDeleteOpen(false)
      // Optimistically remove the task from the local cache so the board
      // updates instantly (the realtime invalidation will correct any race).
      invalidateAll()
      // Show an Undo toast — clicking "Undo" within 5s restores the task.
      const undo = async () => {
        try {
          await api(`/api/clubs/${clubId}/tasks/${task.id}/restore`, {
            method: "POST",
          })
          toast.success(`Restored "${task.title}"`)
          invalidateAll()
        } catch (e: any) {
          toast.error(e.message || "Couldn't restore the task")
        }
      }
      toast(`Deleted "${task.title}"`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: undo,
        },
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Title (exec editable) */}
      {canEdit ? (
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && saveField("title", title)}
          className="text-base font-medium"
        />
      ) : (
        <p className="text-base font-medium">{task.title}</p>
      )}

      {/* Quick status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status:</span>
        {canChangeStatus ? (
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as TaskStatus)
              saveField("status", v)
            }}
          >
            <SelectTrigger size="sm" className="h-7 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <StatusPill status={task.status} />
        )}
        {task.creator && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">
              Created by {task.creator.name} · {relativeTime(task.createdAt)}
            </span>
          </>
        )}
      </div>

      <Separator />

      {/* Description */}
      <div className="flex flex-col gap-2">
        <Label>Description</Label>
        {canEdit ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              description !== (task.description ?? "") &&
              saveField("description", description)
            }
            placeholder="Add a description…"
            rows={4}
          />
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {task.description || "No description."}
          </p>
        )}
      </div>

      {/* Team / assignee / due */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Team</Label>
          {canEdit ? (
            <Select
              value={teamId}
              onValueChange={(v) => {
                setTeamId(v)
                saveField("teamId", v)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm">
              {task.team ? (
                <Badge variant="outline">{task.team.name}</Badge>
              ) : (
                <span className="text-muted-foreground">No team</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Assignee</Label>
          {canEdit ? (
            <Select
              value={assigneeId}
              onValueChange={(v) => {
                setAssigneeId(v)
                saveField("assignedToUserId", v)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <UserAvatar user={task.assignee} size="md" />
              <span>
                {task.assignee?.name ?? (
                  <span className="text-muted-foreground italic">
                    Unassigned
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="due-date">Due date</Label>
          {canEdit ? (
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onBlur={() =>
                dueDate !== toDateInputValue(task.dueDate) &&
                saveField("dueDate", dueDate)
              }
            />
          ) : (
            <p className="text-sm">
              {task.dueDate ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    isOverdue(task.dueDate) && task.status !== "done"
                      ? "text-red-600 font-medium dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  <Calendar className="size-4" />
                  {formatDueDate(task.dueDate)}
                </span>
              ) : (
                <span className="text-muted-foreground">No due date</span>
              )}
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Subtasks */}
      <SubtasksSection task={task} clubId={clubId} onChanged={invalidateAll} />

      <Separator />

      {/* Comments */}
      <CommentsSection task={task} clubId={clubId} myUserId={myUserId} isExec={isExec} onChanged={invalidateAll} />

      {/* Footer actions */}
      {canDelete && (
        <div className="flex justify-end pt-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4" />
            Delete task
          </Button>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              The task “{task.title}” will be removed from the board. You can
              undo this from the toast that appears for the next few seconds;
              after that, an executive can recover it from the deleted-tasks
              view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subtasks section
// ---------------------------------------------------------------------------

function SubtasksSection({
  task,
  clubId,
  onChanged,
}: {
  task: Task
  clubId: string
  onChanged: () => void
}) {
  const [newTitle, setNewTitle] = React.useState("")

  const addMutation = useMutation({
    mutationFn: (title: string) =>
      api(`/api/clubs/${clubId}/tasks/${task.id}/subtasks`, {
        method: "POST",
        json: { title },
      }),
    onSuccess: () => {
      setNewTitle("")
      onChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: (vars: { subtaskId: string; isDone: boolean }) =>
      api(
        `/api/clubs/${clubId}/tasks/${task.id}/subtasks/${vars.subtaskId}`,
        { method: "PATCH", json: { isDone: vars.isDone } }
      ),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (subtaskId: string) =>
      api(
        `/api/clubs/${clubId}/tasks/${task.id}/subtasks/${subtaskId}`,
        { method: "DELETE" }
      ),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  })

  const done = task.subtasks.filter((s) => s.isDone).length

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    addMutation.mutate(newTitle.trim())
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ListChecks className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Subtasks</h3>
        {task.subtasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({done}/{task.subtasks.length})
          </span>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a subtask…"
          maxLength={200}
          className="h-9"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!newTitle.trim() || addMutation.isPending}
        >
          {addMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
        </Button>
      </form>

      {task.subtasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No subtasks yet. Add a checklist item above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {task.subtasks.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
            >
              <Checkbox
                checked={s.isDone}
                onCheckedChange={(c) =>
                  toggleMutation.mutate({
                    subtaskId: s.id,
                    isDone: c === true,
                  })
                }
                id={`subtask-${s.id}`}
                aria-label={`Mark subtask "${s.title}" as done`}
              />
              <label
                htmlFor={`subtask-${s.id}`}
                className={cn(
                  "flex-1 cursor-pointer text-sm",
                  s.isDone && "line-through text-muted-foreground"
                )}
              >
                {s.title}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Delete subtask"
                onClick={() => deleteMutation.mutate(s.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comments section
// ---------------------------------------------------------------------------

function CommentsSection({
  task,
  clubId,
  myUserId,
  isExec,
  onChanged,
}: {
  task: Task
  clubId: string
  myUserId?: string
  isExec: boolean
  onChanged: () => void
}) {
  const queryKey = ["task-comments", clubId, task.id]
  const { data, isLoading } = useQuery<CommentsResponse>({
    queryKey,
    queryFn: () =>
      api<CommentsResponse>(`/api/clubs/${clubId}/tasks/${task.id}/comments`),
  })

  const [body, setBody] = React.useState("")

  const addMutation = useMutation({
    mutationFn: (text: string) =>
      api(`/api/clubs/${clubId}/tasks/${task.id}/comments`, {
        method: "POST",
        json: { body: text },
      }),
    onSuccess: () => {
      setBody("")
      onChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) =>
      api(
        `/api/clubs/${clubId}/tasks/${task.id}/comments/${commentId}`,
        { method: "DELETE" }
      ),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    addMutation.mutate(body.trim())
  }

  const comments = data?.comments ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Comments</h3>
        <span className="text-xs text-muted-foreground">
          ({comments.length})
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
          {comments.map((c) => {
            const canDelete = isExec || c.authorId === myUserId
            return (
              <li key={c.id} className="flex items-start gap-2">
                <UserAvatar user={c.author} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.author.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTime(c.createdAt)}
                    </span>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        aria-label="Delete comment"
                        onClick={() => deleteMutation.mutate(c.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                    {c.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          maxLength={5000}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="club"
            size="sm"
            disabled={!body.trim() || addMutation.isPending}
          >
            {addMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Post comment
          </Button>
        </div>
      </form>
    </div>
  )
}
