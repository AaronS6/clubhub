/**
 * Server boot hook (runs once per dev/prod server start).
 *
 * See src/lib/autoseed.ts for what this does. The logic lives in a separate
 * Node-only module so the Edge-runtime compilation of this entry point never
 * touches Node APIs — required pattern per Next.js instrumentation docs.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/autoseed")
  }
}
