"use client"

import * as React from "react"
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus,
  Heart,
  Download,
  Trash2,
  Pencil,
  Filter as FilterIcon,
  X,
  Loader2,
  Lock,
  Globe,
  Check,
  NotebookPen,
  Tag as TagIcon,
  ChevronDown,
} from "lucide-react"

import { api } from "@/lib/api/client"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { usePollingFallback, useRemoteChange } from "@/lib/realtime-store"
import {
  PageHeader,
  EmptyState,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NoteTag {
  id: string
  name: string
  color: string | null
  usageCount?: number
}

interface Note {
  id: string
  clubId: string
  authorId: string
  title: string | null
  content: string
  isPrivate: boolean
  sharedWith: string[]
  createdAt: string
  updatedAt: string
  heartCount: number
  hasHearted: boolean
  authorName: string
  authorAvatarUrl: string | null
  tags: { id: string; name: string; color: string | null }[]
}

interface Member {
  id: string
  name: string
  avatarUrl?: string | null
}

interface NotesListResponse {
  notes: Note[]
  tags: NoteTag[]
  totalActiveNotes: number
  caps: {
    maxNotesPerClub: number
    maxTagsPerClub: number
    maxContentChars: number
    maxTitleChars: number
  }
  myUserId: string
  myRole: "member" | "executive"
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type FilterScope = "all" | "mine" | "hearted"

export function NotesView() {
  const currentClubId = useAppStore((s) => s.currentClubId)
  const currentClub = useAppStore((s) => s.currentClub)

  const [filter, setFilter] = React.useState<FilterScope>("all")
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([])
  const [composerOpen, setComposerOpen] = React.useState(false)
  const [editingNote, setEditingNote] = React.useState<Note | null>(null)
  const [deletingNoteId, setDeletingNoteId] = React.useState<string | null>(null)

  const queryClient = useQueryClient()
  const queryKey = React.useMemo(() => ["notes", currentClubId ?? ""], [currentClubId])
  const tagsKey = React.useMemo(() => ["tags", currentClubId ?? ""], [currentClubId])

  const { data, isLoading, isError, error, refetch } = useQuery<NotesListResponse>({
    queryKey,
    queryFn: () => api<NotesListResponse>(`/api/clubs/${currentClubId}/notes`),
    enabled: !!currentClubId,
    staleTime: 30_000,
    refetchInterval: usePollingFallback(8000),
  })

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: tagsKey })
  }, [queryClient, queryKey, tagsKey])

  // Filtered notes — apply scope + selected tags client-side. The list is
  // already bounded (max 200) so per-render filter passes are cheap.
  const filteredNotes = React.useMemo(() => {
    if (!data?.notes) return []
    return data.notes.filter((n) => {
      if (filter === "mine" && n.authorId !== data.myUserId) return false
      if (filter === "hearted" && !n.hasHearted) return false
      if (selectedTagIds.length > 0) {
        const noteTagIds = new Set(n.tags.map((t) => t.id))
        if (!selectedTagIds.every((id) => noteTagIds.has(id))) return false
      }
      return true
    })
  }, [data, filter, selectedTagIds])

  // Delete mutation — soft-deletes the note (server sets deletedAt).
  const deleteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api(`/api/clubs/${currentClubId}/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Note deleted")
      setDeletingNoteId(null)
      invalidate()
    },
    onError: (e: Error) => {
      toast.error(e.message || "Couldn't delete note")
      invalidate()
    },
  })

  if (!currentClubId || !currentClub) {
    return (
      <div className="p-8 text-muted-foreground">Select a club to view notes.</div>
    )
  }

  const caps = data?.caps
  const totalActive = data?.totalActiveNotes ?? 0
  const maxNotes = caps?.maxNotesPerClub ?? 200

  return (
    <div className="flex flex-col gap-5 pb-28 sm:pb-6">
      {/* Sticky header on desktop — negative margins mirror the shell's
          gutters (px-4 md:px-6) for a true edge-to-edge bleed. */}
      <div className="hidden sm:block sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-4 bg-background/45 backdrop-blur-xl border-b border-border/60">
        <PageHeader
          title="Notes"
          description="Share knowledge, meeting recaps, and ideas."
          actions={
            <NotesHeaderActions
              clubId={currentClubId}
              clubName={currentClub.clubName}
              totalActive={totalActive}
              maxNotes={maxNotes}
              onNewNote={() => setComposerOpen(true)}
            />
          }
        />
      </div>
      {/* Mobile (non-sticky) header */}
      <div className="sm:hidden">
        <PageHeader
          title="Notes"
          description="Share knowledge, meeting recaps, and ideas."
          actions={
            <NotesHeaderActions
              clubId={currentClubId}
              clubName={currentClub.clubName}
              totalActive={totalActive}
              maxNotes={maxNotes}
              onNewNote={() => setComposerOpen(true)}
            />
          }
        />
      </div>

      {/* Filter pills + tag chips — tag chips are horizontally scrollable on
          mobile (no wrapping) so the bar stays one row tall. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FilterIcon className="size-4 text-muted-foreground" />
          {(["all", "mine", "hearted"] as FilterScope[]).map((s) => (
            <FilterPill
              key={s}
              active={filter === s}
              onClick={() => setFilter(s)}
              label={s === "all" ? "All" : s === "mine" ? "Mine" : "Hearted"}
            />
          ))}
        </div>
        {data?.tags && data.tags.length > 0 && (
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex items-center gap-2 pb-1">
              {data.tags.map((t) => {
                const active = selectedTagIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setSelectedTagIds((prev) =>
                        prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors min-h-[28px] shrink-0",
                      active
                        ? "ring-1 ring-inset ring-club/40 bg-club-muted text-club-ink"
                        : "bg-muted text-muted-foreground hover:bg-muted/70",
                    )}
                    style={
                      t.color && active
                        ? { backgroundColor: hexToRgba(t.color, 0.18), color: t.color }
                        : undefined
                    }
                  >
                    <TagIcon className="size-3" style={t.color ? { color: t.color } : undefined} />
                    {t.name}
                    {active && <X className="size-3" />}
                  </button>
                )
              })}
              {selectedTagIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground min-h-[28px] shrink-0"
                >
                  <X className="size-3" />
                  Clear
                </button>
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>

      {/* Body */}
      {isError ? (
        <EmptyState
          icon={<X className="h-8 w-8" />}
          title="Couldn't load notes"
          description={error instanceof Error ? error.message : "Try again."}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : isLoading ? (
        <NotesLoadingSkeleton />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          illustration={<NotesEmptyIllustration />}
          title={data && data.notes.length > 0 ? "No notes match your filters" : "No notes yet"}
          description={
            data && data.notes.length > 0
              ? "Try clearing the filters above."
              : "Be the first to jot something down — meeting recaps, links, and ideas all live here."
          }
          action={
            data && data.notes.length === 0 ? (
              <Button variant="club" onClick={() => setComposerOpen(true)} size="sm">
                <Plus className="size-4" />
                Write a note
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all")
                  setSelectedTagIds([])
                }}
              >
                <X className="size-3.5" />
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((n, index) => (
            <NoteCard
              key={n.id}
              note={n}
              index={index}
              canEdit={n.authorId === data?.myUserId}
              canDelete={n.authorId === data?.myUserId || data?.myRole === "executive"}
              onEdit={() => setEditingNote(n)}
              onDelete={() => setDeletingNoteId(n.id)}
              onHeart={() => {
                // Optimistic heart toggle. The server emits a realtime event
                // so other clients re-fetch — but for THIS client we update
                // the cache directly so the heart fills instantly.
                queryClient.setQueryData<NotesListResponse>(queryKey, (old) => {
                  if (!old) return old
                  return {
                    ...old,
                    notes: old.notes.map((x) =>
                      x.id === n.id
                        ? {
                            ...x,
                            hasHearted: !x.hasHearted,
                            heartCount: x.hasHearted
                              ? Math.max(0, x.heartCount - 1)
                              : x.heartCount + 1,
                          }
                        : x,
                    ),
                  }
                })
                api<{ hearted: boolean; heartCount: number }>(
                  `/api/clubs/${currentClubId}/notes/${n.id}/heart`,
                  { method: "POST" },
                )
                  .then(() => invalidate())
                  .catch((e) => {
                    toast.error(e.message || "Couldn't update heart")
                    invalidate()
                  })
              }}
            />
          ))}
        </div>
      )}

      {/* New-note dialog (desktop: centered modal; mobile: full-screen). */}
      <NoteComposerDialog
        key={composerOpen ? "new" : "new-closed"}
        open={composerOpen}
        onOpenChange={setComposerOpen}
        mode="create"
        clubId={currentClubId}
        tags={data?.tags ?? []}
        members={[] /* loaded lazily inside the dialog when going private */}
        caps={caps}
        onSaved={invalidate}
      />

      {/* Edit-note dialog */}
      <NoteComposerDialog
        key={editingNote ? `edit-${editingNote.id}` : "edit-closed"}
        open={!!editingNote}
        onOpenChange={(open) => { if (!open) setEditingNote(null) }}
        mode="edit"
        clubId={currentClubId}
        note={editingNote ?? undefined}
        tags={data?.tags ?? []}
        members={[]}
        caps={caps}
        onSaved={invalidate}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={!!deletingNoteId}
        onOpenChange={(open) => { if (!open) setDeletingNoteId(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              The note will be hidden immediately. This cannot be undone from inside the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingNoteId && deleteMutation.mutate(deletingNoteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile FAB — floats above the mobile tab bar. */}
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="sm:hidden fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-club text-club-foreground shadow-dialog transition-transform active:scale-95"
        aria-label="New note"
      >
        <Plus className="size-6" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header actions (Export + counter + New note button)
// ---------------------------------------------------------------------------

function NotesHeaderActions({
  clubId,
  clubName,
  totalActive,
  maxNotes,
  onNewNote,
}: {
  clubId: string
  clubName: string
  totalActive: number
  maxNotes: number
  onNewNote: () => void
}) {
  const [exporting, setExporting] = React.useState(false)
  async function handleExport() {
    setExporting(true)
    try {
      // Hit the export endpoint; the browser will trigger a download via the
      // Content-Disposition header. We attach a hidden anchor so we can name
      // the file from the header.
      const res = await fetch(`/api/clubs/${clubId}/notes/export`, {
        credentials: "same-origin",
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const m = cd.match(/filename="?([^";]+)"?/i)
      const filename = m?.[1] ?? `clubhub-notes-${clubName}.md`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Notes exported")
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't export")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden md:inline text-caption text-muted-foreground tabular-nums"
        title={`Notes cap: ${maxNotes} per club`}
      >
        {totalActive}/{maxNotes}
      </span>
      <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
        {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        <span className="hidden sm:inline">Export</span>
      </Button>
      <Button variant="club" size="sm" onClick={onNewNote}>
        <Plus className="size-4" />
        <span className="hidden sm:inline">New note</span>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter pill
// ---------------------------------------------------------------------------

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors min-h-[28px]",
        active
          ? "bg-club text-club-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Note card
// ---------------------------------------------------------------------------

function NoteCard({
  note,
  index,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onHeart,
}: {
  note: Note
  index: number
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  onHeart: () => void
}) {
  const flash = useRemoteChange("note", note.id)
  // Expandable notes — clicking a note toggles its full content. Short notes
  // (≤ 200 chars, no long wrapping) render fully either way and aren't
  // clickable-to-expand (no affordance shown).
  const [expanded, setExpanded] = React.useState(false)
  const isLong = note.content.length > 200 || note.content.split("\n").length > 4
  return (
    <article
      className={cn(
        "stagger-in card-quiet-hover p-4 flex flex-col gap-3 break-words overflow-hidden",
        flash && "ring-2 ring-club/40",
        isLong && "cursor-pointer",
      )}
      style={{ "--stagger-i": index } as React.CSSProperties}
      onClick={isLong ? () => setExpanded((v) => !v) : undefined}
    >
      {/* Header row: privacy badge + action buttons */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title truncate">
            {note.title || <span className="text-muted-foreground">Untitled</span>}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {note.isPrivate ? (
            <span className="inline-flex items-center gap-1 rounded-full chip-neutral px-2 py-0.5 text-xs font-medium">
              <Lock className="size-3" /> Private
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full chip-neutral px-2 py-0.5 text-xs font-medium">
              <Globe className="size-3" /> Public
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Edit note"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label="Delete note"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content — collapsed to 4 lines; click the note to expand the full
          text (accordion-style), click again to collapse. */}
      <p
        className={cn(
          "text-body text-foreground/90 whitespace-pre-wrap break-words",
          !expanded && "line-clamp-4",
        )}
      >
        {note.content}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className="self-start inline-flex items-center gap-1 text-caption-medium text-club-ink hover:text-club transition-colors -mt-1.5"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
          />
          {expanded ? "Show less" : "Read more"}
        </button>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {note.tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: t.color ? hexToRgba(t.color, 0.16) : undefined,
                color: t.color ?? undefined,
              }}
            >
              <TagIcon className="size-3" />
              {t.name}
            </span>
          ))}
        </div>
      )}

        {/* Footer: author + heart */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="size-6">
            {note.authorAvatarUrl && <AvatarImage src={note.authorAvatarUrl} alt={note.authorName} />}
            <AvatarFallback className="text-xs">{initials(note.authorName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-caption-medium truncate">{note.authorName}</div>
            <div className="text-caption">{relativeTime(note.createdAt)}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onHeart}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors min-h-[28px]",
            note.hasHearted
              ? "text-rose-600 hover:bg-rose-500/10"
              : "text-muted-foreground hover:bg-muted",
          )}
          aria-pressed={note.hasHearted}
          aria-label={note.hasHearted ? "Remove heart" : "Add heart"}
        >
          <Heart className={cn("size-4", note.hasHearted && "fill-current")} />
          <span className="tabular-nums">{note.heartCount}</span>
        </button>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Composer / Edit dialog
// ---------------------------------------------------------------------------

interface ComposerState {
  title: string
  content: string
  tagIds: string[]
  isPrivate: boolean
  sharedWith: string[]
}

function emptyState(): ComposerState {
  return { title: "", content: "", tagIds: [], isPrivate: false, sharedWith: [] }
}

function stateFromNote(n: Note): ComposerState {
  return {
    title: n.title ?? "",
    content: n.content,
    tagIds: n.tags.map((t) => t.id),
    isPrivate: n.isPrivate,
    sharedWith: n.sharedWith ?? [],
  }
}

function NoteComposerDialog({
  open,
  onOpenChange,
  mode,
  clubId,
  note,
  tags,
  members,
  caps,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: "create" | "edit"
  clubId: string
  note?: Note
  tags: NoteTag[]
  members: Member[]
  caps?: {
    maxNotesPerClub: number
    maxTagsPerClub: number
    maxContentChars: number
    maxTitleChars: number
  }
  onSaved: () => void
}) {
  const [state, setState] = React.useState<ComposerState>(
    mode === "edit" && note ? stateFromNote(note) : emptyState(),
  )
  const [membersCache, setMembersCache] = React.useState<Member[]>(members)
  const [membersLoaded, setMembersLoaded] = React.useState(false)
  const [newTagName, setNewTagName] = React.useState("")
  const [creatingTag, setCreatingTag] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  // § Who-can-see chooser — tracks whether the user explicitly picked the
  // "Specific people" option (the picker below). Kept separate from
  // sharedWith.length so the choice is visible even before any name is
  // ticked; picking "Only me" collapses it again.
  const [specificOpen, setSpecificOpen] = React.useState(false)

  const maxContent = caps?.maxContentChars ?? 5000
  const maxTitle = caps?.maxTitleChars ?? 120

  // Reset when opened (re-mount via key already handles the edit case, but
  // make sure the create case starts fresh each time).
  React.useEffect(() => {
    if (open) {
      const fresh = mode === "edit" && note ? stateFromNote(note) : emptyState()
      setState(fresh)
      setNewTagName("")
      // Editing an already-shared private note opens with "Specific people"
      // selected so the current shares are visible and editable.
      setSpecificOpen(fresh.sharedWith.length > 0)
    }
  }, [open, mode, note])

  // NOTE: no JS auto-grow here (iOS Safari keyboard fix) — the textarea
  // keeps a static shape (min-h) and scrolls internally for long notes.

  // Lazy-load the member list only when the note goes private. Public notes
  // never need the member list — saves a request on the common case.
  React.useEffect(() => {
    if (!open || !state.isPrivate || membersLoaded) return
    let cancelled = false
    api<{
      members: { user: { id: string; name: string; avatarUrl?: string | null } }[]
    }>(`/api/clubs/${clubId}/members`)
      .then((d) => {
        if (!cancelled) {
          setMembersCache((d.members ?? []).map((m) => ({
            id: m.user.id,
            name: m.user.name,
            avatarUrl: m.user.avatarUrl ?? null,
          })))
          setMembersLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setMembersLoaded(true) // still flip so we don't loop
      })
    return () => { cancelled = true }
  }, [open, state.isPrivate, membersLoaded, clubId])

  async function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) return
    setCreatingTag(true)
    try {
      const { tag } = await api<{ tag: NoteTag }>(`/api/clubs/${clubId}/tags`, {
        method: "POST",
        json: { name },
      })
      // Auto-select the new tag. The parent query will be invalidated by the
      // realtime event emitted from the server, so the local tags list will
      // refresh on its own — we just need to mark it as selected.
      setState((s) => ({ ...s, tagIds: [...s.tagIds, tag.id] }))
      setNewTagName("")
      toast.success("Tag created")
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't create tag")
    } finally {
      setCreatingTag(false)
    }
  }

  async function handleSave() {
    if (state.content.trim().length === 0) {
      toast.error("Content is required")
      return
    }
    if (state.content.length > maxContent) {
      toast.error(`Content must be ${maxContent} characters or fewer`)
      return
    }
    setSubmitting(true)
    try {
      if (mode === "create") {
        await api(`/api/clubs/${clubId}/notes`, {
          method: "POST",
          json: {
            title: state.title.trim() || undefined,
            content: state.content,
            tagIds: state.tagIds,
            isPrivate: state.isPrivate,
            sharedWith: state.isPrivate ? state.sharedWith : undefined,
          },
        })
        toast.success("Note created")
      } else if (note) {
        await api(`/api/clubs/${clubId}/notes/${note.id}`, {
          method: "PATCH",
          json: {
            title: state.title.trim() || null,
            content: state.content,
            tagIds: state.tagIds,
            isPrivate: state.isPrivate,
            sharedWith: state.isPrivate ? state.sharedWith : [],
          },
        })
        toast.success("Note updated")
      }
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save note")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-3 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>{mode === "create" ? "New note" : "Edit note"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Markdown-style notes — no images, just text. Be concise."
              : "Update your note. Only you can edit it."}
          </DialogDescription>
        </DialogHeader>

        {/* Body — scrollable on both mobile and desktop so long content never
            pushes the action buttons off-screen. */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 sm:px-0 py-4 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="note-title" className="text-caption-medium">Title (optional)</Label>
              <span className="text-caption text-muted-foreground tabular-nums">
                {state.title.length}/{maxTitle}
              </span>
            </div>
            <Input
              id="note-title"
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value.slice(0, maxTitle) }))}
              placeholder="A short, searchable title"
              maxLength={maxTitle}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="note-content" className="text-caption-medium">Content</Label>
              <span
                className={cn(
                  "text-caption tabular-nums",
                  state.content.length > maxContent * 0.9 && "text-warning-foreground",
                )}
              >
                {state.content.length}/{maxContent}
              </span>
            </div>
            <Textarea
              id="note-content"
              value={state.content}
              onChange={(e) => setState((s) => ({ ...s, content: e.target.value.slice(0, maxContent) }))}
              placeholder="Meeting recap, links, ideas, anything text-based…"
              className="min-h-[140px] resize-y"
              maxLength={maxContent}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-caption-medium">Tags</Label>
            {tags.length === 0 ? (
              <p className="text-caption text-muted-foreground">
                No tags yet — create one below.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => {
                  const active = state.tagIds.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          tagIds: s.tagIds.includes(t.id)
                            ? s.tagIds.filter((x) => x !== t.id)
                            : [...s.tagIds, t.id],
                        }))
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors min-h-[28px]",
                        active
                          ? "bg-club text-club-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            )}
            {/* Inline create-new-tag */}
            <div className="flex items-center gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value.slice(0, 40))}
                placeholder="New tag name"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateTag()
                  }
                }}
                maxLength={40}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCreateTag}
                disabled={creatingTag || newTagName.trim().length === 0}
              >
                {creatingTag ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                <span className="hidden sm:inline">Add tag</span>
              </Button>
            </div>
          </div>

          {/* Visibility — deliberately NOT a switch: a toggle labeled
              "Private" reads as "Public: off", which confused people into
              thinking they'd just turned visibility off entirely. Instead:
              a plain status line + an explicit action button underneath.
              Going private reveals a who-can-see chooser ("Only me" vs
              picking specific people) — no guessing what the state means. */}
          <div className="space-y-2">
            <Label className="text-caption-medium">Visibility</Label>
            <div className="rounded-lg border border-border/80 bg-card p-3">
              <div className="flex items-start gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
                  {state.isPrivate ? <Lock /> : <Globe />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-card-title">
                    {state.isPrivate ? "Private note" : "Public note"}
                  </p>
                  <p className="text-caption text-muted-foreground mt-0.5">
                    {state.isPrivate
                      ? state.sharedWith.length > 0
                        ? `Only you and the ${state.sharedWith.length === 1 ? "member" : `${state.sharedWith.length} members`} you picked can see this note.`
                        : "Only you can see this note."
                      : "All active members of this club can see this note."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant={state.isPrivate ? "outline" : "secondary"}
                size="sm"
                className="mt-3"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    // Returning to public resets the share list — it only
                    // ever applied while the note was private.
                    isPrivate: !s.isPrivate,
                    sharedWith: s.isPrivate ? [] : s.sharedWith,
                  }))
                }
              >
                {state.isPrivate ? (
                  <>
                    <Globe className="size-3.5" /> Make public
                  </>
                ) : (
                  <>
                    <Lock className="size-3.5" /> Make private
                  </>
                )}
              </Button>
            </div>

            {/* Who can see it — only while private. "Only me" and "Specific
                people" are explicit choices instead of an implied default. */}
            {state.isPrivate && (
              <div className="space-y-1.5">
                <Label className="text-caption-medium">Who can see this note?</Label>
                <div className="grid gap-2">
                  <button
                    type="button"
                    aria-pressed={!specificOpen}
                    onClick={() => {
                      setSpecificOpen(false)
                      setState((s) => ({ ...s, sharedWith: [] }))
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !specificOpen
                        ? "border-club bg-club-muted/40"
                        : "border-border/80 bg-card hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        !specificOpen ? "border-club bg-club" : "border-muted-foreground/40",
                      )}
                    >
                      {!specificOpen && (
                        <Check className="size-2.5 text-club-foreground" strokeWidth={3.5} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight">Only me</span>
                      <span className="block text-caption text-muted-foreground mt-0.5">
                        Just you — nobody else can open it.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={specificOpen}
                    onClick={() => setSpecificOpen(true)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      specificOpen
                        ? "border-club bg-club-muted/40"
                        : "border-border/80 bg-card hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        specificOpen ? "border-club bg-club" : "border-muted-foreground/40",
                      )}
                    >
                      {specificOpen && (
                        <Check className="size-2.5 text-club-foreground" strokeWidth={3.5} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight">Specific people</span>
                      <span className="block text-caption text-muted-foreground mt-0.5">
                        You choose exactly who — pick below.
                      </span>
                    </span>
                  </button>
                </div>

                {/* Member picker — shown once "Specific people" is chosen;
                    ticking names is the act of choosing them. */}
                {specificOpen && (
                  <>
                    {!membersLoaded ? (
                      <div className="flex items-center gap-2 text-caption text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Loading members…
                      </div>
                    ) : membersCache.length === 0 ? (
                      <p className="text-caption text-muted-foreground">No other members to share with.</p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto scrollbar-thin rounded-lg border border-border/80 bg-card p-2 space-y-1">
                        {membersCache.map((m) => {
                          const checked = state.sharedWith.includes(m.id)
                          return (
                            <label
                              key={m.id}
                              className={cn(
                                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors min-h-[36px]",
                                checked ? "bg-club-muted" : "hover:bg-muted",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setState((s) => ({
                                    ...s,
                                    sharedWith: e.target.checked
                                      ? [...s.sharedWith, m.id]
                                      : s.sharedWith.filter((x) => x !== m.id),
                                  }))
                                }
                                className="size-4 accent-[var(--club-accent)]"
                              />
                              <Avatar className="size-6">
                                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.name} />}
                                <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                              </Avatar>
                              <span className="truncate">{m.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    {state.sharedWith.length === 0 && (
                      <p className="text-caption text-muted-foreground px-0.5">
                        Until you tick a name, the note stays visible to you only.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions — sticky bottom on mobile, sticky bottom of dialog on desktop. */}
        <DialogFooter className="px-4 sm:px-0 py-3 sm:py-0 border-t sm:border-t-0 shrink-0 sm:items-center">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="club"
            onClick={handleSave}
            disabled={submitting || state.content.trim().length === 0}
            className="w-full sm:w-auto"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {mode === "create" ? "Create note" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Skeleton + illustration
// ---------------------------------------------------------------------------

function NotesLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card-quiet p-4 space-y-3">
          <div className="h-4 w-2/3 rounded skeleton-shimmer" />
          <div className="h-3 w-full rounded skeleton-shimmer" />
          <div className="h-3 w-5/6 rounded skeleton-shimmer" />
          <div className="h-3 w-3/4 rounded skeleton-shimmer" />
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <div className="h-6 w-24 rounded skeleton-shimmer" />
            <div className="h-6 w-10 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  )
}

function NotesEmptyIllustration() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="mb-4 text-muted-foreground"
    >
      {/* Notebook outline (muted) */}
      <rect x="12" y="8" width="24" height="32" rx="3" stroke="currentColor" strokeWidth="1.6" />
      {/* Spiral binding (muted) */}
      <path d="M12 13h-3M12 19h-3M12 25h-3M12 31h-3M12 37h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* Accent line — title */}
      <path d="M18 18h12" stroke="var(--club)" strokeWidth="1.8" strokeLinecap="round" />
      {/* Body lines (muted) */}
      <path d="M18 24h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      <path d="M18 28h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      <path d="M18 32h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

/** Convert a hex color like "#1f7a4d" to an "rgba(r,g,b,a)" string. Used for
 *  tag chip backgrounds so the text color stays readable on either side. */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return `rgba(120,120,120,${alpha})`
  const num = parseInt(m[1], 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
