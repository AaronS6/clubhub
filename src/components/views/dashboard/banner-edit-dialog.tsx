"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
import { api, apiUpload } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ImagePlus, Loader2, Check, Trash2, Upload, RefreshCw, MoveVertical } from "lucide-react"

/**
 * BannerEditDialog — executive-only editor for the club's dashboard banner.
 *
 * Flow:
 *   1. Opens seeded with the club's CURRENT banner + focal point (if any).
 *   2. Pick a new image (click or drag) → live preview in the real card
 *      layout (image + scrim + card-fade gradient + identity text overlay),
 *      rendered at banner aspect so the exec sees exactly what members see.
 *   3. Adjust the vertical focal point with a slider (which part of the
 *      image stays visible as the card crops it to cover).
 *   4. Save → POST (new file + focal) or PATCH (focal only, repositioning
 *      the existing image). Remove → DELETE (falls back to the accent wash).
 *
 * After any mutation we invalidate the dashboard query locally; the API also
 * broadcasts `club_banner_updated` over realtime so other connected members
 * refetch without waiting for the polling fallback.
 */
export function BannerEditDialog({
  clubId,
  clubName,
  currentBannerUrl,
  currentFocalY,
  open,
  onOpenChange,
}: {
  clubId: string
  clubName: string
  currentBannerUrl: string | null
  currentFocalY: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const [file, setFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [focal, setFocal] = React.useState<number>(50)
  const [saving, setSaving] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Seed the preview from the club's current banner whenever the dialog opens.
  React.useEffect(() => {
    if (open) {
      setFile(null)
      setPreviewUrl(currentBannerUrl)
      setFocal(Math.round((currentFocalY ?? 0.5) * 100))
      setSaving(false)
      setRemoving(false)
      setDragOver(false)
    }
  }, [open, currentBannerUrl, currentFocalY])

  // Object URL lifecycle for a newly-picked file.
  React.useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pickFile = (f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error("Choose an image file.")
      return
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Image too large (max 8MB).")
      return
    }
    setFile(f)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (file) {
        const form = new FormData()
        form.append("file", file)
        form.append("focalY", String(focal / 100))
        await apiUpload<{ bannerUrl: string }>(`/api/clubs/${clubId}/banner`, form)
        toast.success("Banner updated")
      } else if (previewUrl) {
        await api(`/api/clubs/${clubId}/banner`, { method: "PATCH", json: { focalY: focal / 100 } })
        toast.success("Banner position updated")
      }
      await qc.invalidateQueries({ queryKey: ["dashboard", clubId] })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save banner")
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await api(`/api/clubs/${clubId}/banner`, { method: "DELETE" })
      await qc.invalidateQueries({ queryKey: ["dashboard", clubId] })
      toast.success("Banner removed")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove banner")
    } finally {
      setRemoving(false)
    }
  }

  const busy = saving || removing
  const hasBanner = !!previewUrl

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader className="px-5 pt-5 sm:px-0 sm:pt-0 shrink-0">
          <DialogTitle className="text-card-title flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-club" />
            Edit banner
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 sm:px-0 sm:pb-0 space-y-4">
          {/* Live preview — replicates the real dashboard card layout:
              image + scrim + card-fade gradient + identity text. */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              pickFile(e.dataTransfer.files?.[0])
            }}
            className={cn(
              "relative h-40 sm:h-48 w-full overflow-hidden rounded-xl border bg-muted transition-colors",
              dragOver && "border-club ring-2 ring-club/30",
            )}
          >
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt="Banner preview"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: `center ${focal}%` }}
                />
                {/* Same layered gradients as the live card so the preview is
                    true — dark cinematic scrim in light mode (white text),
                    near-normal photo brightness in dark mode with a
                    bottom-anchored shadow for the text zone. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65 dark:from-black/10 dark:via-black/0 dark:to-black/10"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent dark:from-black/70 dark:via-black/25"
                />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-club text-club-foreground text-[10px] font-bold shrink-0">
                      {clubName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
                        {clubName}
                      </p>
                      <p className="text-[11px] text-white/75">Preview</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Upload className="h-6 w-6" />
                <span className="text-body font-medium">Click or drag an image</span>
                <span className="text-caption">PNG or JPG · up to 8MB</span>
              </button>
            )}

            {/* Repick overlay control */}
            {previewUrl && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 h-8 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/55 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {file ? "Replace" : "Upload new"}
              </button>
            )}
          </div>

          {/* Focal point control */}
          {hasBanner && (
            <div className="rounded-lg border border-border/80 bg-card px-4 py-3.5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <MoveVertical className="h-4 w-4 text-club shrink-0" />
                  <span className="text-body-medium">Image focus</span>
                </div>
                <span className="text-caption tabular-nums shrink-0">
                  {focal < 35 ? "Top" : focal > 65 ? "Bottom" : "Center"} · {focal}%
                </span>
              </div>
              <Slider
                value={[focal]}
                onValueChange={(v) => setFocal(v[0] ?? 50)}
                min={0}
                max={100}
                step={1}
                disabled={busy}
                aria-label="Banner focal point"
              />
              <p className="text-caption mt-2">
                Sets which part of the image stays visible.
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </div>

        {/* Footer actions */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-4 sm:px-0 sm:py-0 sm:pt-4 border-t border-border/60 sm:border-0">
          {currentBannerUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemove}
              disabled={busy}
              className="text-danger-foreground hover:text-danger"
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove
            </Button>
          )}
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="club"
            onClick={handleSave}
            disabled={busy || !previewUrl || (!file && !currentBannerUrl && !previewUrl)}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {file ? "Save banner" : previewUrl ? "Save position" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
