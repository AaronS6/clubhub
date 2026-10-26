"use client"

import { useMemo } from "react"
import { useCustomizationStore, type AmbientEffect } from "@/lib/customization-store"
import { useAppStore } from "@/lib/store"

/**
 * ============================================================================
 * AmbientBackground — the live-preview layer for the customization system
 * ============================================================================
 *
 * Renders one of eight background effects behind the app. All effects are
 * pure CSS (no canvas, no WebGL, no images) so they:
 *   - work on every device
 *   - cost nothing to ship (a few KB of CSS + a handful of divs)
 *   - respect `prefers-reduced-motion` (animations halt to a static frame)
 *
 * Design philosophy: every effect is SLOW (30–60s loops), SOFT (heavy blur,
 * no hard edges, no regular patterns) and PRESENT — the veil that sits
 * between the effect and the app is deliberately light (fixed 30%) so a
 * chosen background actually reads as a colorful wash, not a rumor of one.
 * The intensity slider (0–100) scales the effect layer linearly on top of
 * that. Text contrast stays safe: everything under the app's content is
 * either an opaque card or sits over ≤45% alpha of heavily blurred color.
 * ============================================================================
 */

interface AmbientBackgroundProps {
  accent?: string
}

export function AmbientBackground({ accent }: AmbientBackgroundProps) {
  const ambient = useCustomizationStore((s) => s.ambient)
  const intensity = useCustomizationStore((s) => s.ambientIntensity)
  const clubAccent = useAppStore((s) => s.currentClub?.accentColor) ?? "#10b981"
  const override = useCustomizationStore((s) => s.overrideThemeColor)
  const themeColor = useCustomizationStore((s) => s.themeColor)
  const color = accent ?? (override ? themeColor : clubAccent)

  const opacity = intensity / 100

  // A wider hue spread than the accent itself (+40° / −35°) so every effect
  // reads as a small PALETTE, not the same hue stamped three times.
  const palette = useMemo(() => {
    const [h, s, l] = hexToHsl(color)
    return {
      base: color,
      c2: hslToHex((h + 40) % 360, Math.max(0.45, s * 0.9), Math.min(72, l + 5)),
      c3: hslToHex((h - 35 + 360) % 360, Math.max(0.45, s * 0.85), Math.min(76, l + 9)),
    }
  }, [color])

  if (ambient === "none") {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ background: "var(--background)", zIndex: 0 }}
      />
    )
  }

  return (
    <>
      {/* `ch-bg-idle` — globals.css pauses every animation under this root
          while a modal overlay (sheet/dialog) is open: the overlay's dark
          scrim hides the background entirely, so freezing the heavy blurred
          layers for those few seconds is visually free and removes the
          per-frame compositing cost that made mobile sheet opens choppy. */}
      <div
        aria-hidden
        className="ch-bg-idle pointer-events-none fixed inset-0 overflow-hidden"
        style={{
          ["--ambient-opacity" as string]: String(opacity),
          ["--ambient-base" as string]: palette.base,
          ["--ambient-c2" as string]: palette.c2,
          ["--ambient-c3" as string]: palette.c3,
          zIndex: 0,
        }}
      >
        <AmbientEffect effect={ambient} />
      </div>
      {/* The veil — a LIGHT, fixed 30% wash of the page background over the
          effect. Previous builds scaled this up to 65%+, which is why
          backgrounds "barely showed up": at default intensity the effect
          survived at ~10% alpha. Now the intensity slider alone controls
          strength, and 70% of whatever you pick actually reaches the screen. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: "var(--background)",
          opacity: 0.3,
          zIndex: 1,
        }}
      />
    </>
  )
}

function AmbientEffect({ effect }: { effect: AmbientEffect }) {
  switch (effect) {
    case "aurora":
      return <Aurora />
    case "blobs":
      return <Blobs />
    case "bubbles":
      return <Bubbles />
    case "mesh":
      return <Mesh />
    case "waves":
      return <Waves />
    case "particles":
      return <Particles />
    case "stardust":
      return <Stardust />
    default:
      return null
  }
}

/* ───────────────────────── Effects ───────────────────────── */

/**
 * Aurora — three tall, soft light curtains that breathe and sway at
 * different speeds. Polar-photo feel: vertical, diffuse, never harsh.
 */
function Aurora() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-aurora-sway1 {
          0%, 100% { transform: translate(-4%, 0) scaleX(1); opacity: 0.55; }
          50%      { transform: translate(7%, -3%) scaleX(1.18); opacity: 0.75; }
        }
        @keyframes ch-aurora-sway2 {
          0%, 100% { transform: translate(4%, 2%) scaleX(1.12); opacity: 0.6; }
          50%      { transform: translate(-6%, -2%) scaleX(0.94); opacity: 0.45; }
        }
        @keyframes ch-aurora-sway3 {
          0%, 100% { transform: translate(0, 0) scaleY(1); opacity: 0.35; }
          50%      { transform: translate(-3%, -4%) scaleY(1.12); opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-aurora-col { animation: none !important; } }
      `}</style>
      {/* Left curtain — the anchor hue */}
      <div
        className="ch-aurora-col absolute left-[-12%] top-[-20%] h-[150%] w-[48%]"
        style={{
          background: `linear-gradient(165deg, transparent 0%, var(--ambient-base) 38%, var(--ambient-c2) 68%, transparent 100%)`,
          animation: "ch-aurora-sway1 36s ease-in-out infinite",
          filter: "blur(70px)",
          willChange: "transform",
        }}
      />
      {/* Right curtain — the counter-hue for depth */}
      <div
        className="ch-aurora-col absolute right-[-12%] top-[-15%] h-[140%] w-[44%]"
        style={{
          background: `linear-gradient(200deg, transparent 0%, var(--ambient-c3) 32%, var(--ambient-base) 66%, transparent 100%)`,
          animation: "ch-aurora-sway2 44s ease-in-out infinite",
          filter: "blur(70px)",
          willChange: "transform",
        }}
      />
      {/* Bottom glow — grounds the composition so it doesn't float */}
      <div
        className="ch-aurora-col absolute bottom-[-30%] left-[20%] h-[70%] w-[60%]"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 60%, var(--ambient-c2) 0%, transparent 70%)`,
          animation: "ch-aurora-sway3 52s ease-in-out infinite",
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
    </div>
  )
}

/**
 * Blobs — three large morphing circles that breathe and drift. Radial fills
 * (brighter core, soft falloff) instead of flat color, so each blob reads
 * as volume rather than a sticker.
 */
function Blobs() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        /* PERF: keyframes animate ONLY transform + opacity (compositor-only —
           no style recalc / repaint). The blobs never morph border-radius. */
        @keyframes ch-blob-morph1 {
          0%, 100% { transform: translate(0,0) scale(1); }
          34%      { transform: translate(4%, -3%) scale(1.06); }
          67%      { transform: translate(-3%, 4%) scale(0.96); }
        }
        @keyframes ch-blob-morph2 {
          0%, 100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(-5%, 3%) scale(1.09); }
          80%      { transform: translate(3%, -4%) scale(0.94); }
        }
        @keyframes ch-blob-morph3 {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(2%, 5%) scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-blob { animation: none !important; } }
      `}</style>
      {/* PERF: ONE blur only (the inline filter) — never combine with a
          blur-* utility, which double-rasters for the same visual. */}
      <div
        className="ch-blob absolute left-[-10%] top-[-12%] h-[60vh] w-[60vh] rounded-full"
        style={{
          background: "radial-gradient(circle at 38% 38%, var(--ambient-base) 0%, color-mix(in oklab, var(--ambient-base) 55%, transparent) 55%, transparent 75%)",
          animation: "ch-blob-morph1 26s ease-in-out infinite",
          opacity: 0.7,
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
      <div
        className="ch-blob absolute right-[-12%] top-[12%] h-[54vh] w-[54vh] rounded-full"
        style={{
          background: "radial-gradient(circle at 60% 40%, var(--ambient-c2) 0%, color-mix(in oklab, var(--ambient-c2) 50%, transparent) 55%, transparent 75%)",
          animation: "ch-blob-morph2 32s ease-in-out infinite",
          opacity: 0.65,
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
      <div
        className="ch-blob absolute left-[22%] bottom-[-18%] h-[64vh] w-[64vh] rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, var(--ambient-c3) 0%, color-mix(in oklab, var(--ambient-c3) 45%, transparent) 55%, transparent 75%)",
          animation: "ch-blob-morph3 28s ease-in-out infinite",
          opacity: 0.6,
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
    </div>
  )
}

/**
 * Bubbles — soft luminous orbs rising slowly, like dust motes in light.
 * Varied palette colors and sizes; stronger cores that fade to nothing.
 */
function Bubbles() {
  const bubbles = useMemo(() => {
    const arr: { left: number; size: number; duration: number; delay: number; drift: number; hue: number }[] = []
    for (let i = 0; i < 16; i++) {
      const seed = i * 9301 + 49297
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: 3 + r(1) * 94,
        size: 56 + r(2) * 110,
        duration: 22 + r(3) * 22,
        delay: r(4) * -28,
        drift: (r(5) - 0.5) * 120,
        hue: i % 3,
      })
    }
    return arr
  }, [])
  const colorFor = (hue: number) =>
    ["var(--ambient-base)", "var(--ambient-c2)", "var(--ambient-c3)"][hue]
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-bubble-rise {
          0%   { transform: translateY(110vh) translateX(0); opacity: 0; }
          12%  { opacity: 0.5; }
          85%  { opacity: 0.35; }
          100% { transform: translateY(-25vh) translateX(var(--drift, 0px)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-bubble { animation: none !important; opacity: 0.45 !important; transform: translateY(35vh) !important; } }
      `}</style>
      {bubbles.map((b, i) => (
        <div
          key={i}
          className="ch-bubble absolute bottom-0 rounded-full"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle at 42% 42%, ${colorFor(b.hue)} 0%, transparent 62%)`,
            ["--drift" as string]: `${b.drift}px`,
            animation: `ch-bubble-rise ${b.duration}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
            filter: "blur(18px)",
            willChange: "transform",
          }}
        />
      ))}
    </div>
  )
}

