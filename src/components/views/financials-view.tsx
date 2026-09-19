"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PageHeader, EmptyState } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreVertical, Pencil, Trash2, Loader2, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Wallet } from "lucide-react"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"

interface Transaction {
  id: string
  type: "revenue" | "expense"
  amount: number
  category: string
  description: string | null
  date: string
  createdBy: string | null
  creator?: { name: string } | null
}

// ── Animated count-up hook (respects prefers-reduced-motion) ──────────────
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0)
  const raf = useRef<number>(0)
  // Count-up animation intentionally calls setState inside a RAF loop.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced || target === 0) { setVal(target); return }
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setVal(target * eased)
      if (t < 1) raf.current = requestAnimationFrame(animate)
    }
    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  /* eslint-enable react-hooks/set-state-in-effect */
  return val
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FinancialsView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const isExec = useAppStore((s) => s.currentClub?.role === "executive")
  const [addOpen, setAddOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", clubId],
    queryFn: () => api<{ transactions: Transaction[] }>(`/api/clubs/${clubId}/transactions`).then(r => r.transactions),
    enabled: !!clubId,
  })

  const qc = useQueryClient()
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/clubs/${clubId}/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Transaction deleted"); qc.invalidateQueries({ queryKey: ["transactions", clubId] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!clubId) return <div className="p-8 text-muted-foreground">Loading…</div>

  const transactions = data ?? []
  const totalRevenue = transactions.filter(t => t.type === "revenue").reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
  const balance = totalRevenue - totalExpense
  const revenuePct = totalRevenue + totalExpense > 0 ? (totalRevenue / (totalRevenue + totalExpense)) * 100 : 0

  // This month's stats
  const now = new Date()
  const monthTx = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const monthRevenue = monthTx.filter(t => t.type === "revenue").reduce((s, t) => s + t.amount, 0)
  const monthExpense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)

  // Category breakdown
  const byCategory = new Map<string, { revenue: number; expense: number; count: number }>()
  for (const t of transactions) {
    const cat = t.category
    if (!byCategory.has(cat)) byCategory.set(cat, { revenue: 0, expense: 0, count: 0 })
    const c = byCategory.get(cat)!
    if (t.type === "revenue") c.revenue += t.amount
    else c.expense += t.amount
    c.count++
  }
  const categories = Array.from(byCategory.entries())
    .map(([cat, v]) => ({ cat, ...v, net: v.revenue - v.expense, total: v.revenue + v.expense }))
    .sort((a, b) => b.total - a.total)

  const maxCatTotal = Math.max(...categories.map(c => c.total), 1)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financials"
        description="Track your club's budget, revenue, and expenses."
        actions={
          isExec ? (
            <Button variant="club" onClick={() => setAddOpen(true)} size="sm">
              <Plus className="size-4" /> <span className="hidden sm:inline">Add entry</span>
            </Button>
          ) : undefined
        }
      />

      {/* ── Balance hero — the memorable centerpiece ────────────────────── */}
      <BalanceHero
        balance={balance}
        totalRevenue={totalRevenue}
        totalExpense={totalExpense}
        monthRevenue={monthRevenue}
        monthExpense={monthExpense}
      />

      {/* ── Revenue vs Expense ratio bar ─────────────────────────────────── */}
      {totalRevenue + totalExpense > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Revenue vs Expenses</span>
            <span className="text-muted-foreground tabular-nums">{revenuePct.toFixed(0)}% / {(100 - revenuePct).toFixed(0)}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-muted">
            <div
              className="h-full bg-success transition-all duration-700 ease-out"
              style={{ width: `${revenuePct}%` }}
            />
            <div
              className="h-full bg-danger transition-all duration-700 ease-out"
              style={{ width: `${100 - revenuePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-success-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> ${fmtMoney(totalRevenue)} in
            </span>
            <span className="inline-flex items-center gap-1.5 text-danger-foreground">
              <TrendingDown className="h-3.5 w-3.5" /> ${fmtMoney(totalExpense)} out
            </span>
          </div>
        </div>
      )}

      {/* ── Category breakdown — animated bars ──────────────────────────── */}
      {categories.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-card-title">By category</h3>
          <div className="space-y-2">
            {categories.map((c, i) => (
              <div key={c.cat} className="rounded-lg border border-border bg-card px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium truncate">{c.cat}</span>
                  <span className={cn("text-sm font-semibold tabular-nums shrink-0", c.net >= 0 ? "text-success-foreground" : "text-danger-foreground")}>
                    {c.net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(c.net))}
                  </span>
                </div>
                <div className="flex items-center gap-1 h-1.5 rounded-full overflow-hidden bg-muted">
                  {c.revenue > 0 && (
                    <div
                      className="h-full bg-success rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${(c.revenue / maxCatTotal) * 100}%`, transitionDelay: `${i * 50}ms` }}
                    />
                  )}
                  {c.expense > 0 && (
                    <div
                      className="h-full bg-danger rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${(c.expense / maxCatTotal) * 100}%`, transitionDelay: `${i * 50}ms` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  {c.revenue > 0 && <span className="text-success-foreground">+${fmtMoney(c.revenue)}</span>}
                  {c.expense > 0 && <span className="text-danger-foreground">-${fmtMoney(c.expense)}</span>}
                  <span>{c.count} {c.count === 1 ? "entry" : "entries"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transaction list ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-card-title">Transactions</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-8 w-8" />}
            title="No transactions yet"
            description={isExec ? "Add your first revenue or expense entry to start tracking your club's finances." : "Check back once executives start recording finances."}
            action={isExec ? <Button variant="club" size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add entry</Button> : undefined}
          />
        ) : (
          <div className="space-y-1.5">
            {transactions.map((t, i) => (
              <TransactionRow
                key={t.id}
                t={t}
                isExec={!!isExec}
                index={i}
                onDelete={() => deleteMut.mutate(t.id)}
                onEdit={() => setEditingTx(t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Add/Edit dialog ──────────────────────────────────────────────── */}
      {(addOpen || editingTx) && (
        <TransactionDialog
          clubId={clubId}
          open={!!(addOpen || editingTx)}
          onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditingTx(null) } }}
          editing={editingTx}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["transactions", clubId] }) }}
        />
      )}
    </div>
  )
}

