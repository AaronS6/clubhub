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
 * Design philosophy: every effect is SLOW (30–60s loops), SUBTLE (low
 * opacity), and ORGANIC (no hard edges, no regular patterns). The goal is a
 * calm, living backdrop — not a screensaver.
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

  const palette = useMemo(() => {
    const [h, s, l] = hexToHsl(color)
    return {
      base: color,
      c2: hslToHex((h + 25) % 360, Math.max(0.4, s * 0.85), Math.min(75, l + 6)),
      c3: hslToHex((h - 20 + 360) % 360, Math.max(0.4, s * 0.9), Math.min(78, l + 10)),
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
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
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
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: "var(--background)",
          opacity: 1 - opacity * 0.5,
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
 * Aurora — two wide, soft vertical light columns that slowly breathe and
 * shift hue. Inspired by polar aurora photos: vertical, diffuse, never harsh.
 * Uses tall blurred gradients that sway gently rather than horizontal bands.
 */
function Aurora() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-aurora-sway1 {
          0%, 100% { transform: translate(-5%, 0) scaleX(1); opacity: 0.4; }
          50%      { transform: translate(8%, -3%) scaleX(1.15); opacity: 0.6; }
        }
        @keyframes ch-aurora-sway2 {
          0%, 100% { transform: translate(5%, 2%) scaleX(1.1); opacity: 0.5; }
          50%      { transform: translate(-6%, -2%) scaleX(0.95); opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-aurora-col { animation: none !important; } }
      `}</style>
      {/* Left column */}
      <div
        className="ch-aurora-col absolute left-[-10%] top-[-15%] h-[130%] w-[45%] blur-3xl"
        style={{
          background: `linear-gradient(160deg, transparent 0%, var(--ambient-base) 40%, var(--ambient-c2) 70%, transparent 100%)`,
          animation: "ch-aurora-sway1 32s ease-in-out infinite",
          filter: "blur(60px)",
        }}
      />
      {/* Right column */}
      <div
        className="ch-aurora-col absolute right-[-10%] top-[-10%] h-[120%] w-[40%] blur-3xl"
        style={{
          background: `linear-gradient(200deg, transparent 0%, var(--ambient-c3) 35%, var(--ambient-base) 65%, transparent 100%)`,
          animation: "ch-aurora-sway2 38s ease-in-out infinite",
          filter: "blur(60px)",
        }}
      />
    </div>
  )
}

/**
 * Blobs — three large morphing circles that breathe and drift. Heavy blur,
 * slow morph, soft colors. (Unchanged — user likes this one.)
 */
function Blobs() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-blob-morph1 {
          0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0,0) scale(1); }
          34%      { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; transform: translate(4%, -3%) scale(1.05); }
          67%      { border-radius: 50% 50% 33% 67% / 30% 70% 40% 60%; transform: translate(-3%, 4%) scale(0.96); }
        }
        @keyframes ch-blob-morph2 {
          0%, 100% { border-radius: 40% 60% 70% 30% / 40% 70% 30% 60%; transform: translate(0,0) scale(1); }
          40%      { border-radius: 70% 30% 50% 50% / 30% 50% 50% 70%; transform: translate(-5%, 3%) scale(1.08); }
          80%      { border-radius: 30% 70% 40% 60% / 60% 40% 60% 40%; transform: translate(3%, -4%) scale(0.94); }
        }
        @keyframes ch-blob-morph3 {
          0%, 100% { border-radius: 50% 50% 60% 40% / 30% 60% 40% 70%; transform: translate(0,0) scale(1); }
          50%      { border-radius: 70% 30% 40% 60% / 50% 40% 60% 50%; transform: translate(2%, 5%) scale(1.04); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-blob { animation: none !important; } }
      `}</style>
      <div
        className="ch-blob absolute left-[-10%] top-[-10%] h-[55vh] w-[55vh] blur-3xl"
        style={{ background: "var(--ambient-base)", animation: "ch-blob-morph1 26s ease-in-out infinite", opacity: 0.45 }}
      />
      <div
        className="ch-blob absolute right-[-10%] top-[15%] h-[50vh] w-[50vh] blur-3xl"
        style={{ background: "var(--ambient-c2)", animation: "ch-blob-morph2 32s ease-in-out infinite", opacity: 0.4 }}
      />
      <div
        className="ch-blob absolute left-[25%] bottom-[-15%] h-[60vh] w-[60vh] blur-3xl"
        style={{ background: "var(--ambient-c3)", animation: "ch-blob-morph3 28s ease-in-out infinite", opacity: 0.35 }}
      />
    </div>
  )
}

/**
 * Bubbles — soft, glowing orbs that slowly rise. Refined: no borders, no
 * harsh gradients. Each bubble is a soft radial glow that fades at the edges,
 * like luminous dust motes. Much calmer than a "soap bubble" look.
 */
function Bubbles() {
  const bubbles = useMemo(() => {
    const arr: { left: number; size: number; duration: number; delay: number; drift: number }[] = []
    for (let i = 0; i < 12; i++) {
      const seed = i * 9301 + 49297
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: 5 + r(1) * 90,
        size: 40 + r(2) * 80,
        duration: 20 + r(3) * 20,
        delay: r(4) * -25,
        drift: (r(5) - 0.5) * 80,
      })
    }
    return arr
  }, [])
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-bubble-rise {
          0%   { transform: translateY(110vh) translateX(0); opacity: 0; }
          15%  { opacity: 0.35; }
          85%  { opacity: 0.25; }
          100% { transform: translateY(-20vh) translateX(var(--drift, 0px)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-bubble { animation: none !important; opacity: 0.3 !important; transform: translateY(40vh) !important; } }
      `}</style>
      {bubbles.map((b, i) => (
        <div
          key={i}
          className="ch-bubble absolute bottom-0 rounded-full"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle at 40% 40%, var(--ambient-base) 0%, transparent 65%)`,
            ["--drift" as string]: `${b.drift}px`,
            animation: `ch-bubble-rise ${b.duration}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
            filter: "blur(20px)",
          }}
        />
      ))}
    </div>
  )
}

/**
 * Mesh — a smooth, single-layer gradient that slowly shifts its focal points.
 * Refined: uses just two large radial gradients (not four) with heavy blur,
 * creating a soft "aurora haze" feel rather than a muddy 4-color grid.
 */
function Mesh() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-mesh-shift {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          33%      { transform: translate(8%, -5%) scale(1.1); }
          66%      { transform: translate(-6%, 6%) scale(0.95); }
        }
        @keyframes ch-mesh-shift2 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          50%      { transform: translate(-10%, 8%) scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-mesh-layer { animation: none !important; } }
      `}</style>
      <div
        className="ch-mesh-layer absolute inset-[-20%] blur-3xl"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 30% 30%, var(--ambient-base) 0%, transparent 70%)`,
          animation: "ch-mesh-shift 40s ease-in-out infinite",
          opacity: 0.5,
          filter: "blur(40px)",
        }}
      />
      <div
        className="ch-mesh-layer absolute inset-[-20%] blur-3xl"
        style={{
          background: `radial-gradient(ellipse 50% 60% at 70% 70%, var(--ambient-c2) 0%, transparent 70%)`,
          animation: "ch-mesh-shift2 50s ease-in-out infinite",
          opacity: 0.45,
          filter: "blur(40px)",
        }}
      />
    </div>
  )
}

/**
 * Waves — soft, layered gradient hills at the bottom. Refined: uses smooth
 * CSS gradients (no SVG paths) with heavy blur, creating a gentle "fog rolling
 * over hills" feel. Three layers drift at different speeds for parallax.
 */
function Waves() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-wave-drift1 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(-30px); }
        }
        @keyframes ch-wave-drift2 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(40px); }
        }
        @keyframes ch-wave-drift3 {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(-20px); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-wave-layer { animation: none !important; } }
      `}</style>
      {/* Back wave */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[-10%] right-[-10%] h-[40%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-c3) 0%, transparent 100%)`,
          animation: "ch-wave-drift1 35s ease-in-out infinite",
          opacity: 0.25,
          filter: "blur(30px)",
          borderRadius: "50% 50% 0 0 / 20% 20% 0 0",
        }}
      />
      {/* Mid wave */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[-10%] right-[-10%] h-[30%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-c2) 0%, transparent 100%)`,
          animation: "ch-wave-drift2 45s ease-in-out infinite",
          opacity: 0.3,
          filter: "blur(25px)",
          borderRadius: "50% 50% 0 0 / 25% 25% 0 0",
        }}
      />
      {/* Front wave */}
      <div
        className="ch-wave-layer absolute bottom-0 left-[-10%] right-[-10%] h-[22%]"
        style={{
          background: `linear-gradient(to top, var(--ambient-base) 0%, transparent 100%)`,
          animation: "ch-wave-drift3 55s ease-in-out infinite",
          opacity: 0.35,
          filter: "blur(20px)",
          borderRadius: "50% 50% 0 0 / 30% 30% 0 0",
        }}
      />
    </div>
  )
}

