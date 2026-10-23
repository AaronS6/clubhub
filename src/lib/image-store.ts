import { unlink, readFile } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"

/**
 * Server-only image store — DATABASE-backed (was disk-backed).
 *
 * Processed images (avatars, club logos/banners) live as JPEG bytes in the
 * `StoredImage` table instead of files under `storage/`. Why the switch: the
 * filesystem is EPHEMERAL in every real deployment — sandbox migrations,
 * Render redeploys, and free-tier sleep/wake cycles all come back with a
 * BLANK disk while the DB still points at `/api/club-images/{key}?v=…`, so
 * logos and banners "disappear for no reason". The DB is the only durable
 * store, so it is now the source of truth. Payloads stay small (the DB keeps
 * only a short URL per Club/User row; the bytes live here in their own table).
 *
 * Legacy migration: images written by the OLD disk store self-heal into the
 * DB on first read (see readImage), so a machine that still has `storage/`
 * keeps its logos/banners without any manual step.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage")

export type ImageKind = "avatar" | "club-image"

/** Directory (relative to the legacy STORAGE_ROOT) for each kind of image. */
const KIND_DIR: Record<ImageKind, string> = {
  avatar: "avatars",
  "club-image": "club-images",
}

/** API route prefix that serves each kind of image. */
const KIND_ROUTE: Record<ImageKind, string> = {
  avatar: "avatars",
  "club-image": "club-images",
}

/**
 * Keys must be plain id-ish tokens (cuids, `{clubId}-logo`, `{clubId}-banner`).
 * Allowing anything else would risk path traversal via `../` etc. (enforced
 * for the legacy-disk fallback paths, and kept for URL sanity too).
 */
const KEY_RE = /^[A-Za-z0-9_-]+$/

function assertValidKey(key: string): void {
  if (!KEY_RE.test(key)) {
    throw new Error(`Invalid image key: ${JSON.stringify(key)}`)
  }
}

/** Legacy disk path for an image written by the pre-DB store. */
function legacyFilePath(kind: ImageKind, key: string): string {
  assertValidKey(key)
  return path.join(STORAGE_ROOT, KIND_DIR[kind], `${key}.jpg`)
}

/** Prisma's Bytes column wants Uint8Array<ArrayBuffer> — Node's Buffer types
 * as Buffer<ArrayBufferLike> (SharedArrayBuffer-compatible), which the
 * stricter generated client type rejects. Copy into a plain Uint8Array via
 * the length constructor (always backed by a fresh ArrayBuffer). */
function toBytes(b: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(b.byteLength)
  out.set(b)
  return out
}

/**
 * Writes `buffer` (processed JPEG) as a `StoredImage` row, creating it if
 * needed. Re-saving overwrites the bytes and bumps `version`.
 */
export async function saveImage(
  kind: ImageKind,
  key: string,
  buffer: Buffer,
): Promise<void> {
  assertValidKey(key)
  await db.storedImage.upsert({
    where: { key },
    create: { key, kind, data: toBytes(buffer), version: 1 },
    update: { data: toBytes(buffer), kind, version: { increment: 1 } },
  })
}

/**
 * Deletes the `StoredImage` row if it exists (missing rows are fine — DELETE
 * endpoints stay idempotent). Also best-effort deletes any legacy disk file so
 * old deployments don't resurrect stale images.
 */
export async function deleteImage(kind: ImageKind, key: string): Promise<void> {
  assertValidKey(key)
  try {
    await db.storedImage.delete({ where: { key } })
  } catch (e: unknown) {
    // P2025 = record not found — the normal case for double-DELETEs.
    if ((e as { code?: string })?.code !== "P2025") throw e
  }
  try {
    await unlink(legacyFilePath(kind, key))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
  }
}

/** Reads the image's JPEG bytes, or null if it doesn't exist.
 *
 * Order of operations:
 *   1. DB row (the source of truth).
 *   2. Legacy disk file → SELF-HEAL: import it into the DB, then return it.
 *      This transparently migrates images written before the DB switch, so
 *      existing clubs never lose their logo/banner to the migration itself.
 */
export async function readImage(
  kind: ImageKind,
  key: string,
): Promise<Buffer | null> {
  assertValidKey(key)
  const row = await db.storedImage.findUnique({ where: { key } })
  if (row) return Buffer.from(row.data)

  // Legacy disk fallback (one-time import per image).
  try {
    const legacy = await readFile(legacyFilePath(kind, key))
    await saveImage(kind, key, legacy)
    return legacy
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[image-store] legacy read failed for ${key}:`, e)
    }
    return null
  }
}

/**
 * Public URL stored in the DB / returned to clients. The `v` version param
 * changes on every save so clients bust their `immutable` cached copy.
 */
export function publicUrl(kind: ImageKind, key: string, version: number): string {
  assertValidKey(key)
  return `/api/${KIND_ROUTE[kind]}/${key}?v=${version}`
}
