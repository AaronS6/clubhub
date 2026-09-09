import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * Avatar upload endpoints for the signed-in user.
 *
 * Storage strategy: there's no cloud storage on the free tier, so processed
 * images are stored inline as base64 JPEG data URLs directly in the user's
 * `avatarUrl` column (already `String?` in the Prisma schema). `sharp` resizes
 * to 256×256 cover + JPEG q80, which lands around 20–50KB — small enough to
 * keep the row lightweight while looking crisp at the avatar sizes we render
 * (24–48px). Input is capped at 5MB to protect the server.
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5MB input cap
const SIZE = 256

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)

    // Multipart form, field name "file".
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return error("Expected multipart/form-data upload", 400)
    }

    const file = formData.get("file")
    if (!(file instanceof File)) {
      return error("No file uploaded — field must be named 'file'", 400)
    }
    if (file.size === 0) return error("File is empty", 400)
    if (file.size > MAX_BYTES) {
      return error("File too large (5MB max)", 413)
    }

    // Process with sharp. Resize to 256×256 cover, JPEG q80.
    const buf = Buffer.from(await file.arrayBuffer())
    let processed: Buffer
    try {
      processed = await sharp(buf)
        .resize(SIZE, SIZE, { fit: "cover", position: "center" })
        .jpeg({ quality: 80 })
        .toBuffer()
    } catch {
      return error("Could not process image — must be a valid image file", 400)
    }

    const dataUrl = `data:image/jpeg;base64,${processed.toString("base64")}`
    await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: dataUrl },
    })

    return json({ avatarUrl: dataUrl })
  } catch (err: any) {
    console.error("[me/avatar POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json(
      { error: "Failed to upload avatar: " + (err?.message || "Unknown error") },
      { status: 500 }
    )
  }
}

/**
 * Clear the avatar (set avatarUrl to null).
 */
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)
    await db.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    })
    return json({ ok: true })
  } catch (err: any) {
    console.error("[me/avatar DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json(
      { error: "Failed to remove avatar: " + (err?.message || "Unknown error") },
      { status: 500 }
    )
  }
}
