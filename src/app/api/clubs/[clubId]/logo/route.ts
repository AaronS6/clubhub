import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

/** 5MB upload cap for club logos. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_SIZE = 256
const LOGO_QUALITY = 80

/**
 * POST /api/clubs/[clubId]/logo
 * Accepts a multipart file upload (field name "file"), processes it with
 * sharp (resize 256×256, JPEG q80), and stores the result as a base64 data
 * URL in `Club.logoUrl`. Executive-only via getClubContext. Returns { logoUrl }.
 *
 * 5MB cap on the raw upload.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
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

    const dataUrl = `data:image/jpeg;base64,${processed.toString("base64")}`

    await db.club.update({
      where: { id: clubId },
      data: { logoUrl: dataUrl },
    })

    return NextResponse.json({ logoUrl: dataUrl })
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
 * Clears the club's logoUrl (sets to null). Executive-only.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

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
