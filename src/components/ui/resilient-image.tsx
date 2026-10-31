"use client"

/**
 * ResilientImage — logo tile content that never shows a broken glyph.
 *
 * A single dropped request used to permanently render the browser's
 * broken-image icon inside logo tiles (dashboard banner, club switcher),
 * because nothing ever retried. This component retries the image ONCE with
 * a cache-busting parameter (proxy/tunnel hiccups are transient; the retry
 * usually lands) and only then falls back to clean initials — so a logo
 * tile either shows the logo or a calm branded tile, never an error state.
 *
 * `data:` URLs can't transiently fail (they parse or they don't), so they
 * skip the retry and fail straight to the fallback.
 */

import { useState } from "react"

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts
    .slice(0, 2)
    .map((p) => (p[0] ?? "").toUpperCase())
    .join("")
}

export function ResilientImage({
  src,
  alt,
  name,
  className,
}: {
  /** The logo URL — null/undefined renders the initials fallback. */
  src: string | null | undefined
  alt: string
  /** Club (or user) name — drives the initials fallback tile. */
  name: string
  /** Classes for the <img> when it renders (e.g. "h-full w-full object-cover"). */
  className?: string
}) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  // Reset when the src prop changes (club switch, upload, realtime update)
  // so a previously-failed image doesn't hide a new valid one. Official
  // "adjust state when props change" pattern — no effect needed.
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setAttempt(0)
    setFailed(false)
  }

  if (!src || failed) {
    return <span aria-label={alt}>{initialsFor(name)}</span>
  }

  const bustable = !src.startsWith("data:")
  const resolved =
    attempt > 0 && bustable
      ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`
      : src

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      onError={() => {
        if (bustable && attempt === 0) {
          setAttempt(1) // one cache-busted retry before giving up
        } else {
          setFailed(true)
        }
      }}
    />
  )
}
