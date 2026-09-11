import crypto from "crypto"

/**
 * Reversible AES-256-GCM encryption for the CLUB JOIN PASSWORD.
 *
 * This is NOT a user account password — it's a shared "join code" that executives
 * distribute to let new members join a club. It's low-sensitivity but we still
 * encrypt it at rest (rather than storing plaintext) so a DB dump doesn't leak it.
 * Executives can retrieve it via the API; members cannot.
 *
 * The key comes from CLUB_PASSWORD_ENC_KEY (32-byte hex or base64). If unset, we
 * derive a deterministic dev key from a fixed seed — so the app works in dev but
 * you MUST set the env var in production.
 */

const ALGO = "aes-256-gcm"

function getKey(): Buffer {
  const env = process.env.CLUB_PASSWORD_ENC_KEY
  if (env) {
    // accept hex or base64
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex")
    const b = Buffer.from(env, "base64")
    if (b.length === 32) return b
    throw new Error("CLUB_PASSWORD_ENC_KEY must be 32 bytes (hex or base64)")
  }
  // Dev fallback — deterministic but NOT secure. Warn.
  if (process.env.NODE_ENV === "production") {
    throw new Error("CLUB_PASSWORD_ENC_KEY must be set in production")
  }
  return crypto.createHash("sha256").update("clubhub-dev-enc-key").digest()
}

/** Encrypts a plaintext password. Returns a single string `iv:tag:ciphertext` (all hex). */
export function encryptClubPassword(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":")
}

/** Decrypts an `iv:tag:ciphertext` string back to plaintext. Throws on tamper/wrong key. */
export function decryptClubPassword(stored: string): string {
  const parts = stored.split(":")
  if (parts.length !== 3) throw new Error("malformed club password ciphertext")
  const [ivHex, tagHex, dataHex] = parts
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()])
  return dec.toString("utf8")
}

/** Verifies a plaintext password against the stored encrypted form. */
export function verifyClubPassword(plaintext: string, stored: string): boolean {
  try {
    return decryptClubPassword(stored) === plaintext
  } catch {
    return false
  }
}
