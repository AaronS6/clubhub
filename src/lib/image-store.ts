import { mkdir, unlink, readFile } from "fs/promises"
import path from "path"

/**
 * Server-only disk image store.
 *
 * Processed images (avatars, club logos/banners) live as JPEG files on disk
 * under `storage/` instead of base64 data URLs in SQLite — the DB keeps only
 * a short URL (`/api/avatars/{userId}?v=...`) that this module + the serving
 * routes resolve back to bytes. This keeps chat/announcement/member payloads
 * small (no ~20–140KB base64 blobs per row).
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage")

export type ImageKind = "avatar" | "club-image"

/** Directory (relative to STORAGE_ROOT) for each kind of image. */
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
 * Allowing anything else would risk path traversal via `../` etc.
 */
const KEY_RE = /^[A-Za-z0-9_-]+$/

function assertValidKey(key: string): void {
  if (!KEY_RE.test(key)) {
    throw new Error(`Invalid image key: ${JSON.stringify(key)}`)
  }
}

function filePath(kind: ImageKind, key: string): string {
  assertValidKey(key)
  return path.join(STORAGE_ROOT, KIND_DIR[kind], `${key}.jpg`)
}

/**
 * Writes `buffer` as `storage/{kind-dir}/{key}.jpg`, creating the directory
 * if needed. Overwrites any previous file with the same key.
 */
export async function saveImage(
  kind: ImageKind,
  key: string,
  buffer: Buffer,
): Promise<void> {
  const target = filePath(kind, key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFileAtomic(target, buffer)
}

/**
 * Deletes `storage/{kind-dir}/{key}.jpg` if it exists. Missing files are
 * fine (ENOENT swallowed) — DELETE endpoints must stay idempotent.
 */
export async function deleteImage(kind: ImageKind, key: string): Promise<void> {
  try {
    await unlink(filePath(kind, key))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
  }
}

/** Reads `storage/{kind-dir}/{key}.jpg`, or null if it doesn't exist. */
export async function readImage(
  kind: ImageKind,
  key: string,
): Promise<Buffer | null> {
  try {
    return await readFile(filePath(kind, key))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
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

/**
 * Write-then-rename so a concurrent GET never observes a half-written file.
 * (rename over an existing file is atomic on POSIX.)
 */
async function writeFileAtomic(target: string, buffer: Buffer): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`
  const { writeFile, rename } = await import("fs/promises")
  await writeFile(tmp, buffer)
  await rename(tmp, target)
}