/**
 * Mesh — three large radial anchors in the palette's three hues, drifting
 * on independent slow loops. Reads as a soft gradient POSTER behind the
 * app rather than a grid.
 */
function Mesh() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-mesh-shift {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          33%      { transform: translate(9%, -6%) scale(1.12); }
          66%      { transform: translate(-7%, 7%) scale(0.95); }
        }
        @keyframes ch-mesh-shift2 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          50%      { transform: translate(-11%, 9%) scale(1.16); }
        }
        @keyframes ch-mesh-shift3 {
          0%, 100% { transform: translate(0%, 0%) scale(1.05); }
          50%      { transform: translate(8%, -10%) scale(0.92); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-mesh-layer { animation: none !important; } }
      `}</style>
      <div
        className="ch-mesh-layer absolute inset-[-25%]"
        style={{
          background: `radial-gradient(ellipse 55% 45% at 28% 26%, var(--ambient-base) 0%, transparent 68%)`,
          animation: "ch-mesh-shift 40s ease-in-out infinite",
          opacity: 0.7,
          filter: "blur(50px)",
          willChange: "transform",
        }}
      />
      <div
        className="ch-mesh-layer absolute inset-[-25%]"
        style={{
          background: `radial-gradient(ellipse 50% 55% at 72% 68%, var(--ambient-c2) 0%, transparent 68%)`,
          animation: "ch-mesh-shift2 52s ease-in-out infinite",
          opacity: 0.6,
          filter: "blur(50px)",
          willChange: "transform",
        }}
      />
      <div
        className="ch-mesh-layer absolute inset-[-25%]"
        style={{
          background: `radial-gradient(ellipse 40% 35% at 55% 15%, var(--ambient-c3) 0%, transparent 66%)`,
          animation: "ch-mesh-shift3 46s ease-in-out infinite",
          opacity: 0.5,
          filter: "blur(50px)",
          willChange: "transform",
        }}
      />
    </div>
  )
}

/**
 * Waves — layered gradient hills rolling along the bottom, fog-over-hills
 * feel. Four layers drift at different speeds for parallax; the front two
 * carry the anchor hue so the composition lands.
 */
function Waves() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-wave-drift1 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(-42px); }
        }
        @keyframes ch-wave-drift2 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(52px); }
        }
        @keyframes ch-wave-drift3 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(-30px); }
        }
        @keyframes ch-wave-drift4 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(24px); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-wave-layer { animation: none !important; } }
      `}</style>
      {/* Back haze */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[-10%] right-[-10%] h-[46%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-c3) 0%, transparent 100%)`,
          animation: "ch-wave-drift1 38s ease-in-out infinite",
          opacity: 0.45,
          filter: "blur(34px)",
          borderRadius: "50% 50% 0 0 / 18% 18% 0 0",
        }}
      />
      {/* Mid wave */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[-10%] right-[-10%] h-[34%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-c2) 0%, transparent 100%)`,
          animation: "ch-wave-drift2 48s ease-in-out infinite",
          opacity: 0.55,
          filter: "blur(28px)",
          borderRadius: "50% 50% 0 0 / 24% 24% 0 0",
        }}
      />
      {/* Front-left wave */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[-14%] right-[20%] h-[26%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-base) 0%, transparent 100%)`,
          animation: "ch-wave-drift3 58s ease-in-out infinite",
          opacity: 0.6,
          filter: "blur(22px)",
          borderRadius: "50% 50% 0 0 / 30% 30% 0 0",
        }}
      />
      {/* Front-right wave */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[30%] right-[-14%] h-[20%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-base) 0%, transparent 100%)`,
          animation: "ch-wave-drift4 64s ease-in-out infinite",
          opacity: 0.65,
          filter: "blur(18px)",
          borderRadius: "50% 50% 0 0 / 34% 34% 0 0",
        }}
      />
    </div>
  )
}

