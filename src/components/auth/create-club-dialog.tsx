"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { api } from "@/lib/api/client"
import { Loader2, ShieldCheck, X } from "lucide-react"

const ACCENT_PRESETS = [
  { color: "#16a34a", name: "Green" },
  { color: "#0ea5e9", name: "Sky" },
  { color: "#f97316", name: "Orange" },
  { color: "#a855f7", name: "Purple" },
  { color: "#ef4444", name: "Red" },
  { color: "#14b8a6", name: "Teal" },
  { color: "#eab308", name: "Yellow" },
  { color: "#ec4899", name: "Pink" },
]

/**
 * DialogContent className that makes a Dialog full-screen on mobile (fills
 * the viewport) and a normal centered modal on sm+ screens.
 */
const MOBILE_FULLSCREEN_DIALOG =
  "top-0 left-0 translate-x-0 translate-y-0 h-[100dvh] max-w-full rounded-none p-0 gap-0 flex flex-col " +
  "sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:h-auto sm:max-w-lg sm:rounded-lg sm:p-6 sm:gap-4"

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
  const [accentColor, setAccentColor] = useState(ACCENT_PRESETS[0].color)
  const [clubPassword, setClubPassword] = useState("")
  const [adminPasscode, setAdminPasscode] = useState("")
  const [loading, setLoading] = useState(false)

  // The admin passcode is mandatory — the Create button is disabled until
  // all required fields are filled.
  const canSubmit =
    name.trim().length > 0 &&
    clubPassword.length >= 4 &&
    adminPasscode.trim().length > 0 &&
    !loading

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error("Club name is required")
    if (clubPassword.length < 4) return toast.error("Club password must be at least 4 characters")
    if (!adminPasscode.trim()) return toast.error("Admin passcode is required to create a club")
    setLoading(true)
    try {
      // Verify the admin passcode SERVER-SIDE (the literal never lives in the
      // client bundle). The create endpoint also re-checks it as the source
      // of truth, so this is a UX pre-check to fail fast.
      const verify = await api<{ valid: boolean }>("/api/clubs/verify-admin-passcode", {
        method: "POST",
        json: { adminPasscode },
      })
      if (!verify.valid) {
        setLoading(false)
        return toast.error("Incorrect admin passcode. Ask your ClubHub admin for the passcode to create a new club.")
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
      <DialogContent className={MOBILE_FULLSCREEN_DIALOG} showCloseButton={false}>
        {/* Header — sticky at top on mobile */}
        <DialogHeader className="px-5 pt-5 pb-4 sm:p-0 sm:pb-0 border-b sm:border-0 shrink-0 flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-xl">Create a new club</DialogTitle>
            <DialogDescription className="mt-1">
              You&apos;ll become the first executive. Share the club code and password with members so they can join.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex-1 flex flex-col min-h-0">
          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:p-0 sm:py-2 space-y-5">
            {/* Club name */}
            <div className="space-y-1.5">
              <Label htmlFor="club-name" className="text-sm font-medium">
                Club name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="club-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Robotics Club"
                maxLength={80}
                className="h-10"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="club-desc" className="text-sm font-medium">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="club-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What is this club about?"
                maxLength={1000}
                className="resize-none"
              />
            </div>

            {/* Accent color */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Accent color</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.color}
                    type="button"
                    onClick={() => setAccentColor(preset.color)}
                    className="h-8 w-8 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    style={{
                      backgroundColor: preset.color,
                      boxShadow: accentColor === preset.color ? `0 0 0 2px var(--background), 0 0 0 4px ${preset.color}` : "none",
                    }}
                    aria-label={`Select ${preset.name}`}
                    title={preset.name}
                  />
                ))}
              </div>
            </div>

            {/* Club password — clean, no covering box */}
            <div className="space-y-1.5">
              <Label htmlFor="club-password" className="text-sm font-medium">
                Club password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="club-password"
                type="text"
                value={clubPassword}
                onChange={(e) => setClubPassword(e.target.value)}
                placeholder="Members need this to join"
                minLength={4}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                Members use this password along with the auto-generated club code to join.
              </p>
            </div>

            {/* Admin passcode — mandatory, clearly marked */}
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-4">
              <Label htmlFor="admin-passcode" className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-foreground" />
                Admin passcode <span className="text-destructive">*</span>
              </Label>
              <Input
                id="admin-passcode"
                type="password"
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Enter the admin passcode"
                autoComplete="off"
                className="h-10"
                required
              />
              <p className="text-xs text-muted-foreground">
                Required to create a new club. This prevents spam clubs. Ask your ClubHub admin if you don&apos;t have it.
              </p>
            </div>
          </div>

          {/* Footer — sticky at bottom, always visible */}
          <DialogFooter className="px-5 py-4 sm:p-0 sm:pt-2 border-t sm:border-0 shrink-0 bg-background">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="club"
              disabled={!canSubmit}
              className="h-10"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create club
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
