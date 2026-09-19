"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PageHeader, EmptyState, relativeTime } from "@/components/shared/page-header"
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
import { Wallet, TrendingUp, TrendingDown, Plus, MoreVertical, Pencil, Trash2, Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react"
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

  // Group by category for breakdown
  const byCategory = new Map<string, { revenue: number; expense: number }>()
  for (const t of transactions) {
    const cat = t.category
    if (!byCategory.has(cat)) byCategory.set(cat, { revenue: 0, expense: 0 })
    const c = byCategory.get(cat)!
    if (t.type === "revenue") c.revenue += t.amount
    else c.expense += t.amount
  }
  const categories = Array.from(byCategory.entries()).sort((a, b) => (b[1].revenue + b[1].expense) - (a[1].revenue + a[1].expense))

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

      {/* Balance summary — the memorable hero */}
      <div className="rounded-xl border border-club/20 bg-club-subtle p-6 flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Current balance</span>
        <span className="text-numeral text-club-ink">{balance < 0 ? "-" : ""}${Math.abs(balance).toFixed(2)}</span>
        <div className="flex items-center gap-4 mt-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-success-foreground">
            <TrendingUp className="h-4 w-4" /> ${totalRevenue.toFixed(2)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-danger-foreground">
            <TrendingDown className="h-4 w-4" /> ${totalExpense.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-card-title">By category</h3>
          <div className="space-y-1">
            {categories.map(([cat, vals]) => (
              <div key={cat} className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="font-medium truncate">{cat}</span>
                <div className="flex items-center gap-4 shrink-0 tabular-nums">
                  {vals.revenue > 0 && <span className="text-success-foreground">+${vals.revenue.toFixed(2)}</span>}
                  {vals.expense > 0 && <span className="text-danger-foreground">-${vals.expense.toFixed(2)}</span>}
                  <span className="font-semibold w-16 text-right">{((vals.revenue - vals.expense) >= 0 ? "+" : "-")}${Math.abs(vals.revenue - vals.expense).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="space-y-2">
        <h3 className="text-card-title">Transactions</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-8 w-8" />}
            title="No transactions yet"
            description={isExec ? "Add your first revenue or expense entry to start tracking." : "Check back once executives start recording finances."}
            action={isExec ? <Button variant="club" size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add entry</Button> : undefined}
          />
        ) : (
          <div className="space-y-1">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  t.type === "revenue" ? "bg-success-subtle text-success-foreground" : "bg-danger-subtle text-danger-foreground")}>
                  {t.type === "revenue" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{t.category}</span>
                    {t.description && <span className="text-xs text-muted-foreground truncate">· {t.description}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {t.creator?.name ?? "—"}</span>
                </div>
                <span className={cn("text-sm font-semibold tabular-nums shrink-0",
                  t.type === "revenue" ? "text-success-foreground" : "text-danger-foreground")}>
                  {t.type === "revenue" ? "+" : "-"}${t.amount.toFixed(2)}
                </span>
                {isExec && (
                  <div onClick={(e) => e.stopPropagation()} role="presentation" className="shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-1" aria-label="Actions"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingTx(t)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger-foreground focus:text-danger-foreground" onClick={() => deleteMut.mutate(t.id)} disabled={deleteMut.isPending}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit dialog */}
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
    if (!amt || amt <= 0) { toast.error("Amount must be positive"); return }
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
              className={cn("rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "revenue" ? "border-success text-success-foreground bg-success-subtle" : "border-border hover:bg-accent")}>
              <ArrowUpCircle className="h-4 w-4 inline mr-1.5" /> Revenue
            </button>
            <button type="button" onClick={() => setType("expense")}
              className={cn("rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "expense" ? "border-danger text-danger-foreground bg-danger-subtle" : "border-border hover:bg-accent")}>
              <ArrowDownCircle className="h-4 w-4 inline mr-1.5" /> Expense
            </button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Amount ($)</Label>
            <Input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
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
