"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Download,
  MapPin,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
  Check,
  X,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"
import {
  format,
  parseISO,
  isToday as isDateToday,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns"

import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { usePollingFallback, useRemoteChange } from "@/lib/realtime-store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PageHeader, EmptyState, initials } from "@/components/shared/page-header"

// ---------------------------------------------------------------------------
// Mobile full-screen dialog className — makes a Dialog fill the viewport on
// phones (sticky header / scrollable body / sticky footer so the action
// buttons stay reachable above the soft keyboard) and centers as a normal
// modal on sm+ screens.
// ---------------------------------------------------------------------------
const MOBILE_FULLSCREEN_DIALOG =
  "top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
  "sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-w-lg sm:rounded-lg sm:p-6 sm:gap-4 sm:grid"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RsvpStatus = "going" | "not_going" | "maybe"

interface TeamInfo {
  id: string
  name: string
}

interface MeetingItem {
  id: string
  title: string
  description: string | null
  location: string
  startTime: string
  endTime: string
  isRecurring: boolean
  recurrenceRule: "weekly" | "biweekly" | "monthly" | null
  cancelledAt: string | null
  createdAt: string
  teamId: string | null
  team: TeamInfo | null
  createdById: string
  creator: { id: string; name: string }
  rsvpCounts: { going: number; notGoing: number; maybe: number }
  myRsvp: RsvpStatus | null
}

interface MeetingsResponse {
  meetings: MeetingItem[]
  teams: TeamInfo[]
  now: string
  myUserId: string
  myRole: "member" | "executive"
}

interface Attendee {
  id: string
  status: RsvpStatus
  respondedAt: string
  user: { id: string; name: string; email: string; avatarUrl: string | null }
}

interface AttendeesResponse {
  meeting: { id: string; title: string; startTime: string }
  attendees: Attendee[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a meeting's date/time: "Mon, Jan 15 · 3:00 PM – 4:30 PM" */
function formatMeetingRange(start: string, end: string) {
  const s = parseISO(start)
  const e = parseISO(end)
  return `${format(s, "EEE, MMM d")} · ${format(s, "h:mm a")} – ${format(e, "h:mm a")}`
}

/** Convert an ISO/date to a value usable by <input type="datetime-local"> */
function toLocalInputValue(d: Date) {
  // Build YYYY-MM-DDTHH:MM in local time
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function icsLinkFor(clubId: string) {
  return `/api/clubs/${clubId}/meetings/ics`
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function MeetingsView() {
  const currentClubId = useAppStore((s) => s.currentClubId)
  const currentClub = useAppStore((s) => s.currentClub)
  const [tab, setTab] = useState<"upcoming" | "past" | "calendar">("upcoming")
  const [teamFilter, setTeamFilter] = useState<string>("all")

  const queryClient = useQueryClient()

  const meetingsKey = ["meetings", currentClubId] as const

  const { data, isLoading, isError, refetch } = useQuery<MeetingsResponse>({
    queryKey: meetingsKey,
    queryFn: () => api<MeetingsResponse>(`/api/clubs/${currentClubId}/meetings`),
    enabled: !!currentClubId,
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(8000),
  })

  // Split into upcoming vs past using the server-provided "now".
  const { upcoming, past } = useMemo(() => {
    const now = data?.now ? new Date(data.now) : new Date()
    const items = data?.meetings ?? []
    const upcoming = items
      .filter((m) => new Date(m.endTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    const past = items
      .filter((m) => new Date(m.endTime) < now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    return { upcoming, past }
  }, [data])

  const filteredUpcoming = useMemo(
    () => (teamFilter === "all" ? upcoming : upcoming.filter((m) => m.teamId === teamFilter)),
    [upcoming, teamFilter]
  )
  const filteredPast = useMemo(
    () => (teamFilter === "all" ? past : past.filter((m) => m.teamId === teamFilter)),
    [past, teamFilter]
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<MeetingItem | null>(null)
  const [detailMeeting, setDetailMeeting] = useState<MeetingItem | null>(null)

  async function handleExportIcs() {
    if (!currentClubId) return
    try {
      const res = await fetch(icsLinkFor(currentClubId), { credentials: "same-origin" })
      if (!res.ok) throw new Error("Failed to export calendar")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "club-meetings.ics"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Calendar file downloaded")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export calendar")
    }
  }

  if (!currentClubId || !currentClub) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<CalendarDays className="size-10" />}
          title="No club selected"
          description="Join or create a club to manage meetings."
        />
      </div>
    )
  }

  const isExec = currentClub.role === "executive"

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title="Meetings"
        description="RSVP, plan, and track club meetings."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportIcs} className="gap-2">
              <Download className="size-4" />
              <span className="hidden sm:inline">Export .ics</span>
              <span className="sm:hidden">Export</span>
            </Button>
            {isExec && (
              <Button size="sm" variant="club" className="gap-2" onClick={() => setCreateOpen(true)}>
                <CalendarPlus className="size-4" />
                <span className="hidden sm:inline">New Meeting</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>

            {tab !== "calendar" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="team-filter" className="sr-only">
                  Filter by team
                </Label>
                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger id="team-filter" className="w-[180px]">
                    <SelectValue placeholder="All teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {(data?.teams ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <TabsContent value="upcoming" className="mt-4">
            <MeetingsList
              meetings={filteredUpcoming}
              isLoading={isLoading}
              isError={isError}
              isExec={isExec}
              onRetry={() => refetch()}
              onEdit={(m) => setEditingMeeting(m)}
              onOpenDetail={(m) => setDetailMeeting(m)}
              emptyTitle="No upcoming meetings"
              emptyDescription={
                isExec
                  ? "Schedule the next meeting to get RSVPs rolling."
                  : "Check back soon — execs haven't scheduled anything yet."
              }
              emptyAction={
                isExec ? (
                  <Button size="sm" variant="club" className="gap-2" onClick={() => setCreateOpen(true)}>
                    <CalendarPlus className="size-4" /> Schedule a meeting
                  </Button>
                ) : undefined
              }
            />
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            <MeetingsList
              meetings={filteredPast}
              isLoading={isLoading}
              isError={isError}
              isExec={isExec}
              readOnly
              onRetry={() => refetch()}
              onEdit={() => {}}
              onOpenDetail={(m) => setDetailMeeting(m)}
              emptyTitle="No past meetings"
              emptyDescription="Past meetings will show up here after they end."
            />
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <CalendarPanel
              meetings={data?.meetings ?? []}
              onOpenMeeting={(m) => setDetailMeeting(m)}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CreateMeetingDialog
        clubId={currentClubId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        teams={data?.teams ?? []}
        onCreated={() => queryClient.invalidateQueries({ queryKey: meetingsKey })}
      />

      <EditMeetingDialog
        clubId={currentClubId}
        meeting={editingMeeting}
        onOpenChange={(o) => !o && setEditingMeeting(null)}
        teams={data?.teams ?? []}
        onSaved={() => queryClient.invalidateQueries({ queryKey: meetingsKey })}
      />

      <MeetingDetailDialog
        meeting={detailMeeting}
        clubId={currentClubId}
        isExec={isExec}
        onOpenChange={(o) => !o && setDetailMeeting(null)}
        onEdit={(m) => {
          setDetailMeeting(null)
          setEditingMeeting(m)
        }}
        onRsvpChanged={() => queryClient.invalidateQueries({ queryKey: meetingsKey })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meetings list
// ---------------------------------------------------------------------------

function MeetingsList({
  meetings,
  isLoading,
  isError,
  isExec,
  readOnly,
  onRetry,
  onEdit,
  onOpenDetail,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  meetings: MeetingItem[]
  isLoading: boolean
  isError: boolean
  isExec: boolean
  readOnly?: boolean
  onRetry: () => void
  onEdit: (m: MeetingItem) => void
  onOpenDetail: (m: MeetingItem) => void
  emptyTitle: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <EmptyState
        icon={<X className="size-8" />}
        title="Couldn't load meetings"
        description="Something went wrong. Please try again."
        action={
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCw className="size-4" /> Retry
          </Button>
        }
      />
    )
  }
  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-10" />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }
  return (
    <div className="grid gap-3">
      {meetings.map((m) => (
        <MeetingCard
          key={m.id}
          meeting={m}
          isExec={isExec}
          readOnly={readOnly}
          onEdit={() => onEdit(m)}
          onOpenDetail={() => onOpenDetail(m)}
        />
      ))}
    </div>
  )
}

function MeetingCard({
  meeting,
  isExec,
  readOnly,
  onEdit,
  onOpenDetail,
}: {
  meeting: MeetingItem
  isExec: boolean
  readOnly?: boolean
  onEdit: () => void
  onOpenDetail: () => void
}) {
  const start = parseISO(meeting.startTime)
  // Briefly highlight when this meeting was just created/edited/cancelled or
  // someone RSVP'd, so the change is perceptible across sessions.
  const flash = useRemoteChange("meeting", meeting.id)
  return (
    <div className={cn(
      "card-quiet overflow-hidden p-4 sm:p-5 animate-fade-in",
      flash && "ring-2 ring-club/50 shadow-md"
    )}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <button
            onClick={onOpenDetail}
            className="group flex w-full items-start gap-2 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-card-title group-hover:text-club transition-colors">
                  {meeting.title}
                </h3>
                {meeting.isRecurring && meeting.recurrenceRule && (
                  <Badge variant="secondary" className="gap-1 capitalize">
                    <RefreshCw className="size-3" />
                    {meeting.recurrenceRule}
                  </Badge>
                )}
                {meeting.team && (
                  <Badge variant="outline" className="gap-1">
                    <Users className="size-3" />
                    {meeting.team.name}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {formatMeetingRange(meeting.startTime, meeting.endTime)}
                </span>
                <span className="inline-flex items-center gap-1 min-w-0">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="max-w-[14rem] truncate">{meeting.location}</span>
                </span>
              </div>
            </div>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isExec && !readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Meeting actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <CancelMeetingMenuItem meeting={meeting} />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-caption text-muted-foreground">
          {meeting.rsvpCounts.going} going · {meeting.rsvpCounts.maybe} maybe
          {meeting.rsvpCounts.notGoing > 0 && ` · ${meeting.rsvpCounts.notGoing} not going`}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <RsvpButton meeting={meeting} status="going" />
            <RsvpButton meeting={meeting} status="maybe" />
            <RsvpButton meeting={meeting} status="not_going" />
          </div>
        )}
        {readOnly && (
          <div className="text-caption text-muted-foreground">
            {format(start, "MMM d, yyyy")}
          </div>
        )}
      </div>
    </div>
  )
}

function RsvpButton({ meeting, status }: { meeting: MeetingItem; status: RsvpStatus }) {
  const queryClient = useQueryClient()
  const clubId = useAppStore((s) => s.currentClubId)
  const isCurrent = meeting.myRsvp === status

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/clubs/${clubId}/meetings/${meeting.id}/rsvp`, {
        method: "POST",
        json: { status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", clubId] })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to update RSVP")
    },
  })

  const labels: Record<RsvpStatus, string> = {
    going: "Going",
    maybe: "Maybe",
    not_going: "Not Going",
  }
  const icons: Record<RsvpStatus, React.ReactNode> = {
    going: <Check className="size-3.5" />,
    maybe: <HelpCircle className="size-3.5" />,
    not_going: <X className="size-3.5" />,
  }

  return (
    <Button
      size="sm"
      variant={isCurrent ? "club" : "outline"}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      className="gap-1.5"
      aria-pressed={isCurrent}
    >
      {mutation.isPending && isCurrent ? <Loader2 className="size-3.5 animate-spin" /> : icons[status]}
      <span className="hidden xs:inline sm:inline">{labels[status]}</span>
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Cancel meeting item (handles single vs series)
// ---------------------------------------------------------------------------

function CancelMeetingMenuItem({ meeting }: { meeting: MeetingItem }) {
  const clubId = useAppStore((s) => s.currentClubId)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<"single" | "series">("single")
  const [pending, setPending] = useState(false)

  async function handleCancel() {
    setPending(true)
    try {
      const qs = scope === "series" ? "?scope=series" : ""
      await api(`/api/clubs/${clubId}/meetings/${meeting.id}${qs}`, { method: "DELETE" })
      toast.success(
        scope === "series" ? "Series cancelled" : "Meeting cancelled"
      )
      queryClient.invalidateQueries({ queryKey: ["meetings", clubId] })
      setOpen(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel")
    } finally {
      setPending(false)
    }
  }

  const isRecurring = meeting.isRecurring && !!meeting.recurrenceRule

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setScope(isRecurring ? "single" : "single")
          setOpen(true)
        }}
        className="gap-2 text-destructive focus:text-destructive"
      >
        <Trash2 className="size-4" /> Cancel
      </DropdownMenuItem>

      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRecurring ? "Cancel this meeting or the series?" : "Cancel this meeting?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span>
                {isRecurring ? (
                  <span>
                    <strong>{meeting.title}</strong> is part of a recurring series. Choose whether
                    to cancel only this occurrence or every remaining occurrence in the series.
                  </span>
                ) : (
                  <span>
                    This will cancel <strong>{meeting.title}</strong>. Members will be notified.
                    This cannot be undone.
                  </span>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {isRecurring && (
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm has-[:checked]:border-club has-[:checked]:bg-club-muted">
                <input
                  type="radio"
                  name="cancel-scope"
                  value="single"
                  checked={scope === "single"}
                  onChange={() => setScope("single")}
                  className="accent-club"
                />
                <div>
                  <div className="font-medium">This occurrence only</div>
                  <div className="text-caption text-muted-foreground">
                    {formatMeetingRange(meeting.startTime, meeting.endTime)}
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm has-[:checked]:border-club has-[:checked]:bg-club-muted">
                <input
                  type="radio"
                  name="cancel-scope"
                  value="series"
                  checked={scope === "series"}
                  onChange={() => setScope("series")}
                  className="accent-club"
                />
                <div>
                  <div className="font-medium">Entire series ({meeting.recurrenceRule})</div>
                  <div className="text-xs text-muted-foreground">
                    Cancels all upcoming non-cancelled occurrences with this title.
                  </div>
                </div>
              </label>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Cancel {scope === "series" ? "series" : "meeting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Create meeting dialog
// ---------------------------------------------------------------------------

function CreateMeetingDialog({
  clubId,
  open,
  onOpenChange,
  teams,
  onCreated,
}: {
  clubId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  teams: TeamInfo[]
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [teamId, setTeamId] = useState<string>("none")
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState<"weekly" | "biweekly" | "monthly">("weekly")
  const [pending, setPending] = useState(false)

  // Default times when opening.
  React.useEffect(() => {
    if (open) {
      const now = new Date()
      now.setMinutes(0, 0, 0)
      now.setHours(now.getHours() + 1)
      const s = new Date(now)
      const e = new Date(now.getTime() + 60 * 60 * 1000)
      setStartTime(toLocalInputValue(s))
      setEndTime(toLocalInputValue(e))
    }
  }, [open])

  function reset() {
    setTitle("")
    setDescription("")
    setLocation("")
    setTeamId("none")
    setIsRecurring(false)
    setRecurrenceRule("weekly")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return toast.error("Title is required")
    if (!location.trim()) return toast.error("Location is required")
    if (!startTime || !endTime) return toast.error("Start and end times are required")
    const s = new Date(startTime)
    const en = new Date(endTime)
    if (isNaN(s.getTime()) || isNaN(en.getTime())) return toast.error("Invalid times")
    if (en <= s) return toast.error("End time must be after start time")
    if (isRecurring && !recurrenceRule) return toast.error("Recurrence rule required")

    setPending(true)
    try {
      await api(`/api/clubs/${clubId}/meetings`, {
        method: "POST",
        json: {
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim(),
          startTime: s.toISOString(),
          endTime: en.toISOString(),
          teamId: teamId === "none" ? null : teamId,
          isRecurring,
          recurrenceRule: isRecurring ? recurrenceRule : null,
        },
      })
      toast.success(isRecurring ? "Recurring meetings created" : "Meeting created")
      reset()
      onCreated()
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create meeting")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className={MOBILE_FULLSCREEN_DIALOG} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>
            Create a meeting — RSVPs open immediately to all members.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="m-title">Title</Label>
              <Input
                id="m-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly standup"
                maxLength={120}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-desc">Description</Label>
              <Textarea
                id="m-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Agenda, links, etc."
                maxLength={2000}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-loc">Location</Label>
              <Input
                id="m-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Room 101 / Zoom link"
                maxLength={200}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="m-start">Start</Label>
                <Input
                  id="m-start"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-end">End</Label>
                <Input
                  id="m-end"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-team">Team (optional)</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="m-team">
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
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="m-recurring"
                  checked={isRecurring}
                  onCheckedChange={(v) => setIsRecurring(!!v)}
                />
                <Label htmlFor="m-recurring" className="cursor-pointer">
                  Make this meeting recurring
                </Label>
              </div>
              {isRecurring && (
                <div className="grid gap-2">
                  <Label htmlFor="m-recurrence">Repeat</Label>
                  <Select
                    value={recurrenceRule}
                    onValueChange={(v) => setRecurrenceRule(v as "weekly" | "biweekly" | "monthly")}
                  >
                    <SelectTrigger id="m-recurrence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Creates the next 8 occurrences (9 total). You can cancel individual ones or the
                    entire series later.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0 sticky bottom-0 bg-background">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} variant="club" className="gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create meeting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit meeting dialog
// ---------------------------------------------------------------------------

function EditMeetingDialog({
  clubId,
  meeting,
  onOpenChange,
  teams,
  onSaved,
}: {
  clubId: string
  meeting: MeetingItem | null
  onOpenChange: (v: boolean) => void
  teams: TeamInfo[]
  onSaved: () => void
}) {
  const open = !!meeting
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [teamId, setTeamId] = useState<string>("none")
  const [pending, setPending] = useState(false)

  React.useEffect(() => {
    if (meeting) {
      setTitle(meeting.title)
      setDescription(meeting.description ?? "")
      setLocation(meeting.location)
      setStartTime(toLocalInputValue(parseISO(meeting.startTime)))
      setEndTime(toLocalInputValue(parseISO(meeting.endTime)))
      setTeamId(meeting.teamId ?? "none")
    }
  }, [meeting])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!meeting) return
    if (!title.trim()) return toast.error("Title is required")
    if (!location.trim()) return toast.error("Location is required")
    const s = new Date(startTime)
    const en = new Date(endTime)
    if (isNaN(s.getTime()) || isNaN(en.getTime())) return toast.error("Invalid times")
    if (en <= s) return toast.error("End time must be after start time")

    setPending(true)
    try {
      await api(`/api/clubs/${clubId}/meetings/${meeting.id}`, {
        method: "PATCH",
        json: {
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim(),
          startTime: s.toISOString(),
          endTime: en.toISOString(),
          teamId: teamId === "none" ? null : teamId,
        },
      })
      toast.success("Meeting updated")
      onSaved()
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update meeting")
    } finally {
      setPending(false)
    }
  }

  if (!meeting) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className={MOBILE_FULLSCREEN_DIALOG} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Edit meeting</DialogTitle>
          <DialogDescription>
            {meeting.isRecurring ? (
              <>Editing this occurrence only. Series metadata stays unchanged.</>
            ) : (
              <>Update the details of this meeting.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="e-title">Title</Label>
              <Input
                id="e-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e-desc">Description</Label>
              <Textarea
                id="e-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e-loc">Location</Label>
              <Input
                id="e-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="e-start">Start</Label>
                <Input
                  id="e-start"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="e-end">End</Label>
                <Input
                  id="e-end"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e-team">Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="e-team">
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
          </div>
          <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0 sticky bottom-0 bg-background">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} variant="club" className="gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Meeting detail dialog (with RSVP + attendees for execs)
// ---------------------------------------------------------------------------

function MeetingDetailDialog({
  meeting,
  clubId,
  isExec,
  onOpenChange,
  onEdit,
  onRsvpChanged,
}: {
  meeting: MeetingItem | null
  clubId: string
  isExec: boolean
  onOpenChange: (v: boolean) => void
  onEdit: (m: MeetingItem) => void
  onRsvpChanged: () => void
}) {
  const open = !!meeting
  const [attendees, setAttendees] = useState<Attendee[] | null>(null)
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  React.useEffect(() => {
    if (open && meeting && isExec) {
      let cancelled = false
      setAttendeesLoading(true)
      setAttendees(null)
      api<AttendeesResponse>(`/api/clubs/${clubId}/meetings/${meeting.id}/attendees`)
        .then((res) => {
          if (!cancelled) setAttendees(res.attendees)
        })
        .catch(() => {
          if (!cancelled) setAttendees([])
        })
        .finally(() => {
          if (!cancelled) setAttendeesLoading(false)
        })
      return () => {
        cancelled = true
      }
    }
    if (!open) setAttendees(null)
  }, [open, meeting, isExec, clubId])

  if (!meeting) return null

  const start = parseISO(meeting.startTime)
  const end = parseISO(meeting.endTime)
  const isPast = end.getTime() < Date.now()

  return (
    <Dialog open={open} onOpenChange={(v) => !attendeesLoading && onOpenChange(v)}>
      <DialogContent className={MOBILE_FULLSCREEN_DIALOG} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span className="truncate">{meeting.title}</span>
            {meeting.isRecurring && meeting.recurrenceRule && (
              <Badge variant="secondary" className="gap-1 capitalize">
                <RefreshCw className="size-3" />
                {meeting.recurrenceRule}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{formatMeetingRange(meeting.startTime, meeting.endTime)}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 grid gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="break-words">{meeting.location}</span>
          </div>
          {meeting.team && (
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-muted-foreground" />
              <Badge variant="outline">{meeting.team.name}</Badge>
            </div>
          )}
          {meeting.description && (
            <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {meeting.description}
            </p>
          )}
          <div className="text-xs text-muted-foreground">
            Scheduled by {meeting.creator.name} · {format(parseISO(meeting.createdAt), "MMM d, yyyy")}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <RsvpTally label="Going" value={meeting.rsvpCounts.going} kind="going" />
            <RsvpTally label="Maybe" value={meeting.rsvpCounts.maybe} kind="maybe" />
            <RsvpTally label="Not Going" value={meeting.rsvpCounts.notGoing} kind="not_going" />
          </div>

          {!isPast && (
            <div className="flex flex-wrap gap-2">
              <RsvpButton meeting={meeting} status="going" />
              <RsvpButton meeting={meeting} status="maybe" />
              <RsvpButton meeting={meeting} status="not_going" />
            </div>
          )}

          {isExec && (
            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-sm font-medium">Attendees</div>
                <div className="text-xs text-muted-foreground">
                  {attendees?.length ?? 0} response{attendees?.length === 1 ? "" : "s"}
                </div>
              </div>
              <ScrollArea className="max-h-60">
                {attendeesLoading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded" />
                    ))}
                  </div>
                ) : attendees && attendees.length > 0 ? (
                  <ul className="divide-y">
                    {attendees.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                        <Avatar className="size-7">
                          <AvatarImage src={a.user.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback className="text-xs">
                            {initials(a.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.user.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{a.user.email}</div>
                        </div>
                        <RsvpPill status={a.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No RSVPs yet.
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0 sticky bottom-0 bg-background">
          {isExec && !isPast && (
            <Button
              variant="outline"
              onClick={() => onEdit(meeting)}
              className="mr-auto gap-2"
            >
              <Pencil className="size-4" /> Edit
            </Button>
          )}
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RsvpTally({
  label,
  value,
  kind,
}: {
  label: string
  value: number
  kind: RsvpStatus
}) {
  const styles: Record<RsvpStatus, string> = {
    going: "chip-approved",
    maybe: "chip-pending",
    not_going: "chip-rejected",
  }
  return (
    <div className={cn("rounded-md border p-2 text-center", styles[kind])}>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="text-caption">{label}</div>
    </div>
  )
}

function RsvpPill({ status }: { status: RsvpStatus }) {
  const styles: Record<RsvpStatus, string> = {
    going: "chip-approved",
    maybe: "chip-pending",
    not_going: "chip-rejected",
  }
  const labels: Record<RsvpStatus, string> = {
    going: "Going",
    maybe: "Maybe",
    not_going: "Not going",
  }
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-caption-medium", styles[status])}>
      {labels[status]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Calendar panel (month grid)
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function CalendarPanel({
  meetings,
  onOpenMeeting,
}: {
  meetings: MeetingItem[]
  onOpenMeeting: (m: MeetingItem) => void
}) {
  const [cursor, setCursor] = useState<Date>(() => new Date())
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingItem[]>()
    for (const m of meetings) {
      const key = format(parseISO(m.startTime), "yyyy-MM-dd")
      const arr = map.get(key) ?? []
      arr.push(m)
      map.set(key, arr)
    }
    return map
  }, [meetings])

  const today = new Date()

  return (
    <div className="card-quiet p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="size-5 text-muted-foreground shrink-0" />
          <h2 className="text-section-title truncate">{format(cursor, "MMMM yyyy")}</h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor((d) => subMonths(d, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor((d) => addMonths(d, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="hidden text-center text-caption-medium text-muted-foreground sm:block"
          >
            {d}
          </div>
        ))}
        {/* Single-letter weekday header on mobile */}
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={`m-${d}`}
            className="text-center text-[10px] font-medium text-muted-foreground sm:hidden"
          >
            {d[0]}
          </div>
        ))}

        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const dayMeetings = meetingsByDay.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = isDateToday(day)
          return (
            <div
              key={key}
              className={cn(
                "min-h-[4rem] rounded-md border p-1 sm:min-h-[6rem] sm:p-1.5",
                inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
                isToday && "border-club ring-1 ring-club"
              )}
            >
              <div
                className={cn(
                  "mb-1 text-right text-caption",
                  isToday ? "font-bold text-club" : "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="flex flex-col gap-1">
                {dayMeetings.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onOpenMeeting(m)}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-left text-[10px] sm:text-caption",
                      "bg-club-muted text-club hover:bg-club-muted/70 transition-colors"
                    )}
                    title={`${m.title} · ${format(parseISO(m.startTime), "h:mm a")}`}
                  >
                    <span className="hidden sm:inline">
                      {format(parseISO(m.startTime), "h:mm")}{" "}
                    </span>
                    {m.title}
                  </button>
                ))}
                {dayMeetings.length > 3 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{dayMeetings.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {meetings.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No meetings to show"
            description="Upcoming meetings will appear here as they're scheduled."
          />
        </div>
      )}
    </div>
  )
}
