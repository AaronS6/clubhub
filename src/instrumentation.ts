/**
 * Server boot hook (runs once per dev/prod server start).
 *
 * 1. src/lib/schema-sync.ts heals the PRODUCTION Postgres schema before the
 *    app serves any traffic (creates missing tables/columns — e.g. the
 *    announcement-poll tables behind the P2021 outage — via idempotent DDL
 *    that is safe on every boot). SQLite dev is skipped automatically.
 * 2. src/lib/autoseed.ts restores the demo data when the dev database is
 *    empty (sandbox re-provisioning guard).
 *
 * The logic lives in separate Node-only modules so the Edge-runtime
 * compilation of this entry point never touches Node APIs — required pattern
 * per Next.js instrumentation docs.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Heal the production schema FIRST — autoseed's user count and every API
    // route depend on the tables existing.
    const { ensureSchemaSynced } = await import("./lib/schema-sync")
    await ensureSchemaSynced()

    const { runAutoseed } = await import("./lib/autoseed")
    await runAutoseed()
  }
}
