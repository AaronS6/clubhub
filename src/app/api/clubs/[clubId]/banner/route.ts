import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"
import { clubStorageFullResponse } from "@/lib/storage-guard"
import { emitClubEvent } from "@/lib/realtime-server"
import { saveImage, deleteImage, publicUrl } from "@/lib/image-store"

/** 8MB cap on the raw upload (banners are bigger than 256px logos). */
const MAX_BANNER_BYTES = 8 * 1024 * 1024
/** Stored image bounds - free-tier conservative: 1280x720 is plenty for a
 * card that renders at <=~1100px wide, and keeps the stored data URL (and
 * therefore the DB row + every dashboard payload) small. Preserves aspect. */
const BANNER_MAX_W = 1280
const BANNER_MAX_H = 720
/** JPEG quality starts here and steps down until the buffer fits the budget. */
const BANNER_QUALITY = 62
/** Target stored size (bytes of the JPEG, pre-base64). Free-tier conservative. */
const BANNER_TARGET_BYTES = 140 * 1024

/**
 * POST /api/clubs/[clubId]/banner
 * Accepts multipart/form-data with `file` (image) and optional `focalY`
 * (0–1 vertical focal point). Processes with sharp (downscale to fit inside
 * 1280×720, progressive JPEG starting at q62 with adaptive step-down to
 * ~140KB) and stores the result as a JPEG file in
 * the `StoredImage` DB table (key `{clubId}-banner`); the Club row keeps only a short URL
 * (`/api/club-images/{clubId}-banner?v=…`), plus the focal point in
 * `Club.bannerFocalY`.
 * Executive-only via getClubContext — members get 403.
 *
 * Emits `club_banner_updated` over realtime so every connected member's
 * dashboard refetches and shows the new banner immediately.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // Storage pause: at 100% of the club quota new content is held until
    // an executive clears room (deletes + edits stay open — that's the recovery path).
    const storageFull = await clubStorageFullResponse(clubId, c.membership.role)
    if (storageFull) return storageFull
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: "Expected multipart/form-data upload" }, { status: 400 })
    }
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 })
    }
    if (file.size > MAX_BANNER_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(MAX_BANNER_BYTES / 1024 / 1024)}MB)` },
        { status: 413 },
      )
    }
    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 })
    }

    // Optional focalY (0–1) sent alongside the upload.
    const focalRaw = form.get("focalY")
    let focalY = 0.5
    if (typeof focalRaw === "string" && focalRaw !== "") {
      const n = parseFloat(focalRaw)
      if (Number.isFinite(n)) focalY = Math.min(1, Math.max(0, n))
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    // Free-tier compression: downscale to <=1280x720, then encode as a
    // progressive mozjpeg JPEG starting at q62. If the result still exceeds
    // the ~140KB budget (busy photos can), step the quality down (62 -> 50 ->
    // 40) until it fits - mozjpeg stays visually clean at these levels for
    // banner-sized imagery, and the card's gradient scrims hide softness.
    let processed = await sharp(bytes)
      .rotate() // honor EXIF orientation
      .resize(BANNER_MAX_W, BANNER_MAX_H, {
        fit: "inside", // preserve aspect, only downscale
        withoutEnlargement: true,
      })
      .jpeg({ quality: BANNER_QUALITY, mozjpeg: true, progressive: true })
      .toBuffer()
    for (
      let q = BANNER_QUALITY - 12;
      processed.length > BANNER_TARGET_BYTES && q >= 40;
      q -= 12
    ) {
      processed = await sharp(bytes)
        .rotate()
        .resize(BANNER_MAX_W, BANNER_MAX_H, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: q, mozjpeg: true, progressive: true })
        .toBuffer()
    }

    // Write the processed JPEG to disk and keep a short versioned URL in
    // the DB (v = Date.now() so re-uploads bust the immutable HTTP cache).
    await saveImage("club-image", `${clubId}-banner`, processed)
    const url = publicUrl("club-image", `${clubId}-banner`, Date.now())

    await db.club.update({
      where: { id: clubId },
      data: { bannerUrl: url, bannerFocalY: focalY },
    })

    // Live-update every connected member's dashboard.
    await emitClubEvent(clubId, "club_banner_updated", { clubId })

    return NextResponse.json({ bannerUrl: url, bannerFocalY: focalY })
  } catch (e) {
    console.error("[banner] POST failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to upload banner" },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/clubs/[clubId]/banner
 * JSON { focalY: number } — repositions the vertical focal point of the
 * existing banner without re-uploading the image. Executive-only.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const body = await req.json().catch(() => null)
    const focalY = typeof body?.focalY === "number" ? body.focalY : NaN
    if (!Number.isFinite(focalY) || focalY < 0 || focalY > 1) {
      return NextResponse.json({ error: "focalY must be a number between 0 and 1" }, { status: 400 })
    }

    await db.club.update({
      where: { id: clubId },
      data: { bannerFocalY: focalY },
    })

    await emitClubEvent(clubId, "club_banner_updated", { clubId })

    return NextResponse.json({ ok: true, bannerFocalY: focalY })
  } catch (e) {
    console.error("[banner] PATCH failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update banner position" },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/clubs/[clubId]/banner
 * Clears the club's banner (bannerUrl + bannerFocalY → null) and removes the
 * stored file. Executive-only. The dashboard falls back to the quiet
 * accent-wash hero.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    await deleteImage("club-image", `${clubId}-banner`)
    await db.club.update({
      where: { id: clubId },
      data: { bannerUrl: null, bannerFocalY: null },
    })

    await emitClubEvent(clubId, "club_banner_updated", { clubId })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[banner] DELETE failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to remove banner" },
      { status: 500 },
    )
  }
}
