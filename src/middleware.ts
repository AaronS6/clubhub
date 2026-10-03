import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Middleware — clears stale chunked NextAuth session cookies.
 *
 * BEFORE the avatar-in-JWT fix (commit d65c01e), a user who uploaded a profile
 * picture had their ~15KB base64 avatar baked into the session JWT. NextAuth
 * chunked that into `next-auth.session-token.0`, `.1`, `.2`… cookies. After
 * the fix, fresh logins produce a single small `next-auth.session-token`
 * (~370 bytes), but the OLD chunked cookies stay in the browser and are still
 * sent on every request — pushing the Cookie header past Node's 16KB limit
 * and causing HTTP 431 on every page (including the post-login reload).
 *
 * This middleware runs on every request and, for any chunked
 * `next-auth.session-token.N` cookie it sees, emits a `Set-Cookie: …; Max-Age=0`
 * header to delete it from the browser. After one successful response the
 * chunks are gone and the site works normally.
 *
 * (Requires the dev server / gateway to accept the bloated header long enough
 * for this middleware to run — hence the raised --max-http-header-size in the
 * dev script / Dockerfile.)
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const chunked = req.cookies
    .getAll()
    .filter((c) => /^next-auth\.session-token\.\d+$/.test(c.name))
  if (chunked.length > 0) {
    for (const c of chunked) {
      res.headers.append(
        "Set-Cookie",
        `${c.name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
      )
    }
  }
  return res
}

export const config = {
  // Run on everything except static assets — cookies matter for routes, not
  // for hashed bundle files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
}
