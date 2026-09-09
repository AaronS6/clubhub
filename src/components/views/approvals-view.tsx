"use client"

import { useState } from "react"
import Image from "next/image"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { useViewingIndicator, useViewingCount } from "@/lib/use-presence"
import { cn } from "@/lib/utils"
import { usePollingFallback } from "@/lib/realtime-store"
import { toast } from "sonner"
import { PageHeader, StatusBadge, EmptyState, TableSkeleton, relativeTime } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  AlertTriangle,
  Inbox,
  Filter,
  Eye,
} from "lucide-react"

interface HoursItem {
  id: string
  clubId: string
  userId: string
  dateOfService: string
  hours: number
  reasonText: string
  proofFileUrl: string | null
  status: "pending" | "approved" | "rejected"
  submittedAt: string
  category: { id: string; name: string } | null
  user: { id: string; name: string; avatarUrl?: string | null }
  reviewer?: { id: string; name: string } | null
}

interface ApprovalsResponse {
  items: HoursItem[]
  totals: { approvedHours: number }
  clubHoursGoal: number
  myRole: "member" | "executive"
  myUserId: string
  filteredUserId: string | null
}

interface MembersResponse {
  members: {
    membershipId: string
    role: "member" | "executive"
    joinedAt: string
    user: { id: string; name: string; email: string; avatarUrl?: string | null; bio?: string | null }
    teams: { id: string; name: string }[]
    approvedHours: number
  }[]
  myUserId: string
  myRole: "member" | "executive"
}

