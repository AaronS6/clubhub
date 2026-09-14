"use client"

import { useRef, useState, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { api, apiUpload } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { usePollingFallback } from "@/lib/realtime-store"
import { toast } from "sonner"
import { PageHeader, StatusBadge, EmptyState, TableSkeleton, relativeTime } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
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
  Clock,
  Plus,
  Download,
  Upload,
  Trash2,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  History,
  ChevronDown,
  Calendar,
} from "lucide-react"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"

interface HoursItem {
  id: string
  clubId: string
  userId: string
  dateOfService: string
  hours: number
  reasonText: string
  proofFileUrl: string | null
  status: "pending" | "approved" | "rejected"
  reviewedBy: string | null
  reviewComment: string | null
  submittedAt: string
  reviewedAt: string | null
  category: { id: string; name: string } | null
  user?: { id: string; name: string }
  reviewer?: { id: string; name: string } | null
}

interface HoursResponse {
  items: HoursItem[]
  totals: { approvedHours: number }
  clubHoursGoal: number
  myRole: "member" | "executive"
  myUserId: string
  filteredUserId: string | null
}

interface CategoryResponse {
  categories: { id: string; name: string; hoursCount: number; createdAt: string }[]
  myRole: "member" | "executive"
}

function statusKind(s: HoursItem["status"]) {
  return s as "pending" | "approved" | "rejected"
}

