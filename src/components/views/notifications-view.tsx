"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore, type View } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { onRealtimeEvent } from "@/lib/realtime-client"
import {
  notifMeta, notifToneClasses, targetViewFor, ALL_NOTIF_TYPE_KEYS,
} from "@/lib/notif-meta"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select"
import {
  PageHeader, EmptyState, relativeTime,
} from "@/components/shared/page-header"
import { toast } from "sonner"
import {
  Bell, CheckCheck, ChevronRight, Loader2, Filter,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotifItem {
  id: string
  type: string
  message: string
  linkUrl: string | null
  isRead: boolean
  createdAt: string
  clubId: string | null
}

interface NotifListResponse {
  items: NotifItem[]
  hasMore: boolean
  total: number
  unread: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

type FilterValue = "all" | "unread" | (string & {})

const FILTER_GROUPS: { label: string; options: { value: FilterValue; label: string }[] }[] = [
  {
    label: "Status",
    options: [
      { value: "all", label: "All notifications" },
      { value: "unread", label: "Unread only" },
    ],
  },
  {
    label: "By type",
    options: ALL_NOTIF_TYPE_KEYS.map((t) => ({
      value: t,
      label: notifMeta(t).label,
    })),
  },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotificationsView() {
  const setView = useAppStore((s) => s.setView)
  const qc = useQueryClient()
  const [filter, setFilter] = useState<FilterValue>("all")
  const [markingAll, setMarkingAll] = useState(false)

  const queryKey = useMemo(
    () => ["notifications", "list", filter] as const,
    [filter]
  )

  // Build the query string based on the filter. `unread` becomes `filter=unread`;
  // a specific type becomes `type=<type>`.
  const queryString = useCallback((page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (filter === "unread") params.set("filter", "unread")
    else if (filter !== "all") params.set("type", filter)
    return `/api/notifications?${params.toString()}`
  }, [filter])

  const {
    data, isLoading, isError, error, refetch,
    fetchNextPage, hasNextPage, isFetchingNextPage, isFetching,
  } = useInfiniteQuery<NotifListResponse>({
    queryKey,
    queryFn: ({ pageParam = 1 }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      return api<NotifListResponse>(queryString(page))
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30_000,
  })

  // Live updates — invalidate on realtime:notification events.
  useEffect(() => {
    const unsub = onRealtimeEvent("realtime:notification", () => {
      qc.invalidateQueries({ queryKey: ["notifications"] })
    })
    return unsub
  }, [qc])

  // Surface errors via toast.
  useEffect(() => {
    if (isError) toast.error((error as Error)?.message ?? "Failed to load notifications")
  }, [isError, error])

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0
  const unread = data?.pages[0]?.unread ?? 0

  // ---- Mutations (mark read / mark all read) ------------------------------
  // We update the cache optimistically so the UI flips to "read" instantly,
  // then the API call reconciles. On error we invalidate to re-fetch.
  const markRead = useCallback(async (id: string) => {
    const snapshot = qc.getQueryData<NotifListResponse & { pages?: any[] }>(queryKey as any)
    // Optimistic flip across all pages.
    qc.setQueriesData<{ pages: NotifListResponse[]; pageParams: number[] }>(
      { queryKey: ["notifications"] },
      (old) => {
        if (!old || !old.pages) return old
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
            unread: Math.max(0, p.unread - 1),
          })),
        }
      }
    )
    try {
      await api(`/api/notifications/${id}/read`, { method: "POST" })
    } catch {
      if (snapshot) qc.setQueryData(queryKey as any, snapshot)
      qc.invalidateQueries({ queryKey: ["notifications"] })
    }
  }, [qc, queryKey])

  const markAllRead = useCallback(async () => {
    if (markingAll) return
    setMarkingAll(true)
    qc.setQueriesData<{ pages: NotifListResponse[]; pageParams: number[] }>(
      { queryKey: ["notifications"] },
      (old) => {
        if (!old || !old.pages) return old
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((n) => ({ ...n, isRead: true })),
            unread: 0,
          })),
        }
      }
    )
    try {
      await api("/api/notifications/read-all", { method: "POST" })
      toast.success("All notifications marked as read")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to mark all as read")
      qc.invalidateQueries({ queryKey: ["notifications"] })
    } finally {
      setMarkingAll(false)
    }
  }, [markingAll, qc])

  function handleRowClick(n: NotifItem) {
    const { view } = targetViewFor(n)
    const targetView = view as View
    if (!n.isRead) markRead(n.id)
    setView(targetView)
  }

  // ---- Header actions -----------------------------------------------------
  const headerActions = (
    <div className="flex items-center gap-2">
      <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
        <SelectTrigger
          className="w-[170px] sm:w-[220px]"
          aria-label="Filter notifications"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <SelectValue placeholder="All notifications" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {FILTER_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={markAllRead}
        disabled={markingAll || unread === 0}
      >
        {markingAll ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCheck className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Mark all read</span>
      </Button>
    </div>
  )

  const description =
    filter === "all"
      ? `${total} ${total === 1 ? "notification" : "notifications"}${
          unread > 0 ? ` · ${unread} unread` : ""
        }`
      : filter === "unread"
      ? `${total} unread`
      : `${total} matching ${total === 1 ? "notification" : "notifications"}`

  // ---- Render -------------------------------------------------------------
  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={description}
        actions={headerActions}
      />

      {isLoading ? (
        <NotificationsSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          title={
            filter === "unread"
              ? "You're all caught up"
              : filter !== "all"
              ? "No matching notifications"
              : "No notifications yet"
          }
          description={
            filter === "unread"
              ? "You have no unread notifications. New activity in your clubs will appear here."
              : filter !== "all"
              ? "Try a different filter or clear it to see everything."
              : "When something happens in your clubs — like a task being assigned or hours approved — it'll show up here."
          }
          action={
            filter !== "all" ? (
              <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                Clear filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card-quiet p-0 overflow-hidden">
          <ul className="divide-y" aria-label="All notifications">
            {items.map((n) => (
              <NotifListItem
                key={n.id}
                n={n}
                onClick={() => handleRowClick(n)}
                onMarkRead={() => markRead(n.id)}
              />
            ))}
          </ul>

          {/* Footer: load more + refresh */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t px-3 py-2.5 bg-muted/20">
            <span className="text-caption text-muted-foreground">
              Showing {items.length} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-caption-medium"
                onClick={() => refetch()}
                disabled={isFetching || isFetchingNextPage}
              >
                <Loader2 className={cn("h-3 w-3 mr-1", !isFetching && "hidden")} />
                Refresh
              </Button>
              {hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function NotifListItem({
  n,
  onClick,
  onMarkRead,
}: {
  n: NotifItem
  onClick: () => void
  onMarkRead: () => void
}) {
  const meta = notifMeta(n.type)
  const Icon = meta.icon
  const toneClasses = notifToneClasses(meta.tone)
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        "group relative flex w-full items-start gap-3 px-4 py-3 sm:px-5 text-left text-sm cursor-pointer transition-colors hover:bg-accent/60 focus:outline-none focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        !n.isRead && "bg-club-subtle"
      )}
    >
      {/* Type-tinted icon */}
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          toneClasses
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            className={cn(
              "text-sm leading-snug flex-1 break-words",
              !n.isRead ? "font-medium text-foreground" : "text-foreground/90"
            )}
          >
            {n.message}
          </p>
          {!n.isRead && (
            <span
              className="mt-1.5 h-2 w-2 rounded-full bg-club shrink-0"
              aria-label="Unread"
            />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Icon className="h-3 w-3 opacity-70" />
            {meta.label}
          </span>
          <span aria-hidden="true">·</span>
          <span>{relativeTime(n.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-0.5">
            Open
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>

      {/* Hover-only mark-read affordance */}
      {!n.isRead && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkRead() }}
          aria-label="Mark as read"
          className="absolute right-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity"
        >
          <CheckCheck className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function NotificationsSkeleton() {
  return (
    <div className="card-quiet p-0 overflow-hidden">
      <ul className="divide-y" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 flex-1 max-w-[80%]" />
                <Skeleton className="h-2 w-2 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