/**
 * Particles — larger luminous motes drifting upward like dust in a sunbeam,
 * gently pulsing as they go. Mixed palette colors, heavy blur.
 */
function Particles() {
  const dots = useMemo(() => {
    const arr: { left: number; top: number; size: number; duration: number; delay: number; hue: number }[] = []
    for (let i = 0; i < 16; i++) {
      const seed = i * 7919 + 1009
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: r(1) * 100,
        top: r(2) * 100,
        size: 24 + r(3) * 44,
        duration: 9 + r(4) * 13,
        delay: r(5) * -12,
        hue: i % 3,
      })
    }
    return arr
  }, [])
  const colorFor = (hue: number) =>
    ["var(--ambient-base)", "var(--ambient-c2)", "var(--ambient-c3)"][hue]
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-particle-float {
          0%, 100% { transform: translate(0, 0); opacity: 0.25; }
          50%      { transform: translate(0, -26px); opacity: 0.65; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-particle { animation: none !important; opacity: 0.4 !important; } }
      `}</style>
      {dots.map((d, i) => (
        <div
          key={i}
          className="ch-particle absolute rounded-full"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            background: `radial-gradient(circle, ${colorFor(d.hue)} 0%, transparent 70%)`,
            animation: `ch-particle-float ${d.duration}s ease-in-out infinite`,
            animationDelay: `${d.delay}s`,
            filter: "blur(8px)",
          }}
        />
      ))}
    </div>
  )
}

/**
 * Stardust — a constellation of twinkling pinpoints. Opacity-pulse only (no
 * scaling), two sizes, two palette hues, soft glow — a calm night sky, not
 * a laser show.
 */
function Stardust() {
  const stars = useMemo(() => {
    const arr: { left: number; top: number; size: number; duration: number; delay: number; hue: number; big: boolean }[] = []
    for (let i = 0; i < 90; i++) {
      const seed = i * 4099 + 2017
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: r(1) * 100,
        top: r(2) * 100,
        size: 1 + r(3) * 2,
        duration: 3 + r(4) * 5,
        delay: r(5) * -8,
        hue: i % 2,
        big: r(6) > 0.86,
      })
    }
    return arr
  }, [])
  const colorFor = (hue: number) =>
    ["var(--ambient-base)", "var(--ambient-c2)"][hue]
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-star-twinkle {
          0%, 100% { opacity: 0.15; }
          50%      { opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-star { animation: none !important; opacity: 0.5 !important; } }
      `}</style>
      {stars.map((s, i) => (
        <div
          key={i}
          className="ch-star absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.big ? s.size + 1.5 : s.size,
            height: s.big ? s.size + 1.5 : s.size,
            background: colorFor(s.hue),
            boxShadow: `0 0 ${s.size * (s.big ? 5 : 3)}px ${colorFor(s.hue)}`,
            animation: `ch-star-twinkle ${s.duration}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/* ───────────────────────── Color utils ───────────────────────── */

function hexToHsl(hex: string): [number, number, number] {
  let c = hex.replace("#", "").trim()
  if (c.length === 3) c = c.split("").map((x) => x + x).join("")
  if (c.length !== 6) return [160, 0.7, 0.45]
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2); break
      case b: h = ((r - g) / d + 4); break
    }
    h *= 60
  }
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
