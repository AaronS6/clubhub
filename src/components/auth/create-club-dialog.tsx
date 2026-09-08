"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { api } from "@/lib/api/client"
import { Loader2, ShieldCheck } from "lucide-react"
import { ADMIN_PASSCODE } from "@/lib/admin-passcode"

const ACCENT_PRESETS = ["#16a34a", "#0ea5e9", "#f97316", "#a855f7", "#ef4444", "#14b8a6", "#eab308", "#ec4899"]

export function CreateClubDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [accentColor, setAccentColor] = useState(ACCENT_PRESETS[0])
  const [clubPassword, setClubPassword] = useState("")
  const [adminPasscode, setAdminPasscode] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error("Club name is required")
    if (clubPassword.length < 4) return toast.error("Club password must be at least 4 characters")
    if (adminPasscode !== ADMIN_PASSCODE) {
      return toast.error("Incorrect admin passcode. Ask your ClubHub admin for the passcode to create a new club.")
    }
    setLoading(true)
    try {
      await api("/api/clubs", {
        method: "POST",
        json: { name, description, accentColor, clubPassword, adminPasscode },
      })
      toast.success("Club created! You are now an executive.")
      setName("")
      setDescription("")
      setClubPassword("")
      setAdminPasscode("")
      onCreated()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new club</DialogTitle>
          <DialogDescription>
            You&apos;ll become the first executive. Share the generated club code and password with others so they can join.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>Club name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Robotics Club" maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this club about?" maxLength={1000} />
          </div>
          <div className="space-y-2">
            <Label>Accent color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccentColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: accentColor === c ? "white" : "transparent",
                    boxShadow: accentColor === c ? `0 0 0 2px ${c}` : "none",
                  }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Club password *</Label>
            <Input
              value={clubPassword}
              onChange={(e) => setClubPassword(e.target.value)}
              placeholder="Members need this to join"
              minLength={4}
            />
            <p className="text-xs text-muted-foreground">A 6-character club code will be auto-generated.</p>
          </div>
          <div className="space-y-2 rounded-md border border-club/30 bg-club-subtle p-3">
            <Label className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-club" />
              Admin passcode *
            </Label>
            <Input
              type="password"
              value={adminPasscode}
              onChange={(e) => setAdminPasscode(e.target.value)}
              placeholder="Enter the admin passcode"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Required to create a new club. Ask your ClubHub admin if you don&apos;t have it.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" variant="club" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create club
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