// ── Balance hero with animated count-up ─────────────────────────────────────
function BalanceHero({ balance, totalRevenue, totalExpense, monthRevenue, monthExpense }: {
  balance: number; totalRevenue: number; totalExpense: number; monthRevenue: number; monthExpense: number
}) {
  const animated = useCountUp(balance)
  const isPositive = balance >= 0

  return (
    <div className="relative overflow-hidden rounded-xl border border-club/20 bg-club-subtle p-6 sm:p-8">
      {/* Decorative accent blob — adds life without being distracting */}
      <div aria-hidden className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-club/10 blur-3xl" />

      <div className="relative space-y-3">
        <span className="text-xs font-medium text-muted-foreground">Current balance</span>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-numeral", isPositive ? "text-club-ink" : "text-danger-foreground")}>
            {balance < 0 ? "-" : ""}${fmtMoney(Math.abs(animated))}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-subtle text-success-foreground">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
            <div>
              <span className="font-semibold tabular-nums">${fmtMoney(totalRevenue)}</span>
              <span className="text-muted-foreground ml-1">total revenue</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger-subtle text-danger-foreground">
              <ArrowDownRight className="h-3.5 w-3.5" />
            </span>
            <div>
              <span className="font-semibold tabular-nums">${fmtMoney(totalExpense)}</span>
              <span className="text-muted-foreground ml-1">total expenses</span>
            </div>
          </div>
        </div>

        {/* This month summary */}
        {(monthRevenue > 0 || monthExpense > 0) && (
          <div className="flex items-center gap-4 pt-2 border-t border-club/15 text-xs text-muted-foreground">
            <span>This month:</span>
            {monthRevenue > 0 && <span className="text-success-foreground font-medium">+${fmtMoney(monthRevenue)}</span>}
            {monthExpense > 0 && <span className="text-danger-foreground font-medium">-${fmtMoney(monthExpense)}</span>}
            <span className="font-medium tabular-nums">
              Net {monthRevenue - monthExpense >= 0 ? "+" : "-"}${fmtMoney(Math.abs(monthRevenue - monthExpense))}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transaction row ────────────────────────────────────────────────────────────
function TransactionRow({ t, isExec, index, onDelete, onEdit }: {
  t: Transaction; isExec: boolean; index: number; onDelete: () => void; onEdit: () => void
}) {
  const isRevenue = t.type === "revenue"
  return (
    <div
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-club/20 hover:bg-accent/30"
      style={{ animation: `fade-in 200ms ease-out ${Math.min(index * 40, 400)}ms both` }}
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110",
        isRevenue ? "bg-success-subtle text-success-foreground" : "bg-danger-subtle text-danger-foreground"
      )}>
        {isRevenue ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{t.category}</span>
          {t.description && <span className="text-xs text-muted-foreground truncate hidden sm:inline">· {t.description}</span>}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {t.creator?.name && ` · ${t.creator.name}`}
        </span>
      </div>
      <span className={cn(
        "text-sm font-semibold tabular-nums shrink-0",
        isRevenue ? "text-success-foreground" : "text-danger-foreground"
      )}>
        {isRevenue ? "+" : "-"}${fmtMoney(t.amount)}
      </span>
      {isExec && (
        <div onClick={(e) => e.stopPropagation()} role="presentation" className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity" aria-label="Actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger-foreground focus:text-danger-foreground" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

// ── Add/Edit dialog ────────────────────────────────────────────────────────────
function TransactionDialog({ clubId, open, onOpenChange, editing, onSaved }: {
  clubId: string; open: boolean; onOpenChange: (v: boolean) => void; editing: Transaction | null; onSaved: () => void
}) {
  const [type, setType] = useState<"revenue" | "expense">(editing?.type ?? "revenue")
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "")
  const [category, setCategory] = useState(editing?.category ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error("Amount must be a positive number"); return }
    if (!category.trim()) { toast.error("Category is required"); return }
    setLoading(true)
    try {
      if (editing) {
        await api(`/api/clubs/${clubId}/transactions/${editing.id}`, {
          method: "PATCH", json: { type, amount: amt, category, description }
        })
        toast.success("Transaction updated")
      } else {
        await api(`/api/clubs/${clubId}/transactions`, {
          method: "POST", json: { type, amount: amt, category, description }
        })
        toast.success("Transaction added")
      }
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || "Couldn't save")
    } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG_CLASS, "sm:max-w-md")} showCloseButton>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>Record money in (revenue) or money out (expense).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4 sm:p-0">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType("revenue")}
              className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-all",
                type === "revenue" ? "border-success bg-success-subtle text-success-foreground scale-[1.02]" : "border-border hover:bg-accent")}>
              <ArrowUpRight className="h-4 w-4" /> Revenue
            </button>
            <button type="button" onClick={() => setType("expense")}
              className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-all",
                type === "expense" ? "border-danger bg-danger-subtle text-danger-foreground scale-[1.02]" : "border-border hover:bg-accent")}>
              <ArrowDownRight className="h-4 w-4" /> Expense
            </button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="pl-7" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Category</Label>
            <Input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Bake sale, Supplies, Transportation" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Add details…" />
          </div>
          <Button type="submit" variant="club" className="w-full h-11" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Add transaction"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
