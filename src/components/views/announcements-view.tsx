"use client"

import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react"
import { useSession } from "next-auth/react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { usePollingFallback } from "@/lib/realtime-store"
import { toast } from "sonner"
import {
  PageHeader,
  EmptyState,
  AnnouncementsEmptyIllustration,
  FeedSkeleton,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DecoratedAvatar } from "@/components/shared/decorated-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { MentionableTextarea, type MentionableMember } from "@/components/ui/mentionable-textarea"
import { RichText, MarkdownToolbar } from "@/components/shared/rich-text"
import {
  ANNOUNCEMENT_ACCENTS,
  ANNOUNCEMENT_ACCENT_KEYS,
  ANNOUNCEMENT_TAG_PRESETS,
  MAX_ANNOUNCEMENT_TAG_LENGTH,
  isAccentKey,
} from "@/lib/announcement-style"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
import {
  Pin,
  PinOff,
  MessageSquare,
  Trash2,
  Send,
  Plus,
  MoreVertical,
  Palette,
  Pencil,
  Loader2,
  ChevronDown,
  SmilePlus,
  AlertTriangle,
  X,
  type LucideIcon,
} from "lucide-react"

// Reaction feature data — fixed set of emojis for the picker.
const REACTION_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83C\uDF89", "\uD83D\uDC4F", "\uD83D\uDE02"]

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const MENTION_REGEX = /@([A-Za-z0-9._-]+[A-Za-z0-9])/g

interface AuthorInfo {
  id: string
  name: string
  avatarUrl: string | null
  avatarDecoration?: string | null
}

interface ReactionUser {
  id: string
  name: string
  avatarUrl: string | null
  avatarDecoration?: string | null
}

interface ReactionSummary {
  emoji: string
  count: number
  users: ReactionUser[]
}

interface AnnouncementItem {
  id: string
  title: string
  body: string
  isPinned: boolean
  isUrgent: boolean
  accent: string | null
  tag: string | null
  createdAt: string
  updatedAt: string
  authorId: string
  author: AuthorInfo
  reactions: ReactionSummary[]
  myReaction: string | null
  commentCount: number
}

interface CommentItem {
  id: string
  deleted: boolean
  body?: string
  createdAt: string
  authorId: string
  author?: AuthorInfo
}

interface AnnouncementsResponse {
  items: AnnouncementItem[]
  hasMore: boolean
  page: number
}

interface CommentsResponse {
  items: CommentItem[]
  myUserId: string
  myRole: "member" | "executive"
}

function announcementListKey(clubId: string) {
  return ["announcements", clubId] as const
}

function commentsKey(clubId: string, announcementId: string) {
  return ["announcement-comments", clubId, announcementId] as const
}

function linkify(text: string) {
  // Combined URL + @mention renderer. URLs become clickable links; @mentions
  // get a styled span (text-club font-medium) for visual emphasis. Mention
  // click-through to a member profile is a future enhancement — for v1 we
  // just style them.
  const parts: React.ReactNode[] = []
  const urlSplit = text.split(URL_REGEX)
  urlSplit.forEach((chunk, i) => {
    if (/^https?:\/\//.test(chunk)) {
      parts.push(
        <a
          key={`u${i}`}
          href={chunk}
          target="_blank"
          rel="noopener noreferrer"
          className="text-club hover:underline break-all"
        >
          {chunk}
        </a>,
      )
    } else {
      let lastIdx = 0
      const re = new RegExp(MENTION_REGEX)
      let m: RegExpExecArray | null
      while ((m = re.exec(chunk)) !== null) {
        if (m.index > lastIdx) {
          parts.push(<span key={`t${i}-${lastIdx}`}>{chunk.slice(lastIdx, m.index)}</span>)
        }
        parts.push(
          <span
            key={`m${i}-${m.index}`}
            className="text-club font-medium"
          >
            {m[0]}
          </span>,
        )
        lastIdx = m.index + m[0].length
      }
      if (lastIdx < chunk.length) {
        parts.push(<span key={`t${i}-end`}>{chunk.slice(lastIdx)}</span>)
      }
    }
  })
  return parts
}

