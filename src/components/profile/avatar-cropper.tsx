"use client"

import * as React from "react"
import Cropper, { type Area } from "react-easy-crop"
import { Check, Loader2, RotateCw, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * ============================================================================
 * AvatarCropper — the inline (in-step) avatar crop experience
 * ============================================================================
 *
 * A compact re-imagining of profile/crop-avatar-dialog.tsx for the
 * onboarding tour's "Add your photo" step: the same battle-tested
 * react-easy-crop setup (square aspect, pan + zoom slider + 90° rotate) and
 * the exact same rotation-aware canvas math (rotated bounding box → crop
 * region copy → 512×512 white-flattened JPEG), but rendered inline inside
 * the step card instead of inside a nested dialog.
 *
 *  - Drag to reposition; the slider (and ± buttons) zoom 1–3×; the rotate
 *    button steps -90°.
 *  - Every crop change pushes a small JPEG data-URL of the current crop
 *    region to `onLivePreview` (coalesced onto a ~90ms trailing timer) so
 *    the parent can render a live circular preview while the user works.
 *  - The confirm button renders the crop region to a 512×512 canvas and
 *    hands the resulting JPEG blob (plus a preview data-URL) to `onCropped`
 *    — the parent does the actual upload.
 */

const OUTPUT_SIZE = 512
const PREVIEW_SIZE = 96
const PREVIEW_COALESCE_MS = 90
const MIN_ZOOM = 1
const MAX_ZOOM = 3

export function AvatarCropper({
  file,
  saving = false,
  confirmLabel = "Save photo",
  onLivePreview,
  onCropped,
}: {
  /** The image to crop (null renders the loading state). */
  file: File | null
  /** True while the parent uploads the produced blob. */
  saving?: boolean
  /** Confirm-button label — e.g. "Save photo" / "Update photo". */
  confirmLabel?: string
  /** Receives a coalesced, small JPEG data-URL of the current crop region. */
  onLivePreview?: (dataUrl: string) => void
  /** Confirm pressed — the 512×512 JPEG blob + a preview data-URL. */
  onCropped: (blob: Blob, previewUrl: string) => void
}) {
  const [imgSrc, setImgSrc] = React.useState<string | null>(null)
  const [imgEl, setImgEl] = React.useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = React.useState({ x: 0, y: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [rotation, setRotation] = React.useState(0)
  const [confirming, setConfirming] = React.useState(false)
  const areaRef = React.useRef<Area | null>(null)
  const previewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the chosen file into an object URL + an <img> element (needed for
  // the preview / canvas math). Controls reset for each new image. All
  // setState calls live inside the async loader (never synchronously in the
  // effect body).
  React.useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    let cancelled = false
    void (async () => {
      try {
        const el = await loadImage(url)
        if (cancelled) return
        setImgEl(el)
        setImgSrc(url)
        setCrop({ x: 0, y: 0 })
        setZoom(1)
        setRotation(0)
      } catch {
        // Unreadable image — still show the Cropper so its own media element
        // can surface the problem; the parent's type/size checks make this
        // path nearly impossible.
        if (cancelled) return
        setImgSrc(url)
      }
    })()
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  // Clear any pending live-preview draw on unmount.
  React.useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
  }, [])

  const handleCropComplete = React.useCallback(
    (_area: Area, pixels: Area) => {
      areaRef.current = pixels
      if (!onLivePreview) return
      // Drags fire many events — coalesce the preview draws onto a short
      // trailing timer so we render one small canvas per pause, not per frame.
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = null
        const el = imgEl
        const area = areaRef.current
        if (!el || !area) return
        try {
          const canvas = drawRotatedCropCanvas(el, area, rotation, PREVIEW_SIZE)
          if (canvas) onLivePreview(canvas.toDataURL("image/jpeg", 0.85))
        } catch {
          // The live preview is best-effort only.
        }
      }, PREVIEW_COALESCE_MS)
    },
    [imgEl, rotation, onLivePreview],
  )

  const handleConfirm = React.useCallback(async () => {
    const el = imgEl
    const area = areaRef.current
    if (!el || !area || confirming) return
    setConfirming(true)
    try {
      const canvas = drawRotatedCropCanvas(el, area, rotation, OUTPUT_SIZE)
      if (canvas) {
        const previewUrl = canvas.toDataURL("image/jpeg", 0.9)
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
        })
        if (blob) onCropped(blob, previewUrl)
      }
    } finally {
      setConfirming(false)
    }
  }, [imgEl, rotation, confirming, onCropped])

  const busy = saving || confirming

  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="relative h-52 w-full bg-muted/60 sm:h-56">
        {imgSrc ? (
          <Cropper
            image={imgSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={handleCropComplete}
            restrictPosition={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Pan / zoom / rotate controls */}
      <div className="flex items-center gap-1 border-t border-border/60 bg-card/70 px-2.5 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
          disabled={busy}
          aria-label="Rotate photo"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.2))}
          disabled={busy}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          disabled={busy}
          className="h-11 flex-1 accent-[var(--club-accent)]"
          aria-label="Zoom"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.2))}
          disabled={busy}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Confirm row */}
      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/70 px-3 py-2.5">
        <p className="hidden text-xs text-muted-foreground sm:block">
          Drag to reposition
        </p>
        <Button
          type="button"
          variant="club"
          onClick={() => void handleConfirm()}
          disabled={busy || !imgSrc}
          className="h-11 min-w-[8rem] focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {busy ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </div>
  )
}

/* ───────────────────────── Canvas math ───────────────────────── */

/**
 * Render `area` (in the ROTATED image's coordinate space, exactly what
 * react-easy-crop reports) into a `out×out` canvas:
 *   1. Draw the original image onto a canvas sized to the rotated bounding
 *      box (this is the space croppedAreaPixels is expressed in).
 *   2. Copy the crop region from that canvas to the output, scaled to fill,
 *      over a white background (so transparent PNGs don't go black on JPEG
 *      flatten).
 * Identical to crop-avatar-dialog.tsx's proven math.
 */
function drawRotatedCropCanvas(
  img: HTMLImageElement,
  area: Area,
  rotation: number,
  out: number,
): HTMLCanvasElement | null {
  if (area.width <= 0 || area.height <= 0) return null
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

  // Step 2 — output canvas; copy + scale the crop region to fill it.
  const canvas = document.createElement("canvas")
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
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
  return canvas
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
