import type { MetadataRoute } from "next"
import { PHASE_PRODUCTION_BUILD } from "next/constants"
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
 * Fault-tolerant by design: if the DB is unreachable (e.g. a cold runtime,
 * a bad DATABASE_URL), the sitemap degrades to the homepage entry instead of
 * failing the render. And during `next build` (NEXT_PHASE =
 * phase-production-build) the DB query is SKIPPED entirely — the Docker/Render
 * build environment has no production database reachable (the schema's
 * provider is flipped to postgresql while no postgres URL exists at build
 * time), so attempting the query there only produced a caught, noisy
 * PrismaClientInitializationError in the build logs. The deployed sitemap
 * self-heals: the first request serves the homepage-only entry and triggers
 * the ISR revalidation, which regenerates it against the live database.
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

  // No database is reachable during `next build` (Docker/Render build stage) —
  // skip the query instead of relying on the catch below, so build logs stay
  // clean and no time is wasted initializing a Prisma client that cannot
  // connect. Local `next dev` and the production runtime both query normally.
  if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
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
  }

  return entries
}