function fmtDate(d: string) {
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function HoursView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const isExec = useAppStore((s) => s.currentClub?.role) === "executive"
  const qc = useQueryClient()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [period, setPeriod] = useState<string>("this_month")

  const hoursQuery = useQuery<HoursResponse>({
    queryKey: ["hours", clubId],
    queryFn: () => api<HoursResponse>(`/api/clubs/${clubId}/hours`),
    enabled: !!clubId,
    staleTime: 15_000,
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(10000),
  })

  const catsQuery = useQuery<CategoryResponse>({
    queryKey: ["hours-categories", clubId],
    queryFn: () => api<CategoryResponse>(`/api/clubs/${clubId}/hours/categories`),
    enabled: !!clubId,
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/clubs/${clubId}/hours/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Entry deleted")
      qc.invalidateQueries({ queryKey: ["hours", clubId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ---- Time-period filtering + grouping ----------------------------------
  // The API returns all items; we filter + group client-side based on the
  // selected period. For "this_year"/"last_year" we group by month; for
  // "all_time" we group by year and stash pre-current-year groups in an
  // "older" bucket so they can be collapsed behind an "Older entries" trigger.
  // NOTE: this useMemo is placed BEFORE the `if (!clubId)` early return so
  // React's rules-of-hooks are satisfied (hooks must run unconditionally).
  type Group = { key: string; label: string; items: HoursItem[] }
  const { currentGroups, olderGroups } = useMemo<{ currentGroups: Group[]; olderGroups: Group[] }>(() => {
    const data = hoursQuery.data
    if (!data) return { currentGroups: [], olderGroups: [] }
    const now = new Date()
    const thisYear = now.getFullYear()
    const thisMonth = now.getMonth()

    // --- Filter by period ---
    let filtered = data.items
    if (period === "this_month") {
      filtered = data.items.filter((it) => {
        const d = new Date(it.dateOfService)
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth
      })
    } else if (period === "last_month") {
      const lm = new Date(thisYear, thisMonth - 1, 1)
      filtered = data.items.filter((it) => {
        const d = new Date(it.dateOfService)
        return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
      })
    } else if (period === "this_year") {
      filtered = data.items.filter((it) => new Date(it.dateOfService).getFullYear() === thisYear)
    } else if (period === "last_year") {
      filtered = data.items.filter((it) => new Date(it.dateOfService).getFullYear() === thisYear - 1)
    }
    // "all_time" — no filter

    // --- Group ---
    // Sort filtered items by dateOfService descending (most recent first).
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.dateOfService).getTime() - new Date(a.dateOfService).getTime(),
    )

    if (period === "this_year" || period === "last_year") {
      // Group by month, most recent first.
      const map = new Map<string, Group>()
      for (const it of sorted) {
        const d = new Date(it.dateOfService)
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`
        const label = d.toLocaleDateString(undefined, { year: "numeric", month: "long" })
        const existing = map.get(key)
        if (existing) {
          existing.items.push(it)
        } else {
          map.set(key, { key, label, items: [it] })
        }
      }
      return { currentGroups: [...map.values()], olderGroups: [] }
    }

    if (period === "all_time") {
      // Group by year. Current year → currentGroups (shown directly); older
      // years → olderGroups (collapsed behind "Older entries").
      const currentMap = new Map<string, Group>()
      const olderMap = new Map<string, Group>()
      for (const it of sorted) {
        const d = new Date(it.dateOfService)
        const y = d.getFullYear()
        const key = String(y)
        const label = String(y)
        const target = y === thisYear ? currentMap : olderMap
        const existing = target.get(key)
        if (existing) {
          existing.items.push(it)
        } else {
          target.set(key, { key, label, items: [it] })
        }
      }
      return {
        currentGroups: [...currentMap.values()],
        olderGroups: [...olderMap.values()],
      }
    }

    // this_month / last_month — single flat group (no header).
    return {
      currentGroups: [{ key: "flat", label: "", items: sorted }],
      olderGroups: [],
    }
  }, [hoursQuery.data, period])

  const filteredCount = currentGroups.reduce((n, g) => n + g.items.length, 0) + olderGroups.reduce((n, g) => n + g.items.length, 0)

  function handleExport() {
    if (!clubId) return
    window.location.href = `/api/clubs/${clubId}/hours/export`
  }

  if (!clubId) {
    return <div className="p-8 text-muted-foreground">Loading…</div>
  }

  const data = hoursQuery.data
  const approvedHours = data?.totals.approvedHours ?? 0
  const goal = data?.clubHoursGoal ?? 0
  const progressPct = goal > 0 ? Math.min(100, Math.round((approvedHours / goal) * 100)) : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Hours"
        description="Log and track your service contributions to the club."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.items.length === 0}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button size="sm" variant="club" onClick={() => setSubmitOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>Submit Hours</span>
            </Button>
          </>
        }
      />

      {/* Summary card */}
      <div className="card-quiet rounded-xl p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-club-muted text-club">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="text-caption-medium text-muted-foreground">Total approved hours</div>
              <div className="text-3xl font-semibold tracking-tight">
                {hoursQuery.isLoading ? <Skeleton className="h-9 w-20" /> : approvedHours}
              </div>
            </div>
          </div>
          {goal > 0 && (
            <div className="flex-1 sm:max-w-xs">
              <div className="flex items-center justify-between text-caption-medium mb-1.5">
                <span className="text-muted-foreground">Goal: {goal}h</span>
                <span className="font-medium">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2.5" />
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="h-4 w-4" />
            <span>History</span>
            {data && filteredCount > 0 && (
              <span className="text-caption text-muted-foreground/70">
                · {filteredCount} {filteredCount === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>
          {/* Time period filter — client-side filtering/grouping. */}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px] sm:w-[180px] h-9" aria-label="Filter by time period">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
              <SelectItem value="this_year">This year</SelectItem>
              <SelectItem value="last_year">Last year</SelectItem>
              <SelectItem value="all_time">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hoursQuery.isLoading ? (
          <TableSkeleton rows={5} />
        ) : hoursQuery.error ? (
          <EmptyState
            icon={<XCircle className="h-8 w-8" />}
            title="Couldn't load hours"
            description={hoursQuery.error.message}
            action={
              <Button variant="outline" size="sm" onClick={() => hoursQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-8 w-8" />}
            title="No service hours yet"
            description="Log your first contribution! ⏰"
            action={
              <Button size="sm" variant="club" onClick={() => setSubmitOpen(true)}>
                <Plus className="h-4 w-4" /> Submit Hours
              </Button>
            }
          />
        ) : filteredCount === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8" />}
            title="No entries in this period"
            description="Try a different time period — or switch to “All time” to see everything."
          />
        ) : (
          <>
            {/* Current groups (this month / this year months / current year) */}
            {currentGroups.map((g) => (
              <div key={g.key} className="space-y-2">
                {g.label && (
                  <div className="flex items-center gap-2 px-1">
                    <h3 className="text-card-title">{g.label}</h3>
                    <span className="text-caption text-muted-foreground">
                      {g.items.length} {g.items.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                )}
                {/* Desktop: table */}
                <div className="card-quiet rounded-xl p-0 overflow-hidden hidden md:block">
                  <Table>
                    <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:bg-muted/50 [&_th]:backdrop-blur-sm [&_th]:z-10">
                      <TableRow>
                        <TableHead className="min-w-[7rem]">Date</TableHead>
                        <TableHead className="min-w-[3rem]">Hours</TableHead>
                        <TableHead className="min-w-[12rem]">Reason</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Proof</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((it) => (
                        <HoursRow
                          key={it.id}
                          item={it}
                          canDelete={isExec || it.status === "pending"}
                          onDelete={() => deleteMutation.mutate(it.id)}
                          deleting={deleteMutation.isPending && deleteMutation.variables === it.id}
                          goal={data?.clubHoursGoal ?? 0}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile: stacked cards */}
                <div className="md:hidden space-y-3">
                  {g.items.map((it) => (
                    <HoursCard
                      key={it.id}
                      item={it}
                      canDelete={isExec || it.status === "pending"}
                      onDelete={() => deleteMutation.mutate(it.id)}
                      deleting={deleteMutation.isPending && deleteMutation.variables === it.id}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Older entries (all_time only) — collapsed by default. */}
            {olderGroups.length > 0 && (
              <Collapsible className="space-y-2">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border bg-card/50 px-3 py-2.5 text-left text-sm hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground [[data-state=open]_&]:rotate-180 transition-transform" />
                    <span className="font-medium">Older entries</span>
                    <span className="text-caption text-muted-foreground">
                      {olderGroups.reduce((n, g) => n + g.items.length, 0)} entries ·{" "}
                      {olderGroups.map((g) => g.label).join(", ")}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4">
                  {olderGroups.map((g) => (
                    <div key={g.key} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <h3 className="text-card-title">{g.label}</h3>
                        <span className="text-caption text-muted-foreground">
                          {g.items.length} {g.items.length === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                      <div className="card-quiet rounded-xl p-0 overflow-hidden hidden md:block">
                        <Table>
                          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:bg-muted/50 [&_th]:backdrop-blur-sm [&_th]:z-10">
                            <TableRow>
                              <TableHead className="min-w-[7rem]">Date</TableHead>
                              <TableHead className="min-w-[3rem]">Hours</TableHead>
                              <TableHead className="min-w-[12rem]">Reason</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Proof</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Submitted</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.items.map((it) => (
                              <HoursRow
                                key={it.id}
                                item={it}
                                canDelete={isExec || it.status === "pending"}
                                onDelete={() => deleteMutation.mutate(it.id)}
                                deleting={deleteMutation.isPending && deleteMutation.variables === it.id}
                                goal={data?.clubHoursGoal ?? 0}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="md:hidden space-y-3">
                        {g.items.map((it) => (
                          <HoursCard
                            key={it.id}
                            item={it}
                            canDelete={isExec || it.status === "pending"}
                            onDelete={() => deleteMutation.mutate(it.id)}
                            deleting={deleteMutation.isPending && deleteMutation.variables === it.id}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>

      <SubmitHoursDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        clubId={clubId}
        categories={catsQuery.data?.categories ?? []}
        categoriesLoading={catsQuery.isLoading}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ["hours", clubId] })
        }}
      />
    </div>
  )
}

function HoursRow({
  item,
  canDelete,
  onDelete,
  deleting,
  goal,
}: {
  item: HoursItem
  canDelete: boolean
  onDelete: () => void
  deleting: boolean
  /** Monthly club hours goal — powers the inline progress bar in the Hours cell.
      0/undefined = no bar (spec: "If no goal, skip the bar"). Purely visual. */
  goal?: number
}) {
  const pct = goal && goal > 0 ? Math.min(100, Math.round((item.hours / goal) * 100)) : 0
  return (
    <TableRow className="hover:bg-muted/30 transition-colors">
      <TableCell className="text-xs text-muted-foreground">{fmtDate(item.dateOfService)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tabular-nums">{item.hours}</span>
          {goal && goal > 0 && pct > 0 && (
            <span
              className="h-1 w-16 shrink-0 rounded-full bg-muted overflow-hidden"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-club"
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-xs">
        <div className="line-clamp-2 text-sm">{item.reasonText}</div>
        {item.status === "rejected" && item.reviewComment && (
          <div className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2">
            "{item.reviewComment}"
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.category?.name ?? <span className="text-muted-foreground/60">—</span>}
      </TableCell>
      <TableCell>
        <ProofLink url={item.proofFileUrl} />
      </TableCell>
      <TableCell>
        <StatusBadge status={statusKind(item.status)} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{relativeTime(item.submittedAt)}</TableCell>
      <TableCell className="text-right">
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete entry"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function HoursCard({
  item,
  canDelete,
  onDelete,
  deleting,
}: {
  item: HoursItem
  canDelete: boolean
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="card-quiet rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-body-medium">{fmtDate(item.dateOfService)}</div>
          <div className="text-caption">
            <span className="font-mono tabular-nums text-foreground">{item.hours}</span> hour{item.hours === 1 ? "" : "s"}
            {item.category && <span> · {item.category.name}</span>}
          </div>
        </div>
        <StatusBadge status={statusKind(item.status)} />
      </div>
      <div className="text-body">{item.reasonText}</div>
      {item.status === "rejected" && item.reviewComment && (
        <div className="text-caption text-red-600 dark:text-red-400">
          <span className="font-medium">Reason:</span> {item.reviewComment}
        </div>
      )}
      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="text-caption min-w-0">
          Submitted {relativeTime(item.submittedAt)}
          {item.reviewer && item.reviewedAt && (
            <span className="truncate"> · reviewed by {item.reviewer.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.proofFileUrl && <ProofLink url={item.proofFileUrl} compact />}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Delete entry"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProofLink({ url, compact }: { url: string | null; compact?: boolean }) {
  if (!url) return <span className="text-caption text-muted-foreground/60">—</span>
  const isPdf = url.toLowerCase().endsWith(".pdf")
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-caption-medium text-club hover:bg-club-subtle",
        compact && "px-1.5 py-1"
      )}
    >
      {isPdf ? <FileText className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
      <span>{isPdf ? "PDF" : "Image"}</span>
    </a>
  )
}

function SubmitHoursDialog({
  open,
  onOpenChange,
  clubId,
  categories,
  categoriesLoading,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clubId: string
  categories: { id: string; name: string }[]
  categoriesLoading: boolean
  onSubmitted: () => void
}) {
  const qc = useQueryClient()
  const [date, setDate] = useState<string>(todayISO())
  const [hours, setHours] = useState<string>("")
  const [reason, setReason] = useState<string>("")
  const [categoryId, setCategoryId] = useState<string>("__none__")
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofLabel, setProofLabel] = useState<string>("")
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setDate(todayISO())
    setHours("")
    setReason("")
    setCategoryId("__none__")
    setProofUrl(null)
    setProofLabel("")
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const res = await apiUpload<{ url: string }>(`/api/clubs/${clubId}/hours/upload`, fd)
      setProofUrl(res.url)
      setProofLabel(f.name)
      toast.success("Proof uploaded")
    } catch (err: any) {
      toast.error(err.message || "Upload failed")
      setProofUrl(null)
      setProofLabel("")
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const hoursNum = Number(hours)
    if (!date) return toast.error("Please pick a date")
    if (!isFinite(hoursNum) || hoursNum <= 0) return toast.error("Enter a valid number of hours")
    if (!reason.trim()) return toast.error("Please describe what you did")

    setSubmitting(true)
    try {
      await api(`/api/clubs/${clubId}/hours`, {
        method: "POST",
        json: {
          dateOfService: new Date(date).toISOString(),
          hours: hoursNum,
          reasonText: reason.trim(),
          categoryId: categoryId !== "__none__" ? categoryId : undefined,
          proofFileUrl: proofUrl ?? undefined,
        },
      })
      toast.success("Hours submitted for review")
      reset()
      onOpenChange(false)
      onSubmitted()
      qc.invalidateQueries({ queryKey: ["hours-categories", clubId] })
    } catch (err: any) {
      toast.error(err.message || "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Submit service hours</DialogTitle>
          <DialogDescription>
            Record the hours you volunteered. An executive will review your submission.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="hours-date">Date</Label>
                <Input
                  id="hours-date"
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hours-num">Hours</Label>
                <Input
                  id="hours-num"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0.1"
                  max="1000"
                  placeholder="e.g. 3.5 or 0.25"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hours-reason">What did you do?</Label>
              <Textarea
                id="hours-reason"
                rows={3}
                placeholder="e.g. Helped set up the spring fair booths and cleaned up afterwards."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                required
              />
              <div className="text-right text-xs text-muted-foreground">{reason.length}/2000</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hours-category">Category (optional)</Label>
              {categoriesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="hours-category" className="w-full">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Proof file (optional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFile}
                  className="hidden"
                  id="hours-proof-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>{uploading ? "Uploading…" : proofUrl ? "Replace file" : "Upload file"}</span>
                </Button>
                {proofUrl ? (
                  <span className="text-caption-medium text-club truncate flex items-center gap-1 min-w-0">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{proofLabel || "uploaded"}</span>
                  </span>
                ) : (
                  <span className="text-caption text-muted-foreground">JPG, PNG, WebP, or PDF (max 10MB)</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading} variant="club">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Submitting…" : "Submit for review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
