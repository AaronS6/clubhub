/**
 * Public site URL resolution — server-side only.
 *
 * Used by the crawler surfaces (app/robots.ts, app/sitemap.ts) and the root
 * metadata (metadataBase / OpenGraph URLs) so every generated URL is absolute
 * and host-correct on any deployment.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL  — explicit canonical site URL (preferred once you
 *                              have a custom domain, e.g.
 *                              https://clubhub.yourschool.com)
 *   2. NEXTAUTH_URL          — already set on every deployment (it's the app's
 *                              public origin); reusing it keeps the env surface
 *                              minimal.
 *   3. http://localhost:3000 — local dev default.
 *
 * Never throws: an unparseable value falls back to the dev default so a bad
 * env var can't take down robots.txt/sitemap.xml generation.
 */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"

  try {
    const url = new URL(raw)
    // Normalize: strip trailing slash + default ports so we never emit
    // "https://x.com//sitemap.xml" or port-doubled URLs.
    let out = `${url.protocol}//${url.hostname}`
    if (url.port && url.port !== "80" && url.port !== "443") {
      out += `:${url.port}`
    }
    if (url.pathname && url.pathname !== "/") {
      out += url.pathname.replace(/\/+$/, "")
    }
    return out
  } catch {
    console.warn("[site] Unparseable site URL env — falling back to localhost:", raw)
    return "http://localhost:3000"
  }
}
