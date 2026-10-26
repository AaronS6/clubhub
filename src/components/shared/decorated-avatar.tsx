"use client"

import * as React from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { initials } from "@/components/shared/page-header"

/**
 * ============================================================================
 * DecoratedAvatar — SVG avatar-decoration engine (v8.2 complete rebuild)
 * ============================================================================
 *
 * A drop-in replacement for `<Avatar>` that renders animated decorative
 * layers around the avatar. The decoration id is stored on
 * `User.avatarDecoration` and plumbed through the APIs that return user data
 * (me, members, chat messages, conversations).
 *
 * WHY SVG (the v8 CSS edition failed its own design review):
 *  - Chat avatars render at 24–36px. Masked hairline rings + blur washes
 *    turned to mush at that scale; only chunky VECTOR geometry survives.
 *  - SVG scales crisply from a 24px chat chip to a 96px profile photo with
 *    zero re-authoring, and gradients/filters are baked in viewBox units so
 *    glow width grows with the avatar instead of being a fixed 2px smudge.
 *  - Every effect gets a DISTINCT silhouette — the old set was "a grid of
 *    colored rims". Now: an anodized metal band, a breathing aura with a
 *    radar ripple, a five-star constellation, a tilted Saturn ring that
 *    weaves BEHIND and IN FRONT of the photo, a sakura wreath, a neon
 *    hexagon frame, a glossy candy band with a sun flare, a wavy aurora
 *    ribbon, and a champagne halo with glinting stars.
 *
 * Architecture:
 *  - BackLayer renders BEHIND the avatar (z below); FrontLayer renders ABOVE
 *    it (z-2, pointer-events:none) — only the orbit uses the front layer,
 *    for the ring arc and comet that pass in front of the face.
 *  - Each effect is one or more stacked `<svg viewBox="0 0 100 100">`
 *    absolutely positioned at top/left −18% (136% box) around the wrapper.
 *    The avatar occupies radius ≈36.8 units; effects live in the 37–50 band.
 *  - Whole-svg animations (spin/breathe/pulse) rotate around the CSS box
 *    center = avatar center. Per-part animations (twinkle/sway) run on inner
 *    `<g>` elements with `transform-box: fill-box` (class .ch-fx / .ch-fx-sway).
 *    Static placement transforms use SVG *attribute* transforms on a parent
 *    <g> so CSS animations can never clobber them.
 *  - The orbit comet rides the ellipse via SMIL `<animateMotion>` (user-unit
 *    path → scales with the avatar; `rotate="auto"` keeps the tail trailing).
 *    Two mirrored comets — one per layer — hand off at the ellipse's side
 *    points so the pearl weaves behind the photo, exactly like the ring.
 *    SMIL ignores prefers-reduced-motion, so reduced-motion users get a
 *    static comet instead (gated at render time).
 *  - All CSS animations are transform/opacity only (compositor-friendly);
 *    they freeze under prefers-reduced-motion and while modal overlays are
 *    open (globals.css guards, unchanged class names).
 *  - Gradient + filter defs are embedded PER INSTANCE with sanitized useId()
 *    ids — every svg is self-contained (no cross-svg references, which some
 *    WebKit versions mishandle) and club-accent gradients resolve against
 *    the surrounding --club scope.
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
  ring: "Accent ring",
  aura: "Aura",
  sparkles: "Starlight",
  orbit: "Comet orbit",
  petals: "Blossom",
  glitch: "Neon glitch",
  sunset: "Sunset",
  aurora: "Aurora",
  halo: "Halo",
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
      {deco !== "none" && <BackLayer deco={deco} />}
      <Avatar className={cn("relative z-[1] h-full w-full", avatarClassName)}>
        {src ? <AvatarImage src={src} alt={name} /> : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      {deco !== "none" && <FrontLayer deco={deco} />}
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Geometry helpers + shared shapes (all in 0–100 viewBox units)
   ══════════════════════════════════════════════════════════════════════════ */

