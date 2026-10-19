import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site"

/**
 * /robots.txt — dynamically generated (replaces the old static
 * public/robots.txt, which couldn't emit an absolute Sitemap URL).
 *
 * Policy:
 *   - Everyone allowed to crawl the whole site (landing page + public club
 *     profiles are the SEO surface).
 *   - /api/* disallowed — JSON API responses are not pages; skipping them
 *     saves crawl budget. robots.txt never affects real browser traffic,
 *     so the app itself is untouched.
 *   - Sitemap announced with an absolute URL (required by the sitemaps
 *     spec) built from the same site-URL resolution used by sitemap.ts.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
