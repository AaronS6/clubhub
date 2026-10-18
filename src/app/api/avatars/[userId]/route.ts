import { NextResponse } from "next/server"
import { readImage } from "@/lib/image-store"

/**
 * GET /api/avatars/[userId]?v=…
 *
 * Public (no auth — images are visible to club members anyway and userIds are
 * unguessable cuids). Serves the JPEG stored on disk by /api/me/avatar with
 * immutable caching: the `?v=` version param changes on every re-upload, so
 * browsers can cache each version forever.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId } = await ctx.params
  try {
    const buf = await readImage("avatar", userId)
    if (!buf) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 })
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
    console.error("[avatars] GET failed:", e)
    return NextResponse.json({ error: "Failed to serve avatar" }, { status: 500 })
  }
}