export function AnnouncementsView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const currentClub = useAppStore((s) => s.currentClub)
  const isExec = currentClub?.role === "executive"
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const currentUser = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        avatarUrl: session.user.image ?? null,
        avatarDecoration: session.user.avatarDecoration ?? null,
      }
    : undefined

  const [composeOpen, setComposeOpen] = useState(false)

  const query = useInfiniteQuery<AnnouncementsResponse>({
    queryKey: clubId ? [...announcementListKey(clubId)] : ["announcements", "none"],
    queryFn: ({ pageParam }) =>
      api<AnnouncementsResponse>(`/api/clubs/${clubId}/announcements?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: !!clubId,
    // Realtime is primary; poll only as a fallback while the socket is down
    // (was previously always-on 10s polling — now degrades to polling only
    // when the realtime connection is lost).
    refetchInterval: usePollingFallback(10000),
  })

  const items: AnnouncementItem[] = query.data?.pages.flatMap((p) => p.items) ?? []
  const hasMore = query.data?.pages[query.data.pages.length - 1]?.hasMore ?? false

  function invalidateAll() {
    if (!clubId) return
    queryClient.invalidateQueries({ queryKey: announcementListKey(clubId) })
  }

  const queryClient = useQueryClient()

  // §45 — Mark announcements as "seen" when the user opens the view. Updates
  // the localStorage timestamp under `last-seen-announcements-<clubId>` so
  // the nav unread dot clears. We only update to the latest createdAt we
  // actually saw — never backward (avoids re-flagging old items as unread).
  useEffect(() => {
    if (!clubId || items.length === 0) return
    const latestCreatedAt = items.reduce<number>((max, it) => {
      const t = new Date(it.createdAt).getTime()
      return t > max ? t : max
    }, 0)
    if (latestCreatedAt === 0) return
    try {
      const raw = localStorage.getItem(`last-seen-announcements-${clubId}`)
      const prev = raw ? parseInt(raw, 10) : 0
      if (latestCreatedAt > prev) {
        localStorage.setItem(
          `last-seen-announcements-${clubId}`,
          String(latestCreatedAt)
        )
        // §Instant dot-clear — poke the sidebar's unread-peek query so the
        // "New announcements" dot clears in under half a second instead of
        // lingering until its next 60s poll.
        queryClient.invalidateQueries({
          queryKey: ["announcements-unread-peek", clubId],
        })
      }
    } catch {
      // ignore — localStorage may be unavailable in private browsing
    }
  }, [clubId, items])

  if (!clubId) {
    return (
      <div className="p-8 text-muted-foreground">Select a club to start.</div>
    )
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Sticky page header on desktop. Full-width via negative horizontal
          margins (contained by the outer flow-root). No negative TOP margin —
          that caused the scroll container to miscalculate content height and
          left scrollable empty space past the last item. */}
      <div className="hidden sm:block sticky top-0 z-20 bg-background/45 backdrop-blur-xl -mx-4 md:-mx-6 px-4 md:px-6 py-4 border-b border-border/60">
        <PageHeader
          title="Announcements"
          actions={
            isExec ? (
              <Button variant="club" onClick={() => setComposeOpen(true)}>
                <Plus className="h-4 w-4" /> New post
              </Button>
            ) : undefined
          }
        />
      </div>
      {/* Mobile (non-sticky) header — also pulled flush to the top bar. */}
      <div className="sm:hidden -mx-4 -mt-4 px-4 pt-2 pb-3 border-b border-border/60">
        <PageHeader
          title="Announcements"
          actions={
            isExec ? (
              <Button variant="club" onClick={() => setComposeOpen(true)}>
                <Plus className="h-4 w-4" /> New post
              </Button>
            ) : undefined
          }
        />
      </div>

      {query.isLoading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          illustration={<AnnouncementsEmptyIllustration />}
          title="No announcements yet"
          description={isExec ? "Post the first one." : undefined}
          action={
            isExec ? (
              <Button variant="club" onClick={() => setComposeOpen(true)}>
                <Plus className="h-4 w-4" /> New post
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="max-w-[720px] mx-auto space-y-4">
          {items.map((a, index) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              index={index}
              clubId={clubId}
              isExec={isExec}
              currentUserId={currentUserId}
              currentUser={currentUser}
              onMutated={invalidateAll}
            />
          ))}
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" /> Load more
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <ComposeAnnouncementDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        clubId={clubId}
        author={currentUser}
        onCreated={() => {
          setComposeOpen(false)
          invalidateAll()
        }}
      />
    </div>
  )
}

function AnnouncementCard({
  announcement,
  index,
  clubId,
  isExec,
  currentUserId,
  currentUser,
  onMutated,
}: {
  announcement: AnnouncementItem
  index: number
  clubId: string
  isExec: boolean
  currentUserId?: string
  currentUser?: { id: string; name: string; avatarUrl: string | null }
  onMutated: () => void
}) {
  const queryClient = useQueryClient()
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Measure whether the body genuinely overflows the collapsed height.
  // Only then do we show the "Read more" toggle — never on bodies that
  // already fit (fixes the phantom button on short announcements).
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    // When expanded, the container has no max-h, so scrollHeight ===
    // clientHeight → canExpand stays as-is. Measure against the collapsed
    // height by temporarily removing the cap, or just compare on collapsed.
    if (expanded) return
    setCanExpand(el.scrollHeight > el.clientHeight + 2)
  }, [announcement.body, expanded])

  const isAuthor = !!currentUserId && announcement.authorId === currentUserId
  const canEdit = isExec || isAuthor
  // Chosen accent color (null = default card). Pinned-without-accent keeps
  // the classic club strip + tint below.
  const accentDef = isAccentKey(announcement.accent)
    ? ANNOUNCEMENT_ACCENTS[announcement.accent]
    : undefined

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      api<{ reactions: ReactionSummary[]; myReaction: string | null }>(
        `/api/clubs/${clubId}/announcements/${announcement.id}/reactions`,
        { method: "POST", json: { emoji } }
      ),
    onMutate: async (emoji) => {
      // Optimistic update across all cached pages
      await cancelAllAnnouncementQueries(queryClient, clubId)
      const previous = queryClient.getQueriesData<{ pages: AnnouncementsResponse[] }>({
        queryKey: [...announcementListKey(clubId)],
      })
      for (const [key, value] of previous) {
        if (!value?.pages) continue
        queryClient.setQueryData(key, {
          ...value,
          pages: value.pages.map((p) => ({
            ...p,
            items: p.items.map((it) =>
              it.id === announcement.id ? applyReactionOptimistic(it, emoji, currentUser) : it
            ),
          })),
        })
      }
      return { previous }
    },
    onError: (_err, _emoji, ctx) => {
      if (ctx?.previous) {
        for (const [key, value] of ctx.previous) {
          queryClient.setQueryData(key, value)
        }
      }
      toast.error("Could not update reaction")
    },
    onSuccess: (data) => {
      patchAnnouncementInCache(queryClient, clubId, announcement.id, (it) => ({
        ...it,
        reactions: data.reactions,
        myReaction: data.myReaction,
      }))
    },
  })

  const pinMutation = useMutation({
    mutationFn: (isPinned: boolean) =>
      api<{ item: AnnouncementItem }>(
        `/api/clubs/${clubId}/announcements/${announcement.id}`,
        { method: "PATCH", json: { isPinned } }
      ),
    onSuccess: (res) => {
      patchAnnouncementInCache(queryClient, clubId, announcement.id, () => res.item)
      toast.success(res.item.isPinned ? "Pinned to top" : "Unpinned")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      api(`/api/clubs/${clubId}/announcements/${announcement.id}`, { method: "DELETE" }),
    onSuccess: () => {
      onMutated()
      // 5-second undo: the API uses soft-delete (sets deletedAt), and a
      // /restore endpoint clears it. Show an Undo toast that restores.
      const annId = announcement.id
      const undo = async () => {
        try {
          await api(`/api/clubs/${clubId}/announcements/${annId}/restore`, { method: "POST" })
          toast.success("Announcement restored")
          onMutated()
        } catch (e: any) {
          toast.error(e.message || "Couldn't restore the announcement")
        }
      }
      toast.success("Announcement deleted", {
        duration: 5000,
        action: { label: "Undo", onClick: undo },
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className={cn(
      "stagger-in rounded-xl border border-border/80 bg-card shadow-card overflow-hidden transition-[color,background-color,border-color,transform,box-shadow] duration-200",
      accentDef
        ? `border-l-2 ${accentDef.strip}`
        : announcement.isPinned && "border-l-2 border-l-club bg-club-subtle/50 dark:bg-club-subtle/30"
    )}
      style={{ "--stagger-i": index } as CSSProperties}>
      <div className="p-4 md:p-5 space-y-3">
        {/* Header — avatar + name + relative time + pills in one inline row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <DecoratedAvatar
              decoration={announcement.author.avatarDecoration}
              src={announcement.author.avatarUrl ?? undefined}
              name={announcement.author.name}
              className="h-10 w-10 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{announcement.author.name}</span>
                <span className="text-caption text-muted-foreground">·</span>
                <span className="text-caption text-muted-foreground">{relativeTime(announcement.createdAt)}</span>
                {new Date(announcement.updatedAt).getTime() - new Date(announcement.createdAt).getTime() > 1000 && (
                  <span className="text-caption text-muted-foreground italic">(edited)</span>
                )}
                {announcement.tag && (
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                    accentDef ? accentDef.pill : "bg-muted text-muted-foreground",
                  )}>
                    {announcement.tag}
                  </span>
                )}
                {announcement.isUrgent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-subtle text-danger-foreground dark:bg-danger-subtle dark:text-danger-foreground px-2 py-0.5 text-xs font-semibold">
                    <AlertTriangle className="h-3 w-3" /> Urgent
                  </span>
                )}
                {announcement.isPinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-club-subtle text-club-ink dark:bg-club-subtle dark:text-club-ink px-2 py-0.5 text-xs font-semibold">
                    <Pin className="h-3 w-3" /> Pinned
                  </span>
                )}
              </div>
            </div>
          </div>
          {(canEdit || isExec) && (
            <AnnouncementMenu
              isExec={isExec}
              canEdit={canEdit}
              pinned={announcement.isPinned}
              onTogglePin={() => pinMutation.mutate(!announcement.isPinned)}
              onEdit={() => setEditing(true)}
              onDelete={() => deleteMutation.mutate()}
              pinLoading={pinMutation.isPending}
              deleteLoading={deleteMutation.isPending}
            />
          )}
        </div>

        {/* Title + Body */}
        {announcement.title && (
          <h3 className="text-card-title leading-tight">{announcement.title}</h3>
        )}
        {/* Body — collapsed to ~10 lines (max-h-[15rem]) with a fade; only
            shows "Read more" when the content genuinely overflows (measured
            via scrollHeight), so short bodies never get a phantom button. */}
        <div ref={bodyRef} className={cn("relative", !expanded && "max-h-[15rem] overflow-hidden")}>
          <RichText className="text-body">{announcement.body}</RichText>
          {!expanded && canExpand && (
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
          )}
        </div>
        {canExpand && (
          <button type="button" className="text-xs font-medium text-club hover:underline" onClick={() => setExpanded(v => !v)}>
            {expanded ? "Show less" : "Read more"}
          </button>
        )}

        {/* Reaction bar */}
        <ReactionBar
          announcement={announcement}
          myReaction={announcement.myReaction}
          currentUserId={currentUserId}
          onReact={(emoji) => reactionMutation.mutate(emoji)}
          disabled={reactionMutation.isPending}
        />
      </div>

      {/* Footer: comment toggle — inviting clickable pill */}
      <div className="border-t bg-muted/20 px-4 md:px-5 py-2.5">
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs hover:bg-accent cursor-pointer transition-colors"
          aria-expanded={commentsOpen}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {announcement.commentCount} {announcement.commentCount === 1 ? "reply" : "replies"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", commentsOpen && "rotate-180")} />
        </button>
      </div>

      {commentsOpen && (
        <CommentSection
          clubId={clubId}
          announcementId={announcement.id}
          isExec={isExec}
          onCommentCountChanged={() => onMutated()}
        />
      )}

      {editing && (
        <EditAnnouncementDialog
          open={editing}
          onOpenChange={setEditing}
          clubId={clubId}
          announcement={announcement}
          isExec={isExec}
          onSaved={() => {
            setEditing(false)
            onMutated()
          }}
        />
      )}
    </div>
  )
}

function AnnouncementMenu({
  isExec,
  canEdit,
  pinned,
  onTogglePin,
  onEdit,
  onDelete,
  pinLoading,
  deleteLoading,
}: {
  isExec: boolean
  canEdit: boolean
  pinned: boolean
  onTogglePin: () => void
  onEdit: () => void
  onDelete: () => void
  pinLoading?: boolean
  deleteLoading?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 -mr-1.5" aria-label="Announcement actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {isExec && (
          <DropdownMenuItem
            onClick={onTogglePin}
            disabled={pinLoading}
            className="cursor-pointer"
          >
            {pinned ? (
              <>
                <PinOff className="h-4 w-4" /> Unpin
              </>
            ) : (
              <>
                <Pin className="h-4 w-4" /> Pin to top
              </>
            )}
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
        )}
        {isExec && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              disabled={deleteLoading}
              className="cursor-pointer text-danger-foreground focus:text-danger-foreground"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ReactionBar({
  announcement,
  myReaction,
  currentUserId,
  onReact,
  disabled,
}: {
  announcement: AnnouncementItem
  myReaction: string | null
  currentUserId?: string
  onReact: (emoji: string) => void
  disabled?: boolean
}) {
  const activeReactions = announcement.reactions // only entries with count > 0 are returned by the API
  return (
    <div className="flex items-center flex-wrap gap-1.5 pt-1">
      {/* Existing reaction badges — only render ones with at least 1 reaction */}
      {activeReactions.map((entry) => {
        const isMine = myReaction === entry.emoji
        const users = entry.users
        return (
          <Tooltip key={entry.emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onReact(entry.emoji)}
                disabled={disabled}
                aria-pressed={isMine}
                aria-label={`React ${entry.emoji} · ${entry.count} ${entry.count === 1 ? "person" : "people"}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-[color,background-color,border-color,transform,box-shadow] h-8 min-h-8",
                  isMine
                    ? "bg-club-muted border-transparent text-club ring-1 ring-club"
                    : "bg-background border-border hover:bg-muted text-foreground hover:border-foreground/20"
                )}
              >
                <span aria-hidden>{entry.emoji}</span>
                <span className="font-medium tabular-nums">{entry.count}</span>
                {isMine && (
                  <span className="sr-only">(your reaction — click to remove)</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              <div className="text-xs">
                <div className="font-semibold mb-1">
                  {entry.count} reacted
                </div>
                {users.length > 0 && (
                  <div className="text-xs space-y-0.5">
                    {users.slice(0, 6).map((u) => (
                      <div key={u.id} className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={u.avatarUrl ?? undefined} alt={u.name} />
                          <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{u.name}{u.id === currentUserId ? " (you)" : ""}</span>
                      </div>
                    ))}
                    {users.length > 6 && (
                      <div className="text-muted-foreground">+{users.length - 6} more</div>
                    )}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      })}

      {/* Add reaction control — compact pill, opens a popover with all 5 emoji choices */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 min-h-8 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            disabled={disabled}
            aria-label={myReaction ? "Change your reaction" : "Add a reaction"}
          >
            <SmilePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{myReaction ? "Change" : "React"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1.5rem)] p-3">
          <div className="flex flex-wrap gap-1">
            {REACTION_EMOJIS.map((emoji) => {
              const isMine = myReaction === emoji
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  disabled={disabled}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-md text-xl hover:bg-muted transition-[color,background-color,border-color,transform,box-shadow]",
                    isMine && "bg-club-muted ring-1 ring-club"
                  )}
                  aria-label={`React with ${emoji}`}
                  aria-pressed={isMine}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function CommentSection({
  clubId,
  announcementId,
  isExec,
  onCommentCountChanged,
}: {
  clubId: string
  announcementId: string
  isExec: boolean
  onCommentCountChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")

  const { data, isLoading } = useQuery<CommentsResponse>({
    queryKey: commentsKey(clubId, announcementId),
    queryFn: () =>
      api<CommentsResponse>(`/api/clubs/${clubId}/announcements/${announcementId}/comments`),
    refetchInterval: 15_000,
  })

  // Cached member list to power @mention suggestions in the comment composer.
  const { data: membersData } = useQuery<{ members: { user: { id: string; name: string; avatarUrl: string | null } }[] }>({
    queryKey: ["members", clubId],
    queryFn: () => api(`/api/clubs/${clubId}/members`),
    staleTime: 30_000,
  })
  const members: MentionableMember[] = (membersData?.members ?? []).map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl ?? null,
  }))

  const postMutation = useMutation({
    mutationFn: (body: string) =>
      api<{ item: CommentItem }>(
        `/api/clubs/${clubId}/announcements/${announcementId}/comments`,
        { method: "POST", json: { body } }
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(commentsKey(clubId, announcementId), (old: CommentsResponse | undefined) => {
        if (!old) return { ...res, items: [res.item] } as unknown as CommentsResponse
        return { ...old, items: [...old.items, res.item] }
      })
      setDraft("")
      onCommentCountChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) =>
      api(`/api/clubs/${clubId}/announcements/${announcementId}/comments/${commentId}`, {
        method: "DELETE",
      }),
    onSuccess: (_res, commentId) => {
      queryClient.setQueryData(commentsKey(clubId, announcementId), (old: CommentsResponse | undefined) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((c) =>
            c.id === commentId ? { ...c, deleted: true, body: undefined, author: undefined } : c
          ),
        }
      })
      toast.success("Comment removed")
      onCommentCountChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const myUserId = data?.myUserId

  function handleSend() {
    const text = draft.trim()
    if (!text) return
    postMutation.mutate(text)
  }

  return (
    <div className="px-4 md:px-6 py-3 space-y-3 bg-muted/10 border-t">
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          No replies yet.
        </p>
      ) : (
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
          {items.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              canDelete={
                !!myUserId &&
                (c.authorId === myUserId || isExec) &&
                !c.deleted
              }
              onDelete={() => deleteMutation.mutate(c.id)}
              deleting={
                deleteMutation.isPending && deleteMutation.variables === c.id
              }
            />
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 pt-1">
        <MentionableTextarea
          value={draft}
          members={members}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          rows={1}
          className="min-h-9 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          aria-label="New comment"
          listLabel="Mention a club member"
        />
        <Button
          size="icon"
          variant="club"
          className="h-9 w-9 shrink-0"
          onClick={handleSend}
          disabled={!draft.trim() || postMutation.isPending}
          aria-label="Send comment"
        >
          {postMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

function CommentRow({
  comment,
  canDelete,
  onDelete,
  deleting,
}: {
  comment: CommentItem
  canDelete: boolean
  onDelete: () => void
  deleting?: boolean
}) {
  if (comment.deleted) {
    return (
      <li className="flex items-center gap-2 text-caption text-muted-foreground italic">
        <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Trash2 className="h-3 w-3 opacity-50" />
        </span>
        <span>[comment removed]</span>
      </li>
    )
  }
  return (
    <li className="flex gap-2 group">
      <DecoratedAvatar
        decoration={comment.author?.avatarDecoration}
        src={comment.author?.avatarUrl ?? undefined}
        name={comment.author?.name ?? "Unknown"}
        className="h-8 w-8 mt-0.5 shrink-0"
        avatarClassName="text-xs"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-caption-medium text-foreground truncate min-w-0">{comment.author?.name ?? "Unknown"}</span>
          <span className="text-caption text-muted-foreground whitespace-nowrap">{relativeTime(comment.createdAt)}</span>
          {canDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              aria-label="Delete comment"
              // Always visible on touch (no hover); hover-reveal on md+.
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-danger-foreground hover:bg-muted/60 disabled:opacity-50 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 -mr-1.5"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <p className="text-body whitespace-pre-wrap break-words">{linkify(comment.body ?? "")}</p>
      </div>
    </li>
  )
}

// --- announcement customization (composer + card shared pieces) ---

/** WYSIWYG mini replica of the feed card — updates live while composing. */
function AnnouncementPreview({
  title,
  body,
  tag,
  accent,
  isPinned,
  isUrgent,
  author,
}: {
  title: string
  body: string
  tag: string | null
  accent: string | null
  isPinned: boolean
  isUrgent: boolean
  author?: { id: string; name: string; avatarUrl: string | null; avatarDecoration?: string | null }
}) {
  const accentDef = isAccentKey(accent) ? ANNOUNCEMENT_ACCENTS[accent] : undefined
  const strip = accentDef
    ? `border-l-2 ${accentDef.strip}`
    : isPinned
      ? "border-l-2 border-l-club"
      : null
  const excerpt = body.trim().slice(0, 240)
  const name = author?.name ?? "You"
  return (
    <div aria-hidden className={cn("rounded-xl border border-border/80 bg-card shadow-card overflow-hidden", strip)}>
      <div className="p-3.5 space-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <DecoratedAvatar
            decoration={author?.avatarDecoration ?? undefined}
            src={author?.avatarUrl ?? undefined}
            name={name}
            className="h-8 w-8 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold truncate">{name}</span>
              <span className="text-caption text-muted-foreground">now</span>
              {tag && (
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                  accentDef ? accentDef.pill : "bg-muted text-muted-foreground",
                )}>
                  {tag}
                </span>
              )}
              {isUrgent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-subtle text-danger-foreground px-2 py-0.5 text-xs font-semibold">
                  <AlertTriangle className="h-3 w-3" /> Urgent
                </span>
              )}
              {isPinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-club-subtle text-club-ink px-2 py-0.5 text-xs font-semibold">
                  <Pin className="h-3 w-3" /> Pinned
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-card-title leading-tight">
          {title.trim() || <span className="text-muted-foreground/70">Title</span>}
        </div>
        <p className="text-body text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">
          {excerpt || <span className="text-muted-foreground/70">Your post shows up here.</span>}
        </p>
      </div>
    </div>
  )
}

/** Compact pill toggle (Pin / Urgent) — replaces the old wordy switch cards. */
function ToggleChip({
  active,
  onClick,
  icon: Icon,
  label,
  tone = "club",
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
  tone?: "club" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer",
        active
          ? tone === "danger"
            ? "border-danger/40 bg-danger-subtle text-danger-foreground"
            : "border-club/40 bg-club-muted text-club"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

/** Color + tag pickers — the announcement customization surface. */
function AnnouncementStyleControls({
  accent,
  onAccent,
  tag,
  onTag,
}: {
  accent: string | null
  onAccent: (v: string | null) => void
  tag: string | null
  onTag: (v: string | null) => void
}) {
  const [custom, setCustom] = useState("")
  const isPreset = tag != null && (ANNOUNCEMENT_TAG_PRESETS as readonly string[]).includes(tag)

  function commitCustom() {
    const v = custom.trim()
    if (v) {
      onTag(v.slice(0, MAX_ANNOUNCEMENT_TAG_LENGTH))
      setCustom("")
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 space-y-2.5 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Palette className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Style</span>
      </div>

      {/* Accent color dots */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-9 shrink-0 text-xs text-muted-foreground">Color</span>
        <button
          type="button"
          onClick={() => onAccent(null)}
          aria-pressed={accent == null}
          aria-label="No color"
          title="None"
          className={cn(
            "h-6 w-6 rounded-full border-2 border-dashed border-border transition-transform hover:scale-110",
            accent == null && "border-solid border-foreground/50",
          )}
        />
        {ANNOUNCEMENT_ACCENT_KEYS.map((k) => {
          const def = ANNOUNCEMENT_ACCENTS[k]
          const active = accent === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => onAccent(active ? null : k)}
              aria-pressed={active}
              aria-label={def.label}
              title={def.label}
              className={cn(
                "h-6 w-6 rounded-full transition-transform hover:scale-110",
                def.swatch,
                active && cn("ring-2 ring-offset-2 ring-offset-background", def.active),
              )}
            />
          )
        })}
      </div>

      {/* Tag chips + custom entry */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="w-9 shrink-0 text-xs text-muted-foreground">Tag</span>
        {tag && !isPreset && (
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-club bg-club-muted px-2.5 text-xs font-medium text-club">
            {tag}
            <button
              type="button"
              onClick={() => onTag(null)}
              aria-label="Remove tag"
              className="text-club/70 hover:text-club"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        {ANNOUNCEMENT_TAG_PRESETS.map((p) => {
          const active = tag === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => onTag(active ? null : p)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer",
                active
                  ? "border-club bg-club-muted text-club"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {p}
            </button>
          )
        })}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitCustom()
            }
          }}
          onBlur={commitCustom}
          placeholder="Custom…"
          maxLength={MAX_ANNOUNCEMENT_TAG_LENGTH}
          aria-label="Custom tag"
          className="h-7 w-24 rounded-full border border-border bg-transparent px-3 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-foreground/30"
        />
      </div>
    </div>
  )
}

function ComposeAnnouncementDialog({
  open,
  onOpenChange,
  clubId,
  author,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clubId: string
  author?: { id: string; name: string; avatarUrl: string | null; avatarDecoration?: string | null }
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [isPinned, setIsPinned] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)
  const [accent, setAccent] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Reset the customization state whenever the dialog closes
  function handleOpenChange(v: boolean) {
    if (!v) {
      setAccent(null)
      setTag(null)
    }
    onOpenChange(v)
  }

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/clubs/${clubId}/announcements`, {
        method: "POST",
        json: { title: title.trim(), body: body.trim(), isPinned, isUrgent, accent, tag },
      }),
    onSuccess: () => {
      toast.success("Posted")
      setTitle("")
      setBody("")
      setIsPinned(false)
      setIsUrgent(false)
      setAccent(null)
      setTag(null)
      setTitleError(null)
      setBodyError(null)
      onCreated()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let bad = false
    if (!title.trim()) {
      setTitleError("Title is required")
      bad = true
    } else setTitleError(null)
    if (!body.trim()) {
      setBodyError("Body is required")
      bad = true
    } else setBodyError(null)
    if (bad) return
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-3 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>New post</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 relative flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-4 sm:p-0 space-y-4 pb-24 sm:pb-6">
            {/* Live preview — mirrors the feed card as you type */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </div>
              <AnnouncementPreview
                title={title}
                body={body}
                tag={tag}
                accent={accent}
                isPinned={isPinned}
                isUrgent={isUrgent}
                author={author}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (titleError) setTitleError(null)
                }}
                placeholder="Title"
                maxLength={200}
                required
                aria-invalid={!!titleError}
                className={titleError ? "border-danger focus-visible:ring-red-500" : ""}
              />
              {titleError && (
                <p className="text-xs text-danger mt-1">{titleError}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ann-body">Body</Label>
                <span className="text-caption text-muted-foreground">**bold** *italic* # heading</span>
              </div>
              <MarkdownToolbar
                textareaRef={bodyRef}
                onValueChange={(v) => {
                  setBody(v)
                  if (bodyError) setBodyError(null)
                }}
              />
              <Textarea
                ref={bodyRef}
                id="ann-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  if (bodyError) setBodyError(null)
                }}
                placeholder="Write your post…"
                rows={6}
                maxLength={8000}
                required
                aria-invalid={!!bodyError}
                className={bodyError ? "border-danger focus-visible:ring-red-500" : ""}
              />
              {body.length > 6800 && (
                <p className="text-xs text-muted-foreground">{body.length}/8000</p>
              )}
              {bodyError && (
                <p className="text-xs text-danger mt-1">{bodyError}</p>
              )}
            </div>

            <AnnouncementStyleControls accent={accent} onAccent={setAccent} tag={tag} onTag={setTag} />

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ToggleChip
                  icon={Pin}
                  label="Pin to top"
                  active={isPinned}
                  onClick={() => setIsPinned((v) => !v)}
                />
                <ToggleChip
                  icon={AlertTriangle}
                  label="Urgent"
                  tone="danger"
                  active={isUrgent}
                  onClick={() => setIsUrgent((v) => !v)}
                />
              </div>
              {isUrgent && (
                <p className="text-xs text-muted-foreground">Banners the app for everyone until dismissed.</p>
              )}
            </div>
          </div>
          {/* Floating Post button — always visible at the bottom-right
              corner with a soft blur, so it stays reachable even when the
              body is taller than the viewport. */}
          <div className="pointer-events-none absolute bottom-3 right-3 z-20 sm:static sm:z-auto sm:pointer-events-auto">
            <Button
              type="submit"
              variant="club"
              disabled={mutation.isPending || !title.trim() || !body.trim()}
              className="pointer-events-auto shadow-club/30 backdrop-blur-md rounded-full sm:rounded-md"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Posting…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Post
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditAnnouncementDialog({
  open,
  onOpenChange,
  clubId,
  announcement,
  isExec,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clubId: string
  announcement: AnnouncementItem
  isExec: boolean
  onSaved: () => void
}) {
  const [title, setTitle] = useState(announcement.title)
  const [body, setBody] = useState(announcement.body)
  const [isPinned, setIsPinned] = useState(announcement.isPinned)
  const [isUrgent, setIsUrgent] = useState(announcement.isUrgent)
  const [accent, setAccent] = useState<string | null>(announcement.accent)
  const [tag, setTag] = useState<string | null>(announcement.tag)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const mutation = useMutation({
    mutationFn: () =>
      api<{ item: AnnouncementItem }>(
        `/api/clubs/${clubId}/announcements/${announcement.id}`,
        {
          method: "PATCH",
          // Pin/urgent are exec-only fields — only send them when the editor
          // is an exec (a member author previously got a 403 here).
          json: {
            title: title.trim(),
            body: body.trim(),
            accent,
            tag,
            ...(isExec ? { isPinned, isUrgent } : {}),
          },
        }
      ),
    onSuccess: () => {
      toast.success("Saved")
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required")
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-3 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Edit post</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 relative flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-4 sm:p-0 space-y-4 pb-24 sm:pb-6">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </div>
              <AnnouncementPreview
                title={title}
                body={body}
                tag={tag}
                accent={accent}
                isPinned={isPinned}
                isUrgent={isUrgent}
                author={announcement.author}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="edit-body">Body</Label>
                <span className="text-caption text-muted-foreground">**bold** *italic* # heading</span>
              </div>
              <MarkdownToolbar textareaRef={bodyRef} onValueChange={setBody} />
              <Textarea
                ref={bodyRef}
                id="edit-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={8000}
                required
              />
              {body.length > 6800 && (
                <p className="text-xs text-muted-foreground">{body.length}/8000</p>
              )}
            </div>
            <AnnouncementStyleControls accent={accent} onAccent={setAccent} tag={tag} onTag={setTag} />
            {isExec && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <ToggleChip
                    icon={Pin}
                    label="Pin to top"
                    active={isPinned}
                    onClick={() => setIsPinned((v) => !v)}
                  />
                  <ToggleChip
                    icon={AlertTriangle}
                    label="Urgent"
                    tone="danger"
                    active={isUrgent}
                    onClick={() => setIsUrgent((v) => !v)}
                  />
                </div>
                {isUrgent && (
                  <p className="text-xs text-muted-foreground">Banners the app for everyone until dismissed.</p>
                )}
              </div>
            )}
          </div>
          {/* Floating Save button — always visible at the bottom-right
              corner with a soft blur. */}
          <div className="pointer-events-none absolute bottom-3 right-3 z-20 sm:static sm:z-auto sm:pointer-events-auto">
            <Button
              type="submit"
              variant="club"
              disabled={mutation.isPending}
              className="pointer-events-auto shadow-club/30 backdrop-blur-md rounded-full sm:rounded-md"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Save
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- helpers ---

async function cancelAllAnnouncementQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  clubId: string
) {
  await queryClient.cancelQueries({ queryKey: [...announcementListKey(clubId)] })
}

function patchAnnouncementInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  clubId: string,
  announcementId: string,
  updater: (item: AnnouncementItem) => AnnouncementItem
) {
  const keys = queryClient.getQueriesData<{ pages: AnnouncementsResponse[] }>({
    queryKey: [...announcementListKey(clubId)],
  })
  for (const [key, value] of keys) {
    if (!value?.pages) continue
    queryClient.setQueryData(key, {
      ...value,
      pages: value.pages.map((p) => ({
        ...p,
        items: p.items.map((it) => (it.id === announcementId ? updater(it) : it)),
      })),
    })
  }
}

function applyReactionOptimistic(
  item: AnnouncementItem,
  emoji: string,
  currentUser?: { id: string; name: string; avatarUrl: string | null }
): AnnouncementItem {
  const prev = item.myReaction
  const me = currentUser
    ? { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl ?? null }
    : { id: "me", name: "You", avatarUrl: null }

  let reactions = item.reactions.map((r) => ({
    emoji: r.emoji,
    count: r.count,
    users: r.users.map((u) => ({ ...u })),
  }))

  // Decrement previous reaction (swap or toggle off)
  if (prev) {
    const idx = reactions.findIndex((r) => r.emoji === prev)
    if (idx >= 0) {
      const newUsers = reactions[idx].users.filter((u) => u.id !== me.id)
      const newCount = Math.max(0, reactions[idx].count - 1)
      if (newCount <= 0) {
        reactions.splice(idx, 1)
      } else {
        reactions[idx] = { ...reactions[idx], count: newCount, users: newUsers }
      }
    }
  }

  if (prev === emoji) {
    // Toggling off — already removed above
    return { ...item, myReaction: null, reactions }
  }

  // Add / swap to new emoji
  const idx = reactions.findIndex((r) => r.emoji === emoji)
  if (idx >= 0) {
    reactions[idx] = {
      ...reactions[idx],
      count: reactions[idx].count + 1,
      users: [...reactions[idx].users, me],
    }
  } else {
    reactions.push({ emoji, count: 1, users: [me] })
  }

  return { ...item, myReaction: emoji, reactions }
}
