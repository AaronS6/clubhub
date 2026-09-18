"use client"

import * as React from "react"
import Cropper, { type Area } from "react-easy-crop"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Check, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react"

/**
 * CropAvatarDialog — pick a square crop region from a chosen image before
 * uploading it as an avatar. Pan (drag) + zoom (slider / buttons) + rotate,
 * with a locked 1:1 aspect. On confirm, renders the crop to a 512×512 canvas
 * (crisp downscale from whatever source resolution) and hands the resulting
 * JPEG blob back to the caller — the server endpoint then re-resizes to 256.
 *
 * Used by the profile-settings dialog so users can position their face in the
 * frame instead of relying on the server's dumb center-crop.
 */
export function CropAvatarDialog({
  file,
  open,
  onConfirm,
  onCancel,
  uploading,
}: {
  file: File | null
  open: boolean
  onConfirm: (blob: Blob) => void
  onCancel: () => void
  uploading?: boolean
}) {
  const [imgSrc, setImgSrc] = React.useState<string | null>(null)
  const [crop, setCrop] = React.useState({ x: 0, y: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [rotation, setRotation] = React.useState(0)
  const [aspect] = React.useState(1) // square
  const croppedAreaRef = React.useRef<Area | null>(null)

  // Load the chosen file into an object URL whenever it changes.
  React.useEffect(() => {
    if (!file) {
      setImgSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    // reset controls for each new image
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function onCropComplete(_a: Area, croppedAreaPixels: Area) {
    croppedAreaRef.current = croppedAreaPixels
  }

  // Render the crop region to a 512×512 canvas → JPEG blob.
  //
  // Uses the canonical react-easy-crop approach so the output exactly
  // matches the on-screen preview (no offset / white-space, even when the
  // image is rotated):
  //   1. Draw the original image rotated onto a canvas sized to the rotated
  //      bounding box. `croppedAreaPixels` is in this rotated canvas's
  //      coordinate space.
  //   2. Copy the crop region from that rotated canvas to the 512×512
  //      output canvas.
  async function produceCroppedBlob(): Promise<Blob | null> {
    const area = croppedAreaRef.current
    if (!area || !imgSrc) return null
    const img = await loadImage(imgSrc)
    const rot = ((rotation % 360) + 360) % 360
    const rad = (rot * Math.PI) / 180
    const sin = Math.abs(Math.sin(rad))
    const cos = Math.abs(Math.cos(rad))
    // Rotated bounding-box dimensions.
    const bBoxW = Math.round(img.width * cos + img.height * sin)
    const bBoxH = Math.round(img.height * cos + img.width * sin)

    // Step 1 — rotated bounding-box canvas with the full image drawn on it.
    const bb = document.createElement("canvas")
    bb.width = bBoxW
    bb.height = bBoxH
    const bbCtx = bb.getContext("2d")
    if (!bbCtx) return null
    bbCtx.translate(bBoxW / 2, bBoxH / 2)
    bbCtx.rotate(rad)
    bbCtx.translate(-img.width / 2, -img.height / 2)
    bbCtx.drawImage(img, 0, 0)

    // Step 2 — 512×512 output canvas; copy the crop region from the rotated
    // bounding-box canvas and scale it to fill the output.
    const out = 512
    const canvas = document.createElement("canvas")
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    // White background so transparent PNGs don't go black on JPEG flatten.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, out, out)
    ctx.drawImage(
      bb,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      out,
      out,
    )
    return new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b ?? null),
        "image/jpeg",
        0.9,
      )
    })
  }

  async function handleConfirm() {
    const blob = await produceCroppedBlob()
    if (!blob) {
      onCancel()
      return
    }
    onConfirm(blob)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>Drag to reposition. Use the slider to zoom.</DialogDescription>
        </DialogHeader>

        <div className="relative h-72 w-full bg-muted/50 overflow-hidden">
          {imgSrc ? (
            <Cropper
              image={imgSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              restrictPosition={false}
              showGrid
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t bg-card/50 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            disabled={uploading}
            aria-label="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
            disabled={uploading}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={uploading}
            className="flex-1 accent-[var(--club-accent)]"
            aria-label="Zoom"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            disabled={uploading}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t shrink-0">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={uploading}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button type="button" variant="club" onClick={handleConfirm} disabled={uploading || !imgSrc}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Confirm & upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })
}
