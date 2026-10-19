import type { MetadataRoute } from "next"
import { db } from "@/lib/db"
import { getSiteUrl } from "@/lib/site"

/**
 * /sitemap.xml — dynamically generated from the database.
 *
 * Lists every URL a search engine should index:
 *   - `/`                the landing page (marketing copy + Explore directory)
 *   - `/?public=<code>`  each club's public profile, but ONLY clubs whose
 *                        executives opted into public discovery
 *                        (`Club.isListedPublic = true`) — exactly the same
 *                        visibility rule as /api/public/clubs. Unlisted clubs
 *                        never appear in search results.
 *
 * Authenticated workspace URLs (`/?view=...`) are deliberately excluded:
 * they render the login wall for crawlers and have no public content.
 *
 * Revalidated hourly (ISR): new public clubs appear in the sitemap within an
 * hour, without a redeploy, and without a DB query on every request.
 *
 * Fault-tolerant by design: if the DB is unreachable (e.g. cold build
 * environment), the sitemap degrades to the homepage entry instead of
 * failing the render/build.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      changeFrequency: "daily",
      priority: 1,
    },
  ]

  try {
    const clubs = await db.club.findMany({
      where: { isListedPublic: true },
      select: { clubCode: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    })

    for (const club of clubs) {
      entries.push({
        url: `${base}/?public=${encodeURIComponent(club.clubCode)}`,
        lastModified: club.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      })
    }
  } catch (e) {
    // DB unreachable at generation time — serve the homepage-only sitemap
    // rather than erroring (a broken sitemap.xml is worse than a small one).
    console.error("[sitemap] club query failed — serving homepage-only sitemap:", e)
  }

  return entries
}
