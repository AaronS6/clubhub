"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { usePresence } from "@/lib/use-presence"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { usePollingFallback } from "@/lib/realtime-store"
import { toast } from "sonner"
import { getRealtimeSocket, onRealtimeEvent } from "@/lib/realtime-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Edit,
  Hash,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  SmilePlus,
  Trash2,
  Users,
  X,
} from "lucide-react"
import {
  EmptyState,
  avatarColor,
  initials,
  relativeTime,
} from "@/components/shared/page-header"

/* =========================================================================
   Types
   ========================================================================= */

type ConversationType = "club_wide" | "group" | "direct"

interface ConversationItem {
  id: string
  type: ConversationType
  name: string | null
  lastMessage: {
    id: string
    body: string
    createdAt: string
    authorId: string
    authorName: string
  } | null
  unreadCount: number
  memberCount: number
  myRole: "owner" | "member"
  otherUser: { id: string; name: string; avatarUrl: string | null } | null
  updatedAt: string
}

interface ConversationsResponse {
  conversations: ConversationItem[]
  myUserId: string
}

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

interface ReactionGroup {
  emoji: string
  count: number
  users: ReactionUser[]
}

interface MessageItem {
  id: string
  body: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  pinnedAt: string | null
  authorId: string
  author: AuthorInfo
  reactions: ReactionGroup[]
  myReaction: string | null
  isMine: boolean
}

interface MessagesResponse {
  messages: MessageItem[]
  hasMore: boolean
}

interface PinnedMessage {
  id: string
  body: string
  createdAt: string
  pinnedAt: string
  author: AuthorInfo
}

interface MemberListItem {
  userId: string
  role?: string
  name: string
  avatarUrl: string | null
}

interface MemberListResponse {
  members: {
    membershipId: string
    role: string
    user: { id: string; name: string; email: string; avatarUrl: string | null; bio: string | null }
  }[]
  myUserId: string
  myRole: "member" | "executive"
}

const REACTION_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83C\uDF89", "\uD83D\uDC4F", "\uD83D\uDE02"]
const URL_REGEX = /(https?:\/\/[^\s]+)/g
const MENTION_REGEX = /@([A-Za-z0-9._-]+[A-Za-z0-9])/g
const PAGE_SIZE = 50
const POLL_INTERVAL_MS = 10_000
const TYPING_DEBOUNCE_MS = 2000
const TYPING_TTL_MS = 3000

/* =========================================================================
   Helpers
   ========================================================================= */

function conversationsKey(clubId: string) {
  return ["conversations", clubId] as const
}
function messagesKey(clubId: string, conversationId: string) {
  return ["messages", clubId, conversationId] as const
}
function pinnedKey(clubId: string, conversationId: string) {
  return ["pinned-messages", clubId, conversationId] as const
}

function linkify(text: string) {
  // Combined URL + @mention renderer. Mentions get a styled span (no deep
  // link target for v1 — just visual emphasis); URLs open in a new tab.
  const parts: React.ReactNode[] = []
  // Split on URL first to avoid running mention regex over links.
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
      // Within this non-URL chunk, split on @mentions.
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

function conversationTitle(c: ConversationItem): string {
  if (c.type === "direct") return c.otherUser?.name ?? "Direct chat"
  return c.name ?? "Group chat"
}

function conversationAvatarText(c: ConversationItem): string {
  if (c.type === "direct") return c.otherUser?.name ?? "?"
  return c.name ?? "G"
}

/* =========================================================================
   ChatView (root)
   ========================================================================= */

export function ChatView() {
  const clubId = useAppStore((s) => s.currentClubId)
  // Delegate everything to an inner component keyed by clubId so React
  // automatically resets local state (selected conversation, mobile panel)
  // when the user switches clubs — no manual effect-based resets needed.
  if (!clubId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Select a club to view chat.</div>
    )
  }
  return <ChatPane key={clubId} clubId={clubId} />
}

