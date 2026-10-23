"use client"

import * as React from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { initials } from "@/components/shared/page-header"

/**
 * ============================================================================
 * DecoratedAvatar — Discord-style decorative frames around avatars
 * ============================================================================
 *
 * A drop-in replacement for `<Avatar>` that renders an animated decorative
 * layer BEHIND the avatar (rings, auras, sparkles, orbits…). The decoration
 * id is stored on `User.avatarDecoration` and plumbed through the APIs that
 * return user data (me, members, chat messages, conversations).
 *
 * Design constraints:
 *  - Every effect animates ONLY `transform` + `opacity` (compositor-friendly —
 *    no repaints; keeps chat scrolling and sheets smooth on mobile).
 *  - Layers are absolutely positioned inside a relative wrapper so the
 *    component never affects surrounding layout.
 *  - All animations freeze under `prefers-reduced-motion` (globals.css guard).
 *  - Effects scale with the avatar size (they use inset/em-relative units).
 *
 * The `<Avatar>` itself renders on top at full size; each effect paints into
 * the negative inset space around it.
 */

export const DECORATION_IDS = [
  "none",
  "ring",
  "aura",
  "sparkles",
  "orbit",
  "petals",
  "glitch",
  "sunset",
  "aurora",
  "halo",
] as const

export type DecorationId = (typeof DECORATION_IDS)[number]

/** Human labels for pickers (onboarding tour, settings). */
export const DECORATION_LABELS: Record<DecorationId, string> = {
  none: "None",
  ring: "Jewel ring",
  aura: "Soft aura",
  sparkles: "Starlight",
  orbit: "Comet orbit",
  petals: "Petals",
  glitch: "Glitch",
  sunset: "Sunset halo",
  aurora: "Aurora ring",
  halo: "Gold halo",
}

export function isDecorationId(v: unknown): v is DecorationId {
  return typeof v === "string" && (DECORATION_IDS as readonly string[]).includes(v)
}

/** Coerce anything (API payload / localStorage) into a safe DecorationId. */
export function toDecorationId(v: unknown): DecorationId {
  return isDecorationId(v) ? v : "none"
}

interface DecoratedAvatarProps extends React.ComponentProps<"div"> {
  /** Decoration id (validated; anything unknown renders plain). */
  decoration?: string | null | undefined
  /** Avatar image src (data URL or http) — null/undefined renders initials. */
  src?: string | null
  /** Name used for the initials fallback + alt text. */
  name: string
  /** Extra classes forwarded to the inner Avatar (border etc.). */
  avatarClassName?: string
}

export function DecoratedAvatar({
  decoration,
  src,
  name,
  className,
  avatarClassName,
  children,
  ...props
}: DecoratedAvatarProps) {
  const deco = toDecorationId(decoration)
  return (
    <div className={cn("relative inline-flex shrink-0", className)} {...props}>
      {deco !== "none" && <DecorationLayer decoration={deco} />}
      <Avatar className={cn("relative z-[1] h-full w-full", avatarClassName)}>
        {src ? <AvatarImage src={src} alt={name} /> : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      {children}
    </div>
  )
}

/** The animated effect layer — absolute, behind the avatar, never hit-tests. */
function DecorationLayer({ decoration }: { decoration: DecorationId }) {
  switch (decoration) {
    case "ring":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-ring"
            style={{ animation: "ch-deco-spin 7s linear infinite" }}
          />
          <span aria-hidden className="ch-deco ch-deco-mask" />
        </>
      )
    case "aura":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-aura"
            style={{ animation: "ch-deco-breathe 3.4s ease-in-out infinite" }}
          />
          <span
            aria-hidden
            className="ch-deco ch-deco-aura ch-deco-aura-2"
            style={{ animation: "ch-deco-breathe 3.4s ease-in-out infinite", animationDelay: "-1.7s" }}
          />
        </>
      )
    case "sparkles":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-orbit"
            style={{ animation: "ch-deco-spin 9s linear infinite" }}
          >
            <i className="ch-deco-sparkle ch-deco-sparkle-1" style={{ animation: "ch-deco-twinkle 1.8s ease-in-out infinite" }} />
            <i className="ch-deco-sparkle ch-deco-sparkle-2" style={{ animation: "ch-deco-twinkle 2.4s ease-in-out infinite", animationDelay: "-0.6s" }} />
            <i className="ch-deco-sparkle ch-deco-sparkle-3" style={{ animation: "ch-deco-twinkle 2.1s ease-in-out infinite", animationDelay: "-1.2s" }} />
            <i className="ch-deco-sparkle ch-deco-sparkle-4" style={{ animation: "ch-deco-twinkle 2.7s ease-in-out infinite", animationDelay: "-0.3s" }} />
          </span>
        </>
      )
    case "orbit":
      return (
        <span
          aria-hidden
          className="ch-deco ch-deco-orbit-ring"
          style={{ animation: "ch-deco-spin 14s linear infinite" }}
        >
          <i className="ch-deco-orbit-dot" />
        </span>
      )
    case "petals":
      return (
        <span
          aria-hidden
          className="ch-deco ch-deco-orbit"
          style={{ animation: "ch-deco-spin 12s linear infinite" }}
        >
          <i className="ch-deco-petal ch-deco-petal-1" />
          <i className="ch-deco-petal ch-deco-petal-2" />
          <i className="ch-deco-petal ch-deco-petal-3" />
        </span>
      )
    case "glitch":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-glitch ch-deco-glitch-teal"
            style={{ animation: "ch-deco-flicker 2.2s steps(2, jump-none) infinite" }}
          />
          <span
            aria-hidden
            className="ch-deco ch-deco-glitch ch-deco-glitch-warm"
            style={{ animation: "ch-deco-flicker 2.2s steps(2, jump-none) infinite", animationDelay: "-1.1s" }}
          />
        </>
      )
    case "sunset":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-sunset"
            style={{ animation: "ch-deco-breathe 5s ease-in-out infinite" }}
          />
          <span
            aria-hidden
            className="ch-deco ch-deco-mask"
          />
        </>
      )
    case "aurora":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-aurora-glow"
            style={{ animation: "ch-deco-breathe 4.5s ease-in-out infinite" }}
          />
          <span
            aria-hidden
            className="ch-deco ch-deco-aurora"
            style={{ animation: "ch-deco-spin 10s linear infinite" }}
          />
        </>
      )
    case "halo":
      return (
        <>
          <span
            aria-hidden
            className="ch-deco ch-deco-halo"
            style={{ animation: "ch-deco-breathe 4s ease-in-out infinite" }}
          />
          <span
            aria-hidden
            className="ch-deco ch-deco-mask"
          />
        </>
      )
    default:
      return null
  }
}