const CX = 50
const CY = 50

/** Point on the avatar-centered circle — deg 0 = 12 o'clock, clockwise. */
function pt(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}

/** Circular arc path from angle a0 to a1 (degrees, clockwise-positive). */
function arc(r: number, a0: number, a1: number): string {
  const [x0, y0] = pt(r, a0)
  const [x1, y1] = pt(r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Concave four-point star, tip-to-tip 13 units, centered on the origin. */
const STAR =
  "M 0 -6.5 C 1.2 -3.6 2.1 -2.7 6.5 0 C 2.1 2.7 1.2 3.6 0 6.5 C -1.2 3.6 -2.1 2.7 -6.5 0 C -2.1 -2.7 -1.2 -3.6 0 -6.5 Z"

/** Sakura petal — notched tip UP, rounded base DOWN, centered on origin. */
const PETAL =
  "M 2.6 -6.5 C 4.2 -4.6 4.8 -2.4 4.2 -0.2 C 3.4 3.2 1.8 5.4 0 6.5 C -1.8 5.4 -3.4 3.2 -4.2 -0.2 C -4.8 -2.4 -4.2 -4.6 -2.6 -6.5 L 0 -4.6 Z"

/** Pointy-top hexagon frame (circumradius 42). */
const HEX = "M 50 8 L 86.4 29 L 86.4 71 L 50 92 L 13.6 71 L 13.6 29 Z"

/** Closed wavy ring — a soft sine wobble around radius r (aurora ribbon). */
function wavyRing(r: number, amp: number, lobes: number): string {
  const N = 96
  let d = ""
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const rr = r + amp * Math.sin(lobes * t)
    const x = CX + rr * Math.sin(t)
    const y = CY - rr * Math.cos(t)
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return d + "Z"
}

/* — the Saturn orbit: a tilted ellipse around the avatar — */
const ORB_RX = 42
const ORB_RY = 14.3
const ORB_TILT = -16
const obRad = (ORB_TILT * Math.PI) / 180
/** Major-axis endpoints of the tilted ellipse. */
const ORB_P1: [number, number] = [
  +(CX + ORB_RX * Math.cos(obRad)).toFixed(2),
  +(CY + ORB_RX * Math.sin(obRad)).toFixed(2),
]
const ORB_P2: [number, number] = [
  +(CX - ORB_RX * Math.cos(obRad)).toFixed(2),
  +(CY - ORB_RX * Math.sin(obRad)).toFixed(2),
]
/** Full ellipse (comet track) — clockwise: right → bottom → left → top. */
const ORB_FULL = `M ${ORB_P1[0]} ${ORB_P1[1]} A ${ORB_RX} ${ORB_RY} ${ORB_TILT} 0 1 ${ORB_P2[0]} ${ORB_P2[1]} A ${ORB_RX} ${ORB_RY} ${ORB_TILT} 0 1 ${ORB_P1[0]} ${ORB_P1[1]}`
/** Lower half (passes IN FRONT of the avatar). */
const ORB_FRONT = `M ${ORB_P1[0]} ${ORB_P1[1]} A ${ORB_RX} ${ORB_RY} ${ORB_TILT} 0 1 ${ORB_P2[0]} ${ORB_P2[1]}`
/** Upper half (passes BEHIND the avatar). */
const ORB_BACK = `M ${ORB_P2[0]} ${ORB_P2[1]} A ${ORB_RX} ${ORB_RY} ${ORB_TILT} 0 1 ${ORB_P1[0]} ${ORB_P1[1]}`
/** Bottom point of the ellipse — where the comet parks when motion is off. */
const ORB_REST: [number, number] = [
  +(CX - ORB_RY * Math.sin(obRad)).toFixed(2),
  +(CY + ORB_RY * Math.cos(obRad)).toFixed(2),
]

/* — club-accent color strings (resolve inside the club scope) — */
const CLUB = "var(--club, #10b981)"
const CLUB_LIGHT = "color-mix(in oklab, var(--club, #10b981) 58%, white)"
const CLUB_BRIGHT = "color-mix(in oklab, var(--club, #10b981) 34%, white)"
const CLUB_DEEP = "color-mix(in oklab, var(--club, #10b981) 45%, black)"
const CLUB_SHADOW = "color-mix(in oklab, var(--club, #10b981) 22%, black)"

/** Sanitized unique id prefix (React useId strips to [a-z0-9]). */
function useUid(): string {
  const id = React.useId()
  return id.replace(/[^a-zA-Z0-9]/g, "")
}

/** Glow filter: blurred copy merged under the crisp source (classic neon). */
function GlowDef({ id, blur }: { id: string; blur: number }) {
  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation={blur} result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}

/** prefers-reduced-motion gate (SMIL comets need render-time gating). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduced
}

/* ══════════════════════════════════════════════════════════════════════════
   Layer dispatch
   ══════════════════════════════════════════════════════════════════════════ */

function BackLayer({ deco }: { deco: DecorationId }) {
  switch (deco) {
    case "ring":
      return <RingBack />
    case "aura":
      return <AuraBack />
    case "sparkles":
      return <SparklesBack />
    case "orbit":
      return <OrbitBack />
    case "petals":
      return <PetalsBack />
    case "glitch":
      return <GlitchBack />
    case "sunset":
      return <SunsetBack />
    case "aurora":
      return <AuroraBack />
    case "halo":
      return <HaloBack />
    default:
      return null
  }
}

function FrontLayer({ deco }: { deco: DecorationId }) {
  if (deco === "orbit") return <OrbitFront />
  return null
}

/** Shared svg shell props (sized/positioned by the .ch-deco CSS class). */
const SHELL = { viewBox: "0 0 100 100", "aria-hidden": true, focusable: "false" } as const

/* ══════════════════════════════════════════════════════════════════════════
   1 · Accent ring — anodized club-accent metal band
   ══════════════════════════════════════════════════════════════════════════ */

function RingBack() {
  const u = useUid()
  const band = `rg-b-${u}`
  const glow = `rg-g-${u}`
  const glow2 = `rg-g2-${u}`
  return (
    <>
      <svg {...SHELL} className="ch-deco">
        <defs>
          <linearGradient id={band} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: CLUB_LIGHT }} />
            <stop offset="0.5" style={{ stopColor: CLUB }} />
            <stop offset="1" style={{ stopColor: CLUB_SHADOW }} />
          </linearGradient>
          <GlowDef id={glow} blur={2.6} />
        </defs>
        {/* soft accent bloom under the band */}
        <circle cx={CX} cy={CY} r="41" fill="none" stroke={CLUB} strokeWidth="8" opacity="0.22" />
        {/* the anodized band */}
        <circle
          cx={CX} cy={CY} r="41" fill="none"
          stroke={`url(#${band})`} strokeWidth="4.6"
        />
        {/* polished inner rim + crisp outer edge — enamel depth */}
        <circle cx={CX} cy={CY} r="38.1" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" />
        <circle cx={CX} cy={CY} r="43.3" fill="none" stroke={CLUB_DEEP} strokeWidth="0.9" opacity="0.45" />
      </svg>
      {/* specular highlight sweeping the band — light over polished metal */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-spin 7s linear infinite" }}>
        <defs>
          <GlowDef id={glow2} blur={1.6} />
        </defs>
        <path
          d={arc(41, -38, 8)}
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="4.6"
          strokeLinecap="round"
          filter={`url(#${glow2})`}
        />
      </svg>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Aura — a living backlight: edge-hugging glow + radar ripple
   ══════════════════════════════════════════════════════════════════════════ */

function AuraBack() {
  const u = useUid()
  const bloom = `au-b-${u}`
  const glow = `au-g-${u}`
  return (
    <>
      {/* breathing bloom — brightest at the avatar's edge, fading outward */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-breathe 4.2s ease-in-out infinite" }}>
        <defs>
          <radialGradient id={bloom}>
            <stop offset="0" stopColor="transparent" />
            <stop offset="0.7" stopColor="transparent" />
            <stop offset="0.76" style={{ stopColor: CLUB, stopOpacity: "0.72" }} />
            <stop offset="0.9" style={{ stopColor: CLUB, stopOpacity: "0.22" }} />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r="49" fill={`url(#${bloom})`} />
      </svg>
      {/* the energy rim — what makes an aura READ at chat sizes */}
      <svg {...SHELL} className="ch-deco">
        <defs>
          <GlowDef id={glow} blur={3.2} />
        </defs>
        <circle
          cx={CX} cy={CY} r="39.6" fill="none"
          stroke={CLUB} strokeWidth="3" opacity="0.95"
          filter={`url(#${glow})`}
        />
        {/* inner echo line — layered light, not a single flat stroke */}
        <circle cx={CX} cy={CY} r="36.9" fill="none" stroke={CLUB_BRIGHT} strokeWidth="1.2" opacity="0.6" />
      </svg>
      {/* radar ripple — one soft ring pulsing outward every 3.6s */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-pulse-ring 3.6s ease-out infinite" }}>
        <circle cx={CX} cy={CY} r="39.6" fill="none" stroke={CLUB_BRIGHT} strokeWidth="2" />
      </svg>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Starlight — a constellation of champagne stars
   ══════════════════════════════════════════════════════════════════════════ */

const STARS: { x: number; y: number; rot: number; s: number; dur: number; delay: number }[] = [
  { x: 78, y: 16, rot: 15, s: 1.5, dur: 2.3, delay: 0 },
  { x: 89, y: 56, rot: -12, s: 1.0, dur: 2.9, delay: -1.1 },
  { x: 21, y: 78, rot: -16, s: 1.35, dur: 2.6, delay: -2.2 },
  { x: 47, y: 91, rot: 8, s: 0.9, dur: 3.1, delay: -0.6 },
  { x: 11, y: 30, rot: 20, s: 1.05, dur: 2.7, delay: -1.7 },
  { x: 64, y: 5, rot: -6, s: 0.8, dur: 3.4, delay: -2.5 },
]

function SparklesBack() {
  const u = useUid()
  const grad = `sp-g-${u}`
  const glow = `sp-f-${u}`
  const bloom = `sp-b-${u}`
  return (
    <svg {...SHELL} className="ch-deco">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#fcd34d" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <radialGradient id={bloom}>
          <stop offset="0" stopColor="transparent" />
          <stop offset="0.68" stopColor="transparent" />
          <stop offset="0.8" stopColor="#fbbf24" stopOpacity="0.12" />
          <stop offset="1" stopColor="transparent" />
        </radialGradient>
        <GlowDef id={glow} blur={3} />
      </defs>
      {/* a faint champagne halo so the stars sit in light, not on nothing */}
      <circle cx={CX} cy={CY} r="49" fill={`url(#${bloom})`} />
      {STARS.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.rot}) scale(${s.s})`}>
          <g
            className="ch-fx"
            style={{
              animation: `ch-deco-twinkle ${s.dur}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          >
            <path d={STAR} fill={`url(#${grad})`} filter={`url(#${glow})`} />
            {/* white-hot core — the punch that survives small sizes */}
            <circle r="1.5" fill="#ffffff" />
          </g>
        </g>
      ))}
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Comet orbit — a tilted Saturn ring weaving behind/in front of the
       avatar, with a glowing comet (pearl + trailing tail) riding it
   ══════════════════════════════════════════════════════════════════════════ */

/** The comet itself — pearl + tapered tail, drawn around the origin with
 *  +x = direction of travel (auto-rotated by animateMotion). */
function Comet({ pearl, tail, glow }: { pearl: string; tail: string; glow: string }) {
  return (
    <>
      <path
        d="M -2.8 -2.4 C -8 -4.6 -13 -3 -17 0 C -13 3 -8 4.6 -2.8 2.4 Z"
        fill={`url(#${tail})`}
        opacity="0.9"
      />
      <circle r="4.8" fill={`url(#${pearl})`} filter={`url(#${glow})`} />
      {/* hot white core so the pearl reads even at chat sizes */}
      <circle cx="-1" cy="-1" r="1.8" fill="#ffffff" />
    </>
  )
}

function OrbitBack() {
  const u = useUid()
  const band = `ob-b-${u}`
  const pearl = `ob-p-${u}`
  const tail = `ob-t-${u}`
  const glow = `ob-f-${u}`
  const reduced = usePrefersReducedMotion()
  return (
    <svg {...SHELL} className="ch-deco">
      <defs>
        <linearGradient id={band} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: CLUB }} />
          <stop offset="1" style={{ stopColor: CLUB_DEEP }} />
        </linearGradient>
        <radialGradient id={pearl} cx="0.35" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" style={{ stopColor: CLUB }} />
          <stop offset="1" style={{ stopColor: CLUB_DEEP }} />
        </radialGradient>
        <linearGradient id={tail} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="transparent" />
          <stop offset="1" style={{ stopColor: CLUB_BRIGHT }} />
        </linearGradient>
        <GlowDef id={glow} blur={3} />
      </defs>
      {/* the far half of the ring — dimmer, behind the avatar */}
      <path
        d={ORB_BACK}
        fill="none"
        stroke={`url(#${band})`}
        strokeWidth="3.1"
        strokeLinecap="round"
        opacity="0.78"
      />
      {/* the mirrored comet — visible only while it rides the far half */}
      {reduced ? null : (
        <g>
          <animateMotion
            dur="9s"
            repeatCount="indefinite"
            rotate="auto"
            path={ORB_FULL}
          />
          <animate
            attributeName="opacity"
            dur="9s"
            repeatCount="indefinite"
            calcMode="discrete"
            values="0;1"
            keyTimes="0;0.5"
          />
          <Comet pearl={pearl} tail={tail} glow={glow} />
        </g>
      )}
    </svg>
  )
}

function OrbitFront() {
  const u = useUid()
  const band = `of-b-${u}`
  const pearl = `of-p-${u}`
  const tail = `of-t-${u}`
  const glow = `of-f-${u}`
  const reduced = usePrefersReducedMotion()
  return (
    <div className="ch-deco ch-deco-front">
      <svg {...SHELL}>
        <defs>
          <linearGradient id={band} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: CLUB_LIGHT }} />
            <stop offset="1" style={{ stopColor: CLUB }} />
          </linearGradient>
          <radialGradient id={pearl} cx="0.35" cy="0.35" r="0.85">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" style={{ stopColor: CLUB }} />
            <stop offset="1" style={{ stopColor: CLUB_DEEP }} />
          </radialGradient>
          <linearGradient id={tail} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="transparent" />
            <stop offset="1" style={{ stopColor: CLUB_BRIGHT }} />
          </linearGradient>
          <GlowDef id={glow} blur={3} />
        </defs>
        {/* the near half of the ring — bright, passing over the photo */}
        <path
          d={ORB_FRONT}
          fill="none"
          stroke={`url(#${band})`}
          strokeWidth="3.6"
          strokeLinecap="round"
          filter={`url(#${glow})`}
        />
        {/* the comet while it rides the near half (parked at the bottom
            when the user prefers reduced motion) */}
        {reduced ? (
          <g transform={`translate(${ORB_REST[0]} ${ORB_REST[1]})`}>
            <Comet pearl={pearl} tail={tail} glow={glow} />
          </g>
        ) : (
          <g>
            <animateMotion
              dur="9s"
              repeatCount="indefinite"
              rotate="auto"
              path={ORB_FULL}
            />
            <animate
              attributeName="opacity"
              dur="9s"
              repeatCount="indefinite"
              calcMode="discrete"
              values="1;0"
              keyTimes="0;0.5"
            />
            <Comet pearl={pearl} tail={tail} glow={glow} />
          </g>
        )}
      </svg>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Blossom — a sakura wreath: notched petals swaying on a slow ring
   ══════════════════════════════════════════════════════════════════════════ */

const PETAL_ANGLES = [0, 60, 120, 180, 240, 300]

function PetalsBack() {
  const u = useUid()
  const grad = `pe-g-${u}`
  const gradStar = `pe-s-${u}`
  const glow = `pe-f-${u}`
  return (
    <>
      {/* the whole wreath rotates very slowly; petals sway individually */}
      <svg
        {...SHELL}
        className="ch-deco"
        style={{ animation: "ch-deco-spin 26s linear infinite" }}
      >
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff1f2" />
            <stop offset="0.5" stopColor="#fb7185" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id={gradStar} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#fcd34d" />
          </linearGradient>
          <GlowDef id={glow} blur={2.2} />
        </defs>
        {/* faint collective bloom behind the wreath */}
        <circle cx={CX} cy={CY} r="43" fill="none" stroke="#fb7185" strokeWidth="9" opacity="0.18" />
        {PETAL_ANGLES.map((a, i) => (
          <g key={a} transform={`rotate(${a} ${CX} ${CY})`}>
            <g transform={`translate(${CX} 7)`}>
              <g
                className="ch-fx-sway"
                style={{
                  animation: `ch-deco-sway ${3.4 + (i % 3) * 0.35}s ease-in-out infinite`,
                  animationDelay: `${-i * 0.55}s`,
                }}
              >
                <path
                  d={PETAL}
                  fill={`url(#${grad})`}
                  stroke="#be185d"
                  strokeWidth="0.5"
                  strokeOpacity="0.35"
                  transform={`rotate(${(i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 3)})`}
                />
              </g>
            </g>
          </g>
        ))}
        {/* two gold glints tucked into the gaps */}
        <g transform={`translate(66.5 15.2) rotate(18) scale(0.5)`}>
          <g className="ch-fx" style={{ animation: "ch-deco-twinkle 2.8s ease-in-out infinite" }}>
            <path d={STAR} fill={`url(#${gradStar})`} filter={`url(#${glow})`} />
          </g>
        </g>
        <g transform={`translate(20.5 78.4) rotate(-14) scale(0.42)`}>
          <g className="ch-fx" style={{ animation: "ch-deco-twinkle 3.4s ease-in-out infinite", animationDelay: "-1.4s" }}>
            <path d={STAR} fill={`url(#${gradStar})`} filter={`url(#${glow})`} />
          </g>
        </g>
      </svg>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · Neon glitch — a hexagon frame with RGB-split echoes that jitter
   ══════════════════════════════════════════════════════════════════════════ */

function GlitchBack() {
  const u = useUid()
  const glow = `gl-f-${u}`
  return (
    <>
      {/* the steady core hex + corner nodes */}
      <svg {...SHELL} className="ch-deco">
        <defs>
          <GlowDef id={glow} blur={2.4} />
        </defs>
        <path
          d={HEX}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3"
          strokeLinejoin="round"
          filter={`url(#${glow})`}
        />
        <g fill="#ffffff" filter={`url(#${glow})`}>
          <circle cx="50" cy="8" r="2.1" />
          <circle cx="86.4" cy="71" r="2.1" />
          <circle cx="13.6" cy="71" r="2.1" />
        </g>
      </svg>
      {/* cyan echo — hard-step jitter, mostly quiet with a sharp burst */}
      <svg
        {...SHELL}
        className="ch-deco"
        style={{ animation: "ch-deco-glitch-a 3s steps(1, end) infinite" }}
      >
        <path d={HEX} fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinejoin="round" opacity="0.7" />
      </svg>
      {/* magenta echo — out of phase with the cyan one */}
      <svg
        {...SHELL}
        className="ch-deco"
        style={{ animation: "ch-deco-glitch-b 3s steps(1, end) infinite" }}
      >
        <path d={HEX} fill="none" stroke="#d946ef" strokeWidth="2.2" strokeLinejoin="round" opacity="0.7" />
      </svg>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · Sunset — a glossy candy band with a sun flare
   ══════════════════════════════════════════════════════════════════════════ */

function SunsetBack() {
  const u = useUid()
  const band = `su-b-${u}`
  const flare = `su-s-${u}`
  const glow = `su-f-${u}`
  const glow2 = `su-f2-${u}`
  const [fx, fy] = pt(41, 38)
  return (
    <>
      <svg
        {...SHELL}
        className="ch-deco"
        style={{ animation: "ch-deco-breathe-soft 5.5s ease-in-out infinite" }}
      >
        <defs>
          <linearGradient id={band} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9c2" />
            <stop offset="0.4" stopColor="#ffab70" />
            <stop offset="0.72" stopColor="#ff8fa3" />
            <stop offset="1" stopColor="#ee5d87" />
          </linearGradient>
          <GlowDef id={glow} blur={2.8} />
        </defs>
        {/* warm bloom */}
        <circle cx={CX} cy={CY} r="41" fill="none" stroke="#ff9d6e" strokeWidth="6" opacity="0.2" />
        {/* the glossy band */}
        <circle
          cx={CX} cy={CY} r="41" fill="none"
          stroke={`url(#${band})`} strokeWidth="4.2"
          filter={`url(#${glow})`}
        />
        {/* enamel edges — crisp white inner rim + deep outer rim */}
        <circle cx={CX} cy={CY} r="38.1" fill="none" stroke="#fff2df" strokeWidth="1.2" opacity="0.85" />
        <circle cx={CX} cy={CY} r="43.2" fill="none" stroke="#c2410c" strokeWidth="0.9" opacity="0.4" />
        {/* static gloss highlight across the top-left */}
        <path
          d={arc(41, -78, -32)}
          fill="none"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="4.6"
          strokeLinecap="round"
        />
      </svg>
      {/* the sun flare — a star sitting on the band, pulsing */}
      <svg {...SHELL} className="ch-deco">
        <defs>
          <linearGradient id={flare} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ffd9a0" />
          </linearGradient>
          <GlowDef id={glow2} blur={2.2} />
        </defs>
        <g transform={`translate(${fx.toFixed(2)} ${fy.toFixed(2)}) rotate(14) scale(1.2)`}>
          <g className="ch-fx" style={{ animation: "ch-deco-flare 3.4s ease-in-out infinite" }}>
            <path d={STAR} fill={`url(#${flare})`} filter={`url(#${glow2})`} />
          </g>
        </g>
      </svg>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · Aurora — a wavy light ribbon + counter-rotating shimmer echo
   ══════════════════════════════════════════════════════════════════════════ */

const AURORA_MAIN = wavyRing(41.5, 4, 6)
const AURORA_ECHO = wavyRing(45.8, 4.2, 6)

function AuroraBack() {
  const u = useUid()
  const main = `au-m-${u}`
  const echo = `au-e-${u}`
  const bloom = `au-b-${u}`
  const glow = `au-f-${u}`
  return (
    <>
      {/* soft aurora wash behind everything */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-breathe 5s ease-in-out infinite" }}>
        <defs>
          <radialGradient id={bloom}>
            <stop offset="0" stopColor="transparent" />
            <stop offset="0.62" stopColor="transparent" />
            <stop offset="0.8" stopColor="#8b5cf6" stopOpacity="0.2" />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r="49" fill={`url(#${bloom})`} />
      </svg>
      {/* the main ribbon, slowly flowing around */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-spin 14s linear infinite" }}>
        <defs>
          <linearGradient id={main} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0d9488" />
            <stop offset="0.3" stopColor="#0ea5e9" />
            <stop offset="0.62" stopColor="#8b5cf6" />
            <stop offset="0.86" stopColor="#e879f9" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
          <GlowDef id={glow} blur={3} />
        </defs>
        <path
          d={AURORA_MAIN}
          fill="none"
          stroke={`url(#${main})`}
          strokeWidth="4.6"
          strokeLinejoin="round"
          filter={`url(#${glow})`}
        />
      </svg>
      {/* counter-rotating shimmer — the two waves slipping past each other */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-spin-rev 20s linear infinite" }}>
        <defs>
          <linearGradient id={echo} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e879f9" />
            <stop offset="0.5" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <path
          d={AURORA_ECHO}
          fill="none"
          stroke={`url(#${echo})`}
          strokeWidth="2.2"
          strokeLinejoin="round"
          opacity="0.6"
        />
      </svg>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   9 · Halo — a champagne-gold band, specular sweep, glinting stars
   ══════════════════════════════════════════════════════════════════════════ */

function HaloBack() {
  const u = useUid()
  const band = `ha-b-${u}`
  const glint = `ha-s-${u}`
  const glow = `ha-f-${u}`
  const glow2 = `ha-f2-${u}`
  return (
    <>
      <svg {...SHELL} className="ch-deco">
        <defs>
          <linearGradient id={band} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffef5" />
            <stop offset="0.3" stopColor="#ffe9a3" />
            <stop offset="0.62" stopColor="#f5c84c" />
            <stop offset="1" stopColor="#cf8f1f" />
          </linearGradient>
          <linearGradient id={glint} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#fcd34d" />
          </linearGradient>
          <GlowDef id={glow} blur={2.8} />
        </defs>
        {/* warm bloom */}
        <circle cx={CX} cy={CY} r="41" fill="none" stroke="#f5c542" strokeWidth="8" opacity="0.22" />
        {/* the gold band + polished inner rim */}
        <circle
          cx={CX} cy={CY} r="41" fill="none"
          stroke={`url(#${band})`} strokeWidth="4.2"
          filter={`url(#${glow})`}
        />
        <circle cx={CX} cy={CY} r="38.1" fill="none" stroke="#fff8dc" strokeWidth="1.2" opacity="0.9" />
        {/* deep outer rim — enamel edge that gives the band definition */}
        <circle cx={CX} cy={CY} r="43.2" fill="none" stroke="#b8811a" strokeWidth="0.9" opacity="0.5" />
      </svg>
      {/* the specular sweep gliding around the band */}
      <svg {...SHELL} className="ch-deco" style={{ animation: "ch-deco-spin 6.5s linear infinite" }}>
        <defs>
          <GlowDef id={glow2} blur={1.6} />
        </defs>
        <path
          d={arc(41, -33, 12)}
          fill="none"
          stroke="rgba(255,255,255,0.95)"
          strokeWidth="4.2"
          strokeLinecap="round"
          filter={`url(#${glow2})`}
        />
      </svg>
      {/* two gold glints, twinkling out of phase */}
      <svg {...SHELL} className="ch-deco">
        <g transform="translate(16 21) rotate(-16) scale(0.9)">
          <g className="ch-fx" style={{ animation: "ch-deco-twinkle 2.9s ease-in-out infinite" }}>
            <path d={STAR} fill={`url(#${glint})`} filter={`url(#${glow})`} />
          </g>
        </g>
        <g transform="translate(84 21) rotate(16) scale(0.72)">
          <g className="ch-fx" style={{ animation: "ch-deco-twinkle 3.3s ease-in-out infinite", animationDelay: "-1.5s" }}>
            <path d={STAR} fill={`url(#${glint})`} filter={`url(#${glow})`} />
          </g>
        </g>
      </svg>
    </>
  )
}
