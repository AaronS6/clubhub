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
 * The effects are intentionally subtle and SLOW (20–40s loops) so they don't
 * compete with content. Intensity is driven by `--ambient-opacity`, which the
 * CustomizationProvider sets from the user's intensity slider.
 *
 * The color comes from the active accent (either the club's accent or the
 * user's override). We pass it in as a CSS variable so each effect can use it.
 * ============================================================================
 */

interface AmbientBackgroundProps {
  /** The accent color to use. Defaults to the active club accent. */
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

  // Derive 2-3 secondary hues from the base accent by shifting hue. This
  // gives each effect a richer palette without hardcoding colors.
  const palette = useMemo(() => {
    const [h, s, l] = hexToHsl(color)
    return {
      base: color,
      // +40° hue shift for the second color (analogous-complementary)
      c2: hslToHex((h + 40) % 360, s, Math.min(80, l + 8)),
      // -30° hue shift for the third color
      c3: hslToHex((h - 30 + 360) % 360, s, Math.min(82, l + 12)),
    }
  }, [color])

  if (ambient === "none") {
    // Even with no effect, we still need the base background color (since the
    // body is transparent — see globals.css). Render just the tint overlay.
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
      {/* The ambient layer — fixed, covers the full viewport, sits ABOVE the
          body's background but BELOW all app content (which uses z-10+).
          pointer-events-none so it never blocks clicks. The opacity is driven
          by the user's intensity slider via the --ambient-opacity CSS var. */}
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
      {/* A subtle tint overlay that darkens/lightens the ambient so text stays
          readable. This sits at z-0 too but after the effects, so it's on top
          of them but still behind app content (z-10). We use a semi-transparent
          background that matches the app's background color so the ambient
          shows through at the set opacity while keeping contrast. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: "var(--background)",
          opacity: 1 - opacity * 0.55, // higher intensity = more ambient, less tint
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

/** Aurora — three soft ribbons of light that drift horizontally, reminiscent
 *  of polar auroras. Uses blur + horizontal translate loops. */
function Aurora() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-aurora-drift {
          0%   { transform: translateX(-15%) translateY(0) scaleY(1); }
          50%  { transform: translateX(10%) translateY(-4%) scaleY(1.08); }
          100% { transform: translateX(-15%) translateY(0) scaleY(1); }
        }
        @keyframes ch-aurora-drift2 {
          0%   { transform: translateX(20%) translateY(2%) scaleY(1); }
          50%  { transform: translateX(-10%) translateY(-6%) scaleY(1.12); }
          100% { transform: translateX(20%) translateY(2%) scaleY(1); }
        }
        @keyframes ch-aurora-drift3 {
          0%   { transform: translateX(0%) translateY(0); }
          50%  { transform: translateX(18%) translateY(-3%); }
          100% { transform: translateX(0%) translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ch-aurora-band { animation: none !important; }
        }
      `}</style>
      <div
        className="ch-aurora-band absolute -inset-x-40 top-[-20%] h-[60%] blur-3xl"
        style={{ background: `linear-gradient(110deg, transparent, var(--ambient-base) 30%, var(--ambient-c2) 55%, transparent 80%)`, animation: "ch-aurora-drift 24s ease-in-out infinite", opacity: 0.55 }}
      />
      <div
        className="ch-aurora-band absolute -inset-x-40 top-[-10%] h-[55%] blur-3xl"
        style={{ background: `linear-gradient(-100deg, transparent, var(--ambient-c2) 25%, var(--ambient-c3) 60%, transparent 85%)`, animation: "ch-aurora-drift2 30s ease-in-out infinite", opacity: 0.5 }}
      />
      <div
        className="ch-aurora-band absolute -inset-x-40 top-[10%] h-[40%] blur-3xl"
        style={{ background: `linear-gradient(90deg, transparent, var(--ambient-c3) 35%, var(--ambient-base) 65%, transparent)`, animation: "ch-aurora-drift3 36s ease-in-out infinite", opacity: 0.4 }}
      />
    </div>
  )
}

/** Blobs — three large morphing circles that breathe and drift. Classic but
 *  refined: heavy blur, slow morph, soft colors. */
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

/** Bubbles — a slow shower of translucent bubbles rising upward. Generated
 *  with a deterministic set (no Math.random on render — would re-randomize on
 *  every re-render). */
function Bubbles() {
  const bubbles = useMemo(() => {
    // Deterministic pseudo-random based on index so the layout is stable.
    const arr: { left: number; size: number; duration: number; delay: number; drift: number }[] = []
    for (let i = 0; i < 18; i++) {
      const seed = i * 9301 + 49297
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({
        left: r(1) * 100,
        size: 16 + r(2) * 60,
        duration: 16 + r(3) * 18,
        delay: r(4) * -20,
        drift: (r(5) - 0.5) * 60,
      })
    }
    return arr
  }, [])
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-bubble-rise {
          0%   { transform: translateY(110vh) translateX(0); opacity: 0; }
          10%  { opacity: 0.5; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-10vh) translateX(var(--drift, 0px)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-bubble { animation: none !important; opacity: 0.3 !important; transform: translateY(50vh) !important; } }
      `}</style>
      {bubbles.map((b, i) => (
        <div
          key={i}
          className="ch-bubble absolute bottom-0 rounded-full border"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle at 30% 30%, var(--ambient-base), transparent 70%)`,
            borderColor: "var(--ambient-base)",
            borderWidth: 1,
            ["--drift" as string]: `${b.drift}px`,
            animation: `ch-bubble-rise ${b.duration}s linear infinite`,
            animationDelay: `${b.delay}s`,
            opacity: 0.45,
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </div>
  )
}

/** Mesh — a four-point gradient mesh that slowly rotates its hues. Feels like
 *  a warm, living gradient. */
function Mesh() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-mesh-shift {
          0%, 100% { background-position: 0% 0%, 100% 0%, 50% 100%, 0% 100%; }
          50%      { background-position: 30% 20%, 70% 10%, 80% 70%, 10% 60%; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-mesh-layer { animation: none !important; } }
      `}</style>
      <div
        className="ch-mesh-layer absolute inset-0 blur-2xl"
        style={{
          backgroundImage: `
            radial-gradient(at 20% 20%, var(--ambient-base) 0px, transparent 50%),
            radial-gradient(at 80% 20%, var(--ambient-c2) 0px, transparent 50%),
            radial-gradient(at 50% 80%, var(--ambient-c3) 0px, transparent 50%),
            radial-gradient(at 20% 80%, var(--ambient-base) 0px, transparent 50%)
          `,
          backgroundSize: "200% 200%",
          backgroundPosition: "0% 0%, 100% 0%, 50% 100%, 0% 100%",
          animation: "ch-mesh-shift 28s ease-in-out infinite",
          opacity: 0.5,
        }}
      />
    </div>
  )
}

/** Waves — layered contour lines at the bottom, like a soft topographic
 *  map. Two SVG paths animate with different speeds for a parallax effect. */
function Waves() {
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-wave-x {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) { .ch-wave-layer { animation: none !important; } }
      `}</style>
      <svg className="ch-wave-layer absolute bottom-0 left-0 h-[50%] w-[200%]" viewBox="0 0 1200 300" preserveAspectRatio="none" style={{ animation: "ch-wave-x 40s linear infinite" }}>
        <path d="M0,150 C200,100 400,200 600,150 C800,100 1000,200 1200,150 L1200,300 L0,300 Z" fill="var(--ambient-base)" opacity="0.18" />
      </svg>
      <svg className="ch-wave-layer absolute bottom-0 left-0 h-[40%] w-[200%]" viewBox="0 0 1200 300" preserveAspectRatio="none" style={{ animation: "ch-wave-x 55s linear infinite reverse" }}>
        <path d="M0,180 C150,130 350,230 600,180 C850,130 1050,230 1200,180 L1200,300 L0,300 Z" fill="var(--ambient-c2)" opacity="0.16" />
      </svg>
      <svg className="ch-wave-layer absolute bottom-0 left-0 h-[30%] w-[200%]" viewBox="0 0 1200 300" preserveAspectRatio="none" style={{ animation: "ch-wave-x 70s linear infinite" }}>
        <path d="M0,210 C200,160 400,250 600,210 C800,160 1000,250 1200,210 L1200,300 L0,300 Z" fill="var(--ambient-c3)" opacity="0.14" />
      </svg>
    </div>
  )
}

/** Particles — a fine dust of small dots drifting upward, like motes in a
 *  sunbeam. Deterministic so it's stable across renders. */
function Particles() {
  const dots = useMemo(() => {
    const arr: { left: number; size: number; duration: number; delay: number }[] = []
    for (let i = 0; i < 40; i++) {
      const seed = i * 7919 + 1009
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({ left: r(1) * 100, size: 2 + r(2) * 4, duration: 12 + r(3) * 14, delay: r(4) * -18 })
    }
    return arr
  }, [])
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-particle-up {
          0%   { transform: translateY(105vh); opacity: 0; }
          15%  { opacity: 0.7; }
          85%  { opacity: 0.5; }
          100% { transform: translateY(-10vh); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .ch-particle { animation: none !important; opacity: 0.4 !important; transform: translateY(50vh) !important; } }
      `}</style>
      {dots.map((d, i) => (
        <div
          key={i}
          className="ch-particle absolute bottom-0 rounded-full"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            background: "var(--ambient-base)",
            boxShadow: "0 0 6px var(--ambient-base)",
            animation: `ch-particle-up ${d.duration}s linear infinite`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/** Stardust — a constellation of twinkling pinpoints. Unlike Particles
 *  (which drift), Stardust points stay put and twinkle via opacity flicker. */
function Stardust() {
  const stars = useMemo(() => {
    const arr: { left: number; top: number; size: number; duration: number; delay: number }[] = []
    for (let i = 0; i < 60; i++) {
      const seed = i * 4099 + 2017
      const r = (n: number) => ((Math.sin(seed + n) + 1) / 2)
      arr.push({ left: r(1) * 100, top: r(2) * 100, size: 1 + r(3) * 2.5, duration: 2 + r(4) * 4, delay: r(5) * -6 })
    }
    return arr
  }, [])
  return (
    <div className="absolute inset-0" style={{ opacity: "var(--ambient-opacity)" }}>
      <style>{`
        @keyframes ch-star-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.8); }
          50%      { opacity: 0.9; transform: scale(1.1); }
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
            boxShadow: `0 0 ${s.size * 2}px var(--ambient-base)`,
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
