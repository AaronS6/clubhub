"use client"

import { useState } from "react"
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
  FeedSkeleton,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { MentionableTextarea, type MentionableMember } from "@/components/ui/mentionable-textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Megaphone,
  Pin,
  PinOff,
  MessageSquare,
  Trash2,
  Send,
  Plus,
  MoreVertical,
  Pencil,
  Loader2,
  ChevronDown,
  SmilePlus,
  AlertTriangle,
} from "lucide-react"

// Reaction feature data — fixed set of emojis for the picker.
const REACTION_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83C\uDF89", "\uD83D\uDC4F", "\uD83D\uDE02"]

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const MENTION_REGEX = /@([A-Za-z0-9._-]+[A-Za-z0-9])/g

interface AuthorInfo {
  id: string
  name: string
  avatarUrl: string | null
}

interface ReactionUser {
  id: string
  name: string
  avatarUrl: string | null
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

  if (!clubId) {
    return (
      <div className="p-8 text-muted-foreground">Select a club to view announcements.</div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Stay up to date with club news, pinned notices, and discussions."
        actions={
          isExec ? (
            <Button variant="club" onClick={() => setComposeOpen(true)}>
              <Plus className="h-4 w-4" /> New Announcement
            </Button>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No announcements yet"
          description={
            isExec
              ? "Post your first announcement to keep members in the loop."
              : "Check back later for updates from club executives."
          }
          action={
            isExec ? (
              <Button variant="club" onClick={() => setComposeOpen(true)}>
                <Plus className="h-4 w-4" /> Post announcement
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
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
  clubId,
  isExec,
  currentUserId,
  currentUser,
  onMutated,
}: {
  announcement: AnnouncementItem
  clubId: string
  isExec: boolean
  currentUserId?: string
  currentUser?: { id: string; name: string; avatarUrl: string | null }
  onMutated: () => void
}) {
  const queryClient = useQueryClient()
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const isAuthor = !!currentUserId && announcement.authorId === currentUserId
  const canEdit = isExec || isAuthor

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
      toast.success("Announcement deleted")
      onMutated()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="card-quiet p-0 gap-0 overflow-hidden animate-fade-in">
      <div className="p-4 md:p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={announcement.author.avatarUrl ?? undefined} alt={announcement.author.name} />
              <AvatarFallback>{initials(announcement.author.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body-medium truncate">{announcement.author.name}</span>
                {announcement.isUrgent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-2 py-0.5 text-[10px] font-semibold">
                    <AlertTriangle className="h-3 w-3" /> Urgent
                  </span>
                )}
                {announcement.isPinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                    <Pin className="h-3 w-3" /> Pinned
                  </span>
                )}
              </div>
              <div className="text-caption">
                {relativeTime(announcement.createdAt)}
                {new Date(announcement.updatedAt).getTime() - new Date(announcement.createdAt).getTime() > 1000 && (
                  <span className="ml-1 italic">(edited)</span>
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
        <div className="text-body whitespace-pre-wrap break-words leading-relaxed">
          {linkify(announcement.body)}
        </div>

        {/* Reaction bar */}
        <ReactionBar
          announcement={announcement}
          myReaction={announcement.myReaction}
          currentUserId={currentUserId}
          onReact={(emoji) => reactionMutation.mutate(emoji)}
          disabled={reactionMutation.isPending}
        />
      </div>

      {/* Footer: comment toggle */}
      <div className="border-t bg-muted/20 px-4 md:px-5 py-2">
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-caption-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={commentsOpen}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {announcement.commentCount} {announcement.commentCount === 1 ? "comment" : "comments"}
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
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Announcement actions">
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
              className="cursor-pointer text-red-600 focus:text-red-600"
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
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-all h-7",
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
                  {entry.count} {entry.count === 1 ? "person" : "people"} reacted with {entry.emoji}
                </div>
                {users.length > 0 && (
                  <div className="text-[11px] space-y-0.5">
                    {users.slice(0, 6).map((u) => (
                      <div key={u.id} className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={u.avatarUrl ?? undefined} alt={u.name} />
                          <AvatarFallback className="text-[8px]">{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{u.name}{u.id === currentUserId ? " (you)" : ""}</span>
                      </div>
                    ))}
                    {users.length > 6 && (
                      <div className="text-muted-foreground">+{users.length - 6} more</div>
                    )}
                  </div>
                )}
                {isMine ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">Click to remove your reaction</div>
                ) : (
                  <div className="mt-1 text-[10px] text-muted-foreground">Click to switch your reaction</div>
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
            className="h-7 gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            disabled={disabled}
            aria-label={myReaction ? "Change your reaction" : "Add a reaction"}
          >
            <SmilePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{myReaction ? "Change" : "React"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <div className="space-y-2">
            <div className="flex gap-1">
              {REACTION_EMOJIS.map((emoji) => {
                const isMine = myReaction === emoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(emoji)}
                    disabled={disabled}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-muted transition-all",
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
            <p className="text-[11px] text-muted-foreground leading-snug">
              You can pick one reaction — picking another swaps it.
            </p>
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
          No comments yet. Be the first to start the discussion.
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
          placeholder="Write a comment… (Enter to send, Shift+Enter for new line. Use @ to mention.)"
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
      <Avatar className="h-7 w-7 mt-0.5">
        <AvatarImage src={comment.author?.avatarUrl ?? undefined} alt={comment.author?.name} />
        <AvatarFallback className="text-[10px]">{initials(comment.author?.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-caption-medium text-foreground">{comment.author?.name ?? "Unknown"}</span>
          <span className="text-caption">{relativeTime(comment.createdAt)}</span>
          {canDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              aria-label="Delete comment"
              className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          )}
        </div>
        <p className="text-body whitespace-pre-wrap break-words">{linkify(comment.body ?? "")}</p>
      </div>
    </li>
  )
}

function ComposeAnnouncementDialog({
  open,
  onOpenChange,
  clubId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clubId: string
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [isPinned, setIsPinned] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/clubs/${clubId}/announcements`, {
        method: "POST",
        json: { title: title.trim(), body: body.trim(), isPinned, isUrgent },
      }),
    onSuccess: () => {
      toast.success("Announcement posted")
      setTitle("")
      setBody("")
      setIsPinned(false)
      setIsUrgent(false)
      onCreated()
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
          <DialogDescription>
            Share an update with all members. Plain text is fine — line breaks are preserved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Spring service drive kicks off next week"
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-body">Body</Label>
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement. URLs will become clickable links automatically."
              rows={6}
              maxLength={8000}
              required
            />
            <p className="text-xs text-muted-foreground">
              {body.length}/8000 characters · URLs auto-link
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch checked={isPinned} onCheckedChange={setIsPinned} id="ann-pinned" />
            <Label htmlFor="ann-pinned" className="cursor-pointer">
              <div className="text-sm font-medium">Pin to top</div>
              <div className="text-xs text-muted-foreground">
                Pinned announcements appear first for all members.
              </div>
            </Label>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 p-3">
            <Switch checked={isUrgent} onCheckedChange={setIsUrgent} id="ann-urgent" />
            <Label htmlFor="ann-urgent" className="cursor-pointer">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Mark as urgent
              </div>
              <div className="text-xs text-muted-foreground">
                Shows a dismissible banner at the top of the app for all members until they dismiss it.
              </div>
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="club"
              disabled={mutation.isPending || !title.trim() || !body.trim()}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Posting…
                </>
              ) : (
                "Post announcement"
              )}
            </Button>
          </DialogFooter>
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

  const mutation = useMutation({
    mutationFn: () =>
      api<{ item: AnnouncementItem }>(
        `/api/clubs/${clubId}/announcements/${announcement.id}`,
        { method: "PATCH", json: { title: title.trim(), body: body.trim(), isPinned, isUrgent } }
      ),
    onSuccess: () => {
      toast.success("Announcement updated")
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit announcement</DialogTitle>
          <DialogDescription>Update the title, body, or pin status.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="edit-body">Body</Label>
            <Textarea
              id="edit-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={8000}
              required
            />
          </div>
          {isExec && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch checked={isPinned} onCheckedChange={setIsPinned} id="edit-pinned" />
              <Label htmlFor="edit-pinned" className="cursor-pointer">
                <div className="text-sm font-medium">Pin to top</div>
                <div className="text-xs text-muted-foreground">
                  Pinned announcements appear first.
                </div>
              </Label>
            </div>
          )}
          {isExec && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 p-3">
              <Switch checked={isUrgent} onCheckedChange={setIsUrgent} id="edit-urgent" />
              <Label htmlFor="edit-urgent" className="cursor-pointer">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Mark as urgent
                </div>
                <div className="text-xs text-muted-foreground">
                  Shows a dismissible banner at the top of the app until members dismiss it.
                </div>
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="club"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
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
