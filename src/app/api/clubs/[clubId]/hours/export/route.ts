import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

function csvEscape(s: string): string {
  if (!s) return ""
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmtDate(d: Date): string {
  // YYYY-MM-DD for stable CSV dates
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function fmtDateTime(d: Date): string {
  return d.toISOString()
}

/**
 * GET /api/clubs/[clubId]/hours/export
 * Exports the current user's APPROVED service hours as a CSV download.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const items = await db.serviceHour.findMany({
      where: { clubId, userId: c.user.id, status: "approved" },
      include: {
        category: { select: { name: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: [{ dateOfService: "desc" }, { submittedAt: "desc" }],
    })

    const header = ["Date", "Hours", "Reason", "Category", "Reviewed By", "Reviewed At"]
    const rows: string[] = [header.join(",")]
    for (const it of items) {
      rows.push(
        [
          fmtDate(it.dateOfService),
          String(it.hours),
          csvEscape(it.reasonText),
          csvEscape(it.category?.name ?? ""),
          csvEscape(it.reviewer?.name ?? ""),
          it.reviewedAt ? fmtDateTime(it.reviewedAt) : "",
        ].join(",")
      )
    }

    const csv = rows.join("\n")
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="service-hours.csv"`,
        "Cache-Control": "no-store",
      },
    })

  } catch (err: any) {
    console.error("[clubs/hours/export GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to export data: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
