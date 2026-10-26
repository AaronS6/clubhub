import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"
import { clubStorageFullResponse } from "@/lib/storage-guard"
import { saveImage, deleteImage, publicUrl } from "@/lib/image-store"

/** 5MB upload cap for club logos. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_SIZE = 256
const LOGO_QUALITY = 80

/**
 * POST /api/clubs/[clubId]/logo
 * Accepts a multipart file upload (field name "file"), processes it with
 * sharp (resize 256×256, JPEG q80), and stores the result as a JPEG file in
 * the `StoredImage` DB table (key `{clubId}-logo`). The DB Club row keeps only a short URL
 * (`/api/club-images/{clubId}-logo?v=…`). Executive-only via getClubContext.
 * Returns { logoUrl }.
 *
 * 5MB cap on the raw upload.
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
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)}MB)` },
        { status: 413 },
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    const processed = await sharp(bytes)
      .rotate() // honor EXIF orientation
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: "cover", position: "center" })
      .jpeg({ quality: LOGO_QUALITY, mozjpeg: true })
      .toBuffer()

    // Write the processed JPEG to disk and keep a short versioned URL in
    // the DB (v = Date.now() so re-uploads bust the immutable HTTP cache).
    await saveImage("club-image", `${clubId}-logo`, processed)
    const url = publicUrl("club-image", `${clubId}-logo`, Date.now())

    await db.club.update({
      where: { id: clubId },
      data: { logoUrl: url },
    })

    return NextResponse.json({ logoUrl: url })
  } catch (e) {
    console.error("[logo] POST failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to upload logo" },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/clubs/[clubId]/logo
 * Clears the club's logoUrl (sets to null) and removes the stored file.
 * Executive-only.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    await deleteImage("club-image", `${clubId}-logo`)
    await db.club.update({
      where: { id: clubId },
      data: { logoUrl: null },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[logo] DELETE failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to remove logo" },
      { status: 500 },
    )
  }
}
