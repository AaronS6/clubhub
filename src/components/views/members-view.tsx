"use client"

import { useState, useMemo, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiUpload } from "@/lib/api/client"
import { useAppStore } from "@/lib/store"
import { usePresence } from "@/lib/use-presence"
import { cn } from "@/lib/utils"
import { usePollingFallback, useRemoteChange } from "@/lib/realtime-store"
import {
  PageHeader,
  RoleBadge,
  EmptyState,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { BadgesDisplay } from "@/components/shared/badges-display"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  UserCog,
  Search,
  MoreVertical,
  Shield,
  ShieldOff,
  UserMinus,
  LogOut,
  KeyRound,
  RefreshCw,
  Copy,
  Mail,
  Clock,
  Users as UsersIcon,
  Hash,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  Pencil,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Mobile full-screen dialog className — makes a Dialog fill the viewport on
// phones (sticky header / scrollable body / sticky footer so action buttons
// stay reachable above the soft keyboard) and centers as a normal modal on
// sm+ screens.
// ---------------------------------------------------------------------------
const MOBILE_FULLSCREEN_DIALOG =
  "top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
  "sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-w-lg sm:rounded-lg sm:p-6 sm:gap-4 sm:grid"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Import result shape — matches POST /api/clubs/[clubId]/members/import
// ---------------------------------------------------------------------------

interface ImportResult {
  added: { name: string; email: string }[]
  alreadyMembers: { email: string }[]
  invalid: { row: number; name?: string; email?: string; reason: string }[]
  pendingInvites: { name: string; email: string }[]
  clubCode: string
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function MembersView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const role = useAppStore((s) => s.currentClub?.role)
  const clubCode = useAppStore((s) => s.currentClub?.clubCode)
  const isExec = role === "executive"

  const { data, isLoading, isError, refetch } = useQuery<MembersResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api(`/api/clubs/${clubId}/members`),
    enabled: !!clubId,
    // Realtime is primary; poll only as a fallback while the socket is down.
    // Members list is low-urgency — 30s is plenty as a fallback.
    refetchInterval: usePollingFallback(30_000),
  })

  // Live presence — green dot on avatars of currently-online club members.
  const online = usePresence(clubId ?? null)

  const [search, setSearch] = useState("")
  const [removeTarget, setRemoveTarget] = useState<ClubMember | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [detailMember, setDetailMember] = useState<ClubMember | null>(null)

  const filtered = useMemo(() => {
    const list = data?.members ?? []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (m) =>
        m.user.name.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q)
    )
  }, [data, search])

  if (!clubId) {
    return <div className="p-8 text-sm text-muted-foreground">No club selected.</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Browse, search, and manage everyone in this club."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {isExec && (
              <Button variant="club" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Import CSV
              </Button>
            )}
            <Button variant="outline" onClick={() => setLeaveOpen(true)}>
              <LogOut className="mr-1.5 h-4 w-4" /> Leave club
            </Button>
          </div>
        }
      />

      {/* Club code section — exec only */}
      {isExec && <ClubCodeSection clubId={clubId} clubCode={clubCode} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-9"
          aria-label="Search members"
        />
      </div>

      {/* Body */}
      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load members.{" "}
          <button className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <MembersSkeleton />
      ) : !data || data.members.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title="No members yet"
          description="Members will appear here once they join this club."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="No matches"
          description={`No members match “${search}”. Try a different search.`}
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="card-quiet hidden md:block overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead className="text-right">Approved hours</TableHead>
                  <TableHead>Joined</TableHead>
                  {isExec && <TableHead className="w-10 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <MemberRow
                    key={m.membershipId}
                    clubId={clubId}
                    member={m}
                    isExec={isExec}
                    isSelf={m.user.id === data.myUserId}
                    online={online}
                    onRemove={() => setRemoveTarget(m)}
                    onOpenDetail={() => setDetailMember(m)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((m) => (
              <MemberMobileCard
                key={m.membershipId}
                clubId={clubId}
                member={m}
                isExec={isExec}
                isSelf={m.user.id === data?.myUserId}
                online={online}
                onRemove={() => setRemoveTarget(m)}
                onOpenDetail={() => setDetailMember(m)}
              />
            ))}
          </div>
        </>
      )}

      {/* Remove confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove{" "}
              <span className="font-medium text-foreground">{removeTarget?.user.name}</span> from
              this club? They will lose access immediately. This action can be reverted later by
              re-adding them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!removeTarget) return
                try {
                  await api(`/api/clubs/${clubId}/members`, {
                    method: "PATCH",
                    json: { userId: removeTarget.user.id, action: "remove" },
                  })
                  toast.success("Member removed")
                  refetch()
                } catch (e: any) {
                  toast.error(e.message)
                } finally {
                  setRemoveTarget(null)
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave confirm */}
      <LeaveClubDialog clubId={clubId} open={leaveOpen} onOpenChange={setLeaveOpen} />

      {/* Import CSV dialog (exec only) */}
      {isExec && (
        <ImportCsvDialog
          clubId={clubId}
          clubCode={clubCode}
          open={importOpen}
          onOpenChange={setImportOpen}
          onDone={() => refetch()}
        />
      )}

      {/* Member detail sheet */}
      <MemberDetailSheet
        clubId={clubId}
        member={detailMember}
        online={online}
        onOpenChange={(o) => !o && setDetailMember(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Club code section (exec only) — code + password visibility + change pwd
// ---------------------------------------------------------------------------

function ClubCodeSection({
  clubId,
  clubCode,
}: {
  clubId: string
  clubCode?: string
}) {
  const qc = useQueryClient()
  const patchCurrentClub = useAppStore((s) => s.patchCurrentClub)
  const setClubs = useAppStore((s) => s.setClubs)
  const clubs = useAppStore((s) => s.clubs)

  // Password reveal state — fetched on demand from the (exec-only) endpoint.
  const [password, setPassword] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)

  const regen = useMutation({
    mutationFn: () => api<{ clubCode: string }>(`/api/clubs/${clubId}/regenerate`, { method: "POST" }),
    onSuccess: (data) => {
      toast.success("Club code regenerated")
      patchCurrentClub({ clubCode: data.clubCode })
      // keep the clubs list in sync too
      setClubs(
        clubs.map((c) =>
          c.clubId === clubId ? { ...c, clubCode: data.clubCode } : c
        )
      )
      qc.invalidateQueries({ queryKey: ["members", clubId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  async function fetchPassword() {
    if (password || passwordLoading) return
    setPasswordLoading(true)
    try {
      const res = await api<{ password: string }>(`/api/clubs/${clubId}/password`)
      setPassword(res.password)
      setPasswordVisible(true)
    } catch (e: any) {
      toast.error(e.message || "Couldn't load the club password")
    } finally {
      setPasswordLoading(false)
    }
  }

  function togglePasswordVisible() {
    // If we don't have the password yet, fetch it (then show).
    if (!password) {
      void fetchPassword()
      return
    }
    setPasswordVisible((v) => !v)
  }

  async function copyCode() {
    if (!clubCode) return
    try {
      await navigator.clipboard.writeText(clubCode)
      toast.success("Code copied to clipboard")
    } catch {
      toast.error("Couldn't copy code to clipboard")
    }
  }

  async function copyPassword() {
    if (!password) {
      // Fetch on demand, then copy.
      setPasswordLoading(true)
      try {
        const res = await api<{ password: string }>(`/api/clubs/${clubId}/password`)
        setPassword(res.password)
        setPasswordVisible(true)
        await navigator.clipboard.writeText(res.password)
        toast.success("Password copied to clipboard")
      } catch (e: any) {
        toast.error(e.message || "Couldn't load the club password")
      } finally {
        setPasswordLoading(false)
      }
      return
    }
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Password copied to clipboard")
    } catch {
      toast.error("Couldn't copy password to clipboard")
    }
  }

  // Masked display: if we have a password, show either the plain text or a
  // row of dots. Otherwise show a placeholder.
  const passwordDisplay = !password
    ? "••••••••"
    : passwordVisible
      ? password
      : "•".repeat(Math.min(password.length, 16))

  return (
    <div className="card-quiet p-5">
      <div className="pb-3">
        <h3 className="text-section-title flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Club code &amp; password
        </h3>
      </div>
      <div className="space-y-4">
        <p className="text-body text-muted-foreground">
          Share this code (and your club&apos;s password) with new members so they can join via the
          &quot;Join a club&quot; dialog. The password is stored encrypted; reveal it here when you
          need to share it.
        </p>

        {/* Club code row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <code className="font-mono text-lg tracking-[0.2em] font-semibold">
              {clubCode ?? "—"}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyCode} disabled={!clubCode}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy code
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => regen.mutate()}
              disabled={regen.isPending}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", regen.isPending && "animate-spin")} />
              {regen.isPending ? "Regenerating…" : "Regenerate code"}
            </Button>
          </div>
        </div>

        {/* Password row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Input
              type="text"
              readOnly
              value={passwordDisplay}
              aria-label="Club password"
              className="font-mono pr-10"
              placeholder="••••••••"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              onClick={togglePasswordVisible}
              disabled={passwordLoading}
            >
              {passwordLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : passwordVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyPassword}
              disabled={passwordLoading}
            >
              {passwordLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              Copy password
            </Button>
            <Button
              variant="club"
              size="sm"
              onClick={() => setChangeOpen(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Change password
            </Button>
          </div>
        </div>
      </div>

      <ChangePasswordDialog
        clubId={clubId}
        open={changeOpen}
        onOpenChange={setChangeOpen}
        onChanged={(newPassword) => {
          // After a successful change, surface the new value locally so the
          // exec doesn't need to re-click "Show" to verify it.
          setPassword(newPassword)
          setPasswordVisible(true)
        }}
      />
    </div>
  )
}

function ChangePasswordDialog({
  clubId,
  open,
  onOpenChange,
  onChanged,
}: {
  clubId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: (newPassword: string) => void
}) {
  const [newPassword, setNewPassword] = useState("")
  const [show, setShow] = useState(false)

  function reset() {
    setNewPassword("")
    setShow(false)
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setTimeout(reset, 200)
    }
    onOpenChange(v)
  }

  const changeMut = useMutation({
    mutationFn: (pwd: string) =>
      api(`/api/clubs/${clubId}/password`, {
        method: "PATCH",
        json: { newPassword: pwd },
      }),
    onSuccess: (_data, pwd) => {
      toast.success("Club password updated")
      onChanged(pwd)
      handleOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const tooShort = newPassword.trim().length < 4
  const tooLong = newPassword.length > 60

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Change club password
          </DialogTitle>
          <DialogDescription>
            Set a new password members will use to join this club.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="club-new-password">New password</Label>
            <div className="relative">
              <Input
                id="club-new-password"
                type={show ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 4 characters"
                autoFocus
                className="font-mono pr-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !tooShort && !tooLong) {
                    changeMut.mutate(newPassword)
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {tooShort && newPassword.length > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Password must be at least 4 characters.
              </p>
            )}
            {tooLong && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Password must be 60 characters or fewer.
              </p>
            )}
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Anyone with the old password will no longer be able to join. Make
              sure to share the new one with anyone you&apos;ve invited.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={changeMut.isPending}>
            Cancel
          </Button>
          <Button
            variant="club"
            onClick={() => changeMut.mutate(newPassword)}
            disabled={changeMut.isPending || tooShort || tooLong}
          >
            {changeMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save new password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Member row (desktop)
// ---------------------------------------------------------------------------

function MemberRow({
  clubId,
  member,
  isExec,
  isSelf,
  online,
  onRemove,
  onOpenDetail,
}: {
  clubId: string
  member: ClubMember
  isExec: boolean
  isSelf: boolean
  online: Set<string>
  onRemove: () => void
  onOpenDetail: () => void
}) {
  const qc = useQueryClient()
  // Briefly highlight when this member was just promoted/demoted/removed by
  // another exec so the permission change is perceptible.
  const flash = useRemoteChange("member", member.user.id)
  const roleMut = useMutation({
    mutationFn: (action: "promote" | "demote") =>
      api(`/api/clubs/${clubId}/members`, {
        method: "PATCH",
        json: { userId: member.user.id, action },
      }),
    onSuccess: (_data, action) => {
      toast.success(action === "promote" ? "Promoted to executive" : "Demoted to member")
      qc.invalidateQueries({ queryKey: ["members", clubId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-muted/40 transition-colors",
        flash && "bg-club/5 ring-1 ring-inset ring-club/30"
      )}
      onClick={onOpenDetail}
    >
      <TableCell>
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar wrapper is `relative` so the presence dot can be positioned
              on the wrapper (NOT inside <Avatar>, which has `overflow-hidden`
              and would clip it). */}
          <span className="relative inline-flex shrink-0">
            <Avatar className="h-8 w-8">
              <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
              <AvatarFallback className="text-xs">{initials(member.user.name)}</AvatarFallback>
            </Avatar>
            {online.has(member.user.id) && (
              <span
                aria-label="Online"
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-club ring-2 ring-background"
              />
            )}
          </span>
          <div className="min-w-0">
            <div className="font-medium truncate flex items-center gap-1.5">
              {member.user.name}
              {isSelf && (
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">(you)</span>
              )}
            </div>
            {member.user.bio && (
              <div className="text-xs text-muted-foreground truncate max-w-xs">
                {member.user.bio}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground truncate max-w-[14rem]">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{member.user.email}</span>
        </div>
      </TableCell>
      <TableCell>
        <RoleBadge role={member.role} />
      </TableCell>
      <TableCell>
        {member.teams.length === 0 ? (
          <span className="text-xs text-muted-foreground/70">—</span>
        ) : (
          <div className="flex flex-wrap gap-1 max-w-[12rem]">
            {member.teams.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {member.approvedHours.toFixed(1)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {relativeTime(member.joinedAt)}
      </TableCell>
      {isExec && (
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          {!isSelf ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={`Actions for ${member.user.name}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {member.user.name}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {member.role === "member" ? (
                  <DropdownMenuItem
                    onClick={() => roleMut.mutate("promote")}
                    disabled={roleMut.isPending}
                  >
                    <Shield className="mr-2 h-4 w-4" /> Promote to executive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => roleMut.mutate("demote")}
                    disabled={roleMut.isPending}
                  >
                    <ShieldOff className="mr-2 h-4 w-4" /> Demote to member
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-700"
                  onClick={onRemove}
                >
                  <UserMinus className="mr-2 h-4 w-4" /> Remove from club
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs text-muted-foreground/70">—</span>
          )}
        </TableCell>
      )}
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Member card (mobile)
// ---------------------------------------------------------------------------

function MemberMobileCard({
  clubId,
  member,
  isExec,
  isSelf,
  online,
  onRemove,
  onOpenDetail,
}: {
  clubId: string
  member: ClubMember
  isExec: boolean
  isSelf: boolean
  online: Set<string>
  onRemove: () => void
  onOpenDetail: () => void
}) {
  const qc = useQueryClient()
  const roleMut = useMutation({
    mutationFn: (action: "promote" | "demote") =>
      api(`/api/clubs/${clubId}/members`, {
        method: "PATCH",
        json: { userId: member.user.id, action },
      }),
    onSuccess: (_data, action) => {
      toast.success(action === "promote" ? "Promoted to executive" : "Demoted to member")
      qc.invalidateQueries({ queryKey: ["members", clubId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div
      role="button"
      tabIndex={0}
      className="card-quiet p-4 space-y-3 cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-fade-in"
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpenDetail()
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar wrapper is `relative` so the presence dot can be positioned
              on the wrapper (NOT inside <Avatar>, which has `overflow-hidden`
              and would clip it). */}
          <span className="relative inline-flex shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
              <AvatarFallback className="text-sm">{initials(member.user.name)}</AvatarFallback>
            </Avatar>
            {online.has(member.user.id) && (
              <span
                aria-label="Online"
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-club ring-2 ring-background"
              />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-body-medium truncate flex items-center gap-1.5">
              {member.user.name}
              {isSelf && (
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                  (you)
                </span>
              )}
            </div>
            <div className="text-caption text-muted-foreground truncate">{member.user.email}</div>
          </div>
        </div>
        <RoleBadge role={member.role} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-caption">
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <div className="text-muted-foreground">Approved hours</div>
          <div className="text-body-medium tabular-nums">
            {member.approvedHours.toFixed(1)}
          </div>
        </div>
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <div className="text-muted-foreground">Joined</div>
          <div className="text-body-medium">{relativeTime(member.joinedAt)}</div>
        </div>
      </div>

      {member.teams.length > 0 && (
        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">Teams</div>
          <div className="flex flex-wrap gap-1">
            {member.teams.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                {t.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {isExec && !isSelf && (
        <>
          <Separator />
          <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {member.role === "member" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => roleMut.mutate("promote")}
                disabled={roleMut.isPending}
              >
                <Shield className="mr-1.5 h-3.5 w-3.5" /> Promote
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => roleMut.mutate("demote")}
                disabled={roleMut.isPending}
              >
                <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Demote
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-red-600" onClick={onRemove}>
              <UserMinus className="mr-1.5 h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Member detail sheet — profile + stats + badges
// ---------------------------------------------------------------------------

function MemberDetailSheet({
  clubId,
  member,
  online,
  onOpenChange,
}: {
  clubId: string
  member: ClubMember | null
  online: Set<string>
  onOpenChange: (v: boolean) => void
}) {
  if (!member) return null
  return (
    <Sheet open={!!member} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center gap-3">
            {/* Avatar wrapper is `relative` so the presence dot can be positioned
                on the wrapper (NOT inside <Avatar>, which has `overflow-hidden`
                and would clip it). This is the most visible spot for the dot,
                so it's the one the user noticed was being cut off. */}
            <span className="relative inline-flex shrink-0">
              <Avatar className="h-12 w-12">
                <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
                <AvatarFallback className="text-base">
                  {initials(member.user.name)}
                </AvatarFallback>
              </Avatar>
              {online.has(member.user.id) && (
                <span
                  aria-label="Online"
                  className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-club ring-2 ring-background"
                />
              )}
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">{member.user.name}</SheetTitle>
              <SheetDescription className="truncate">{member.user.email}</SheetDescription>
            </div>
            <div className="ml-auto">
              <RoleBadge role={member.role} />
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {member.user.bio && (
              <div>
                <h3 className="text-caption-medium uppercase tracking-wide mb-1">Bio</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {member.user.bio}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label="Approved hours"
                value={member.approvedHours.toFixed(1)}
                icon={<Clock className="h-4 w-4" />}
              />
              <StatBox
                label="Teams"
                value={String(member.teams.length)}
                icon={<UsersIcon className="h-4 w-4" />}
              />
              <StatBox
                label="Joined"
                value={relativeTime(member.joinedAt)}
                icon={<UserPlus className="h-4 w-4" />}
              />
              <StatBox
                label="Role"
                value={member.role === "executive" ? "Executive" : "Member"}
                icon={<Shield className="h-4 w-4" />}
              />
            </div>

            {member.teams.length > 0 && (
              <div>
                <h3 className="text-caption-medium uppercase tracking-wide mb-2">Teams</h3>
                <div className="flex flex-wrap gap-2">
                  {member.teams.map((t) => (
                    <Badge key={t.id} variant="secondary" className="px-2 py-1">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <h3 className="text-section-title flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-club" /> Badges
              </h3>
              <BadgesDisplay userId={member.user.id} clubId={clubId} />
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[11px] uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import CSV dialog
// ---------------------------------------------------------------------------

function downloadTemplateCsv() {
  const csv = "name,email\nJordan Lee,jordan@example.com\nSam Rivera,sam@example.com\n"
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "clubhub-members-template.csv"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ImportCsvDialog({
  clubId,
  clubCode,
  open,
  onOpenChange,
  onDone,
}: {
  clubId: string
  clubCode?: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      // Reset on close, with a tiny delay so the close animation doesn't jump.
      setTimeout(reset, 200)
    }
    onOpenChange(v)
  }

  async function handleUpload() {
    if (!file) {
      toast.error("Please choose a CSV file first")
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const data = await apiUpload(`/api/clubs/${clubId}/members/import`, fd)
      setResult(data as ImportResult)
      const r = data as ImportResult
      toast.success(
        `Imported ${r.added.length} member${r.added.length === 1 ? "" : "s"}` +
          (r.pendingInvites.length > 0
            ? ` · ${r.pendingInvites.length} pending invite${r.pendingInvites.length === 1 ? "" : "s"}`
            : "")
      )
      qc.invalidateQueries({ queryKey: ["members", clubId] })
      onDone()
    } catch (e: any) {
      setError(e.message || "Import failed")
      toast.error(e.message || "Import failed")
    } finally {
      setUploading(false)
    }
  }

  function handleCopyCode() {
    if (!result?.clubCode) return
    navigator.clipboard
      .writeText(result.clubCode)
      .then(() => toast.success("Club code copied"))
      .catch(() => toast.error("Couldn't copy"))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={MOBILE_FULLSCREEN_DIALOG} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import members from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV with <code className="font-mono">name,email</code> columns. Existing
            accounts will be added as members; emails without accounts will be listed as pending
            invites — share your club code with them so they can sign up.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0">
            <ImportResults result={result} onAgain={reset} onCopyCode={handleCopyCode} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 space-y-4">
              <div className="space-y-2">
                <Label>CSV file</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        setFile(f)
                        setError(null)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 justify-start truncate min-w-0"
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4 shrink-0" />
                    {file ? (
                      <span className="truncate">{file.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Choose a .csv file…</span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={downloadTemplateCsv}
                    className="text-club shrink-0"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Template
                  </Button>
                </div>
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Requirements</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Header row with <code>name</code> and <code>email</code> columns.</li>
                  <li>Maximum 1 MB · 500 rows.</li>
                  <li>Quoted fields with embedded commas are supported.</li>
                </ul>
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0 sticky bottom-0 bg-background">
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button variant="club" onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-4 w-4" /> Import {file ? `(${file.name})` : ""}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Import results screen
// ---------------------------------------------------------------------------

function ImportResults({
  result,
  onAgain,
  onCopyCode,
}: {
  result: ImportResult
  onAgain: () => void
  onCopyCode: () => void
}) {
  const total =
    result.added.length +
    result.alreadyMembers.length +
    result.invalid.length +
    result.pendingInvites.length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <ResultStat
          icon={<CheckCircle2 className="h-4 w-4 text-club" />}
          label="Added"
          value={result.added.length}
        />
        <ResultStat
          icon={<UsersIcon className="h-4 w-4 text-muted-foreground" />}
          label="Already members"
          value={result.alreadyMembers.length}
        />
        <ResultStat
          icon={<UserPlus className="h-4 w-4 text-amber-600" />}
          label="Pending invites"
          value={result.pendingInvites.length}
        />
        <ResultStat
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          label="Invalid"
          value={result.invalid.length}
        />
      </div>

      {result.added.length > 0 && (
        <div>
          <h4 className="text-caption-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-club" /> Added ({result.added.length})
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
            {result.added.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                <span className="truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground truncate ml-2">{a.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.pendingInvites.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Pending invites ({result.pendingInvites.length})
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                These people need to create an account first. Share your club code with them so they
                can sign up and join.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 flex-1">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <code className="font-mono text-base tracking-[0.2em] font-semibold">
                {result.clubCode || clubCodeFallback}
              </code>
            </div>
            <Button variant="outline" size="sm" onClick={onCopyCode}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <div className="mt-3 space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
            {result.pendingInvites.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-amber-200/40 dark:border-amber-800/40 last:border-0">
                <span className="truncate text-amber-900 dark:text-amber-200">{p.name}</span>
                <span className="text-amber-700 dark:text-amber-300 truncate ml-2">{p.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.alreadyMembers.length > 0 && (
        <div>
          <h4 className="text-caption-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" /> Already members ({result.alreadyMembers.length})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
            {result.alreadyMembers.map((a, i) => (
              <div key={i} className="text-xs text-muted-foreground py-0.5 truncate">
                {a.email}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.invalid.length > 0 && (
        <div>
          <h4 className="text-caption-medium uppercase tracking-wide mb-1.5 flex items-center gap-1.5 text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Invalid rows ({result.invalid.length})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
            {result.invalid.map((r, i) => (
              <div key={i} className="text-xs py-1 border-b border-border/40 last:border-0">
                <span className="text-muted-foreground">Row {r.row}:</span>{" "}
                <span className="text-foreground">{r.reason}</span>
                {r.email && <span className="text-muted-foreground"> ({r.email})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Processed {total} row{total === 1 ? "" : "s"} in total.
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onAgain}>
          Import another file
        </Button>
      </DialogFooter>
    </div>
  )
}

const clubCodeFallback = "—"

function ResultStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Leave club dialog
// ---------------------------------------------------------------------------

function LeaveClubDialog({
  clubId,
  open,
  onOpenChange,
}: {
  clubId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const setClubs = useAppStore((s) => s.setClubs)
  const clubs = useAppStore((s) => s.clubs)
  const [loading, setLoading] = useState(false)

  async function leave() {
    setLoading(true)
    try {
      await api(`/api/clubs/${clubId}/leave`, { method: "POST" })
      toast.success("You left the club")
      const me = await api<{ memberships: any[] }>("/api/me")
      setClubs(me.memberships ?? clubs.filter((c) => c.clubId !== clubId))
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this club?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose access to this club immediately. If you are the only executive, you must
            promote another member first. You can rejoin later with the club code and password.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault()
              leave()
            }}
            disabled={loading}
          >
            {loading ? "Leaving…" : "Leave club"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function MembersSkeleton() {
  return (
    <div className="space-y-3">
      <div className="card-quiet hidden md:block p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={7}>
                <Skeleton className="h-4 w-24" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2 w-20" />
                    </div>
                  </div>
                </TableCell>
                <TableCell><Skeleton className="h-3 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                <TableCell><Skeleton className="h-3 w-8 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-3 w-12" /></TableCell>
                <TableCell><Skeleton className="h-7 w-7 ml-auto rounded" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-quiet p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2 w-40" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// `Clock` + `UserCog` icons imported but not used in the visible UI; keep
// imports to avoid churn in other files.
void Clock
void UserCog
