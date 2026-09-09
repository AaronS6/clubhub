import { NextResponse } from "next/server"
import sharp from "sharp"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"

/**
 * Club logo upload endpoints (executives only).
 *
 * Same storage strategy as user avatars: no cloud storage, so processed
 * images are stored inline as base64 JPEG data URLs in the club's `logoUrl`
 * column (already `String?` in the Prisma schema). `sharp` resizes to 256×256
 * cover + JPEG q80 (~20–50KB). Input capped at 5MB.
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5MB input cap
const SIZE = 256

export async function POST(
  req: Request,
  ctx: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") {
      return error("Only executives can update the club logo", 403)
    }

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
    await db.club.update({
      where: { id: clubId },
      data: { logoUrl: dataUrl },
    })

    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "club_logo_changed",
      targetType: "club",
      targetId: clubId,
      description: `${c.user.name} updated the club logo`,
    }).catch(() => {
      /* logging is best-effort */
    })

    return json({ logoUrl: dataUrl })
  } catch (err: any) {
    console.error("[clubs/logo POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json(
      { error: "Failed to upload club logo: " + (err?.message || "Unknown error") },
      { status: 500 }
    )
  }
}

/**
 * Clear the club logo (set logoUrl to null). Executives only.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") {
      return error("Only executives can remove the club logo", 403)
    }

    await db.club.update({
      where: { id: clubId },
      data: { logoUrl: null },
    })

    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "club_logo_removed",
      targetType: "club",
      targetId: clubId,
      description: `${c.user.name} removed the club logo`,
    }).catch(() => {
      /* logging is best-effort */
    })

    return json({ ok: true })
  } catch (err: any) {
    console.error("[clubs/logo DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json(
      { error: "Failed to remove club logo: " + (err?.message || "Unknown error") },
      { status: 500 }
    )
  }
}