function ChatPane({ clubId }: { clubId: string }) {
  const role = useAppStore((s) => s.currentClub?.role)
  const isExec = role === "executive"
  const { data: session } = useSession()
  const myUserId = session?.user?.id

  const [activeId, setActiveId] = useState<string | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newDmOpen, setNewDmOpen] = useState(false)
  const [isMobileShowingMessages, setIsMobileShowingMessages] = useState(false)

  // Hooks must be called unconditionally. online is empty when no club.
  const online = usePresence(clubId)

  // Load conversation list.
  const conversationsQuery = useQuery<ConversationsResponse>({
    queryKey: conversationsKey(clubId),
    queryFn: () => api<ConversationsResponse>(`/api/clubs/${clubId}/chat/conversations`),
    // Realtime is primary (chat_message events invalidate this key); poll
    // only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(POLL_INTERVAL_MS),
  })

  const conversations = conversationsQuery.data?.conversations ?? []
  // effectiveActiveId: the actually-selectable conversation id.
  // - If the user's chosen activeId is still in the list, keep it.
  // - Otherwise fall back to the club-wide conversation (or null).
  // This handles the leave-conversation flow: after leaving, the
  // conversation disappears from the list, so we gracefully navigate the
  // user to the club-wide chat instead of stranding them on an empty
  // "No conversation selected" state.
  const effectiveActiveId =
    activeId && conversations.some((c) => c.id === activeId)
      ? activeId
      : conversations.find((c) => c.type === "club_wide")?.id ?? null

  // Sync activeId → effectiveActiveId (one-way). This is the React-blessed
  // "derived state" pattern: setting state during render with a guard is
  // safe because React discards the in-progress render and re-renders with
  // the new value. We use it (rather than useEffect) so the transition is
  // synchronous — no flash of the empty state.
  if (activeId !== effectiveActiveId) {
    setActiveId(effectiveActiveId)
  }

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === effectiveActiveId) ?? null,
    [conversations, effectiveActiveId],
  )

  const openConversation = (id: string) => {
    setActiveId(id)
    setIsMobileShowingMessages(true)
  }

  const backToList = () => {
    setIsMobileShowingMessages(false)
  }

  return (
    <div className="h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)]">
      <div className="flex h-full gap-0 md:gap-4">
        {/* Sidebar — conversation list */}
        <aside
          className={cn(
            "card-quiet w-full md:w-80 lg:w-96 flex-shrink-0 overflow-hidden flex flex-col",
            isMobileShowingMessages && "hidden md:flex",
          )}
        >
          <ConversationList
            clubId={clubId}
            conversations={conversations}
            activeId={activeId}
            onSelect={openConversation}
            online={online}
            isLoading={conversationsQuery.isLoading}
            myUserId={myUserId ?? ""}
            onNewGroup={() => setNewGroupOpen(true)}
            onNewDm={() => setNewDmOpen(true)}
          />
        </aside>

        {/* Main area — messages */}
        <main
          className={cn(
            "card-quiet flex-1 overflow-hidden flex flex-col",
            !isMobileShowingMessages && "hidden md:flex",
          )}
        >
          {activeConversation ? (
            <ConversationPane
              key={activeConversation.id}
              clubId={clubId}
              conversation={activeConversation}
              isExec={isExec}
              myUserId={myUserId ?? ""}
              online={online}
              onBack={backToList}
              onConversationMutated={() =>
                conversationsQuery.refetch()
              }
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <EmptyState
                icon={<MessageSquarePlus className="h-8 w-8" />}
                title="No conversation selected"
                description="Pick a conversation from the list, or start a new chat."
              />
            </div>
          )}
        </main>
      </div>

      {/* New group chat dialog */}
      <NewGroupChatDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        clubId={clubId}
        myUserId={myUserId ?? ""}
        onCreated={(convId) => {
          setNewGroupOpen(false)
          void conversationsQuery.refetch().then(() => {
            setActiveId(convId)
            setIsMobileShowingMessages(true)
          })
        }}
      />

      {/* New DM dialog */}
      <NewDirectChatDialog
        open={newDmOpen}
        onOpenChange={setNewDmOpen}
        clubId={clubId}
        myUserId={myUserId ?? ""}
        onCreated={(convId) => {
          setNewDmOpen(false)
          void conversationsQuery.refetch().then(() => {
            setActiveId(convId)
            setIsMobileShowingMessages(true)
          })
        }}
      />
    </div>
  )
}

/* =========================================================================
   ConversationList (sidebar)
   ========================================================================= */

