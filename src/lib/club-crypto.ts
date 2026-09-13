import crypto from "crypto"

/**
 * Reversible AES-256-GCM encryption for the CLUB JOIN PASSWORD.
 *
 * The key comes from CLUB_PASSWORD_ENC_KEY (32-byte hex or base64). If unset,
 * we use a deterministic fallback key. The club join password is low-sensitivity
 * (it's a shared "join code", not a user account password).
 */

const ALGO = "aes-256-gcm"

// All keys that may have been used to encrypt club passwords — we try each
// when decrypting so existing clubs keep working even if the key changes.
const FALLBACK_KEYS = [
  crypto.createHash("sha256").update("clubhub-default-enc-key-v1").digest(),
  crypto.createHash("sha256").update("clubhub-dev-enc-key").digest(),
]

function getKeys(): Buffer[] {
  const env = process.env.CLUB_PASSWORD_ENC_KEY
  const keys = [...FALLBACK_KEYS]
  if (env) {
    if (/^[0-9a-fA-F]{64}$/.test(env)) {
      keys.unshift(Buffer.from(env, "hex"))
    } else {
      const b = Buffer.from(env, "base64")
      if (b.length === 32) keys.unshift(b)
      else console.warn("[club-crypto] CLUB_PASSWORD_ENC_KEY is malformed — using fallback keys")
    }
  }
  return keys
}

function getPrimaryKey(): Buffer {
  return getKeys()[0]
}

/** Encrypts a plaintext password. Returns a single string `iv:tag:ciphertext` (all hex). */
export function encryptClubPassword(plaintext: string): string {
  const key = getPrimaryKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":")
}

/** Decrypts an `iv:tag:ciphertext` string. Tries all known keys. Throws if all fail. */
export function decryptClubPassword(stored: string): string {
  const parts = stored.split(":")
  if (parts.length !== 3) throw new Error("malformed club password ciphertext")
  const [ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const data = Buffer.from(dataHex, "hex")

  // Try each key — the first one that successfully decrypts wins.
  for (const key of getKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, key, iv)
      decipher.setAuthTag(tag)
      const dec = Buffer.concat([decipher.update(data), decipher.final()])
      return dec.toString("utf8")
    } catch {
      // Wrong key — try the next one
    }
  }
  throw new Error("Could not decrypt with any known key")
}

/** Verifies a plaintext password against the stored encrypted form. */
export function verifyClubPassword(plaintext: string, stored: string): boolean {
  try {
    return decryptClubPassword(stored) === plaintext
  } catch {
    return false
  }
}
