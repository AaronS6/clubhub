/**
 * Node-runtime-only auto-seed guard (imported from src/instrumentation.ts).
 *
 * Self-healing seed:
 *   The sandbox occasionally re-provisions the environment and recreates
 *   db/custom.db from the schema alone — every table present, zero rows.
 *   The user experiences this as "the example account / demo clubs are gone"
 *   and an empty public directory. Instead of requiring a manual re-seed,
 *   this runs on server boot and, ONLY when there are zero users, restores
 *   the canonical demo data (alex@clubhub.example + Robotics Club + the two
 *   public-directory clubs) by spawning the existing idempotent seed scripts.
 *
 *   A database that has any user row is never touched.
 *
 * Set CLUBHUB_DISABLE_AUTOSEED=1 to opt out (e.g. before intentionally
 * starting from a blank database).
 */

export async function runAutoseed() {
  if (process.env.CLUBHUB_DISABLE_AUTOSEED === "1") return
  // Never seed during `next build` — only real server boots.
  if (process.env.NEXT_PHASE === "phase-production-build") return

  const root = process.cwd()

  const run = async (cmd: string, args: string[]) => {
    const { spawn } = await import("node:child_process")
    return new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: root, stdio: "inherit" })
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`)),
      )
      child.on("error", reject)
    })
  }

  try {
    const { db } = await import("./db")

    let userCount: number
    try {
      userCount = await db.user.count()
    } catch {
      // Tables missing entirely (fresh volume, schema not applied yet).
      console.log("[autoseed] database schema missing — applying prisma db:push…")
      await run("bun", ["run", "db:push"])
      userCount = await db.user.count()
    }

    if (userCount > 0) return

    console.log(
      "[autoseed] empty database detected — restoring the example account and demo clubs…",
    )
    await run("bun", ["run", "scripts/seed-example-account.ts"])
    await run("bun", ["run", "scripts/seed-public-clubs.ts"])
    console.log("[autoseed] demo data restored. login: alex@clubhub.example / ClubHub2026!")
  } catch (error) {
    // Never block server boot on seeding problems.
    console.error(
      "[autoseed] skipped:",
      error instanceof Error ? error.message : String(error),
    )
  }
}
