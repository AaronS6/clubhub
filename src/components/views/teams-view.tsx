"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api/client"
import { useAppStore } from "@/lib/store"
import { usePresence } from "@/lib/use-presence"
import { cn } from "@/lib/utils"
import { usePollingFallback, useRemoteChange } from "@/lib/realtime-store"
import {
  PageHeader,
  EmptyState,
  StatusBadge,
  CardSkeleton,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
import {
  Users,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  CalendarDays,
  CheckSquare,
  Clock,
  Hash,
  X,
  Loader2,
  Inbox,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamUser {
  id: string
  name: string
  avatarUrl?: string | null
}
interface TeamMember {
  id: string
  userId: string
  joinedAt: string
  user: TeamUser
}
interface TeamTask {
  id: string
  title: string
  status: string
  dueDate: string | null
  assignee: { id: string; name: string; avatarUrl?: string | null } | null
}
interface TeamMeeting {
  id: string
  title: string
  startTime: string
  endTime: string
  location: string
}
interface Team {
  id: string
  name: string
  description: string | null
  createdAt: string
  members: TeamMember[]
  memberCount: number
  taskCount: number
  upcomingMeetingCount: number
  tasks: TeamTask[]
  upcomingMeetings: TeamMeeting[]
}
interface TeamsResponse {
  teams: Team[]
  myRole: "member" | "executive"
  myUserId: string
}

interface ClubMemberUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  bio?: string | null
}
interface ClubMember {
  membershipId: string
  role: "member" | "executive"
  joinedAt: string
  user: ClubMemberUser
  teams: { id: string; name: string }[]
  approvedHours: number
}
interface MembersResponse {
  members: ClubMember[]
  myUserId: string
  myRole: "member" | "executive"
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function TeamsView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const role = useAppStore((s) => s.currentClub?.role)
  const isExec = role === "executive"

  const { data, isLoading, isError, refetch } = useQuery<TeamsResponse>({
    queryKey: ["teams", clubId],
    queryFn: () => api(`/api/clubs/${clubId}/teams`),
    enabled: !!clubId,
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(30_000),
  })

  // Live presence — green dot on avatars of currently-online club members.
  const online = usePresence(clubId ?? null)

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const selectedTeam = data?.teams.find((t) => t.id === selectedTeamId) ?? null

  if (!clubId) {
    return <div className="p-8 text-sm text-muted-foreground">No club selected.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Organize your club into working teams with dedicated rosters, tasks, and meetings."
        actions={
          isExec ? (
            <Button variant="club" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New team
            </Button>
          ) : undefined
        }
      />

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load teams.{" "}
          <button className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <TeamsSkeleton />
      ) : !data || data.teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No teams yet"
          description={
            isExec
              ? "Create one to organize your members."
              : "Your club hasn't created any teams yet. Check back soon."
          }
          action={
            isExec ? (
              <Button variant="club" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create a team
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.teams.map((team, i) => (
            <TeamCard
              key={team.id}
              clubId={clubId}
              team={team}
              isExec={isExec}
              online={online}
              onOpen={() => setSelectedTeamId(team.id)}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Team detail sheet */}
      <Sheet open={!!selectedTeamId} onOpenChange={(o) => !o && setSelectedTeamId(null)}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col" side="right" showCloseButton={false}>
          {selectedTeam ? (
            <TeamDetailSheet
              clubId={clubId}
              team={selectedTeam}
              isExec={isExec}
              online={online}
              onClose={() => setSelectedTeamId(null)}
            />
          ) : (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <CreateTeamDialog clubId={clubId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TeamsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team card
// ---------------------------------------------------------------------------

function TeamCard({
  clubId,
  team,
  isExec,
  online,
  onOpen,
  index,
}: {
  clubId: string
  team: Team
  isExec: boolean
  online: Set<string>
  onOpen: () => void
  index: number
}) {
  // Deterministic accent palette per card position — no random flicker on
  // re-render. Stable across realtime updates.
  const ACCENT_PALETTE = [
    "#f97316",
    "#06b6d4",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#eab308",
  ]
  const accent = ACCENT_PALETTE[index % ACCENT_PALETTE.length]
  const visibleMembers = team.members.slice(0, 4)
  const overflow = team.members.length - visibleMembers.length
  // Briefly highlight when this card was just touched by another user's
  // realtime action (create/rename/member add/remove).
  const flash = useRemoteChange("team", team.id)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open team ${team.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-club animate-fade-in",
        flash && "ring-2 ring-club/50 shadow-md"
      )}
    >
      {/* Colored accent strip across the top edge — gives each team identity. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: accent }}
      />
      {/* Soft tinted halo in the top-right corner — picks up the accent color
          without overwhelming the card content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-[0.08] blur-2xl transition-opacity group-hover:opacity-[0.14]"
        style={{ backgroundColor: accent }}
      />

      <div className="relative pt-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <h3 className="text-card-title truncate">{team.name}</h3>
            </div>
            {team.description ? (
              <p className="text-caption mt-1 line-clamp-2 text-muted-foreground">
                {team.description}
              </p>
            ) : (
              <p className="text-caption text-muted-foreground/70 mt-1 italic">No description</p>
            )}
          </div>
          {isExec && <TeamCardMenu clubId={clubId} team={team} />}
        </div>
      </div>
      <div className="relative space-y-3">
        <div className="flex items-center gap-2 min-h-[32px]">
          {team.members.length === 0 ? (
            <span className="text-caption text-muted-foreground/70">No members yet</span>
          ) : (
            <div className="flex items-center -space-x-2">
              {visibleMembers.map((m) => (
                <Avatar
                  key={m.id}
                  className="h-7 w-7 border-2 border-background"
                  title={m.user.name}
                >
                  <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                  <AvatarFallback className="text-[10px]">{initials(m.user.name)}</AvatarFallback>
                  {online.has(m.userId) && (
                    <span
                      aria-label="Online"
                      className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-club ring-2 ring-background"
                    />
                  )}
                </Avatar>
              ))}
              {overflow > 0 && (
                <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  +{overflow}
                </div>
              )}
              {overflow > 0 && (
                <span className="ml-2.5 text-caption text-muted-foreground">
                  +{overflow} more
                </span>
              )}
            </div>
          )}
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" />
            {team.taskCount} {team.taskCount === 1 ? "task" : "tasks"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {team.upcomingMeetingCount} upcoming
          </span>
        </div>
      </div>
    </div>
  )
}

function TeamCardMenu({ clubId, team }: { clubId: string; team: Team }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const deleteMut = useMutation({
    mutationFn: () => api(`/api/clubs/${clubId}/teams/${team.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`Team "${team.name}" deleted`)
      setDeleteOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <div onClick={(e) => e.stopPropagation()} role="presentation">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 -mr-1.5"
              aria-label={`Actions for team ${team.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-700"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditTeamDialog
        key={team.id}
        clubId={clubId}
        team={team}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteTeamDialog
        team={team}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Team detail sheet
// ---------------------------------------------------------------------------

function TeamDetailSheet({
  clubId,
  team,
  isExec,
  online,
  onClose,
}: {
  clubId: string
  team: Team
  isExec: boolean
  online: Set<string>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null)

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/clubs/${clubId}/teams/${team.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Member removed")
      qc.invalidateQueries({ queryKey: ["teams", clubId] })
      qc.invalidateQueries({ queryKey: ["members", clubId] })
      setRemoveTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-3 border-b">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <SheetTitle className="text-xl truncate">{team.name}</SheetTitle>
            {team.description ? (
              <SheetDescription className="mt-1 text-sm">{team.description}</SheetDescription>
            ) : (
              <SheetDescription className="mt-1 italic">No description</SheetDescription>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 -mr-2" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Created {relativeTime(team.createdAt)}
          </span>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-5 space-y-6">
          {/* Roster */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Roster
                <span className="text-muted-foreground font-normal">({team.memberCount})</span>
              </h3>
              {isExec && (
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add members
                </Button>
              )}
            </div>
            {team.members.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {isExec ? "Add your first team member." : "No members yet."}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {team.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                      <AvatarFallback className="text-xs">{initials(m.user.name)}</AvatarFallback>
                      {online.has(m.userId) && (
                        <span
                          aria-label="Online"
                          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-club ring-2 ring-background"
                        />
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{m.user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Joined {relativeTime(m.joinedAt)}
                      </div>
                    </div>
                    {isExec && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-red-600 shrink-0"
                        aria-label={`Remove ${m.user.name} from team`}
                        onClick={() => setRemoveTarget(m)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          {/* Tasks */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CheckSquare className="h-4 w-4" /> Tasks
              <span className="text-muted-foreground font-normal">({team.taskCount})</span>
            </h3>
            {team.tasks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Inbox className="h-5 w-5" />
                No tasks assigned to this team.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {team.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {t.assignee ? (
                          <span className="inline-flex items-center gap-1">
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={t.assignee.avatarUrl ?? undefined} alt={t.assignee.name} />
                              <AvatarFallback className="text-[8px]">{initials(t.assignee.name)}</AvatarFallback>
                            </Avatar>
                            {t.assignee.name}
                          </span>
                        ) : (
                          <span className="italic">Unassigned</span>
                        )}
                        {t.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            · due {new Date(t.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          {/* Upcoming meetings */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Upcoming meetings
              <span className="text-muted-foreground font-normal">({team.upcomingMeetingCount})</span>
            </h3>
            {team.upcomingMeetings.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                No upcoming meetings scheduled.
              </div>
            ) : (
              <ul className="space-y-2">
                {team.upcomingMeetings.map((mtg) => (
                  <li key={mtg.id} className="rounded-lg border p-3">
                    <div className="text-sm font-medium truncate">{mtg.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(mtg.startTime).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {mtg.location}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </ScrollArea>

      <AddMembersDialog
        clubId={clubId}
        team={team}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove{" "}
              <span className="font-medium text-foreground">{removeTarget?.user.name}</span> from the{" "}
              <span className="font-medium text-foreground">{team.name}</span> team? They remain a member of the club.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeMut.mutate(removeTarget.userId)}
              disabled={removeMut.isPending}
            >
              {removeMut.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function TaskStatusBadge({ status }: { status: string }) {
  const kindMap: Record<string, "not_started" | "in_progress" | "done" | "neutral"> = {
    not_started: "not_started",
    in_progress: "in_progress",
    done: "done",
  }
  const kind = kindMap[status] ?? "neutral"
  return <StatusBadge status={kind} />
}

// ---------------------------------------------------------------------------
// Create / edit / delete dialogs
// ---------------------------------------------------------------------------

function CreateTeamDialog({
  clubId,
  open,
  onOpenChange,
}: {
  clubId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Team name is required")
      return
    }
    setLoading(true)
    try {
      await api(`/api/clubs/${clubId}/teams`, {
        method: "POST",
        json: { name: name.trim(), description: description.trim() || undefined },
      })
      toast.success("Team created")
      setName("")
      setDescription("")
      qc.invalidateQueries({ queryKey: ["teams", clubId] })
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Create a team</DialogTitle>
          <DialogDescription>
            Teams organize members around specific projects, events, or ongoing responsibilities.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. Logistics, Outreach, Decorations"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-desc">Description (optional)</Label>
              <Textarea
                id="team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="What does this team do?"
              />
            </div>
          </div>
          <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="club" disabled={loading}>
              {loading ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditTeamDialog({
  clubId,
  team,
  open,
  onOpenChange,
}: {
  clubId: string
  team: Team
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? "")
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Team name is required")
      return
    }
    setLoading(true)
    try {
      await api(`/api/clubs/${clubId}/teams/${team.id}`, {
        method: "PATCH",
        json: {
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
        },
      })
      toast.success("Team updated")
      qc.invalidateQueries({ queryKey: ["teams", clubId] })
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Edit team</DialogTitle>
          <DialogDescription>Update the name and description for this team.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-team-name">Team name</Label>
              <Input
                id="edit-team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-team-desc">Description (optional)</Label>
              <Textarea
                id="edit-team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="club" disabled={loading}>
              {loading ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteTeamDialog({
  team,
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  team: Team
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete team?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete <span className="font-medium text-foreground">{team.name}</span>? This removes the
            roster. Tasks and meetings associated with this team remain in the club but become
            unassigned to a team. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Deleting…" : "Delete team"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Add members dialog (multi-select)
// ---------------------------------------------------------------------------

function AddMembersDialog({
  clubId,
  team,
  open,
  onOpenChange,
}: {
  clubId: string
  team: Team
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)

  const { data: membersData, isLoading: membersLoading } = useQuery<MembersResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api(`/api/clubs/${clubId}/members`),
    enabled: !!clubId && open,
  })

  const existingIds = useMemo(
    () => new Set(team.members.map((m) => m.userId)),
    [team.members]
  )

  const candidates = useMemo(() => {
    const list = membersData?.members ?? []
    const q = search.trim().toLowerCase()
    return list.filter((m) => {
      if (existingIds.has(m.user.id)) return false
      if (!q) return true
      return (
        m.user.name.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q)
      )
    })
  }, [membersData, existingIds, search])

  function reset() {
    setSelected(new Set())
    setSearch("")
  }

  async function submit() {
    if (selected.size === 0) {
      toast.error("Select at least one member")
      return
    }
    setLoading(true)
    let ok = 0
    let fail = 0
    for (const userId of Array.from(selected)) {
      try {
        await api(`/api/clubs/${clubId}/teams/${team.id}/members`, {
          method: "POST",
          json: { userId },
        })
        ok++
      } catch {
        fail++
      }
    }
    setLoading(false)
    if (ok > 0) {
      toast.success(
        `Added ${ok} ${ok === 1 ? "member" : "members"}${fail > 0 ? ` (${fail} failed)` : ""}`
      )
      qc.invalidateQueries({ queryKey: ["teams", clubId] })
      qc.invalidateQueries({ queryKey: ["members", clubId] })
    } else if (fail > 0) {
      toast.error("Failed to add members")
    }
    reset()
    onOpenChange(false)
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className={cn(DIALOG_CLASS, "sm:max-w-md")} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle className="truncate">Add members to {team.name}</DialogTitle>
          <DialogDescription>
            Select club members to add to this team. {team.memberCount} current{" "}
            {team.memberCount === 1 ? "member" : "members"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 sm:px-0 sm:pt-0 shrink-0">
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search members"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-0 sm:py-0">
            {membersLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading members…</div>
            ) : candidates.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {membersData && membersData.members.length === 0
                  ? "No club members found."
                  : "No members match your search or all are already on this team."}
              </div>
            ) : (
              <ul className="divide-y rounded-lg border">
                {candidates.map((m) => {
                  const checked = selected.has(m.user.id)
                  return (
                    <li key={m.membershipId}>
                      <label
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors min-h-11",
                          checked && "bg-club-muted"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(m.user.id)}
                          aria-label={`Select ${m.user.name}`}
                        />
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={m.user.avatarUrl ?? undefined} alt={m.user.name} />
                          <AvatarFallback className="text-xs">{initials(m.user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{m.user.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{m.user.email}</div>
                        </div>
                        {m.role === "executive" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            exec
                          </Badge>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="club"
                onClick={submit}
                disabled={loading || selected.size === 0}
              >
                {loading ? "Adding…" : `Add${selected.size > 0 ? ` ${selected.size}` : ""}`}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
