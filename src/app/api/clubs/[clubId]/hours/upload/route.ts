import { getClubContext, json, error } from "@/lib/server-auth"
import sharp from "sharp"
import { promises as fs } from "fs"
import path from "path"

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
])
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

function extForType(t: string): string {
  switch (t) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "application/pdf":
      return "pdf"
    default:
      return "bin"
  }
}

/**
 * POST /api/clubs/[clubId]/hours/upload
 * multipart/form-data with a `file` field (image/jpeg|png|webp OR application/pdf, <=10MB).
 * Images: re-encoded as JPEG (sharp resize to max 1600px, quality 80).
 * PDFs: stored as-is.
 * Returns { url } — a relative path under /uploads/clubs/<clubId>/hours/.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return error("Expected multipart/form-data", 400)
  }

  const file = formData.get("file")
  if (!file || !(file instanceof File)) return error("No file uploaded", 400)

  if (!ALLOWED.has(file.type)) {
    return error("Unsupported file type. Allowed: JPG, PNG, WebP, PDF", 400)
  }
  if (file.size === 0) return error("Empty file", 400)
  if (file.size > MAX_BYTES) return error("File too large (max 10MB)", 400)

  const bytes = Buffer.from(await file.arrayBuffer())
  const isImage = file.type.startsWith("image/")

  const dir = path.join(process.cwd(), "public", "uploads", "clubs", clubId, "hours")
  await fs.mkdir(dir, { recursive: true })

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  let publicUrl: string
  if (isImage) {
    const filename = `${stamp}.jpg`
    const fullPath = path.join(dir, filename)
    await sharp(bytes)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(fullPath)
    publicUrl = `/uploads/clubs/${clubId}/hours/${filename}`
  } else {
    const ext = extForType(file.type)
    const filename = `${stamp}.${ext}`
    const fullPath = path.join(dir, filename)
    await fs.writeFile(fullPath, bytes)
    publicUrl = `/uploads/clubs/${clubId}/hours/${filename}`
  }

  return json({ url: publicUrl })
}
