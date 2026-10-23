import { NextResponse } from "next/server"
import { readImage } from "@/lib/image-store"

/**
 * GET /api/club-images/[key]?v=…
 *
 * Public (no auth — see /api/avatars). Serves club logos/banners stored in
 * the `StoredImage` DB table by /api/clubs/[clubId]/logo|banner, where `key`
 * is `{clubId}-logo` or `{clubId}-banner`. Immutable caching keyed off the
 * `?v=` version param.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params
  try {
    const buf = await readImage("club-image", key)
    if (!buf) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 })
    }
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (e) {
    // Invalid key (failed sanitize) or a filesystem error.
    console.error("[club-images] GET failed:", e)
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 })
  }
}
