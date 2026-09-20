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
import { Plus, MoreVertical, Pencil, Trash2, Loader2, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react"
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

function useCountUp(target: number, duration = 1000) {
  const [val, setVal] = useState(0)
  const raf = useRef<number>(0)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced || target === 0) { setVal(target); return }
    const start = performance.now()
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
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
  const revenue = transactions.filter(t => t.type === "revenue").reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
  const balance = revenue - expense

  const now = new Date()
  const monthTx = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
  const mRev = monthTx.filter(t => t.type === "revenue").reduce((s, t) => s + t.amount, 0)
  const mExp = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)

  const byCat = new Map<string, { revenue: number; expense: number }>()
  for (const t of transactions) {
    if (!byCat.has(t.category)) byCat.set(t.category, { revenue: 0, expense: 0 })
    if (t.type === "revenue") byCat.get(t.category)!.revenue += t.amount
    else byCat.get(t.category)!.expense += t.amount
  }
  const cats = Array.from(byCat.entries()).map(([cat, v]) => ({ cat, ...v, total: v.revenue + v.expense, net: v.revenue - v.expense })).sort((a, b) => b.total - a.total)
  const maxCat = Math.max(...cats.map(c => c.total), 1)

  return (
    <div className="space-y-6">
      <PageHeader title="Financials" description="Track your club's budget, revenue, and expenses."
        actions={isExec ? <Button variant="club" onClick={() => setAddOpen(true)} size="sm"><Plus className="size-4" /><span className="hidden sm:inline">Add entry</span></Button> : undefined}
      />

      {/* ═══ BIG BALANCE HERO ═══════════════════════════════════════════ */}
      <BalanceHero balance={balance} revenue={revenue} expense={expense} mRev={mRev} mExp={mExp} />

      {/* ═══ DONUT CHART + CATEGORY BREAKDOWN ══════════════════════════════ */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Donut */}
          <div className="lg:col-span-5">
            <DonutChart revenue={revenue} expense={expense} />
          </div>
          {/* Categories */}
          <div className="lg:col-span-7 space-y-2">
            <h3 className="text-card-title mb-1">By Category</h3>
            {cats.map((c, i) => (
              <div key={c.cat} className="rounded-lg border border-border bg-card px-4 py-2.5" style={{ animation: `fade-in 300ms ease-out ${i * 60}ms both` }}>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium truncate">{c.cat}</span>
                  <span className={cn("text-sm font-bold tabular-nums", c.net >= 0 ? "text-success-foreground" : "text-danger-foreground")}>
                    {c.net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(c.net))}
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                  {c.revenue > 0 && <div className="h-full bg-success transition-[color,background-color,border-color,transform,box-shadow] duration-700 ease-out" style={{ width: `${(c.revenue / maxCat) * 100}%`, transitionDelay: `${i * 60}ms` }} />}
                  {c.expense > 0 && <div className="h-full bg-danger transition-[color,background-color,border-color,transform,box-shadow] duration-700 ease-out" style={{ width: `${(c.expense / maxCat) * 100}%`, transitionDelay: `${i * 60}ms` }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TRANSACTION LIST ═══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-card-title">All Transactions</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : transactions.length === 0 ? (
          <EmptyState icon={<Wallet className="h-8 w-8" />} title="No transactions yet"
            description={isExec ? "Add your first revenue or expense to start tracking." : "Check back once executives start recording finances."}
            action={isExec ? <Button variant="club" size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add entry</Button> : undefined}
          />
        ) : (
          <div className="space-y-2">
            {transactions.map((t, i) => (
              <TransactionCard key={t.id} t={t} isExec={!!isExec} index={i} onDelete={() => deleteMut.mutate(t.id)} onEdit={() => setEditingTx(t)} />
            ))}
          </div>
        )}
      </div>

      {(addOpen || editingTx) && (
        <TransactionDialog clubId={clubId} open={!!(addOpen || editingTx)} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditingTx(null) } }} editing={editingTx} onSaved={() => qc.invalidateQueries({ queryKey: ["transactions", clubId] })} />
      )}
    </div>
  )
}

