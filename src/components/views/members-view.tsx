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
  MembersEmptyIllustration,
  initials,
  relativeTime,
} from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
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
  Trash2,
  Image as ImageIcon,
  Award,
  Plus,
  X as XIcon,
  Trophy,
} from "lucide-react"

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
// Badge shapes — matches /api/clubs/[clubId]/members/[userId]/badges
// ---------------------------------------------------------------------------

interface MemberBadgeItem {
  id: string
  name: string
  description: string | null
  emoji: string
  createdAt: string
  awarded: boolean
  awardedAt: string | null
  awardedById: string | null
  awardedByName: string | null
}
interface MemberBadgesResponse {
  badges: MemberBadgeItem[]
  target: { userId: string; role: "member" | "executive"; joinedAt: string }
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function MembersView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const role = useAppStore((s) => s.currentClub?.role)
  const clubName = useAppStore((s) => s.currentClub?.clubName)
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
      {/* §37 — Sticky page header on desktop. Wraps PageHeader in a sticky,
          backdrop-blurred bar so it stays visible while scrolling long member
          lists. Hidden on mobile to avoid double-stacking with the mobile nav. */}
      <div className="hidden sm:block sticky top-0 z-20 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 border-b border-border/60">
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
      </div>
      {/* Mobile (non-sticky) header */}
      <div className="sm:hidden">
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
      </div>

      {/* Club logo section — exec only */}
      {isExec && <ClubLogoSection clubId={clubId} />}

      {/* Club code section — exec only */}
      {isExec && <ClubCodeSection clubId={clubId} clubCode={clubCode} />}

