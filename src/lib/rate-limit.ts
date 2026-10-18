/**
 * In-memory rolling-window rate limiter.
 *
 * Used by the chat message POST endpoint to cap messages-per-user-per-minute
 * per conversation. Lives in module memory of the Next.js server process, so
 * it's accurate for a single instance (which is what this deployment is).
 * Entries older than the window are pruned lazily on each call.
 */

interface Bucket {
  /** Timestamps (ms) of recent events, oldest first. */
  hits: number[]
}

const buckets = new Map<string, Bucket>()

/**
 * Records a hit and returns whether the caller is within the limit.
 * `key` is any opaque string (e.g. `${userId}:${conversationId}`).
 * Returns `{ ok: true }` if allowed (and counted), or
 * `{ ok: false, retryAfterMs }` if the limit is exceeded.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now()
  const cutoff = now - windowMs
  const bucket = buckets.get(key)
  let hits: number[]
  if (!bucket) {
    hits = []
  } else {
    // Drop entries outside the rolling window.
    hits = bucket.hits.filter((t) => t > cutoff)
  }
  if (hits.length >= limit) {
    // retryAfter = oldest hit + window - now (when the oldest hit falls out)
    const oldest = hits[0]
    const retryAfterMs = Math.max(1, oldest + windowMs - now)
    if (bucket) bucket.hits = hits
    return { ok: false, retryAfterMs }
  }
  hits.push(now)
  if (bucket) {
    bucket.hits = hits
  } else {
    buckets.set(key, { hits })
  }
  return { ok: true }
}

/** Best-effort client IP for rate-limit keys (behind the Caddy gateway /
 *  Render's proxy). Falls back to "unknown" — a shared bucket — when no
 *  proxy headers exist (e.g. direct local access). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

/** Standard 429 response with a human-friendly message + Retry-After. */
export function tooManyRequests(retryAfterMs: number, what = "Too many attempts") {
  const mins = Math.ceil(retryAfterMs / 60_000)
  const wait = mins > 1 ? `${mins} minutes` : "a minute"
  return Response.json(
    { error: `${what} — please wait ${wait} and try again.` },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  )
}