// ═══ BIG BALANCE HERO ════════════════════════════════════════════════════════
function BalanceHero({ balance, revenue, expense, mRev, mExp }: { balance: number; revenue: number; expense: number; mRev: number; mExp: number }) {
  const animated = useCountUp(balance)
  const isPositive = balance >= 0
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-club/20 p-6 sm:p-8 transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(135deg, var(--club-subtle) 0%, var(--card) 60%, var(--club-subtle) 100%)",
        boxShadow: "0 20px 40px -12px rgba(0,0,0,0.18), 0 8px 16px -8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.04)",
      }}
    >
      <div aria-hidden className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-club/10 blur-3xl" />
      <div className="relative">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Club Balance</p>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-[3.5rem] sm:text-[4rem] font-bold leading-none tabular-nums" style={{ fontFamily: "var(--font-display)", color: isPositive ? "var(--club-ink)" : "var(--danger-foreground)" }}>
            {balance < 0 ? "-" : ""}${fmtMoney(Math.abs(animated))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-subtle text-success-foreground"><ArrowUpRight className="h-4 w-4" /></span>
            <div><span className="text-sm font-bold tabular-nums">${fmtMoney(revenue)}</span><span className="text-xs text-muted-foreground ml-1">revenue</span></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-subtle text-danger-foreground"><ArrowDownRight className="h-4 w-4" /></span>
            <div><span className="text-sm font-bold tabular-nums">${fmtMoney(expense)}</span><span className="text-xs text-muted-foreground ml-1">expenses</span></div>
          </div>
          {mRev + mExp > 0 && (
            <div className="flex items-center gap-2 pl-4 border-l border-border">
              <span className="text-xs text-muted-foreground">This month</span>
              <span className={cn("text-sm font-bold tabular-nums", mRev - mExp >= 0 ? "text-success-foreground" : "text-danger-foreground")}>
                {mRev - mExp >= 0 ? "+" : "-"}${fmtMoney(Math.abs(mRev - mExp))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══ DONUT CHART (SVG) ═══════════════════════════════════════════════════════
function DonutChart({ revenue, expense }: { revenue: number; expense: number }) {
  const total = revenue + expense
  const revPct = total > 0 ? revenue / total : 0
  const R = 60, C = 2 * Math.PI * R
  const revDash = C * revPct
  const expDash = C * (1 - revPct)
  const animatedRev = useCountUp(revenue, 1200)
  const animatedExp = useCountUp(expense, 1200)

  return (
    <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center">
      <h3 className="text-card-title mb-4 self-start">Revenue vs Expenses</h3>
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
          {/* Track */}
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--muted)" strokeWidth="16" />
          {/* Revenue arc (green) */}
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--success)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${revDash} ${C - revDash}`} strokeDashoffset={C * 0.25}
            style={{ transition: "stroke-dasharray 1s ease-out" }} />
          {/* Expense arc (red) — drawn from where revenue ends */}
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--danger)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${expDash} ${C - expDash}`} strokeDashoffset={C * 0.25 - revDash}
            style={{ transition: "stroke-dasharray 1s ease-out 0.3s" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{(revPct * 100).toFixed(0)}%</span>
          <span className="text-xs text-muted-foreground">revenue</span>
        </div>
      </div>
      <div className="flex items-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-success" />
          <span className="text-sm font-bold tabular-nums">${fmtMoney(animatedRev)}</span>
          <span className="text-xs text-muted-foreground">in</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-danger" />
          <span className="text-sm font-bold tabular-nums">${fmtMoney(animatedExp)}</span>
          <span className="text-xs text-muted-foreground">out</span>
        </div>
      </div>
    </div>
  )
}

// ═══ TRANSACTION CARD ════════════════════════════════════════════════════════
function TransactionCard({ t, isExec, index, onDelete, onEdit }: { t: Transaction; isExec: boolean; index: number; onDelete: () => void; onEdit: () => void }) {
  const isRev = t.type === "revenue"
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 cv-auto  transition-[color,background-color,border-color,transform,box-shadow] hover:border-club/20 hover:shadow-sm"
      style={{ animation: `fade-in 300ms ease-out ${Math.min(index * 40, 400)}ms both` }}>
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110",
        isRev ? "bg-success-subtle text-success-foreground" : "bg-danger-subtle text-danger-foreground")}>
        {isRev ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{t.category}</p>
        {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {t.creator?.name && ` · ${t.creator.name}`}
        </p>
      </div>
      <span className={cn("text-lg font-bold tabular-nums shrink-0", isRev ? "text-success-foreground" : "text-danger-foreground")}>
        {isRev ? "+" : "-"}${fmtMoney(t.amount)}
      </span>
      {isExec && (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Actions"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger-foreground focus:text-danger-foreground" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

// ═══ ADD/EDIT DIALOG ═════════════════════════════════════════════════════════
function TransactionDialog({ clubId, open, onOpenChange, editing, onSaved }: { clubId: string; open: boolean; onOpenChange: (v: boolean) => void; editing: Transaction | null; onSaved: () => void }) {
  const [type, setType] = useState<"revenue" | "expense">(editing?.type ?? "revenue")
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "")
  const [category, setCategory] = useState(editing?.category ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [loading, setLoading] = useState(false)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error("Amount must be positive"); return }
    if (!category.trim()) { toast.error("Category is required"); return }
    setLoading(true)
    try {
      if (editing) { await api(`/api/clubs/${clubId}/transactions/${editing.id}`, { method: "PATCH", json: { type, amount: amt, category, description } }); toast.success("Transaction updated") }
      else { await api(`/api/clubs/${clubId}/transactions`, { method: "POST", json: { type, amount: amt, category, description } }); toast.success("Transaction added") }
      onSaved(); onOpenChange(false)
    } catch (err: any) { toast.error(err.message || "Couldn't save") } finally { setLoading(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG_CLASS, "sm:max-w-md")} showCloseButton>
        <DialogHeader><DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle><DialogDescription>Record money in (revenue) or money out (expense).</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4 sm:p-0">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType("revenue")} className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition-[color,background-color,border-color,transform,box-shadow]", type === "revenue" ? "border-success bg-success-subtle text-success-foreground scale-[1.02]" : "border-border hover:bg-accent")}><ArrowUpRight className="h-4 w-4" />Revenue</button>
            <button type="button" onClick={() => setType("expense")} className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition-[color,background-color,border-color,transform,box-shadow]", type === "expense" ? "border-danger bg-danger-subtle text-danger-foreground scale-[1.02]" : "border-border hover:bg-accent")}><ArrowDownRight className="h-4 w-4" />Expense</button>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-medium text-muted-foreground">Amount</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span><Input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="pl-7" /></div></div>
          <div className="space-y-1.5"><Label className="text-xs font-medium text-muted-foreground">Category</Label><Input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Bake sale, Supplies, Transportation" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-medium text-muted-foreground">Description (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Add details…" /></div>
          <Button type="submit" variant="club" className="w-full h-11" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add transaction"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