function ConversationList({
  clubId,
  conversations,
  activeId,
  onSelect,
  online,
  isLoading,
  myUserId,
  onNewGroup,
  onNewDm,
}: {
  clubId: string
  conversations: ConversationItem[]
  activeId: string | null
  onSelect: (id: string) => void
  online: Set<string>
  isLoading: boolean
  myUserId: string
  onNewGroup: () => void
  onNewDm: () => void
}) {
  const [search, setSearch] = useState("")

  const clubWide = conversations.filter((c) => c.type === "club_wide")
  const others = conversations.filter((c) => c.type !== "club_wide")

  const filteredOthers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return others
    return others.filter((c) => {
      const label =
        c.type === "direct" ? c.otherUser?.name ?? "" : c.name ?? ""
      return label.toLowerCase().includes(q)
    })
  }, [others, search])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-section-title">Chat</h2>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={onNewDm}
                  aria-label="New direct message"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New direct message</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="club"
                  className="size-8"
                  onClick={onNewGroup}
                  aria-label="New group chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New group chat</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="pl-8 h-8 text-sm"
            aria-label="Search conversations"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : conversations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<MessageSquarePlus className="h-8 w-8" />}
              title="No conversations yet"
              description="Start a direct message or create a group chat."
              action={
                <Button variant="club" size="sm" onClick={onNewDm}>
                  <Plus className="h-4 w-4" /> Start a conversation
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Club-wide section */}
            {clubWide.length > 0 && (
              <div>
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Club-wide
                  </span>
                </div>
                {clubWide.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onClick={() => onSelect(c.id)}
                    online={online}
                    myUserId={myUserId}
                  />
                ))}
                <div className="border-b border-border mx-3 my-1" />
              </div>
            )}

            {/* Other conversations */}
            <div className="pb-2">
              {filteredOthers.length === 0 ? (
                <div className="text-caption text-center py-6 px-4">
                  {search ? "No matches." : "No conversations yet."}
                </div>
              ) : (
                filteredOthers.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onClick={() => onSelect(c.id)}
                    online={online}
                    myUserId={myUserId}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ConversationRow({
  conversation,
  active,
  onClick,
  online,
  myUserId,
}: {
  conversation: ConversationItem
  active: boolean
  onClick: () => void
  online: Set<string>
  myUserId: string
}) {
  const title = conversationTitle(conversation)
  const isDirect = conversation.type === "direct"
  const otherId = conversation.otherUser?.id
  const isOnline = !!otherId && online.has(otherId)
  const initialsText = isDirect
    ? conversation.otherUser?.name
    : conversation.name

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-accent/60 dark:hover:bg-accent/40 focus-visible:bg-accent/60",
        active && "bg-club-muted hover:bg-club-muted",
      )}
    >
      <div className="relative shrink-0">
        {isDirect ? (
          <Avatar className="size-9">
            <AvatarImage src={conversation.otherUser?.avatarUrl ?? undefined} alt={title} />
            <AvatarFallback className={cn("text-xs", avatarColor(initialsText))}>
              {initials(initialsText)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn(
              "size-9 rounded-full flex items-center justify-center text-xs font-medium",
              avatarColor(initialsText),
            )}
          >
            {initials(initialsText)}
          </div>
        )}
        {isOnline && (
          <span
            className="absolute bottom-0 right-0 size-2.5 rounded-full bg-club ring-2 ring-card"
            aria-label="Online"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              active ? "text-foreground" : "text-foreground/90",
            )}
          >
            {title}
          </span>
          {conversation.lastMessage && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {relativeTime(conversation.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {conversation.lastMessage ? (
              <>
                {conversation.lastMessage.authorId === myUserId ? (
                  <span className="text-muted-foreground/80">You: </span>
                ) : conversation.type !== "direct" && conversation.lastMessage.authorName ? (
                  <span className="text-muted-foreground/80">
                    {conversation.lastMessage.authorName.split(" ")[0]}:{" "}
                  </span>
                ) : null}
                {truncate(conversation.lastMessage.body, 40)}
              </>
            ) : (
              <span className="italic text-muted-foreground/70">No messages yet</span>
            )}
          </span>
          {conversation.unreadCount > 0 && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-club text-club-foreground text-[10px] font-semibold tabular-nums">
              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}

/* =========================================================================
   ConversationPane (main area)
   ========================================================================= */

function ConversationPane({
  clubId,
  conversation,
  isExec,
  myUserId,
  online,
  onBack,
  onConversationMutated,
}: {
  clubId: string
  conversation: ConversationItem
  isExec: boolean
  myUserId: string
  online: Set<string>
  onBack: () => void
  onConversationMutated: () => void
}) {
  const qc = useQueryClient()
  const [renameOpen, setRenameOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  // Latest page (latest PAGE_SIZE messages).
  const latestQuery = useQuery<MessagesResponse>({
    queryKey: messagesKey(clubId, conversation.id),
    queryFn: () =>
      api<MessagesResponse>(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages`,
      ),
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(POLL_INTERVAL_MS),
  })

  // Older pages (loaded on scroll-up).
  const [olderPages, setOlderPages] = useState<MessageItem[][]>([])
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const pinnedBottomRef = useRef<boolean>(true)
  // NOTE: This component is keyed by conversation.id in the parent, so React
  // already remounts it (resetting local state) when switching conversations.

  const latestMessages = latestQuery.data?.messages ?? []
  const olderMessages = useMemo(() => olderPages.flat(), [olderPages])

  // Dedupe: drop older messages that overlap with the latest window.
  const latestIds = useMemo(() => new Set(latestMessages.map((m) => m.id)), [latestMessages])
  const allMessages = useMemo(() => {
    const older = olderMessages.filter((m) => !latestIds.has(m.id))
    return [...older, ...latestMessages]
  }, [olderMessages, latestIds, latestMessages])

  // Auto-scroll to bottom on new messages (if user was already at the bottom).
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    if (pinnedBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [allMessages.length, conversation.id])

  // When older messages are prepended, preserve the visible scroll position.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    if (prevScrollHeightRef.current && prevScrollHeightRef.current > 0) {
      const delta = el.scrollHeight - prevScrollHeightRef.current
      el.scrollTop = el.scrollTop + delta
      prevScrollHeightRef.current = 0
    }
  }, [olderPages])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedBottomRef.current = distanceFromBottom < 80
    if (el.scrollTop <= 40 && !loadingOlder && hasMoreOlder && latestMessages.length > 0) {
      void loadOlder()
    }
  }, [loadingOlder, hasMoreOlder, latestMessages.length])

  async function loadOlder() {
    if (loadingOlder || !hasMoreOlder) return
    const oldest = allMessages[0]
    if (!oldest) return
    setLoadingOlder(true)
    const el = scrollContainerRef.current
    if (el) prevScrollHeightRef.current = el.scrollHeight
    try {
      const res = await api<MessagesResponse>(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages?before=${oldest.id}`,
      )
      if (res.messages.length === 0) {
        setHasMoreOlder(false)
      } else {
        setOlderPages((prev) => [res.messages, ...prev])
        if (!res.hasMore) setHasMoreOlder(false)
      }
    } catch (e) {
      // silent
    } finally {
      setLoadingOlder(false)
    }
  }

  function patchMessage(messageId: string, patch: Partial<MessageItem>) {
    qc.setQueryData<MessagesResponse>(messagesKey(clubId, conversation.id), (old) => {
      if (!old) return old
      return {
        ...old,
        messages: old.messages.map((m) =>
          m.id === messageId ? { ...m, ...patch } : m,
        ),
      }
    })
    setOlderPages((pages) =>
      pages.map((page) =>
        page.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
      ),
    )
  }

  function replaceMessageReactions(
    messageId: string,
    reactions: ReactionGroup[],
    myReaction: string | null,
  ) {
    patchMessage(messageId, { reactions, myReaction })
  }

  // Send message mutation.
  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api<{ message: MessageItem }>(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages`,
        { method: "POST", json: { body } },
      ),
    onSuccess: (res) => {
      qc.setQueryData<MessagesResponse>(messagesKey(clubId, conversation.id), (old) => {
        if (!old) return { messages: [res.message], hasMore: false }
        // Append if not present.
        if (old.messages.some((m) => m.id === res.message.id)) return old
        return { ...old, messages: [...old.messages, res.message] }
      })
      pinnedBottomRef.current = true
      void onConversationMutated()
    },
    onError: (e: Error) => {
      toast.error(e.message)
    },
  })

  // Edit mutation.
  const editMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      api<{ message: MessageItem }>(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages/${messageId}`,
        { method: "PATCH", json: { body } },
      ),
    onSuccess: (res) => {
      patchMessage(res.message.id, res.message)
      void onConversationMutated()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Delete mutation.
  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages/${messageId}`,
        { method: "DELETE" },
      ),
    onSuccess: (_res, messageId) => {
      patchMessage(messageId, { deletedAt: new Date().toISOString(), body: "" })
      void qc.invalidateQueries({ queryKey: pinnedKey(clubId, conversation.id) })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Reaction mutation.
  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api<{ reactions: ReactionGroup[]; myReaction: string | null }>(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages/${messageId}/reactions`,
        { method: "POST", json: { emoji } },
      ),
    onSuccess: (res, vars) => {
      replaceMessageReactions(vars.messageId, res.reactions, res.myReaction)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Pin/unpin mutation.
  const pinMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      api(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/messages/${messageId}/pin`,
        { method: "PATCH", json: { pinned } },
      ),
    onSuccess: (_res, vars) => {
      patchMessage(vars.messageId, {
        pinnedAt: vars.pinned ? new Date().toISOString() : null,
      })
      void qc.invalidateQueries({ queryKey: pinnedKey(clubId, conversation.id) })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Leave conversation mutation.
  const leaveMutation = useMutation({
    mutationFn: () =>
      api(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/members/${myUserId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      toast.success("You left the conversation")
      setLeaveOpen(false)
      // Reset mobile state so the user is returned to the conversation list
      // (rather than seeing the now-gone conversation pane).
      onBack()
      void qc.invalidateQueries({ queryKey: conversationsKey(clubId) })
      onConversationMutated()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Pinned messages bar
  const pinnedQuery = useQuery<{ pinned: PinnedMessage[] }>({
    queryKey: pinnedKey(clubId, conversation.id),
    queryFn: () =>
      api<{ pinned: PinnedMessage[] }>(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/pinned`,
      ),
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(POLL_INTERVAL_MS * 2),
  })
  const pinnedMessages = pinnedQuery.data?.pinned ?? []

  const myMembership = conversation.myRole
  const canManage = myMembership === "owner" || isExec
  const canPin = canManage

  // Export handler — fetches the conversation history as a plain-text file
  // and triggers a browser download. Uses raw fetch (not the api() wrapper)
  // because the response is text/plain with Content-Disposition: attachment,
  // not JSON. Surfaces success/failure via toast.
  const [exporting, setExporting] = useState(false)
  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/clubs/${clubId}/chat/conversations/${conversation.id}/export`,
        { credentials: "same-origin" },
      )
      if (!res.ok) {
        // Try to parse a JSON error body, fall back to a status code.
        let msg = `Export failed (${res.status})`
        try {
          const data = await res.json()
          if (data?.error) msg = data.error
        } catch {
          /* not JSON — keep the status-code message */
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      // Pull the filename from Content-Disposition; fall back to a generic
      // name if the header is missing or malformed.
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="?([^";]+)"?/i)
      const filename = match ? match[1] : "conversation.txt"
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Revoke on a short timeout so the click has time to fire in all
      // browsers (Safari in particular needs this).
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toast.success("Conversation exported")
    } catch (e) {
      toast.error((e as Error).message || "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-3 border-b border-border">
        <Button
          size="icon"
          variant="ghost"
          className="md:hidden size-8"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <ConversationAvatar conversation={conversation} online={online} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-card-title truncate min-w-0">{conversationTitle(conversation)}</h3>
            {conversation.type === "group" && myMembership === "owner" && (
              <span className="inline-flex items-center rounded-md bg-club-muted text-club px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
                Owner
              </span>
            )}
          </div>
          <p className="text-caption">
            {conversation.type === "direct"
              ? "Direct message"
              : `${conversation.memberCount} ${conversation.memberCount === 1 ? "member" : "members"}`}
          </p>
        </div>

        {/* Export — available to any conversation member */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={handleExport}
              disabled={exporting}
              aria-label="Export conversation as text"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export conversation as text</TooltipContent>
        </Tooltip>

        {/* Members dropdown */}
        {conversation.type === "group" && (
          <MembersDropdown
            clubId={clubId}
            conversationId={conversation.id}
            online={online}
          />
        )}

        {/* Settings menu */}
        {conversation.type === "group" && canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Conversation settings"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                <Edit className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddMemberOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add members
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setLeaveOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <X className="mr-2 h-4 w-4" /> Leave conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Pinned bar */}
      {pinnedMessages.length > 0 && (
        <PinnedMessagesBar pinned={pinnedMessages} />
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-4 py-4 space-y-1"
        aria-live="polite"
      >
        {loadingOlder && (
          <div className="flex items-center justify-center py-3 text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading older messages…
          </div>
        )}
        {!loadingOlder && hasMoreOlder && allMessages.length > 0 && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
          >
            Load older messages
          </button>
        )}
        {latestQuery.isLoading ? (
          <MessagesSkeleton />
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Hash className="h-6 w-6" />
            </div>
            <h4 className="text-card-title">Say hello!</h4>
            <p className="text-body text-muted-foreground mt-1">
              No messages yet. Be the first to start the conversation.
            </p>
          </div>
        ) : (
          <MessageList
            messages={allMessages}
            clubId={clubId}
            conversationId={conversation.id}
            conversationType={conversation.type}
            myUserId={myUserId}
            isExec={isExec}
            canPin={canPin}
            canManage={canManage}
            onEdit={(messageId, body) =>
              editMutation.mutate({ messageId, body })
            }
            onDelete={(messageId) => deleteMutation.mutate(messageId)}
            onReact={(messageId, emoji) =>
              reactionMutation.mutate({ messageId, emoji })
            }
            onPin={(messageId, pinned) =>
              pinMutation.mutate({ messageId, pinned })
            }
            reactingId={reactionMutation.isPending ? "" : ""}
          />
        )}
      </div>

      {/* Typing indicator */}
      <TypingIndicator conversationId={conversation.id} myUserId={myUserId} />

      {/* Composer */}
      <MessageComposer
        clubId={clubId}
        conversationId={conversation.id}
        myUserId={myUserId}
        onSend={(body) => sendMutation.mutate(body)}
        disabled={sendMutation.isPending}
      />

      {/* Rename dialog */}
      {renameOpen && (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          clubId={clubId}
          conversationId={conversation.id}
          currentName={conversation.name ?? ""}
          onRenamed={() => {
            setRenameOpen(false)
            void qc.invalidateQueries({ queryKey: conversationsKey(clubId) })
            onConversationMutated()
          }}
        />
      )}

      {/* Add member dialog */}
      {addMemberOpen && (
        <AddMemberDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          clubId={clubId}
          conversationId={conversation.id}
          onAdded={() => {
            setAddMemberOpen(false)
            void qc.invalidateQueries({ queryKey: conversationsKey(clubId) })
            onConversationMutated()
          }}
        />
      )}

      {/* Leave confirm */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer receive messages from this group chat. You can
              be re-added later by an owner or executive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={leaveMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                leaveMutation.mutate()
              }}
            >
              {leaveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Leave"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ConversationAvatar({
  conversation,
  online,
}: {
  conversation: ConversationItem
  online: Set<string>
}) {
  const isDirect = conversation.type === "direct"
  const title = conversationTitle(conversation)
  const otherId = conversation.otherUser?.id
  const isOnline = !!otherId && online.has(otherId)

  if (isDirect) {
    return (
      <div className="relative shrink-0">
        <Avatar className="size-9">
          <AvatarImage src={conversation.otherUser?.avatarUrl ?? undefined} alt={title} />
          <AvatarFallback className={cn("text-xs", avatarColor(title))}>
            {initials(title)}
          </AvatarFallback>
        </Avatar>
        {isOnline && (
          <span
            className="absolute bottom-0 right-0 size-2.5 rounded-full bg-club ring-2 ring-card"
            aria-label="Online"
          />
        )}
      </div>
    )
  }
  return (
    <div
      className={cn(
        "size-9 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
        avatarColor(conversation.name ?? "G"),
      )}
    >
      {initials(conversation.name ?? "G")}
    </div>
  )
}

/* =========================================================================
   Members dropdown
   ========================================================================= */

function MembersDropdown({
  clubId,
  conversationId,
  online,
}: {
  clubId: string
  conversationId: string
  online: Set<string>
}) {
  const { data } = useQuery<MemberListResponse>({
    queryKey: ["chat-members", clubId, conversationId],
    queryFn: () => api<MemberListResponse>(`/api/clubs/${clubId}/members`),
    // We use the global members list — same data, just for "is this user online?" display.
    staleTime: 30_000,
  })

  // For now we don't have a dedicated conversation members endpoint, so we
  // show the full club member list filtered to those online. This is a
  // lightweight display aid — to be enhanced.
  const members = data?.members ?? []
  const onlineMembers = members.filter((m) => online.has(m.user.id))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5"
          aria-label="View members"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Members</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Online ({onlineMembers.length})
        </div>
        <DropdownMenuSeparator />
        {onlineMembers.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground italic">
            No one is online right now.
          </div>
        ) : (
          onlineMembers.slice(0, 12).map((m) => (
            <DropdownMenuItem key={m.user.id} className="gap-2 py-1.5">
              <Avatar className="size-6">
                <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                <AvatarFallback className={cn("text-[10px]", avatarColor(m.user.name))}>
                  {initials(m.user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm truncate">{m.user.name}</span>
              {m.role === "executive" && (
                <span className="ml-auto text-[10px] text-muted-foreground">exec</span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* =========================================================================
   Pinned bar
   ========================================================================= */

function PinnedMessagesBar({ pinned }: { pinned: PinnedMessage[] }) {
  const [open, setOpen] = useState(true)
  const [active, setActive] = useState<PinnedMessage | null>(null)
  if (pinned.length === 0) return null
  return (
    <div className="border-b border-border bg-club-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 md:px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Pin className="h-3.5 w-3.5" />
        <span className="font-medium">
          {pinned.length} pinned {pinned.length === 1 ? "message" : "messages"}
        </span>
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 transition-transform", open ? "rotate-180" : "")}
        />
      </button>
      {open && (
        <div className="px-3 md:px-4 pb-2 space-y-1">
          {pinned.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p)}
              className="w-full text-left px-3 py-1.5 rounded-md hover:bg-accent/60 dark:hover:bg-accent/40 text-xs"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-medium text-foreground">{p.author.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {relativeTime(p.createdAt)}
                </span>
              </div>
              <div className="text-muted-foreground truncate">{truncate(p.body, 100)}</div>
            </button>
          ))}
        </div>
      )}
      {active && (
        <Dialog open onOpenChange={(o) => !o && setActive(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pin className="h-4 w-4" />
                Pinned message
              </DialogTitle>
              <DialogDescription>
                {active.author.name} · {relativeTime(active.createdAt)}
              </DialogDescription>
            </DialogHeader>
            <div className="text-body whitespace-pre-wrap break-words">
              {linkify(active.body)}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/* =========================================================================
   Message list
   ========================================================================= */

function MessageList({
  messages,
  conversationType,
  myUserId,
  isExec,
  canPin,
  canManage,
  onEdit,
  onDelete,
  onReact,
  onPin,
}: {
  messages: MessageItem[]
  clubId: string
  conversationId: string
  conversationType: ConversationType
  myUserId: string
  isExec: boolean
  canPin: boolean
  canManage: boolean
  onEdit: (messageId: string, body: string) => void
  onDelete: (messageId: string) => void
  onReact: (messageId: string, emoji: string) => void
  onPin: (messageId: string, pinned: boolean) => void
  reactingId: string
}) {
  // Group consecutive messages by the same author within 5 minutes for a compact look.
  const grouped: MessageItem[][] = []
  let currentGroup: MessageItem[] = []
  let lastAuthorId: string | null = null
  let lastTs = 0
  for (const m of messages) {
    const ts = new Date(m.createdAt).getTime()
    if (
      m.authorId === lastAuthorId &&
      ts - lastTs < 5 * 60_000 &&
      !m.deletedAt
    ) {
      currentGroup.push(m)
    } else {
      if (currentGroup.length > 0) grouped.push(currentGroup)
      currentGroup = [m]
    }
    lastAuthorId = m.authorId
    lastTs = ts
  }
  if (currentGroup.length > 0) grouped.push(currentGroup)

  return (
    <div className="space-y-3">
      {grouped.map((group, gi) => {
        const first = group[0]
        const isMine = first.authorId === myUserId
        const showAuthorHeader =
          conversationType !== "direct" && !first.isMine && !first.deletedAt
        return (
          <div key={gi} className={cn("flex gap-2", isMine ? "flex-row-reverse" : "flex-row")}>
            {/* Avatar (only for group chats, others' messages) */}
            <div className="w-8 shrink-0">
              {showAuthorHeader && (
                <Avatar className="size-8 mt-1">
                  <AvatarImage src={first.author.avatarUrl ?? undefined} alt={first.author.name} />
                  <AvatarFallback className={cn("text-[10px]", avatarColor(first.author.name))}>
                    {initials(first.author.name)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <div className={cn("flex-1 min-w-0 flex flex-col gap-0.5", isMine ? "items-end" : "items-start")}>
              {showAuthorHeader && (
                <div className="text-[10px] text-muted-foreground px-1">
                  {first.author.name}
                </div>
              )}
              <div className={cn("flex flex-col gap-1 w-full max-w-[78%]", isMine ? "items-end" : "items-start")}>
                {group.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isMine={isMine}
                    canDelete={m.isMine || canManage}
                    canPin={canPin}
                    showActions={!m.deletedAt}
                    onEdit={(body) => onEdit(m.id, body)}
                    onDelete={() => onDelete(m.id)}
                    onReact={(emoji) => onReact(m.id, emoji)}
                    onPin={(pinned) => onPin(m.id, pinned)}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MessageBubble({
  message,
  isMine,
  canDelete,
  canPin,
  showActions,
  onEdit,
  onDelete,
  onReact,
  onPin,
}: {
  message: MessageItem
  isMine: boolean
  canDelete: boolean
  canPin: boolean
  showActions: boolean
  onEdit: (body: string) => void
  onDelete: () => void
  onReact: (emoji: string) => void
  onPin: (pinned: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const isDeleted = !!message.deletedAt

  return (
    <div
      className={cn(
        "group relative rounded-lg px-3 py-2 max-w-full text-sm break-words",
        isMine
          ? "bg-club text-club-foreground"
          : "bg-accent text-accent-foreground dark:bg-accent/60",
        isDeleted && "italic bg-muted/50 text-muted-foreground",
      )}
    >
      {isDeleted ? (
        <span>[message deleted]</span>
      ) : editing ? (
        <div className="flex flex-col gap-2 min-w-[220px]">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="bg-background text-foreground text-sm min-h-[60px] resize-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (draft.trim() && draft.trim() !== message.body) {
                  onEdit(draft.trim())
                }
                setEditing(false)
              } else if (e.key === "Escape") {
                e.preventDefault()
                setDraft(message.body)
                setEditing(false)
              }
            }}
          />
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setDraft(message.body)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="club"
              className="h-7"
              onClick={() => {
                if (draft.trim() && draft.trim() !== message.body) {
                  onEdit(draft.trim())
                }
                setEditing(false)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words">{linkify(message.body)}</div>
      )}

      {!isDeleted && !editing && (
        <div
          className={cn(
            "text-[10px] mt-1",
            isMine ? "text-club-foreground/70" : "text-muted-foreground",
          )}
        >
          {relativeTime(message.createdAt)}
          {message.editedAt && <span className="ml-1 italic">(edited)</span>}
          {message.pinnedAt && (
            <span className="ml-1 inline-flex items-center gap-0.5">
              <Pin className="h-2.5 w-2.5" /> pinned
            </span>
          )}
        </div>
      )}

      {/* Reactions */}
      {!isDeleted && message.reactions.length > 0 && (
        <div className={cn("flex flex-wrap gap-1 mt-1.5")}>
          {message.reactions.map((g) => (
            <ReactionBadge
              key={g.emoji}
              group={g}
              mine={message.myReaction === g.emoji}
              isMine={isMine}
              onClick={() => onReact(g.emoji)}
            />
          ))}
        </div>
      )}

      {/* Hover actions */}
      {!isDeleted && !editing && showActions && (
        <div
          className={cn(
            "absolute top-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5",
            isMine ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1",
          )}
        >
          <ReactionPopover onPick={onReact} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => onEdit(message.body)}
                aria-label="Edit message"
                disabled={!message.isMine}
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          {canPin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => onPin(!message.pinnedAt)}
                  aria-label={message.pinnedAt ? "Unpin message" : "Pin message"}
                >
                  {message.pinnedAt ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{message.pinnedAt ? "Unpin" : "Pin"}</TooltipContent>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 hover:text-destructive"
                  onClick={onDelete}
                  aria-label="Delete message"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

function ReactionBadge({
  group,
  mine,
  isMine,
  onClick,
}: {
  group: ReactionGroup
  mine: boolean
  isMine: boolean
  onClick: () => void
}) {
  const names = group.users.map((u) => u.name).join(", ")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          title={names}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs border transition-colors",
            mine
              ? "border-club bg-club-muted text-club"
              : isMine
                ? "border-club-foreground/20 bg-club-foreground/10 text-club-foreground"
                : "border-border bg-background/80 text-foreground hover:bg-accent",
          )}
        >
          <span>{group.emoji}</span>
          <span className="tabular-nums font-medium">{group.count}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{names}</TooltipContent>
    </Tooltip>
  )
}

function ReactionPopover({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Add reaction"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>React</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-1.5">
        <div className="flex items-center gap-0.5">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className="text-lg leading-none p-1.5 rounded hover:bg-accent"
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/* =========================================================================
   Typing indicator
   ========================================================================= */

/**
 * Shows "X is typing…" / "Several people are typing…" below the conversation
 * header. Subscribes directly to `realtime:club` events with type `chat_typing`
 * (and `chat_typing:stop`) — we deliberately DON'T invalidate React-Query here
 * because typing is ephemeral and shouldn't trigger message refetches.
 *
 * Each typing entry expires after TYPING_TTL_MS so a disconnected user
 * doesn't stay "typing" forever.
 */
function TypingIndicator({
  conversationId,
  myUserId,
}: {
  conversationId: string
  myUserId: string
}) {
  const clubId = useAppStore((s) => s.currentClubId)
  // Map<userId, expiresAt>
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(() => new Map())

  useEffect(() => {
    const bump = (userId: string, expiresAt: number) => {
      setTypingUsers((prev) => {
        const next = new Map(prev)
        next.set(userId, expiresAt)
        return next
      })
    }
    const remove = (userId: string) => {
      setTypingUsers((prev) => {
        if (!prev.has(userId)) return prev
        const next = new Map(prev)
        next.delete(userId)
        return next
      })
    }

    const onClub = (data: any) => {
      if (!data || data.conversationId !== conversationId) return
      if (data.userId === myUserId) return // ignore self
      if (data.type === "chat_typing") {
        bump(data.userId, Date.now() + TYPING_TTL_MS)
      } else if (data.type === "chat_typing:stop") {
        remove(data.userId)
      }
    }
    const unsub = onRealtimeEvent("realtime:club", onClub)

    // Sweep expired typing entries every second so a stale "X is typing…"
    // doesn't linger if the user stops typing without sending a stop event
    // (e.g. they closed their tab).
    const sweeper = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now()
        let changed = false
        const next = new Map<string, number>()
        for (const [uid, expiresAt] of prev) {
          if (expiresAt > now) next.set(uid, expiresAt)
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      unsub()
      clearInterval(sweeper)
    }
  }, [conversationId, myUserId])

  // Look up display names for the typing users. We use the global members
  // list (cached via React-Query elsewhere) so we don't fire another fetch
  // here. Stale data is fine — names rarely change.
  const { data: membersData } = useQuery<MemberListResponse>({
    queryKey: ["members", clubId ?? ""],
    queryFn: () => api<MemberListResponse>(`/api/clubs/${clubId ?? ""}/members`),
    enabled: !!clubId && typingUsers.size > 0,
    staleTime: 60_000,
  })
  const nameFor = (userId: string) =>
    membersData?.members.find((m) => m.user.id === userId)?.user.name ?? "Someone"

  const others = Array.from(typingUsers.keys())
  if (others.length === 0) return null
  const label =
    others.length === 1
      ? `${nameFor(others[0])} is typing…`
      : others.length === 2
        ? `${nameFor(others[0])} and ${nameFor(others[1])} are typing…`
        : "Several people are typing…"

  return (
    <div
      className="px-3 md:px-4 py-1.5 text-caption text-muted-foreground border-t border-border/40 bg-muted/20"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5">
          <span className="h-1 w-1 rounded-full bg-club animate-bounce [animation-delay:0ms]" />
          <span className="h-1 w-1 rounded-full bg-club animate-bounce [animation-delay:120ms]" />
          <span className="h-1 w-1 rounded-full bg-club animate-bounce [animation-delay:240ms]" />
        </span>
        {label}
      </span>
    </div>
  )
}

/* =========================================================================
   Composer
   ========================================================================= */

function MessageComposer({
  clubId,
  conversationId,
  myUserId,
  onSend,
  disabled,
}: {
  clubId: string
  conversationId: string
  myUserId: string
  onSend: (body: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const lastTypingAtRef = useRef<number>(0)

  // Load the club members list (cached) to power the @mention picker.
  const { data: membersData } = useQuery<MemberListResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api<MemberListResponse>(`/api/clubs/${clubId}/members`),
    staleTime: 30_000,
  })
  const members: MentionableMember[] = (membersData?.members ?? [])
    .filter((m) => m.user.id !== myUserId)
    .map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl ?? null,
    }))

  // Auto-grow.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [value])

  // Emit a typing event (debounced). We throttle to one event per
  // TYPING_DEBOUNCE_MS so the server isn't spammed on every keystroke.
  function maybeEmitTyping() {
    const now = Date.now()
    if (now - lastTypingAtRef.current < TYPING_DEBOUNCE_MS) return
    lastTypingAtRef.current = now
    try {
      const socket = getRealtimeSocket()
      if (socket.connected) {
        socket.emit("typing", { clubId, conversationId, userId: myUserId })
      }
    } catch {
      // ignore — typing indicators are best-effort
    }
  }

  function submit() {
    const body = value.trim()
    if (!body || disabled) return
    onSend(body)
    setValue("")
    // Clear typing on send (so other clients stop showing "is typing" after
    // the message arrives). We send a stop event so the indicator clears
    // immediately rather than after the TTL expires.
    try {
      const socket = getRealtimeSocket()
      if (socket.connected) {
        socket.emit("typing:stop", { clubId, conversationId, userId: myUserId })
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="border-t border-border p-3 md:p-4">
      <div className="flex items-end gap-2">
        <MentionableTextarea
          ref={textareaRef}
          value={value}
          members={members}
          onChange={(e) => {
            setValue(e.target.value)
            maybeEmitTyping()
          }}
          placeholder="Type a message… use @ to mention someone"
          className="flex-1 resize-none min-h-[40px] max-h-40"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Message input"
          disabled={disabled}
          listLabel="Mention a club member"
        />
        <Button
          variant="club"
          size="icon"
          className="size-10 shrink-0"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 px-1 hidden sm:block">
        Press <kbd className="rounded border border-border px-1">Enter</kbd> to send,{" "}
        <kbd className="rounded border border-border px-1">Shift+Enter</kbd> for a new line.
        Type <kbd className="rounded border border-border px-1">@</kbd> to mention someone.
      </p>
    </div>
  )
}

/* =========================================================================
   New group chat dialog
   ========================================================================= */

function NewGroupChatDialog({
  open,
  onOpenChange,
  clubId,
  myUserId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  myUserId: string
  onCreated: (conversationId: string) => void
}) {
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [submitting, setSubmitting] = useState(false)

  const { data: membersData } = useQuery<MemberListResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api<MemberListResponse>(`/api/clubs/${clubId}/members`),
    enabled: open && !!clubId,
    staleTime: 30_000,
  })

  const others = (membersData?.members ?? []).filter((m) => m.user.id !== myUserId)
  const selectedCount = selected.size

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed || selected.size === 0) return
    setSubmitting(true)
    try {
      const res = await api<{ conversation: { id: string } }>(
        `/api/clubs/${clubId}/chat/conversations`,
        { method: "POST", json: { type: "group", name: trimmed, memberUserIds: Array.from(selected) } },
      )
      toast.success("Group chat created")
      setName("")
      setSelected(new Set())
      onCreated(res.conversation.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create group chat")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setName("")
          setSelected(new Set())
        }
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group chat</DialogTitle>
          <DialogDescription>
            Create a group chat with other members of this club.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project team"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Members ({selectedCount} selected)</Label>
            <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-md border border-border divide-y divide-border">
              {others.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground italic">
                  No other club members.
                </div>
              ) : (
                others.map((m) => {
                  const checked = selected.has(m.user.id)
                  return (
                    <label
                      key={m.user.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50",
                        checked && "bg-club-muted/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.user.id)}
                        className="size-4 accent-[var(--club-accent)]"
                      />
                      <Avatar className="size-7">
                        <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                        <AvatarFallback className={cn("text-[10px]", avatarColor(m.user.name))}>
                          {initials(m.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{m.user.name}</div>
                        {m.role === "executive" && (
                          <span className="text-[10px] text-muted-foreground">executive</span>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="club"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || selected.size === 0}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
   New direct chat dialog
   ========================================================================= */

function NewDirectChatDialog({
  open,
  onOpenChange,
  clubId,
  myUserId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  myUserId: string
  onCreated: (conversationId: string) => void
}) {
  const [search, setSearch] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { data: membersData } = useQuery<MemberListResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api<MemberListResponse>(`/api/clubs/${clubId}/members`),
    enabled: open && !!clubId,
    staleTime: 30_000,
  })

  const others = (membersData?.members ?? []).filter((m) => m.user.id !== myUserId)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return others
    return others.filter(
      (m) =>
        m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    )
  }, [others, search])

  async function startWith(userId: string) {
    setSubmitting(true)
    try {
      const res = await api<{ conversation: { id: string } }>(
        `/api/clubs/${clubId}/chat/conversations`,
        { method: "POST", json: { type: "direct", memberUserIds: [userId] } },
      )
      onCreated(res.conversation.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start chat")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>
            Start a private 1:1 conversation with a club member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search members"
          />
          <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-md border border-border divide-y divide-border">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground italic">No matches.</div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.user.id}
                  type="button"
                  onClick={() => startWith(m.user.id)}
                  disabled={submitting}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 text-left"
                >
                  <Avatar className="size-7">
                    <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                    <AvatarFallback className={cn("text-[10px]", avatarColor(m.user.name))}>
                      {initials(m.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm truncate">{m.user.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.user.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
   Rename dialog
   ========================================================================= */

function RenameDialog({
  open,
  onOpenChange,
  clubId,
  conversationId,
  currentName,
  onRenamed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  conversationId: string
  currentName: string
  onRenamed: () => void
}) {
  const [name, setName] = useState(currentName)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setName(currentName)
  }, [open, currentName])

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await api(
        `/api/clubs/${clubId}/chat/conversations/${conversationId}`,
        { method: "PATCH", json: { name: trimmed } },
      )
      toast.success("Conversation renamed")
      onRenamed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename conversation</DialogTitle>
          <DialogDescription>Choose a new name for this group chat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rename-name">Name</Label>
          <Input
            id="rename-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleSubmit()
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="club" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
   Add member dialog
   ========================================================================= */

function AddMemberDialog({
  open,
  onOpenChange,
  clubId,
  conversationId,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  conversationId: string
  onAdded: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [added, setAdded] = useState<Set<string>>(() => new Set())

  const { data: membersData } = useQuery<MemberListResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api<MemberListResponse>(`/api/clubs/${clubId}/members`),
    enabled: open && !!clubId,
    staleTime: 30_000,
  })

  const others = (membersData?.members ?? [])
  const myUserId = membersData?.myUserId

  async function add(userId: string, name: string) {
    setSubmitting(true)
    try {
      await api(
        `/api/clubs/${clubId}/chat/conversations/${conversationId}/members`,
        { method: "POST", json: { userId } },
      )
      toast.success(`${name} added`)
      setAdded((prev) => new Set(prev).add(userId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
          <DialogDescription>
            Add active club members to this group chat.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto scrollbar-thin rounded-md border border-border divide-y divide-border">
          {others.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground italic">
              No members available.
            </div>
          ) : (
            others
              .filter((m) => m.user.id !== myUserId)
              .map((m) => {
                const isAdded = added.has(m.user.id)
                return (
                  <div key={m.user.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar className="size-7">
                      <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                      <AvatarFallback className={cn("text-[10px]", avatarColor(m.user.name))}>
                        {initials(m.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{m.user.name}</div>
                      {m.role === "executive" && (
                        <span className="text-[10px] text-muted-foreground">executive</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "outline" : "club"}
                      disabled={submitting || isAdded}
                      onClick={() => add(m.user.id, m.user.name)}
                    >
                      {isAdded ? "Added" : "Add"}
                    </Button>
                  </div>
                )
              })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAdded()}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
   Skeletons
   ========================================================================= */

function ConversationListSkeleton() {
  return (
    <div className="px-2 py-2 space-y-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-2.5 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={cn("flex gap-2", i % 2 === 0 ? "flex-row-reverse" : "flex-row")}>
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-1.5 max-w-[70%]">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-10 w-48 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}