/**
 * Particles — soft glowing orbs that drift slowly upward like dust in a
 * sunbeam. Refined: larger, softer (heavy blur), fewer in count, and they
 * pulse gently rather than just translating. Feels like floating light.
 */
function Particles() {
  const dots = useMemo(() => {
    const arr: { left: number; top: number; size: number; duration: number; delay: number }[] = []
    for (let i = 0; i < 18; i++) {
      const seed = i * 7919 + 1009
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: r(1) * 100,
        top: r(2) * 100,
        size: 20 + r(3) * 40,
        duration: 8 + r(4) * 12,
        delay: r(5) * -10,
      })
    }
    return arr
  }, [])
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-particle-float {
          0%, 100% { transform: translate(0, 0); opacity: 0.2; }
          50%      { transform: translate(0, -20px); opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-particle { animation: none !important; opacity: 0.3 !important; } }
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
            background: `radial-gradient(circle, var(--ambient-base) 0%, transparent 70%)`,
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
 * Stardust — tiny twinkling points scattered across the sky. Refined: smaller
 * points with a soft glow, more of them (80), gentle twinkle (opacity pulse
 * only, no scaling). Feels like a calm night sky, not a laser show.
 */
function Stardust() {
  const stars = useMemo(() => {
    const arr: { left: number; top: number; size: number; duration: number; delay: number }[] = []
    for (let i = 0; i < 80; i++) {
      const seed = i * 4099 + 2017
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: r(1) * 100,
        top: r(2) * 100,
        size: 1 + r(3) * 2,
        duration: 3 + r(4) * 5,
        delay: r(5) * -8,
      })
    }
    return arr
  }, [])
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-star-twinkle {
          0%, 100% { opacity: 0.1; }
          50%      { opacity: 0.7; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-star { animation: none !important; opacity: 0.4 !important; } }
      `}</style>
      {stars.map((s, i) => (
        <div
          key={i}
          className="ch-star absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: "var(--ambient-base)",
            boxShadow: `0 0 ${s.size * 3}px var(--ambient-base)`,
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
