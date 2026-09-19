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
import { DIALOG_CLASS } from "@/components/shared/dialog-class"

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
  const [nameError, setNameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passcodeError, setPasscodeError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    let bad = false
    if (!name.trim()) {
      setNameError("Club name is required")
      bad = true
    } else setNameError(null)
    if (clubPassword.length < 4) {
      setPasswordError("Club password must be at least 4 characters")
      bad = true
    } else setPasswordError(null)
    if (!adminPasscode) {
      setPasscodeError("Admin passcode is required")
      bad = true
    } else setPasscodeError(null)
    if (bad) return
    setLoading(true)
    try {
      // Verify the admin passcode SERVER-SIDE (the literal never lives in the
      // client bundle). The create endpoint also re-checks it as the source
      // of truth, so this is a UX pre-check to fail fast without a partial
      // club creation attempt.
      const verify = await api<{ valid: boolean }>("/api/clubs/verify-admin-passcode", {
        method: "POST",
        json: { adminPasscode },
      })
      if (!verify.valid) {
        setPasscodeError("Incorrect admin passcode. Ask your ClubHub admin for the passcode to create a new club.")
        setLoading(false)
        return
      }
      await api("/api/clubs", {
        method: "POST",
        json: { name, description, accentColor, clubPassword, adminPasscode },
      })
      toast.success("Club created! You are now an executive.")
      setName("")
      setDescription("")
      setClubPassword("")
      setAdminPasscode("")
      setNameError(null)
      setPasswordError(null)
      setPasscodeError(null)
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
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0">
          <DialogTitle>Create a new club</DialogTitle>
          <DialogDescription>
            You&apos;ll become the first executive. Share the generated club code and password with others so they can join.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-0 space-y-4">
            <div className="space-y-2">
              <Label>Club name *</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                placeholder="e.g. Robotics Club"
                maxLength={80}
                aria-invalid={!!nameError}
                className={nameError ? "border-danger focus-visible:ring-red-500" : ""}
              />
              {nameError && (
                <p className="text-xs text-danger mt-1">{nameError}</p>
              )}
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
                    className="h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                onChange={(e) => {
                  setClubPassword(e.target.value)
                  if (passwordError) setPasswordError(null)
                }}
                placeholder="Members need this to join"
                minLength={4}
                aria-invalid={!!passwordError}
                className={passwordError ? "border-danger focus-visible:ring-red-500" : ""}
              />
              {passwordError ? (
                <p className="text-xs text-danger mt-1">{passwordError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">A 6-character club code will be auto-generated.</p>
              )}
            </div>
            <div className="space-y-2 rounded-md border border-club/30 bg-club-subtle p-3">
              <Label className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-club" />
                Admin passcode *
              </Label>
              <Input
                type="password"
                value={adminPasscode}
                onChange={(e) => {
                  setAdminPasscode(e.target.value)
                  if (passcodeError) setPasscodeError(null)
                }}
                placeholder="Enter the admin passcode"
                autoComplete="off"
                aria-invalid={!!passcodeError}
                className={passcodeError ? "border-danger focus-visible:ring-red-500" : ""}
              />
              {passcodeError ? (
                <p className="text-xs text-danger mt-1">{passcodeError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Required to create a new club. Ask your ClubHub admin if you don&apos;t have it.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="px-4 py-3 sm:p-0 sm:pt-0 border-t sm:border-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
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