function fmtDate(d: string) {
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function fmtDateInput(d: string) {
  if (!d) return ""
  const date = new Date(d)
  if (isNaN(date.getTime())) return ""
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function ApprovalsView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [memberFilter, setMemberFilter] = useState<string>("all")
  const [fromDate, setFromDate] = useState<string>("")
  const [toDate, setToDate] = useState<string>("")
  const [rejectTarget, setRejectTarget] = useState<HoursItem | null>(null)
  const [rejectBulk, setRejectBulk] = useState(false)

  const queryParams = new URLSearchParams()
  queryParams.set("scope", "all")
  queryParams.set("status", "pending")
  if (memberFilter !== "all") queryParams.set("userId", memberFilter)

  const approvalsQuery = useQuery<ApprovalsResponse>({
    queryKey: ["approvals", clubId, memberFilter, fromDate, toDate],
    queryFn: () => api<ApprovalsResponse>(`/api/clubs/${clubId}/hours?${queryParams.toString()}`),
    enabled: !!clubId,
    // Realtime is primary; poll only as a fallback while the socket is down
    // (was previously always-on 5s polling — now degrades to polling only
    // when the realtime connection is lost). The approvals queue benefits
    // from feeling live, so the fallback interval stays tight at 5s.
    refetchInterval: usePollingFallback(5000),
    staleTime: 4_000,
  })

  const membersQuery = useQuery<MembersResponse>({
    queryKey: ["members", clubId],
    queryFn: () => api<MembersResponse>(`/api/clubs/${clubId}/members`),
    enabled: !!clubId,
    staleTime: 60_000,
  })

  // Presence — report we're viewing approvals, and track how many OTHER execs
  // are doing the same so we don't double-review the same entry.
  const myUserId = approvalsQuery.data?.myUserId
  useViewingIndicator(clubId ?? null, approvalsQuery.data?.myRole === "executive" ? "approvals" : null)
  const otherViewers = useViewingCount(clubId ?? null, "approvals", myUserId)

  const items = (approvalsQuery.data?.items ?? []).filter((it) => {
    // date range filter (by dateOfService)
    if (fromDate) {
      if (fmtDateInput(it.dateOfService) < fromDate) return false
    }
    if (toDate) {
      if (fmtDateInput(it.dateOfService) > toDate) return false
    }
    return true
  })

  const visibleIds = new Set(items.map((i) => i.id))
  const selectedInScope = new Set([...selected].filter((id) => visibleIds.has(id)))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected((prev) => {
      const allSelected = items.every((it) => prev.has(it.id))
      if (allSelected) {
        const next = new Set(prev)
        items.forEach((it) => next.delete(it.id))
        return next
      } else {
        const next = new Set(prev)
        items.forEach((it) => next.add(it.id))
        return next
      }
    })
  }
  function clearSelected() {
    setSelected(new Set())
  }

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: "approved" | "rejected"; comment?: string }) =>
      api(`/api/clubs/${clubId}/hours/${id}`, {
        method: "PATCH",
        json: { status, reviewComment: comment },
      }),
    onSuccess: (_data, vars) => {
      toast.success(`Entry ${vars.status}`)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(vars.id)
        return next
      })
      qc.invalidateQueries({ queryKey: ["approvals", clubId] })
      qc.invalidateQueries({ queryKey: ["hours", clubId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status, comment }: { ids: string[]; status: "approved" | "rejected"; comment?: string }) =>
      api(`/api/clubs/${clubId}/hours/bulk-review`, {
        method: "POST",
        json: { hourIds: ids, status, reviewComment: comment },
      }),
    onSuccess: (data: any, vars) => {
      const n = data?.reviewed ?? vars.ids.length
      toast.success(`${n} entr${n === 1 ? "y" : "ies"} ${vars.status}`)
      clearSelected()
      qc.invalidateQueries({ queryKey: ["approvals", clubId] })
      qc.invalidateQueries({ queryKey: ["hours", clubId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleApprove(id: string) {
    reviewMutation.mutate({ id, status: "approved" })
  }

  if (!clubId) {
    return <div className="p-8 text-muted-foreground">Loading…</div>
  }

  // Gate: executive-only
  if (approvalsQuery.data && approvalsQuery.data.myRole !== "executive") {
    return (
      <div className="space-y-6">
        <PageHeader title="Approvals" description="Review pending service hour submissions." />
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title="Not authorized"
          description="Only executives can review service hour submissions. Ask a club executive if you believe this is a mistake."
        />
      </div>
    )
  }

  const allSelected = items.length > 0 && items.every((it) => selectedInScope.has(it.id))
  const pendingCount = items.length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Review pending service hour submissions from club members."
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {otherViewers > 0 && (
              <span
                className="chip-neutral inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption-medium"
                title={otherViewers === 1 ? "1 other executive is viewing approvals" : `${otherViewers} other executives are viewing approvals`}
              >
                <Eye className="h-3.5 w-3.5" />
                {otherViewers === 1 ? "1 other viewing" : `${otherViewers} others viewing`}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="h-4 w-4" />
              <span className="tabular-nums">{pendingCount}</span> pending
            </span>
          </div>
        }
      />

      {/* Filters */}
      <div className="card-quiet p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="space-y-2 sm:min-w-[14rem]">
              <Label className="text-xs text-muted-foreground">Member</Label>
              <Select value={memberFilter} onValueChange={(v) => { setMemberFilter(v); clearSelected() }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {(membersQuery.data?.members ?? []).map((m) => (
                    <SelectItem key={m.user.id} value={m.user.id}>
                      {m.user.name}
                      {m.user.id === approvalsQuery.data?.myUserId ? " (you)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="filter-from"
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); clearSelected() }}
                className="w-full sm:w-40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="filter-to"
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); clearSelected() }}
                className="w-full sm:w-40"
              />
            </div>
            {(memberFilter !== "all" || fromDate || toDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setMemberFilter("all"); setFromDate(""); setToDate(""); clearSelected() }}
              >
                <Filter className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
      </div>

      {/* Bulk actions — sticky on mobile so the bulk bar is always reachable */}
      {selectedInScope.size > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-background/95 backdrop-blur p-2 shadow-md max-w-full">
          <span className="text-caption-medium text-muted-foreground px-2">
            {selectedInScope.size} selected
          </span>
          <Button
            size="sm"
            variant="club"
            disabled={bulkMutation.isPending}
            onClick={() => {
              bulkMutation.mutate({ ids: [...selectedInScope], status: "approved" })
            }}
          >
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            disabled={bulkMutation.isPending}
            onClick={() => setRejectBulk(true)}
          >
            <XCircle className="h-4 w-4" /> Reject
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelected}>
            Clear
          </Button>
        </div>
      )}

      {/* Queue */}
      {approvalsQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : approvalsQuery.error ? (
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Couldn't load approvals"
          description={approvalsQuery.error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => approvalsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" />}
          title="Inbox zero"
          description="There are no pending service hour submissions to review right now. New submissions will appear here automatically."
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="card-quiet p-0 overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[10rem]">Member</TableHead>
                  <TableHead className="min-w-[7rem]">Date</TableHead>
                  <TableHead className="min-w-[3rem]">Hours</TableHead>
                  <TableHead className="min-w-[16rem]">Reason</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Proof</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <ApprovalRow
                    key={it.id}
                    item={it}
                    checked={selectedInScope.has(it.id)}
                    onToggle={() => toggle(it.id)}
                    onApprove={() => handleApprove(it.id)}
                    onReject={() => setRejectTarget(it)}
                    reviewing={
                      (reviewMutation.isPending && reviewMutation.variables?.id === it.id) ||
                      (bulkMutation.isPending && selectedInScope.has(it.id))
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" id="select-all-mobile" />
                <Label htmlFor="select-all-mobile" className="text-sm text-muted-foreground">
                  Select all ({items.length})
                </Label>
              </div>
            </div>
            {items.map((it) => (
              <ApprovalCard
                key={it.id}
                item={it}
                checked={selectedInScope.has(it.id)}
                onToggle={() => toggle(it.id)}
                onApprove={() => handleApprove(it.id)}
                onReject={() => setRejectTarget(it)}
                reviewing={
                  (reviewMutation.isPending && reviewMutation.variables?.id === it.id) ||
                  (bulkMutation.isPending && selectedInScope.has(it.id))
                }
              />
            ))}
          </div>
        </>
      )}

      {/* Reject dialog (single + bulk) */}
      <RejectDialog
        open={rejectTarget !== null || rejectBulk}
        onClose={() => { setRejectTarget(null); setRejectBulk(false) }}
        count={rejectBulk ? selectedInScope.size : rejectTarget ? 1 : 0}
        onSubmit={async (comment) => {
          if (rejectBulk) {
            bulkMutation.mutate({ ids: [...selectedInScope], status: "rejected", comment })
          } else if (rejectTarget) {
            reviewMutation.mutate({ id: rejectTarget.id, status: "rejected", comment })
          }
          setRejectTarget(null)
          setRejectBulk(false)
        }}
        submitting={reviewMutation.isPending || bulkMutation.isPending}
      />
    </div>
  )
}

function ApprovalRow({
  item,
  checked,
  onToggle,
  onApprove,
  onReject,
  reviewing,
}: {
  item: HoursItem
  checked: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  reviewing: boolean
}) {
  return (
    <TableRow data-state={checked ? "selected" : undefined}>
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select entry from ${item.user?.name ?? "member"}`} />
      </TableCell>
      <TableCell className="font-medium">{item.user?.name ?? "Unknown"}</TableCell>
      <TableCell>{fmtDate(item.dateOfService)}</TableCell>
      <TableCell className="font-mono tabular-nums">{item.hours}</TableCell>
      <TableCell className="max-w-xs">
        <div className="line-clamp-2 text-sm">{item.reasonText}</div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.category?.name ?? <span className="text-muted-foreground/60">—</span>}
      </TableCell>
      <TableCell>
        <ProofThumb url={item.proofFileUrl} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{relativeTime(item.submittedAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 chip-approved hover:opacity-90"
            onClick={onApprove}
            disabled={reviewing}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden lg:inline">Approve</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 chip-rejected hover:opacity-90"
            onClick={onReject}
            disabled={reviewing}
          >
            <XCircle className="h-4 w-4" />
            <span className="hidden lg:inline">Reject</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ApprovalCard({
  item,
  checked,
  onToggle,
  onApprove,
  onReject,
  reviewing,
}: {
  item: HoursItem
  checked: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  reviewing: boolean
}) {
  return (
    <div
      data-state={checked ? "selected" : undefined}
      className={cn("card-quiet p-4 space-y-3", checked && "ring-2 ring-club/50 border-club/30")}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label="Select entry" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-body-medium truncate">{item.user?.name ?? "Unknown"}</div>
            <StatusBadge status="pending" />
          </div>
          <div className="text-caption">
            <span className="font-mono tabular-nums text-foreground">{item.hours}</span>
            {item.hours === 1 ? " hour" : " hours"} · {fmtDate(item.dateOfService)}
            {item.category && <span> · {item.category.name}</span>}
          </div>
        </div>
      </div>
      <div className="text-body">{item.reasonText}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <ProofThumb url={item.proofFileUrl} />
          <span className="text-caption text-muted-foreground truncate">Submitted {relativeTime(item.submittedAt)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 chip-approved hover:opacity-90"
            onClick={onApprove}
            disabled={reviewing}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 chip-rejected hover:opacity-90"
            onClick={onReject}
            disabled={reviewing}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProofThumb({ url }: { url: string | null }) {
  if (!url) return <span className="text-caption text-muted-foreground/60">—</span>
  const isPdf = url.toLowerCase().endsWith(".pdf")
  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-caption-medium text-club hover:bg-club-subtle"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF
      </a>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-md border"
      title="Open proof"
    >
      {/* proof thumbnail — `unoptimized` because proof files come from
          arbitrary user-uploaded sources (no remotePatterns configured). */}
      <Image
        src={url}
        alt="Proof of service"
        width={40}
        height={40}
        className="h-10 w-10 object-cover"
        loading="lazy"
        unoptimized
        onError={(e) => {
          // fall back to an icon link if image can't be decoded
          const t = e.currentTarget as HTMLImageElement
          t.style.display = "none"
          const parent = t.parentElement
          if (parent) {
            parent.innerHTML = '<span class="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-caption-medium text-club"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>Image</span>'
          }
        }}
      />
    </a>
  )
}

function RejectDialog({
  open,
  onClose,
  count,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  count: number
  onSubmit: (comment: string) => void
  submitting: boolean
}) {
  const [comment, setComment] = useState("")

  function handleClose() {
    setComment("")
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject submission{count > 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            {count > 0 ? `Rejecting ${count} entr${count === 1 ? "y" : "ies"}.` : null}
            {" "}Let the member know why (optional, but recommended).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-comment">Comment</Label>
          <Textarea
            id="reject-comment"
            rows={3}
            placeholder="e.g. Please provide more details about the activity, or attach a clearer proof photo."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
          />
          {!comment.trim() && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Without a comment, the member won&apos;t know what to fix. You can still reject.</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onSubmit(comment.trim())
              setComment("")
            }}
            disabled={submitting || count === 0}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject {count > 0 ? `${count} ${count === 1 ? "entry" : "entries"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
