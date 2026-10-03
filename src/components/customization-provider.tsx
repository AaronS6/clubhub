"use client"

import { ReactNode } from "react"
import { useCustomizationStore } from "@/lib/customization-store"
import { AmbientBackground } from "@/components/ambient-background"

/**
 * ============================================================================
 * CustomizationProvider — user-level visual personalization layer
 * ============================================================================
 *
 * Sits INSIDE the ClubAccentProvider. It does two things:
 *
 *   1. If the user has chosen a custom theme color (overrideThemeColor: true),
 *      it OVERRIDES the `--club-accent*` CSS variables that
 *      ClubAccentProvider just set. This is intentionally a separate layer so
 *      the club accent is still the source of truth for the default
 *      experience; the user's override is a personalization on top.
 *
 *   2. Renders the AmbientBackground layer behind the app. The background is
 *      fixed-position and pointer-events-none, so it never interferes with
 *      interaction.
 *
 * Both pieces are no-ops by default (override off, ambient "none"), so the
 * out-of-the-box experience is unchanged until the user picks something in
 * onboarding or settings.
 * ============================================================================
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

function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace("#", "").trim()
  if (c.length === 3) c = c.split("").map((x) => x + x).join("")
  if (c.length !== 6) return `rgba(16,185,129,${alpha})`
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function computeOverrideVars(accent: string): Record<string, string> {
  return {
    "--club-accent": accent,
    "--club-accent-foreground": readableForeground(accent),
    "--club-accent-muted": hexToRgba(accent, 0.12),
    "--club-accent-subtle": hexToRgba(accent, 0.06),
    "--ring": accent,
  }
}

export function CustomizationProvider({ children }: { children: ReactNode }) {
  const override = useCustomizationStore((s) => s.overrideThemeColor)
  const themeColor = useCustomizationStore((s) => s.themeColor)
  const ambient = useCustomizationStore((s) => s.ambient)

  // Compute the override vars directly from props — no state, no effect, no
  // cascading render. When override is off, we pass an empty object so the
  // ClubAccentProvider's vars (inherited via the DOM since we sit inside it)
  // are used as-is.
  const vars = override ? computeOverrideVars(themeColor) : {}

  return (
    <>
      {/* Ambient layer — fixed, behind everything. The app shell sits at
          z-10+ (via `relative` on the wrapper below) so content stays on top. */}
      {ambient !== "none" && <AmbientBackground />}
      <div style={vars as React.CSSProperties} className="relative">
        {children}
      </div>
    </>
  )
}
