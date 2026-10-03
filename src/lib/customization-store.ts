"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * ============================================================================
 * Customization store — user-level visual personalization
 * ============================================================================
 *
 * This is SEPARATE from the per-club accent color (which lives in the
 * `clubhub-app` store, driven by the club's `accentColor` field). The
 * customization store is a user-wide preference layer that:
 *
 *   1. Overrides the club accent color with a user-chosen theme color
 *      (when `overrideThemeColor` is true).
 *   2. Renders an ambient background effect (aurora / blobs / bubbles /
 *      mesh / waves / particles) behind the app shell.
 *
 * Persisted under `clubhub-customization` so it survives reloads and is
 * available even before the user joins a club (e.g. on the auth screen).
 *
 * The defaults are intentionally restrained: `overrideThemeColor: false`
 * means the per-club accent is used by default, and `ambient: "none"` means
 * the background stays clean. The onboarding flow invites the user to pick
 * something more expressive, and the settings dialog lets them change it
 * anytime.
 * ============================================================================
 */

export type AmbientEffect =
  | "none"
  | "aurora"
  | "blobs"
  | "bubbles"
  | "mesh"
  | "waves"
  | "particles"
  | "stardust"

/** The set of presets offered in the picker. Order matters — this is the
 *  order they appear in the onboarding and settings UI. */
export const AMBIENT_PRESETS: { id: AmbientEffect; label: string; description: string }[] = [
  { id: "none", label: "Clean", description: "No background effect. Minimal and focused." },
  { id: "aurora", label: "Aurora", description: "Soft polar ribbons of light that drift slowly." },
  { id: "blobs", label: "Blobs", description: "Three slow morphing blobs that breathe." },
  { id: "bubbles", label: "Bubbles", description: "Floating translucent bubbles rising gently." },
  { id: "mesh", label: "Mesh", description: "A warm gradient mesh that shifts hue over time." },
  { id: "waves", label: "Waves", description: "Layered contour waves at the bottom." },
  { id: "particles", label: "Particles", description: "A dust of tiny motes drifting upward." },
  { id: "stardust", label: "Stardust", description: "A constellation of twinkling pinpoints." },
]

/** Theme color presets — a curated palette. Users can also pick any hex
 *  color via the color input. These are the swatches shown in the picker. */
export const THEME_COLOR_PRESETS: { id: string; label: string; hex: string }[] = [
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "ocean", label: "Ocean", hex: "#0ea5e9" },
  { id: "sunset", label: "Sunset", hex: "#f97316" },
  { id: "violet", label: "Violet", hex: "#a855f7" },
  { id: "rose", label: "Rose", hex: "#ef4444" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
  { id: "amber", label: "Amber", hex: "#eab308" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "indigo", label: "Indigo", hex: "#6366f1" },
  { id: "lime", label: "Lime", hex: "#84cc16" },
  { id: "cyan", label: "Cyan", hex: "#06b6d4" },
  { id: "fuchsia", label: "Fuchsia", hex: "#d946ef" },
]

interface CustomizationState {
  /** When true, the user's chosen theme color overrides the per-club accent.
   *  When false, the club's accent color is used (default). */
  overrideThemeColor: boolean
  /** The user's chosen theme color (hex). Only applied when
   *  `overrideThemeColor` is true. */
  themeColor: string
  /** The ambient background effect. `none` = clean. */
  ambient: AmbientEffect
  /** Intensity of the ambient effect, 0–100. Lower = subtler. */
  ambientIntensity: number
  /** Whether the user has completed the onboarding tour at least once.
   *  Used to auto-trigger the tour only on the first club join. */
  onboardingCompleted: boolean

  setOverrideThemeColor: (v: boolean) => void
  setThemeColor: (hex: string) => void
  setAmbient: (a: AmbientEffect) => void
  setAmbientIntensity: (n: number) => void
  setOnboardingCompleted: (v: boolean) => void
  reset: () => void
}

const DEFAULTS = {
  overrideThemeColor: false,
  themeColor: "#10b981",
  ambient: "none" as AmbientEffect,
  ambientIntensity: 70,
  onboardingCompleted: false,
}

export const useCustomizationStore = create<CustomizationState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setOverrideThemeColor: (overrideThemeColor) => set({ overrideThemeColor }),
      setThemeColor: (themeColor) => set({ themeColor, overrideThemeColor: true }),
      setAmbient: (ambient) => set({ ambient }),
      setAmbientIntensity: (ambientIntensity) =>
        set({ ambientIntensity: Math.max(0, Math.min(100, ambientIntensity)) }),
      setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: "clubhub-customization" }
  )
)