      {/* §35 — Search input. Icon pinned inside-left, focus ring in the
          club accent color, and a clear-X button on the right when text is
          entered. §33 — When a search is active, render the current query as
          a removable chip below the input. */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-9 pr-9 focus-visible:ring-2 focus-visible:ring-club"
          aria-label="Search members"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      {/* §33 — Active search chip (removable). */}
      {search && (
        <div className="-mt-3">
          <button
            type="button"
            onClick={() => setSearch("")}
            className="inline-flex items-center gap-1 rounded-full bg-club-muted px-2.5 py-1 text-xs text-club hover:bg-club-muted/70 transition-colors"
          >
            Search: {search}
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      {/* Body */}
      {isError ? (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle dark:border-danger/40 dark:bg-danger-subtle p-4 text-sm text-danger-foreground dark:text-danger-foreground">
          Failed to load members.{" "}
          <button className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <MembersSkeleton />
      ) : !data || data.members.length === 0 ? (
        <EmptyState
          illustration={<MembersEmptyIllustration />}
          title="No members yet"
          description="Share your club code to invite people."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration={<MembersEmptyIllustration />}
          title="No matches"
          description={`No members match “${search}”. Try a different search.`}
        />
      ) : (
        (() => {
          const executives = filtered.filter((m) => m.role === "executive")
          const regular = filtered.filter((m) => m.role !== "executive")
          return (
            <div className="space-y-6">
              {/* Leadership row — featured executives */}
              {executives.length > 0 && (
                <section aria-labelledby="leadership-heading" className="space-y-3">
                  <h2
                    id="leadership-heading"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Leadership
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {executives.map((m) => (
                      <MemberCard
                        key={m.membershipId}
                        clubId={clubId}
                        member={m}
                        isExec={isExec}
                        isSelf={m.user.id === data.myUserId}
                        online={online}
                        onRemove={() => setRemoveTarget(m)}
                        onOpenDetail={() => setDetailMember(m)}
                        featured
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Divider + All Members */}
              {executives.length > 0 && regular.length > 0 && (
                <Separator className="bg-border" />
              )}

              {regular.length > 0 && (
                <section aria-labelledby="all-members-heading" className="space-y-3">
                  <h2
                    id="all-members-heading"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    All Members
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {regular.map((m) => (
                      <MemberCard
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
                  </div>
                </section>
              )}
            </div>
          )
        })()
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
                const target = removeTarget
                setRemoveTarget(null)
                try {
                  await api(`/api/clubs/${clubId}/members`, {
                    method: "PATCH",
                    json: { userId: target.user.id, action: "remove" },
                  })
                  // Optimistically refetch so the list updates immediately.
                  refetch()
                  // 5-second undo: re-add the member via the import endpoint
                  // with a tiny CSV containing name + email. The import route
                  // reactivates removed memberships in-place (no new user
                  // created) — exactly the "undo" we want. We catch any
                  // errors and surface them as a follow-up toast.
                  toast.success("Member removed", {
                    duration: 5000,
                    action: {
                      label: "Undo",
                      onClick: async () => {
                        try {
                          const fd = new FormData()
                          const csv = `name,email\n${target.user.name},${target.user.email}`
                          fd.append("file", new Blob([csv], { type: "text/csv" }), "undo.csv")
                          await apiUpload(`/api/clubs/${clubId}/members/import`, fd)
                          toast.success(`${target.user.name} was re-added`)
                          refetch()
                        } catch (e: any) {
                          toast.error(e.message || "Couldn't undo — re-add the member manually.")
                        }
                      },
                    },
                  })
                } catch (e: any) {
                  toast.error(e.message)
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

      {/* Delete club — at the very bottom, subtle, exec only */}
      {isExec && <DeleteClubSection clubId={clubId} clubName={clubName ?? ""} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Club logo section (exec only) — upload / remove the club's logo
// ---------------------------------------------------------------------------

function ClubLogoSection({ clubId }: { clubId: string }) {
  const logoUrl = useAppStore((s) => s.currentClub?.logoUrl ?? null)
  const clubName = useAppStore((s) => s.currentClub?.clubName ?? "")
  const patchCurrentClub = useAppStore((s) => s.patchCurrentClub)
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  // §44 — Drag-and-drop state for the upload drop zone. When true the drop
  // target renders a dashed club-colored border + tinted background so the
  // user knows the file will land here.
  const [isDragging, setIsDragging] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const res = await apiUpload<{ logoUrl: string }>(`/api/clubs/${clubId}/logo`, fd)
      patchCurrentClub({ logoUrl: res.logoUrl })
      qc.invalidateQueries({ queryKey: ["members", clubId] })
      toast.success("Club logo updated")
    } catch (err: any) {
      toast.error(err.message || "Couldn't upload logo")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // §44 — Drag-and-drop handlers. Allow dropping an image file anywhere on
  // the avatar/upload area. We don't accept the drop on the inner button (so
  // the click-to-pick flow still works); instead we wire the dragover/
  // drop on the wrapping section so the whole card acts as the drop target.
  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer?.types?.includes("Files")) return
    e.preventDefault()
    setIsDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    // Only clear if we left the wrapper itself (not bubbled up from a child).
    if (e.currentTarget === e.target) setIsDragging(false)
  }
  async function onDrop(e: React.DragEvent) {
    if (!e.dataTransfer?.files?.length) return
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f.type.startsWith("image/")) {
      toast.error("Please drop an image file")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const res = await apiUpload<{ logoUrl: string }>(`/api/clubs/${clubId}/logo`, fd)
      patchCurrentClub({ logoUrl: res.logoUrl })
      qc.invalidateQueries({ queryKey: ["members", clubId] })
      toast.success("Club logo updated")
    } catch (err: any) {
      toast.error(err.message || "Couldn't upload logo")
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setUploading(true)
    try {
      await api(`/api/clubs/${clubId}/logo`, { method: "DELETE" })
      patchCurrentClub({ logoUrl: null })
      qc.invalidateQueries({ queryKey: ["members", clubId] })
      toast.success("Club logo removed")
    } catch (err: any) {
      toast.error(err.message || "Couldn't remove logo")
    } finally {
      setUploading(false)
    }
  }

  return (
    // §44 — Wrapping drop zone with onDragOver/onDragLeave/onDrop. The
    // dashed border + tinted bg appear only when isDragging.
    <div
      className={cn(
        "card-quiet p-5 transition-colors",
        isDragging && "border-2 border-dashed border-club bg-club-muted/20"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pb-3">
        <h3 className="text-section-title flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Club logo
        </h3>
      </div>
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 shrink-0 rounded-lg border bg-club-muted">
          {logoUrl ? (
            <AvatarImage src={logoUrl} alt={`${clubName} logo`} className="object-cover" />
          ) : null}
          <AvatarFallback className="rounded-lg text-lg font-semibold bg-club text-club-foreground">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              initials(clubName || "?")
            )}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
            aria-hidden
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span>{uploading ? "Uploading…" : "Upload logo"}</span>
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
              disabled={uploading}
            >
              <Trash2 className="h-4 w-4" />
              <span>Remove</span>
            </Button>
          )}
        </div>
      </div>
      <p className="text-caption text-muted-foreground mt-3">
        Shown on the dashboard, sidebar, and public club profile. PNG, JPG, or WebP — we&apos;ll resize it to 256×256.
      </p>
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
              <p className="text-xs text-danger-foreground dark:text-danger-foreground">
                Password must be at least 4 characters.
              </p>
            )}
            {tooLong && (
              <p className="text-xs text-danger-foreground dark:text-danger-foreground">
                Password must be 60 characters or fewer.
              </p>
            )}
          </div>

          <div className="rounded-md border border-warning/30 bg-warning-subtle dark:border-amber-900/60 dark:bg-warning-subtle px-3 py-2.5 text-xs text-warning-foreground flex gap-2">
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
// Delete club section (exec only) — requires club password to confirm
// ---------------------------------------------------------------------------

function DeleteClubSection({ clubId, clubName }: { clubId: string; clubName: string }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!password.trim()) {
      toast.error("Enter the club password to confirm deletion")
      return
    }
    setLoading(true)
    try {
      await api(`/api/clubs/${clubId}`, {
        method: "DELETE",
        json: { confirmPassword: password },
      })
      toast.success(`Club "${clubName}" has been permanently deleted`)
      setTimeout(() => window.location.reload(), 500)
    } catch (e: any) {
      toast.error(e.message || "Failed to delete club")
      setLoading(false)
    }
  }

  return (
    <div className="pt-8 pb-4 flex justify-center">
      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPassword("") }}>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="text-xs text-muted-foreground/50 hover:text-danger transition-colors underline-offset-2 hover:underline"
          >
            Delete this club
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-danger-foreground" />
              Delete "{clubName}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the club and all its data — members, hours, tasks, meetings, announcements, and chat. This cannot be undone.
              <br /><br />
              Enter the club's join password to confirm:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Club password"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleDelete() }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={loading || !password.trim()}
              className="bg-danger text-white hover:bg-danger"
            >
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Member card — responsive (Circle / Mighty-Networks style). One card works
// on every breakpoint; the parent grid controls layout.
// ---------------------------------------------------------------------------

function MemberCard({
  clubId,
  member,
  isExec,
  isSelf,
  online,
  onRemove,
  onOpenDetail,
  featured,
}: {
  clubId: string
  member: ClubMember
  isExec: boolean
  isSelf: boolean
  online: Set<string>
  onRemove: () => void
  onOpenDetail: () => void
  /**
   * Leadership-row variant: slightly larger card (avatar h-14 w-14,
   * name text-base font-semibold) for the featured executive grid.
   * Purely visual — no logic depends on it.
   */
  featured?: boolean
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
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "card-quiet rounded-xl p-5 cursor-pointer hover:-translate-y-0.5 hover:border-club/30 transition-[color,background-color,border-color,transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-t-2",
        member.role === "executive" ? "border-t-violet-400" : "border-t-club/30",
        flash && "ring-1 ring-inset ring-club/30 bg-club/5"
      )}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpenDetail()
        }
      }}
    >
      {/* Header: avatar + identity + actions */}
      <div className="flex items-start gap-3">
        {/* Avatar wrapper is `relative` so the presence dot can be positioned
            on the wrapper (NOT inside <Avatar>, which has `overflow-hidden`
            and would clip it). */}
        <span className="relative inline-flex shrink-0">
          <Avatar className={featured ? "h-14 w-14" : "h-12 w-12"}>
            <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
            <AvatarFallback className={featured ? "text-lg" : "text-base"}>{initials(member.user.name)}</AvatarFallback>
          </Avatar>
          {online.has(member.user.id) && (
            <span
              aria-label="Online"
              className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-club ring-2 ring-background"
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("truncate", featured ? "text-base font-semibold" : "font-medium")}>
              {member.user.name}
            </span>
            {isSelf && (
              <span className="text-xs uppercase font-semibold text-muted-foreground shrink-0">
                (you)
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{member.user.email}</span>
          </div>
          <div className="mt-1.5">
            <RoleBadge role={member.role} />
          </div>
        </div>

        {/* Exec actions dropdown (⋯) */}
        {isExec && !isSelf && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="-mt-1 -mr-1 shrink-0"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                  className="text-danger-foreground focus:text-danger-foreground"
                  onClick={onRemove}
                >
                  <UserMinus className="mr-2 h-4 w-4" /> Remove from club
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const res = await api<{ resetUrl: string; memberName: string }>(
                        `/api/clubs/${clubId}/members/${member.user.id}/reset-password`,
                        { method: "POST" }
                      )
                      // Copy to clipboard + show toast with the link
                      try {
                        await navigator.clipboard.writeText(res.resetUrl)
                        toast.success(`Reset link for ${res.memberName} copied to clipboard! Send it to them via chat/text.`)
                      } catch {
                        // Clipboard failed — show the link in a toast
                        toast(`Reset link for ${res.memberName}`, {
                          description: res.resetUrl,
                          duration: 30000,
                          action: {
                            label: "Copy",
                            onClick: () => navigator.clipboard.writeText(res.resetUrl),
                          },
                        })
                      }
                    } catch (e: any) {
                      toast.error(e.message || "Failed to generate reset link")
                    }
                  }}
                >
                  <KeyRound className="mr-2 h-4 w-4" /> Reset password
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Secondary line: teams + hours + joined */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {member.teams.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            {member.teams.map((t) => (
              <Badge
                key={t.id}
                variant="secondary"
                className="text-xs px-2 py-0 font-normal rounded-full"
              >
                {t.name}
              </Badge>
            ))}
          </div>
        )}
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock className="h-3 w-3" />
          {member.approvedHours.toFixed(1)}h
        </span>
        <span aria-hidden className="text-muted-foreground/40">·</span>
        <span>Joined {relativeTime(member.joinedAt)}</span>
      </div>
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
  const isExec = member.role === "executive"
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
                and would clip it). Larger 64×64 with a role accent ring —
                executives get the club accent color, members get a subtle
                muted ring. This gives the detail sheet more presence. */}
            <span className="relative inline-flex shrink-0">
              <Avatar
                className={cn(
                  "h-16 w-16 ring-2 ring-offset-2 ring-offset-background",
                  isExec ? "ring-club" : "ring-border"
                )}
              >
                <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
                <AvatarFallback className="text-lg font-semibold">
                  {initials(member.user.name)}
                </AvatarFallback>
              </Avatar>
              {online.has(member.user.id) && (
                <span
                  aria-label="Online"
                  className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-club ring-2 ring-background"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{member.user.name}</SheetTitle>
              <SheetDescription className="truncate">{member.user.email}</SheetDescription>
              <div className="mt-1">
                <RoleBadge role={member.role} />
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {/* Stats row — prominent, mirrors the dashboard tile styling.
                Uses rounded-xl border bg-card p-3 with icon + value + label,
                sized to fit a 2-col grid on the narrow sheet. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs  font-medium">Hours logged</span>
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {member.approvedHours.toFixed(1)}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <UsersIcon className="h-4 w-4" />
                  <span className="text-xs  font-medium">Teams</span>
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {String(member.teams.length)}
                </div>
              </div>
            </div>

            {member.user.bio && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-1">Bio</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {member.user.bio}
                </p>
              </div>
            )}

            {/* Teams pills — surfaces the teams they belong to. */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Teams</h3>
              {member.teams.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {member.teams.map((t) => (
                    <Badge key={t.id} variant="secondary" className="px-2.5 py-1">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not on any team yet.</p>
              )}
            </div>

            <Separator />

            <BadgesSection clubId={clubId} userId={member.user.id} />
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
        <span className="text-xs  font-medium">{label}</span>
      </div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badges section — shown inside MemberDetailSheet. Members see awarded
// badges only; executives additionally get an "Award badge" dropdown, a
// "Create badge" button, and a small revoke (X) on each awarded badge.
// ---------------------------------------------------------------------------

const EMOJI_CHOICES: string[] = [
  "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅", "⭐", "🌟", "💎", "👑",
  "🔥", "⚡", "💪", "🎯", "🚀", "🌈", "🎉", "✨", "💖", "🙌",
  "🌱", "🌿", "🌳", "🍀", "🌻", "🦋", "🐝", "🐬", "🐾", "🦉",
  "📚", "🎨", "🎵", "⚽", "🏀", "🎮", "🧩", "💡", "🔬", "🦾",
]

function BadgesSection({ clubId, userId }: { clubId: string; userId: string }) {
  const isExec = useAppStore((s) => s.currentClub?.role) === "executive"
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery<MemberBadgesResponse>({
    queryKey: ["member-badges", clubId, userId],
    queryFn: () => api(`/api/clubs/${clubId}/members/${userId}/badges`),
    enabled: !!clubId && !!userId,
    staleTime: 60_000,
  })

  const awardMut = useMutation({
    mutationFn: (badgeId: string) =>
      api(`/api/clubs/${clubId}/members/${userId}/badges`, {
        method: "POST",
        json: { badgeId },
      }),
    onSuccess: () => {
      toast.success("Badge awarded")
      qc.invalidateQueries({ queryKey: ["member-badges", clubId, userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const revokeMut = useMutation({
    mutationFn: (badgeId: string) =>
      api(`/api/clubs/${clubId}/members/${userId}/badges`, {
        method: "DELETE",
        json: { badgeId },
      }),
    onSuccess: () => {
      toast.success("Badge revoked")
      qc.invalidateQueries({ queryKey: ["member-badges", clubId, userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const badges = data?.badges ?? []
  const awarded = badges.filter((b) => b.awarded)

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-section-title flex items-center gap-2">
          <Trophy className="h-4 w-4 text-club" /> Badges
        </h3>
        {isExec && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Create badge
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="club"
                  disabled={isLoading || badges.length === 0 || awardMut.isPending}
                >
                  {awardMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Award className="h-3.5 w-3.5" />
                  )}
                  Award badge
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-60 max-h-72 overflow-y-auto scrollbar-thin"
              >
                <DropdownMenuLabel>Award a badge</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {badges.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    No badges yet — create one first.
                  </div>
                ) : (
                  badges.map((b) => (
                    <DropdownMenuItem
                      key={b.id}
                      disabled={b.awarded || awardMut.isPending}
                      onClick={() => awardMut.mutate(b.id)}
                    >
                      <span className="mr-2 text-base leading-none">{b.emoji}</span>
                      <span className="flex-1 truncate">{b.name}</span>
                      {b.awarded && (
                        <span className="ml-2 text-xs uppercase font-semibold text-muted-foreground">
                          Awarded
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      ) : awarded.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          No badges awarded yet.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {awarded.map((b) => {
            const tip = b.description
              ? `${b.description}\nAwarded by ${b.awardedByName ?? "an executive"}${
                  b.awardedAt ? ` · ${relativeTime(b.awardedAt)}` : ""
                }`
              : `Awarded by ${b.awardedByName ?? "an executive"}${
                  b.awardedAt ? ` · ${relativeTime(b.awardedAt)}` : ""
                }`
            return (
              <div
                key={b.id}
                title={tip}
                className="group flex items-center gap-1.5 rounded-lg bg-club-muted px-2.5 py-1.5 text-club"
              >
                <span aria-hidden className="text-base leading-none">
                  {b.emoji}
                </span>
                <span className="text-xs font-semibold">{b.name}</span>
                {isExec && (
                  <button
                    type="button"
                    onClick={() => revokeMut.mutate(b.id)}
                    disabled={revokeMut.isPending}
                    aria-label={`Revoke ${b.name} badge`}
                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-club/60 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isExec && (
        <CreateBadgeDialog
          clubId={clubId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() =>
            qc.invalidateQueries({ queryKey: ["member-badges", clubId, userId] })
          }
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create badge dialog — exec-only form for defining a new club badge.
// ---------------------------------------------------------------------------

function CreateBadgeDialog({
  clubId,
  open,
  onOpenChange,
  onCreated,
}: {
  clubId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("🏆")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setName("")
    setEmoji("🏆")
    setDescription("")
    setSubmitting(false)
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      // Defer reset so the close animation doesn't jump.
      setTimeout(reset, 200)
    }
    onOpenChange(v)
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Badge name is required")
      return
    }
    setSubmitting(true)
    try {
      await api(`/api/clubs/${clubId}/badges`, {
        method: "POST",
        json: {
          name: name.trim(),
          emoji: emoji.trim() || "🏆",
          description: description.trim() || undefined,
        },
      })
      toast.success("Badge created")
      onCreated()
      handleOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || "Failed to create badge")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-4 w-4" /> Create a new badge
          </DialogTitle>
          <DialogDescription>
            Custom badges can be awarded to any member of this club. You can
            create as many as you like.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 sm:p-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="badge-name">Badge name</Label>
            <Input
              id="badge-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="e.g. Best Member, MVP, Top Volunteer"
              maxLength={60}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{name.length}/60</p>
          </div>

          <div className="space-y-2">
            <Label>Emoji</Label>
            <div className="rounded-lg border p-2 max-h-36 overflow-y-auto scrollbar-thin">
              <div className="grid grid-cols-10 gap-0.5">
                {EMOJI_CHOICES.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={cn(
                      "flex items-center justify-center rounded p-1.5 text-xl leading-none transition-colors hover:bg-accent min-h-9",
                      emoji === em && "bg-club-muted ring-1 ring-club"
                    )}
                    aria-label={`Select emoji ${em}`}
                    aria-pressed={emoji === em}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
                placeholder="🏆"
                className="w-24 text-center text-xl"
                maxLength={8}
                aria-label="Custom emoji"
              />
              <p className="text-xs text-muted-foreground">
                Or paste your own emoji.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="badge-desc">Description (optional)</Label>
            <Textarea
              id="badge-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 280))}
              placeholder="What does this badge recognize?"
              rows={3}
              maxLength={280}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/280
            </p>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="club"
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Plus className="h-4 w-4 mr-1.5" />
            )}
            Create badge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
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
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 sm:p-0">
            <ImportResults result={result} onAgain={reset} onCopyCode={handleCopyCode} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 sm:p-0 space-y-4">
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
                <div className="rounded-md border border-danger/30 bg-danger-subtle dark:border-danger/40 dark:bg-danger-subtle px-3 py-2 text-xs text-danger-foreground dark:text-danger-foreground">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
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
          icon={<UserPlus className="h-4 w-4 text-warning-foreground" />}
          label="Pending invites"
          value={result.pendingInvites.length}
        />
        <ResultStat
          icon={<AlertTriangle className="h-4 w-4 text-danger-foreground" />}
          label="Invalid"
          value={result.invalid.length}
        />
      </div>

      {result.added.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
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
        <div className="rounded-md border border-warning/30 bg-warning-subtle dark:border-amber-900 dark:bg-warning-subtle/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-medium text-warning-foreground dark:text-warning-foreground flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Pending invites ({result.pendingInvites.length})
              </h4>
              <p className="text-xs text-warning-foreground dark:text-warning-foreground mt-1">
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
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-warning/30/40 dark:border-amber-800/40 last:border-0">
                <span className="truncate text-warning-foreground dark:text-warning-foreground">{p.name}</span>
                <span className="text-warning-foreground dark:text-warning-foreground truncate ml-2">{p.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.alreadyMembers.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
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
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5 text-danger-foreground">
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

      <p className="text-xs text-muted-foreground text-center">
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
        <span className="text-xs  font-medium text-muted-foreground">
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
    <div className="space-y-6">
      {/* Leadership row skeleton */}
      <section className="space-y-3">
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="card-quiet rounded-xl p-5 space-y-4 border-t-2 border-t-violet-400"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-14 w-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-2.5 w-44" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-24 rounded-full" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* All members skeleton */}
      <section className="space-y-3">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card-quiet rounded-xl p-5 space-y-4 border-t-2 border-t-club/30"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-44" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-24 rounded-full" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// `UserCog` icon imported but not used in the visible UI; keep the import
// to avoid churn in other files.
void UserCog
