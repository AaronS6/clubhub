import { NextResponse } from "next/server"

/**
 * GET /api/health
 *
 * Lightweight health check — does NOT hit the database. Returns 200
 * immediately so uptime monitors (UptimeRobot, Render's own health check)
 * get a fast response even when the server is cold-starting.
 *
 * This prevents 502 errors from Render's health checker during the
 * cold-start window (the standalone server responds before the DB
 * connection pool is fully warm).
 */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
