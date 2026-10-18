/**
 * ============================================================================
 * migrate-image-data-urls.ts
 * ============================================================================
 *
 * One-time migration: moves base64 `data:` image URLs out of SQLite into
 * files on disk (`storage/avatars/`, `storage/club-images/`), replacing each
 * DB value with a short versioned URL served by the public routes
 * (/api/avatars/{userId}, /api/club-images/{key}).
 *
 * Scans:
 *   - User.avatarUrl  → storage/avatars/{userId}.jpg
 *   - Club.logoUrl    → storage/club-images/{clubId}-logo.jpg
 *   - Club.bannerUrl  → storage/club-images/{clubId}-banner.jpg
 *
 * Values that don't start with `data:` (static paths like
 * `/banners/robotics-banner.jpg`, nulls) are left untouched.
 *
 * Run: `bun scripts/migrate-image-data-urls.ts`
 * (Safe to re-run — already-migrated rows no longer start with `data:`.)
 */

import { db } from "../src/lib/db"
import { saveImage, publicUrl } from "../src/lib/image-store"

/** Matches `data:image/…;base64,<payload>` (also plain `data:…;base64,`). */
const DATA_URL_RE = /^data:[^;,]*;base64,/

/** Retry a Prisma write — the dev server holds db/custom.db open (SQLite locks). */
async function withLockRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 5
  const BACKOFF_MS = 300
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const code =
        typeof (e as { code?: string }).code === "string"
          ? (e as { code?: string }).code
          : undefined
      const isLock =
        msg.includes("database is locked") ||
        msg.includes("database is busy") ||
        code === "P2034"
      if (!isLock || attempt >= MAX_ATTEMPTS) {
        console.error(`  ✗ ${label}: ${msg}`)
        throw e
      }
      console.warn(
        `  … ${label}: database locked, retrying (${attempt}/${MAX_ATTEMPTS - 1} retries left)`,
      )
      await new Promise((r) => setTimeout(r, BACKOFF_MS * attempt))
    }
  }
}

async function main() {
  console.log("Migrating base64 image data URLs → disk files…\n")

  let migratedUsers = 0
  let migratedLogos = 0
  let migratedBanners = 0

  // ---- Users: avatarUrl → storage/avatars/{userId}.jpg ------------------
  const users = await db.user.findMany({
    select: { id: true, email: true, avatarUrl: true },
  })
  for (const u of users) {
    if (!u.avatarUrl || !u.avatarUrl.startsWith("data:")) continue
    const m = DATA_URL_RE.exec(u.avatarUrl)
    if (!m) {
      console.warn(`  ! user ${u.email}: unrecognized data URL format — skipped`)
      continue
    }
    const buf = Buffer.from(u.avatarUrl.slice(m[0].length), "base64")
    if (buf.length === 0) {
      console.warn(`  ! user ${u.email}: empty base64 payload — skipped`)
      continue
    }
    await saveImage("avatar", u.id, buf)
    await withLockRetry(`user ${u.email}`, () =>
      db.user.update({
        where: { id: u.id },
        data: { avatarUrl: publicUrl("avatar", u.id, Date.now()) },
      }),
    )
    migratedUsers++
    console.log(
      `  ✓ avatar: ${u.email} (${(buf.length / 1024).toFixed(1)} KB data URL → /api/avatars/${u.id})`,
    )
  }

  // ---- Clubs: logoUrl / bannerUrl → storage/club-images/{clubId}-{logo|banner}.jpg
  const clubs = await db.club.findMany({
    select: { id: true, name: true, logoUrl: true, bannerUrl: true },
  })
  for (const c of clubs) {
    if (c.logoUrl && c.logoUrl.startsWith("data:")) {
      const m = DATA_URL_RE.exec(c.logoUrl)
      if (m) {
        const buf = Buffer.from(c.logoUrl.slice(m[0].length), "base64")
        if (buf.length > 0) {
          const key = `${c.id}-logo`
          await saveImage("club-image", key, buf)
          await withLockRetry(`club ${c.name} logo`, () =>
            db.club.update({
              where: { id: c.id },
              data: { logoUrl: publicUrl("club-image", key, Date.now()) },
            }),
          )
          migratedLogos++
          console.log(
            `  ✓ logo:   ${c.name} (${(buf.length / 1024).toFixed(1)} KB data URL → /api/club-images/${key})`,
          )
        }
      } else {
        console.warn(`  ! club ${c.name}: unrecognized logo data URL — skipped`)
      }
    }
    if (c.bannerUrl && c.bannerUrl.startsWith("data:")) {
      const m = DATA_URL_RE.exec(c.bannerUrl)
      if (m) {
        const buf = Buffer.from(c.bannerUrl.slice(m[0].length), "base64")
        if (buf.length > 0) {
          const key = `${c.id}-banner`
          await saveImage("club-image", key, buf)
          await withLockRetry(`club ${c.name} banner`, () =>
            db.club.update({
              where: { id: c.id },
              data: { bannerUrl: publicUrl("club-image", key, Date.now()) },
            }),
          )
          migratedBanners++
          console.log(
            `  ✓ banner: ${c.name} (${(buf.length / 1024).toFixed(1)} KB data URL → /api/club-images/${key})`,
          )
        }
      } else {
        console.warn(`  ! club ${c.name}: unrecognized banner data URL — skipped`)
      }
    }
  }

  console.log(
    `\nSummary: migrated ${migratedUsers} user avatar(s), ${migratedLogos} club logo(s), ${migratedBanners} club banner(s) from base64 data URLs to disk files.`,
  )
}

main()
  .catch((e) => {
    console.error("Migration failed:", e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
