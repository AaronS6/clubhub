"use client"

import { useEffect, useState, ReactNode } from "react"
import { useAppStore } from "@/lib/store"

/**
 * ============================================================================
 * ClubAccentProvider — dynamic per-club accent color system
 * ============================================================================
 *
 * Why this exists
 * ---------------
 * Each club has its own brand color (`club.accentColor`, a hex string). Rather
 * than rebuild the entire shadcn palette whenever the user switches clubs, we
 * inject that color as a set of CSS custom properties on a wrapper element.
 * Tailwind utility classes (registered in globals.css `@theme inline`) then
 * resolve to the current club's color.
 *
 * Accent utilities you should use
 * -------------------------------
 *   bg-club                — solid accent background (primary CTAs, active dots)
 *   bg-club-muted          — 12%-alpha accent tint (active rows, subtle washes)
 *   bg-club-subtle         — 6%-alpha accent tint (unread highlights, hover bg)
 *   text-club              — accent text (links, active labels, focused icons)
 *   text-club-foreground   — readable foreground ON accent (used inside bg-club)
 *   ring-club              — accent focus ring (used by interactive elements)
 *   border-club            — accent border (active tabs, selected cards)
 *
 * When to use semantic colors instead
 * ------------------------------------
 * Status chips (pending/approved/rejected/in-progress) use the dedicated
 * chip-* classes from globals.css. Those are *intentionally* semantic
 * (amber for pending, emerald for approved, blue for in-progress, red for
 * rejected) and should NOT be replaced with accent utilities — they convey
 * meaning independent of the club's brand color.
 *
 * For primary CTAs, active navigation, links, focus rings, progress fills,
 * and chart colors, prefer accent utilities.
 *
 * The Button component exposes a `variant="club"` that already wires up
 * bg-club / text-club-foreground with proper hover/active states — use it
 * for primary actions instead of `variant="default"`.
 *
 * Implementation note
 * -------------------
 * The CSS vars are set inline on a `div.className="contents"` wrapper, so it
 * doesn't introduce any extra box in the layout. We also override `--ring`
 * to the accent so focus-visible rings across shadcn primitives pick up the
 * brand color automatically.
 * ============================================================================
 */

/**
 * Computes a readable foreground color (dark or light) for a given hex accent,
 * using relative luminance (WCAG). Returns "#ffffff" or "#1a1a1a".
 */
function readableForeground(hex: string): string {
  let c = hex.replace("#", "").trim()
  if (c.length === 3) c = c.split("").map((x) => x + x).join("")
  if (c.length !== 6) return "#ffffff"
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.55 ? "#1a1a1a" : "#ffffff"
}

/**
 * Converts a hex color to an rgba() string with the given alpha.
 * Falls back gracefully on bad input.
 */
function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace("#", "").trim()
  if (c.length === 3) c = c.split("").map((x) => x + x).join("")
  if (c.length !== 6) return `rgba(16,185,129,${alpha})`
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const DEFAULT_ACCENT = "#10b981"

/**
 * Injects the active club's accent color as CSS variables on a wrapper element,
 * so `bg-club`, `text-club-foreground`, `ring-club`, `border-club` etc. resolve
 * to the current club's brand color. Updates instantly when the user switches
 * clubs. Also drives a subtle [data-accent] attribute for advanced selectors.
 */
export function ClubAccentProvider({ children }: { children: ReactNode }) {
  const currentClub = useAppStore((s) => s.currentClub)
  const accent = currentClub?.accentColor || DEFAULT_ACCENT
  const [vars, setVars] = useState<Record<string, string>>(() => computeVars(DEFAULT_ACCENT))

  useEffect(() => {
    setVars(computeVars(accent))
  }, [accent])

  return (
    <div
      style={vars as React.CSSProperties}
      data-accent={accent}
      className="contents"
    >
      {children}
    </div>
  )
}

function computeVars(accent: string): Record<string, string> {
  const fg = readableForeground(accent)
  return {
    "--club-accent": accent,
    "--club-accent-foreground": fg,
    "--club-accent-muted": hexToRgba(accent, 0.12),
    "--club-accent-subtle": hexToRgba(accent, 0.06),
    // Override the global --ring so focus rings on every shadcn primitive
    // pick up the active club's accent. The default --ring in globals.css
    // is hardcoded to a warm emerald; without this override, focus rings
    // would stay emerald even when the active club's accent is, say, sky-blue.
    "--ring": accent,
  }
}
