import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/server-auth"
import { saveImage, deleteImage, publicUrl } from "@/lib/image-store"

/** 5MB upload cap for avatars. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
/** Output dimensions + quality for the resized avatar. */
const AVATAR_SIZE = 256
const AVATAR_QUALITY = 80

/**
 * POST /api/me/avatar
 * Accepts a multipart file upload (field name "file"), processes it with
 * sharp (resize 256×256, JPEG q80), and stores the result as a JPEG file in
 * the `StoredImage` DB table (key = userId). The DB User row keeps only a short URL
 * (`/api/avatars/{userId}?v=…` served by the cached public route).
 * Returns { avatarUrl }.
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

    // Write the processed JPEG to disk and keep a short versioned URL in
    // the DB (v = Date.now() so re-uploads bust the immutable HTTP cache).
    await saveImage("avatar", user.id, processed)
    const url = publicUrl("avatar", user.id, Date.now())

    await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: url },
    })

    return NextResponse.json({ avatarUrl: url })
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
 * Clears the user's avatarUrl (sets to null) and removes the stored file.
 */
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    await deleteImage("avatar", user.id)
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
