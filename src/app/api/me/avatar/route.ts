import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/server-auth"

/** 5MB upload cap for avatars. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
/** Output dimensions + quality for the resized avatar. */
const AVATAR_SIZE = 256
const AVATAR_QUALITY = 80

/**
 * POST /api/me/avatar
 * Accepts a multipart file upload (field name "file"), processes it with
 * sharp (resize 256×256, JPEG q80), and stores the result as a base64 data
 * URL in `User.avatarUrl`. Returns { avatarUrl }.
 *
 * 5MB cap on the raw upload. Auth via getSessionUser().
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)}MB)` },
        { status: 413 },
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    // Resize + recompress. Cover-fit to a square (center-crop), JPEG q80.
    // sharp is robust to weird input EXIF orientations — it auto-orients.
    const processed = await sharp(bytes)
      .rotate() // honor EXIF orientation
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "center" })
      .jpeg({ quality: AVATAR_QUALITY, mozjpeg: true })
      .toBuffer()

    const dataUrl = `data:image/jpeg;base64,${processed.toString("base64")}`

    await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: dataUrl },
    })

    return NextResponse.json({ avatarUrl: dataUrl })
  } catch (e) {
    console.error("[avatar] POST failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to upload avatar" },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/me/avatar
 * Clears the user's avatarUrl (sets to null).
 */
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[avatar] DELETE failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to remove avatar" },
      { status: 500 },
    )
  }
}
