import { getClubContext, requireExecutive, getSessionUser, json, error } from "@/lib/server-auth"
import { getClubStorageReport } from "@/lib/storage-report"

/**
 * GET /api/clubs/[clubId]/storage — executive-only.
 *
 * Serves the club's storage report (categories, quota, percent, exclusions).
 * The math lives in src/lib/storage-report.ts so the 100% write-pause guard
 * (src/lib/storage-guard.ts) enforces the EXACT numbers this view displays.
 * See that module's doc comment for the bytes math and SQL portability
 * notes. Quota is 15 MB shared by the whole club; at 100%, storage-taking
 * writes pause club-wide until an executive clears some room.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) {
    // 401 when not signed in, 403 when signed in but not a member of this
    // club (mirrors the notifications/me routes' Unauthorized convention).
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)
    return error("Not a member of this club", 403)
  }
  if (!requireExecutive(c)) return error("Executives only", 403)

  const report = await getClubStorageReport(clubId)
  return json({ ...report, clubId })
}
