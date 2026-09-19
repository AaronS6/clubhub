"use client"

import { useEffect, useMemo, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  PageHeader, EmptyState, initials, relativeTime,
} from "@/components/shared/page-header"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  ScrollText, Loader2, History, Filter, UserPlus, UserMinus,
  ArrowUpCircle, ArrowDownCircle, Megaphone, CheckCircle2, XCircle,
  Clock, CalendarDays, ListChecks, Users, UserCog, KeyRound, Crown,
  Trash2,
} from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------
interface ActivityItem {
  id: string
  actorUserId: string
  actorName: string
  actorAvatarUrl: string | null
  actionType: string
  targetType: string
  targetId: string | null
  description: string
  createdAt: string
}

interface ActivityResponse {
  items: ActivityItem[]
  hasMore: boolean
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 50

// Action type metadata
type ActionMeta = { label: string; icon: React.ReactNode; color: string }

const ACTION_META: Record<string, ActionMeta> = {
  club_created: { label: "Club created", icon: <Crown className="h-3 w-3" />, color: "bg-club-subtle text-club-ink dark:bg-club-subtle dark:text-club-ink border-club/20" },
  new_member: { label: "New member", icon: <UserPlus className="h-3 w-3" />, color: "chip-approved" },
  promote: { label: "Promoted", icon: <ArrowUpCircle className="h-3 w-3" />, color: "chip-progress" },
  demote: { label: "Demoted", icon: <ArrowDownCircle className="h-3 w-3" />, color: "chip-pending" },
  member_removed: { label: "Member removed", icon: <UserMinus className="h-3 w-3" />, color: "chip-rejected" },
  hours_submitted: { label: "Hours submitted", icon: <Clock className="h-3 w-3" />, color: "chip-neutral" },
  hours_approved: { label: "Hours approved", icon: <CheckCircle2 className="h-3 w-3" />, color: "chip-approved" },
  hours_rejected: { label: "Hours rejected", icon: <XCircle className="h-3 w-3" />, color: "chip-rejected" },
  new_announcement: { label: "Announcement", icon: <Megaphone className="h-3 w-3" />, color: "chip-progress" },
  task_assigned: { label: "Task assigned", icon: <ListChecks className="h-3 w-3" />, color: "chip-progress" },
  task_created: { label: "Task created", icon: <ListChecks className="h-3 w-3" />, color: "chip-neutral" },
  task_completed: { label: "Task completed", icon: <CheckCircle2 className="h-3 w-3" />, color: "chip-approved" },
  meeting_created: { label: "Meeting scheduled", icon: <CalendarDays className="h-3 w-3" />, color: "chip-progress" },
  meeting_cancelled: { label: "Meeting cancelled", icon: <CalendarDays className="h-3 w-3" />, color: "chip-rejected" },
  team_created: { label: "Team created", icon: <Users className="h-3 w-3" />, color: "bg-club-subtle text-club-ink dark:bg-club-subtle dark:text-club-ink border-club/20" },
  club_updated: { label: "Club updated", icon: <UserCog className="h-3 w-3" />, color: "chip-neutral" },
  code_regenerated: { label: "Code regenerated", icon: <KeyRound className="h-3 w-3" />, color: "chip-pending" },
}

function metaFor(actionType: string): ActionMeta {
  return ACTION_META[actionType] ?? {
    label: actionType.replace(/_/g, " "),
    icon: <History className="h-3 w-3" />,
    color: "chip-neutral",
  }
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------
export function ActivityView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const isExec = useAppStore((s) => s.currentClub?.role) === "executive"
  const qc = useQueryClient()
  const [actionType, setActionType] = useState<string>("all")

  const queryKey = useMemo(() => ["activity", clubId, actionType] as const, [clubId, actionType])

  // Clear all activity entries (exec-only). Calls DELETE /api/clubs/:id/activity,
  // then invalidates the query so the list refreshes.
  const clearAllMutation = useMutation({
    mutationFn: () => api<{ ok: boolean; deleted: number }>(`/api/clubs/${clubId}/activity`, { method: "DELETE" }),
    onSuccess: (data) => {
      toast.success(`Cleared ${data.deleted} ${data.deleted === 1 ? "entry" : "entries"}`)
      qc.invalidateQueries({ queryKey: ["activity", clubId] })
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't clear activity log"),
  })

  const {
    data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch,
  } = useInfiniteQuery<ActivityResponse>({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      api<ActivityResponse>(
        `/api/clubs/${clubId}/activity?page=${pageParam}&pageSize=${PAGE_SIZE}${
          actionType !== "all" ? `&actionType=${encodeURIComponent(actionType)}` : ""
        }`
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: !!clubId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (error) toast.error((error as Error).message || "Failed to load activity log")
  }, [error])

  if (!clubId) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No club selected"
        description="Pick a club from the sidebar to view its activity log."
      />
    )
  }

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  const actionTypeOptions = Object.keys(ACTION_META).sort((a, b) =>
    metaFor(a).label.localeCompare(metaFor(b).label)
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity log"
        description={`Audit trail of everything happening in this club · ${total} ${total === 1 ? "entry" : "entries"}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger className="w-[150px] sm:w-[220px]" aria-label="Filter by action type">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  <SelectValue placeholder="All actions" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionTypeOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {metaFor(key).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isExec && total > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive hover:border-destructive/40 shrink-0"
                    disabled={clearAllMutation.isPending}
                  >
                    {clearAllMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Clear all</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all activity?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes every activity entry for this club. The action cannot be undone. New activity will continue to be logged going forward.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={clearAllMutation.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault()
                        clearAllMutation.mutate()
                      }}
                      disabled={clearAllMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {clearAllMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      Clear all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <div className="card-quiet p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-section-title truncate">Timeline</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-caption-medium"
            onClick={() => refetch()}
            disabled={isLoading || isFetchingNextPage}
          >
            <History className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
        <span className="sr-only">Activity entries, newest first.</span>
        {isLoading ? (
          <ActivitySkeleton />
        ) : items.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title={actionType === "all" ? "No activity yet" : "No matching entries"}
              description={
                actionType === "all"
                  ? "As you and your members use the club, actions will appear here."
                  : "Try a different filter or clear it to see everything."
              }
              action={
                actionType !== "all" ? (
                  <Button variant="outline" size="sm" onClick={() => setActionType("all")}>
                    Clear filter
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ol className="relative space-y-1">
              {/* Vertical timeline line */}
              <span
                aria-hidden
                className="absolute left-[19px] top-2 bottom-2 w-px bg-border"
              />
              {items.map((item, idx) => {
                const meta = metaFor(item.actionType)
                return (
                  <li
                    key={item.id}
                    className="relative flex gap-3 px-1 py-2 rounded-md hover:bg-muted/40 transition-colors"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10 border-2 border-background">
                        <AvatarImage src={item.actorAvatarUrl ?? undefined} alt={item.actorName} />
                        <AvatarFallback className="text-xs">{initials(item.actorName)}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-body-medium truncate min-w-0">{item.actorName}</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption-medium",
                            meta.color
                          )}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                        <span className="text-caption text-muted-foreground w-full sm:w-auto sm:ml-auto whitespace-nowrap mt-0.5 sm:mt-0">
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-body text-muted-foreground break-words">
                        {item.description}
                      </p>
                      <p className="mt-0.5 text-caption text-muted-foreground/70">
                        {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        {idx === 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-club font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-club" /> Latest
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Loading skeleton
// --------------------------------------------------------------------------
function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 items-start">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-3 w-12 ml-auto" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
