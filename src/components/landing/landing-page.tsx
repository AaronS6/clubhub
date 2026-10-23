"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import {
  MotionConfig,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion"
import type { LucideIcon } from "lucide-react"
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Clock,
  Compass,
  KeyRound,
  Megaphone,
  MessageSquare,
  Search,
  SearchX,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { api } from "@/lib/api/client"
import { APP_VERSION } from "@/lib/version"
import { cn } from "@/lib/utils"
import { initials } from "@/components/shared/page-header"

/**
 * ============================================================================
 * LandingPage — the public, unauthenticated face of ClubHub.
 *
 * WARM DARK redesign: a soft espresso canvas (#171310 — deliberately NOT
 * pure black) with cream ink, the ClubHub green brightened for dark
 * backgrounds (#22c55e fills / #4ade80 display), and terracotta accents.
 * REAL photos — taken at Burnaby North by the students themselves and
 * shared straight from the club's camera roll — live in the hero collage
 * and the auto-scrolling "club life" marquee. Everything stays rounded (2xl–3xl
 * cards, full pill buttons) with scroll reveals and gentle floats (all
 * honoring prefers-reduced-motion).
 *
 * Responsive media:
 *   • lg+      — full hero collage beside the left-aligned text (a large
 *                campus photo + two white polaroids + hand note).
 *   • sm–lg    — a COMPACT version of the same collage (smaller photo card,
 *                one polaroid) so it fits beside the text on tablets.
 *   • < sm     — the photos move INTO the hero background behind the text,
 *                faded with a deep espresso wash so the words stay perfectly
 *                readable ("media behind, fade for text").
 *
 *   nav → hero (LEFT-aligned text) → stats → moments marquee → #clubs
 *   directory (REAL public-listed clubs) → how it works → what's inside →
 *   create with ClubHub → sign-off → footer.
 *
 * All club data is REAL — fetched from the public /api/public/clubs
 * directory (executive opt-in). No fabricated stats or testimonials.
 *
 * "Log in" / "Sign up" navigate to `/?auth=login|signup`, which renders the
 * EXISTING AuthScreen unchanged. Signed-in visitors (the `?landing=1` route
 * from the join dialog's Explore tab) instead get an "Open the app" button
 * that pushes to `/`.
 *
 * This page is ALWAYS dark regardless of the visitor's app theme — every
 * color is hard-coded (no theme tokens, no shadcn primitives), and
 * `--color-background` is pinned to the espresso base on the root wrapper
 * so the global :focus-visible ring offsets against #171310.
 * ============================================================================
 */

interface PublicClubSummary {
  name: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  bannerFocalY: number | null
  accentColor: string
  clubCode: string
  createdAt: string
  memberCount: number
  joinMode?: "code" | "request" | null
}

// ── Design system (hard-coded warm-dark palette — never themed) ─────────────

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Espresso / cream scale (soft + warm — never pure black, never gray). */
const INK = "#f0ebe0" // cream text
const BASE = "#171310" // page canvas — warm espresso
const BASE_LIFT = "#1d1812" // raised section wash
const CARD_BG = "#221d15" // card surface

const MUTED = "rgba(240,235,224,0.60)"
const FAINT = "rgba(240,235,224,0.42)"
const HAIRLINE = "rgba(240,235,224,0.09)"

/** Greens brightened for the dark canvas. */
const GREEN_FILL = "#22c55e" // button fills (near-black text on top)
const GREEN_DISPLAY = "#4ade80" // display text + icons
const GREEN_TINT = "rgba(74,222,128,0.10)"

/** Terracotta — the warm secondary. */
const TERRA = "#f0a876"

/** Pin the theme background var to the espresso base for focus-ring offsets. */
const FORCED_DARK_VARS = {
  "--background": BASE,
  "--color-background": BASE,
} as CSSProperties

/** Pill button base — soft, rounded-full, ≥44px touch targets. */
const PILL_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold " +
  "transition-all duration-200 active:scale-[0.98] select-none"

const PILL_PRIMARY = cn(
  PILL_BASE,
  "h-12 px-6 text-[15px] text-[#07130b] bg-[#22c55e] shadow-[0_10px_28px_-10px_rgba(34,197,94,0.45)]",
  "hover:bg-[#4ade80] hover:shadow-[0_12px_32px_-10px_rgba(34,197,94,0.6)]",
)

const PILL_SOFT = cn(
  PILL_BASE,
  "h-12 px-6 text-[15px] text-[#f0ebe0] bg-[#f0ebe0]/[0.06] ring-1 ring-[#f0ebe0]/15 backdrop-blur-sm",
  "shadow-[0_2px_10px_rgba(0,0,0,0.25)] hover:bg-[#f0ebe0]/[0.1] hover:ring-[#f0ebe0]/25",
)

/** Soft dark card — espresso surface, warm hairline, resting whisper-shadow. */
const CARD =
  "rounded-[1.75rem] bg-[#221d15] ring-1 ring-[#f0ebe0]/[0.08] " +
  "shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-300"

const CARD_HOVER =
  "hover:-translate-y-1 hover:shadow-[0_2px_8px_rgba(0,0,0,0.25),0_24px_48px_-16px_rgba(0,0,0,0.5)] hover:ring-[#f0ebe0]/[0.14]"

// ── Copy ────────────────────────────────────────────────────────────────────

const STEPS: {
  icon: LucideIcon
  word: string
  title: string
  body: string
  photo: string
  photoAlt: string
}[] = [
  {
    icon: Compass,
    word: "one",
    title: "Discover",
    body: "Browse the clubs at North and see what they're actually about.",
    photo: "/landing/bn-club-fair.jpg",
    photoAlt: "Students exploring club tables at the club fair",
  },
  {
    icon: KeyRound,
    word: "two",
    title: "Join",
    body: "Enter a club code, or send a request if the club wants to meet you first.",
    photo: "/landing/bn-signup-table.jpg",
    photoAlt: "A club sign-up table with laptops, flyers, and candy",
  },
  {
    icon: CalendarDays,
    word: "three",
    title: "Show up",
    body: "Meetings, tasks, announcements, service hours — all in one calm place.",
    photo: "/landing/bn-welcome-meeting.jpg",
    photoAlt: "Students at a club's welcome meeting",
  },
]

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Megaphone, title: "Announcements", body: "Pinned news, reactions, and threads." },
  { icon: Clock, title: "Service hours", body: "Log them, get them approved, hit the goal." },
  { icon: CheckSquare, title: "Tasks", body: "A kanban board people actually use." },
  { icon: CalendarDays, title: "Meetings", body: "RSVPs, attendees, and calendar export." },
  { icon: MessageSquare, title: "Chat", body: "Club-wide, teams, and DMs — live." },
  { icon: Users, title: "Teams", body: "Sub-groups with their own lanes of work." },
  { icon: Wallet, title: "Financials", body: "Revenue, expenses, and balance." },
  { icon: Trophy, title: "Badges", body: "Earn them. Climb the leaderboard." },
]

/** Moments — every photo here is one of OURS: taken at Burnaby North by
 *  the students themselves, shared straight from the club's camera roll
 *  (plus two of the club's own banner shots). No stock, no stock-adjacent.
 *  Rendered as the auto-scrolling marquee strip under the stats band: one
 *  calm row of fixed-height cards, edge-faded viewport, pauses on hover,
 *  honors prefers-reduced-motion. People first, always. */
const MOMENTS: { src: string; alt: string }[] = [
  {
    src: "/landing/bn-team-photo.jpg",
    alt: "About fifty students in matching navy club shirts posing together outdoors",
  },
  {
    src: "/landing/real-campus.jpg",
    alt: "The sunlit Burnaby North campus between classes",
  },
  {
    src: "/landing/bn-club-fair.jpg",
    alt: "A crowded school atrium during the club fair, students around sign-up tables",
  },
  {
    src: "/landing/real-robotics.jpg",
    alt: "A robotics team with their competition robot",
  },
  {
    src: "/landing/bn-snack-social.jpg",
    alt: "Students sharing Timbits and cookies at a club social",
  },
  {
    src: "/landing/real-friends.jpg",
    alt: "Students riding the school bus together after a competition",
  },
  {
    src: "/landing/bn-cake-decorating.jpg",
    alt: "Hands decorating a heart-shaped cake with pink frosting and sprinkles",
  },
  {
    src: "/landing/bn-gym-north.jpg",
    alt: "The school gym with NORTH spelled out in giant letters on the wall",
  },
  {
    src: "/landing/real-debate.jpg",
    alt: "Students celebrating at a tournament",
  },
  {
    src: "/landing/bn-theater-fundraiser.jpg",
    alt: "A theater club fundraising table covered with items for sale under a pop-up tent",
  },
  {
    src: "/landing/bn-signup-table.jpg",
    alt: "A club sign-up table with laptops, flyers, QR codes, and candy",
  },
  {
    src: "/landing/real-volunteer.jpg",
    alt: "Volunteers tending a community garden",
  },
  {
    src: "/landing/bn-welcome-meeting.jpg",
    alt: "Students at desks watching a welcome presentation at a club's first meeting",
  },
  {
    src: "/landing/real-photography.jpg",
    alt: "A student photographer capturing spring blossoms",
  },
  {
    src: "/banners/photography-banner.jpg",
    alt: "Photography Club out on a shoot",
  },
  {
    src: "/landing/bn-study-hangout.jpg",
    alt: "Students studying together around tables in a bright room",
  },
  {
    src: "/landing/real-debate-hoodie.jpg",
    alt: "A Debate Society member repping the team hoodie outside",
  },
  {
    src: "/landing/bn-atrium.jpg",
    alt: "The school's bright modern atrium between classes",
  },
  {
    src: "/landing/real-study.jpg",
    alt: "Reading buddies — club members reading with younger students",
  },
  {
    src: "/banners/debate-banner.jpg",
    alt: "Debate Society at the podium",
  },
  {
    src: "/landing/bn-lobby.jpg",
    alt: "The school's bright front lobby on a regular Tuesday",
  },
]

/** FAQ — plain answers in the site's voice (first person, no corporate
 *  speak). Rendered as the hairline accordion after "Create with ClubHub"
 *  and emitted once as FAQPage JSON-LD for search engines. */
const FAQS: { q: string; a: string }[] = [
  {
    q: "What is ClubHub, actually?",
    a: "The home for every club at Burnaby North. There's a public directory of what's out there, and once you're in a club you get announcements, tasks, meetings, chat, and service-hour tracking — all in one calm place instead of five group chats.",
  },
  {
    q: "Do I need an account to look around?",
    a: "Nope. The whole directory is open — browse every listed club, read what they're about, see how many members they have. You only need an account to join a club or run one.",
  },
  {
    q: "How do I join a club?",
    a: "Find it in Explore, tap Join, then enter the club's code — or send a request if the club wants to meet you first. Either way it takes about ten seconds.",
  },
  {
    q: "Is it free?",
    a: "Yes, completely. ClubHub was built by students, not a company — no subscriptions, no ads, no upsells. It's just a tool that makes clubs easier to run.",
  },
  {
    q: "My club isn't listed — can we get on it?",
    a: "Any club at North can be. A leader creates the club in a couple of minutes and flips on the public directory in club settings — after that it shows up here for everyone.",
  },
  {
    q: "Who made this?",
    a: "A student at North who got tired of the group-chat chaos and decided to build the fix. The footer at the bottom of this page says exactly who.",
  },
]

/** FAQPage structured data, derived from the same FAQS array so the visible
 *  answers and the machine-readable ones can never drift apart. */
const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.a,
    },
  })),
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const authed = Boolean(session?.user)
  const [query, setQuery] = useState("")

  const { data, isLoading } = useQuery<{ clubs: PublicClubSummary[] }>({
    queryKey: ["public-clubs"],
    queryFn: () => api<{ clubs: PublicClubSummary[] }>("/api/public/clubs"),
    staleTime: 60_000,
    retry: 1,
  })

  const clubs = data?.clubs ?? []

  // Client-side search over the fetched directory (bounded at 100 clubs by
  // the API, so this is instant and works without extra round-trips).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clubs
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        c.clubCode.toLowerCase().includes(q),
    )
  }, [clubs, query])

  // Deep-link support: /#clubs (e.g. from a public profile's "discover more"
  // link) scrolls the explore section into view on mount.
  useEffect(() => {
    if (window.location.hash === "#clubs") {
      // Wait a tick for layout so the scroll lands correctly.
      const t = setTimeout(() => {
        document.getElementById("clubs")?.scrollIntoView({ behavior: "smooth" })
      }, 250)
      return () => clearTimeout(t)
    }
  }, [])

  const scrollToClubs = () => {
    document.getElementById("clubs")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="relative min-h-screen flex flex-col bg-[#171310] text-[#f0ebe0]"
        style={FORCED_DARK_VARS}
      >
        {/* Film grain — a whisper of texture so the page feels printed,
            not generated. Never intercepts pointer events. */}
        <div aria-hidden className="landing-grain" />

        {/* ── Public nav — espresso glass, pill actions ─────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="sticky top-0 z-40 border-b border-[#f0ebe0]/[0.07] bg-[#171310]/85 backdrop-blur-md"
        >
          <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between gap-3">
            <Link
              href="/"
              aria-label="ClubHub home"
              className="group flex h-11 items-center rounded-full pr-2"
            >
              <span className="font-display text-lg font-bold tracking-tight text-[#f0ebe0] transition-colors duration-200 group-hover:text-[#4ade80]">
                ClubHub
              </span>
            </Link>
            <nav className="flex items-center gap-2" aria-label="Public navigation">
              <button
                type="button"
                onClick={scrollToClubs}
                className="hidden md:inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-[#f0ebe0]/60 transition-colors hover:bg-[#f0ebe0]/[0.07] hover:text-[#f0ebe0]"
              >
                Explore clubs
              </button>
              {authed ? (
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className={cn(PILL_BASE, "h-11 px-5 text-sm text-[#07130b] bg-[#22c55e] shadow-[0_8px_22px_-10px_rgba(34,197,94,0.5)] hover:bg-[#4ade80]")}
                >
                  Open the app
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => router.push("/?auth=login")}
                    className={cn(
                      PILL_BASE,
                      "h-11 px-5 text-sm text-[#f0ebe0]/90 bg-[#f0ebe0]/[0.07] ring-1 ring-[#f0ebe0]/22 hover:bg-[#f0ebe0]/[0.12] hover:ring-[#f0ebe0]/30 hover:text-[#f0ebe0]",
                    )}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/?auth=signup")}
                    className={cn(PILL_BASE, "h-11 px-5 text-sm text-[#07130b] bg-[#22c55e] shadow-[0_8px_22px_-10px_rgba(34,197,94,0.5)] hover:bg-[#4ade80]")}
                  >
                    Sign up
                  </button>
                </>
              )}
            </nav>
          </div>
        </motion.header>

        <main className="flex-1 flex flex-col">
          {/* ── Hero — left-aligned text over a dimmed real photo; the
              collage floats beside it on sm+ and melts into the background
              with an espresso fade on phones ── */}
          <section aria-labelledby="hero-title" className="relative overflow-hidden">
            {/* Ambient photo background — the REAL campus photo, dimmed by an
                espresso wash and faded out toward the section edges so text
                stays readable and the texture never fights the content. */}
            <img
              src="/landing/bn-gym-north.jpg"
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-45"
            />
            <div aria-hidden className="absolute inset-0 bg-[#171310]/45" />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(23,19,16,0.55) 0%, rgba(23,19,16,0.12) 34%, rgba(23,19,16,0.2) 60%, #171310 97%)",
              }}
            />
            {/* Extra wash behind the left-aligned headline on wide screens. */}
            <div
              aria-hidden
              className="absolute inset-0 hidden sm:block"
              style={{
                background:
                  "linear-gradient(100deg, rgba(23,19,16,0.92) 0%, rgba(23,19,16,0.6) 42%, rgba(23,19,16,0.1) 78%, rgba(23,19,16,0) 100%)",
              }}
            />

            {/* PHONE — the photos live IN the background behind the text,
                faded with a deep espresso wash so the words stay perfectly
                readable. sm:hidden. */}
            <div aria-hidden className="absolute inset-0 sm:hidden">
              <img
                src="/landing/bn-club-fair.jpg"
                alt=""
                className="absolute right-[-8%] top-[5%] w-[52%] rotate-2 rounded-2xl object-cover opacity-75 ring-1 ring-[#f0ebe0]/10 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
              />
              <img
                src="/landing/bn-cake-decorating.jpg"
                alt=""
                className="absolute left-[-6%] top-[34%] w-[42%] -rotate-3 rounded-xl object-cover opacity-80 ring-1 ring-[#f0ebe0]/10 shadow-[0_14px_36px_rgba(0,0,0,0.5)]"
              />
              <img
                src="/landing/real-friends.jpg"
                alt=""
                className="absolute right-[4%] bottom-[3%] w-[46%] rotate-2 rounded-xl object-cover opacity-80 ring-1 ring-[#f0ebe0]/10 shadow-[0_14px_36px_rgba(0,0,0,0.5)]"
              />
              {/* The fade — strongest over the text zone, letting the media
                  peek through at the edges. */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(100deg, rgba(23,19,16,0.94) 0%, rgba(23,19,16,0.8) 42%, rgba(23,19,16,0.55) 72%, rgba(23,19,16,0.35) 100%)",
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#171310] to-transparent" />
            </div>

            <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-12 sm:pt-20 pb-16 sm:pb-20 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,290px)] sm:items-center sm:gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,330px)] lg:grid-cols-[minmax(0,21fr)_minmax(0,19fr)] lg:gap-12 xl:gap-16 lg:pt-24">
              {/* LEFT — the words (headline, subtext, CTAs all anchored left) */}
              <div className="relative z-10 text-left">
                <Reveal delay={0.1}>
                  <h1
                    id="hero-title"
                    className="max-w-xl font-display font-bold tracking-tight text-balance text-[#f0ebe0]"
                    style={{
                      fontSize: "clamp(2.5rem, 5.4vw, 4.1rem)",
                      lineHeight: 1.04,
                      letterSpacing: "-0.028em",
                    }}
                  >
                    School clubs,
                    <br />
                    <span className="relative inline-block text-[#4ade80]">
                      minus the chaos.
                      {/* Hand-drawn underline — a little terracotta squiggle. */}
                      <svg
                        aria-hidden
                        viewBox="0 0 300 14"
                        preserveAspectRatio="none"
                        className="absolute -bottom-2 left-0 h-3 w-full text-[#f0a876]"
                      >
                        <path
                          d="M4 10 C 60 3, 122 3, 172 8 C 216 12, 262 10, 296 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="5"
                          strokeLinecap="round"
                          opacity="0.85"
                        />
                      </svg>
                    </span>
                  </h1>
                </Reveal>

                <Reveal delay={0.18}>
                  <p className="mt-7 max-w-[34rem] text-base sm:text-lg leading-relaxed text-[#f0ebe0]/65">
                    ClubHub is the home for every club at Burnaby North. Browse
                    what&apos;s out there, join in a couple of clicks, and stop
                    running your whole club out of a group chat.
                  </p>
                </Reveal>

                <Reveal delay={0.26}>
                  <div className="mt-9 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={scrollToClubs} className={cn(PILL_PRIMARY, "group")}>
                      Explore clubs
                      <ArrowDown
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5"
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(authed ? "/" : "/?auth=signup")}
                      className={cn(PILL_SOFT, "group")}
                    >
                      {authed ? "Open the app" : "Start a club"}
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </button>
                  </div>
                </Reveal>
              </div>

              {/* RIGHT — the living collage: campus photo + floating polaroids.
                  sm+: sits beside the text, COMPACT on tablets, full on lg+.
                  Below sm this whole column is hidden — the media renders in
                  the phone background layer above instead. */}
              <div className="relative z-10 hidden sm:block sm:h-[300px] md:h-[340px] lg:h-[460px]">
                {/* Soft color glows breathing behind the collage. */}
                <div
                  aria-hidden
                  className="absolute -top-8 right-6 h-44 w-44 rounded-full bg-[#22c55e]/[0.13] blur-3xl"
                />
                <div
                  aria-hidden
                  className="absolute bottom-2 -left-8 h-48 w-48 rounded-full bg-[#f0a876]/[0.1] blur-3xl"
                />

                {/* Main photo card — the REAL whole-team shot, fifty
                    students deep, rounded soft, floating gently. */}
                <Float
                  className="absolute right-0 top-5 z-10 w-[86%] lg:top-9 lg:w-[76%]"
                  duration={7}
                  dy={7}
                >
                  <div className="overflow-hidden rounded-[1.5rem] ring-1 ring-[#f0ebe0]/12 shadow-[0_2px_6px_rgba(0,0,0,0.3),0_28px_56px_-18px_rgba(0,0,0,0.55)]">
                    <img
                      src="/landing/bn-team-photo.jpg"
                      alt="The whole club together — fifty students in matching navy shirts"
                      loading="lazy"
                      draggable={false}
                      className="aspect-[4/3] w-full object-cover lg:aspect-[16/10]"
                    />
                  </div>
                </Float>

                {/* Polaroid 1 — the REAL robotics team photo, tilted +2.5deg.
                    White polaroid frames keep the printed-photo feel on the
                    dark canvas. */}
                <Float
                  className="absolute left-0 top-0 z-20 w-[52%] lg:w-[46%]"
                  duration={6}
                  delay={1.4}
                  dy={10}
                >
                  <div className="rotate-[2.5deg] rounded-[1.25rem] bg-[#f5f1e8] p-2 shadow-[0_2px_4px_rgba(0,0,0,0.35),0_20px_40px_-12px_rgba(0,0,0,0.55)]">
                    <img
                      src="/landing/real-robotics.jpg"
                      alt="A robotics team posing with their competition robot"
                      loading="lazy"
                      draggable={false}
                      className="aspect-[7/5] w-full rounded-[0.9rem] object-cover"
                    />
                  </div>
                </Float>

                {/* Polaroid 2 — the REAL school-bus photo, tilted -3deg
                    (lg+ only — the tablet collage stays compact). */}
                <Float
                  className="absolute right-7 bottom-0 z-20 hidden w-[48%] lg:block"
                  duration={6.5}
                  delay={2.8}
                  dy={8}
                >
                  <div className="rotate-[-3deg] rounded-[1.25rem] bg-[#f5f1e8] p-2 shadow-[0_2px_4px_rgba(0,0,0,0.35),0_20px_40px_-12px_rgba(0,0,0,0.55)]">
                    <img
                      src="/landing/real-friends.jpg"
                      alt="Students laughing together on the school bus"
                      loading="lazy"
                      draggable={false}
                      className="aspect-[7/5] w-full rounded-[0.9rem] object-cover"
                    />
                  </div>
                </Float>

                {/* Annotation — the human little note pointing at the photo. */}
                <p
                  aria-hidden
                  className="absolute -top-1 right-1 hidden items-center justify-end gap-2 font-serif text-[15px] italic text-[#f0ebe0]/55 lg:flex lg:rotate-2"
                >
                  the group chat, but organized
                  <svg viewBox="0 0 40 26" fill="none" aria-hidden className="h-5 w-8 shrink-0 text-[#f0a876]">
                    <path
                      d="M37 3c-7 9-16 13-28 13"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M15 12l-6 4M16 20l-7-3"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </p>
              </div>
            </div>
          </section>

          {/* ── By the numbers — a quiet trust band fed by the real
              directory (clubs listed, members across them, chaos left) ── */}
          <StatsBand clubs={clubs} loading={isLoading} />

          {/* ── Moments — the auto-scrolling photo strip: ONE calm horizontal
              row of the students' own photos, edge-faded, pauses on hover.
              Compact on every screen. ──────────────────────────────────── */}
          <section aria-label="Club life photos" className="relative overflow-hidden py-10 sm:py-14">
            <Reveal>
              <div className="landing-marquee-mask overflow-hidden">
                <div aria-hidden className="landing-marquee flex w-max items-center gap-4 py-2">
                  {[...MOMENTS, ...MOMENTS].map((m, i) => (
                    <img
                      key={`${m.src}-${i}`}
                      src={m.src}
                      alt={m.alt}
                      loading="lazy"
                      draggable={false}
                      className="h-36 w-auto aspect-[7/5] rounded-2xl object-cover ring-1 ring-[#f0ebe0]/10 shadow-[0_2px_6px_rgba(0,0,0,0.3),0_14px_30px_-12px_rgba(0,0,0,0.45)] sm:h-44"
                    />
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mx-auto mt-6 max-w-xl text-center font-serif text-lg italic leading-relaxed text-[#f0ebe0]/55 sm:mt-8">
                Made for Burnaby North students, by students who lived in
                Group Chat chaos.
              </p>
            </Reveal>
          </section>

          {/* ── Explore clubs — the real public directory ─────────────────── */}
          <section id="clubs" aria-labelledby="clubs-title" className="scroll-mt-20">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
              <Reveal>
                <div className="max-w-xl">
                  <Eyebrow icon={Compass}>Explore</Eyebrow>
                  <h2
                    id="clubs-title"
                    className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-balance text-[#f0ebe0]"
                  >
                    Find your people.
                  </h2>
                  <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#f0ebe0]/60">
                    Real clubs, run by real students at North. See what each one
                    is about before you commit to anything.
                  </p>
                </div>
              </Reveal>

              {/* Search — dark pill, no account required */}
              <Reveal delay={0.08}>
                <div className="relative mt-8 max-w-md">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#f0ebe0]/35"
                    aria-hidden
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search clubs at North…"
                    aria-label="Search public clubs"
                    className="h-12 w-full rounded-full border-0 bg-[#221d15] pl-11 pr-12 text-[15px] text-[#f0ebe0] ring-1 ring-[#f0ebe0]/15 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_10px_24px_-14px_rgba(0,0,0,0.5)] placeholder:text-[#f0ebe0]/45 transition-shadow focus:outline-none focus:ring-2 focus:ring-[#22c55e]/50"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#f0ebe0]/40 transition-colors hover:bg-[#f0ebe0]/[0.08] hover:text-[#f0ebe0]"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </Reveal>

              {/* Directory */}
              <div className="mt-10">
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-80 animate-pulse rounded-[1.75rem] bg-[#1d1812] ring-1 ring-[#f0ebe0]/[0.07]"
                      />
                    ))}
                  </div>
                ) : clubs.length === 0 ? (
                  <Reveal>
                    <EmptyDirectory />
                  </Reveal>
                ) : filtered.length === 0 ? (
                  <Reveal>
                    <NoMatchState query={query.trim()} onClear={() => setQuery("")} />
                  </Reveal>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                    {filtered.map((club, i) => (
                      <motion.div
                        key={club.clubCode}
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ duration: 0.5, delay: (i % 3) * 0.07, ease: EASE }}
                      >
                        <PublicClubCard club={club} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── How it works — three soft cards ──────────────────────────── */}
          <section aria-labelledby="how-title">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
              <Reveal>
                <Eyebrow>How it works</Eyebrow>
                <h2
                  id="how-title"
                  className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-balance text-[#f0ebe0]"
                >
                  From scrolling to showing up.
                </h2>
              </Reveal>

              <div className="mt-10 sm:mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
                {STEPS.map((step, i) => (
                  <Reveal key={step.title} delay={i * 0.08} className="h-full">
                    <div className={cn(CARD, CARD_HOVER, "group h-full overflow-hidden")}>
                      {/* Real-photo header — the step, seen at North. */}
                      <div className="relative h-36 overflow-hidden">
                        <img
                          src={step.photo}
                          alt={step.photoAlt}
                          loading="lazy"
                          draggable={false}
                          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        />
                        <div
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-[#1d1812] via-[#1d1812]/45 to-[#171310]/15"
                        />
                        {/* Icon as a glass chip pinned over the photo. */}
                        <span className="absolute left-5 top-5 grid h-11 w-11 place-items-center rounded-2xl bg-[#171310]/70 text-[#4ade80] ring-1 ring-[#f0ebe0]/15 backdrop-blur-md">
                          <step.icon className="h-5 w-5" aria-hidden />
                        </span>
                      </div>
                      <div className="p-6 sm:p-7">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold text-[#f0ebe0]">{step.title}</h3>
                          <span className="shrink-0 font-serif text-sm italic text-[#f0ebe0]/45">
                            step {step.word}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-[#f0ebe0]/60">{step.body}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ── What's inside — 8 features on a sage-tinted dark band ─────── */}
          <section aria-labelledby="inside-title" className="bg-[#1c2015]">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
              <Reveal>
                <Eyebrow>What&apos;s inside</Eyebrow>
                <h2
                  id="inside-title"
                  className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-balance text-[#f0ebe0]"
                >
                  Everything a club needs. Nothing it doesn&apos;t.
                </h2>
                <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#f0ebe0]/60">
                  All of this is live in ClubHub today.
                </p>
              </Reveal>

              <div className="mt-10 sm:mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
                {FEATURES.map((f, i) => (
                  <Reveal key={f.title} delay={(i % 4) * 0.05} className="h-full">
                    <div
                      className={cn(
                        CARD,
                        CARD_HOVER,
                        "h-full rounded-3xl p-5",
                      )}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#4ade80]/[0.12] text-[#4ade80]">
                        <f.icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <p className="mt-4 text-[15px] font-semibold text-[#f0ebe0]">{f.title}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#f0ebe0]/60">{f.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ── For club leaders — photo panel + exec band ───────────────── */}
          <section aria-labelledby="create-title">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
              <Reveal>
                <div className="grid overflow-hidden rounded-[2rem] bg-[#221d15] ring-1 ring-[#f0ebe0]/[0.09] shadow-[0_2px_8px_rgba(0,0,0,0.25),0_36px_72px_-24px_rgba(0,0,0,0.55)] lg:grid-cols-[1fr_1.05fr]">
                  {/* Softly dimmed REAL photo panel — students heads-down
                      around a laptop, running the workshop themselves. */}
                  <div className="relative h-48 sm:h-64 overflow-hidden lg:h-auto lg:min-h-[440px]">
                    <img
                      src="/landing/bn-classroom-demo.jpg"
                      alt="Students leading a club workshop around a laptop"
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div aria-hidden className="absolute inset-0 bg-[#171310]/35" />
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-[#171310]/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-[#221d15]/70"
                    />
                    <p className="absolute bottom-4 left-5 font-serif text-sm italic text-[#f0ebe0]/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                      workshops that (mostly) run themselves
                    </p>
                  </div>

                  <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                    <Eyebrow tone="terracotta">For club leaders</Eyebrow>
                    <h2
                      id="create-title"
                      className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-balance text-[#f0ebe0]"
                    >
                      Create with ClubHub.
                    </h2>
                    <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#f0ebe0]/60">
                      If you run a club at North, this is your back office —
                      announcements that actually reach people, service-hour
                      approvals in a tap, a banner that makes your club feel
                      real, and join requests you get to vet.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
                      <button
                        type="button"
                        onClick={() => router.push(authed ? "/" : "/?auth=signup")}
                        className={cn(PILL_PRIMARY, "group")}
                      >
                        {authed ? "Open the app" : "Start your club"}
                        <ArrowRight
                          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </button>
                      {!authed && (
                      <button
                        type="button"
                        onClick={() => router.push("/?auth=login")}
                        className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-[#f0ebe0]/60 transition-colors hover:bg-[#4ade80]/[0.08] hover:text-[#4ade80]"
                      >
                        Log in
                      </button>
                      )}
                    </div>
                    <p className="mt-7 font-serif text-sm italic text-[#f0ebe0]/40">
                      you&apos;ll wonder how the group chat ever worked.
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ── FAQ — honest answers to what people actually ask ────────── */}
          <FaqSection />

          {/* ── Sign-off — one warm, human line before the footer ────────── */}
          <section aria-label="Closing note" className="pb-16 sm:pb-24">
            <Reveal>
              <div className="mx-auto max-w-6xl px-5 sm:px-8 text-center">
                <p className="font-serif text-2xl sm:text-3xl italic text-[#f0ebe0]">
                  go join something.
                </p>
                <button
                  type="button"
                  onClick={scrollToClubs}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-[#4ade80] transition-colors hover:bg-[#4ade80]/[0.09]"
                >
                  Explore clubs
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </Reveal>
          </section>
        </main>

        {/* ── Footer — soft, quiet, bottom of the page ────────────────────── */}
        <footer className="mt-auto border-t border-[#f0ebe0]/[0.09] bg-[#141110]">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <p className="font-display text-base font-bold tracking-tight text-[#f0ebe0]">
                ClubHub
              </p>
              <p className="mt-2.5 text-sm text-[#f0ebe0]/55">
                Built for students at Burnaby North Secondary.
              </p>
              <p className="mt-1 text-xs text-[#f0ebe0]/35 select-none">
                Made by Aaron Shan · v{APP_VERSION}
              </p>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Footer">
              <button
                type="button"
                onClick={scrollToClubs}
                className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-[#f0ebe0]/55 transition-colors hover:bg-[#f0ebe0]/[0.06] hover:text-[#f0ebe0]"
              >
                Explore clubs
              </button>
              {authed ? (
                <Link
                  href="/"
                  className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-[#f0ebe0]/55 transition-colors hover:bg-[#f0ebe0]/[0.06] hover:text-[#f0ebe0]"
                >
                  Open the app
                </Link>
              ) : (
                <>
                  <Link
                    href="/?auth=login"
                    className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-[#f0ebe0]/55 transition-colors hover:bg-[#f0ebe0]/[0.06] hover:text-[#f0ebe0]"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/?auth=signup"
                    className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-[#f0ebe0]/55 transition-colors hover:bg-[#f0ebe0]/[0.06] hover:text-[#f0ebe0]"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Scroll-triggered entrance — gentle y-fade with the app's easing. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Gentle vertical float — different phases per item. Disabled under
 *  prefers-reduced-motion by the MotionConfig(reducedMotion="user") wrapper. */
function Float({
  children,
  className,
  duration = 6,
  delay = 0,
  dy = 8,
}: {
  children: ReactNode
  className?: string
  duration?: number
  delay?: number
  dy?: number
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -dy, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  )
}

/** Micro-label — soft pill with an optional icon, green or terracotta. */
function Eyebrow({
  children,
  icon: Icon,
  tone = "green",
}: {
  children: ReactNode
  icon?: LucideIcon
  tone?: "green" | "terracotta"
}) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ring-1",
        tone === "green"
          ? "bg-[#4ade80]/[0.07] text-[#4ade80]/90 ring-[#4ade80]/20"
          : "bg-[#f0a876]/[0.08] text-[#f0a876] ring-[#f0a876]/20",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Stats band — quiet trust strip under the hero (real directory numbers)
// ---------------------------------------------------------------------------

/** Animated numeral — counts 0 → value the first time it scrolls into view.
 *  Rendering goes through a MotionValue so the text updates outside React;
 *  under prefers-reduced-motion (honored via the page's MotionConfig
 *  reducedMotion="user") it jumps straight to the final value. */
function CountUp({
  value,
  duration = 1.1,
  delay = 0,
}: {
  value: number
  duration?: number
  delay?: number
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })
  const count = useMotionValue(0)
  const display = useTransform(count, (latest) => Math.round(latest).toLocaleString("en-US"))

  useEffect(() => {
    if (!inView) return
    // Reduced motion, or a target of zero (the "chaos remaining" gag):
    // land instantly — no count-up theatre.
    if (reduced || value === 0) {
      count.set(value)
      return
    }
    const controls = animate(count, value, { duration, delay, ease: EASE })
    return () => controls.stop()
  }, [inView, reduced, value, duration, delay, count])

  // aria-hidden: the final value also ships as sr-only text beside this
  // span, so screen readers get the number without the per-frame chatter.
  return (
    <motion.span ref={ref} aria-hidden>
      {display}
    </motion.span>
  )
}

/** StatsBand — three REAL numbers pulled from the public clubs query, no
 *  fabrication: how many clubs are listed, how many members sit across them,
 *  and how much group-chat chaos remains (always zero — that's the pitch).
 *  ONE slim horizontal strip on every screen — the three stats sit side by
 *  side even on phones, numbers scaled down so the band never towers. */
function StatsBand({ clubs, loading }: { clubs: PublicClubSummary[]; loading: boolean }) {
  const members = clubs.reduce((sum, club) => sum + club.memberCount, 0)

  const stats: { value: number; label: string; green?: boolean }[] = [
    { value: clubs.length, label: "clubs on the directory" },
    { value: members, label: "members across them" },
    { value: 0, label: "chaos remaining", green: true },
  ]

  return (
    <section aria-label="ClubHub by the numbers" className="border-y border-[#f0ebe0]/[0.07] bg-[#1d1812]">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <Reveal>
          <dl className="grid grid-cols-3">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn(
                  "flex flex-col-reverse items-center justify-center gap-1 py-4 sm:gap-2 sm:py-7",
                  // Hairline rules between the three side-by-side columns —
                  // the band is one horizontal strip at every breakpoint.
                  i < stats.length - 1 && "border-r border-[#f0ebe0]/[0.09]",
                )}
              >
                <dt className="px-1 text-center text-[10px] leading-tight text-[#f0ebe0]/[0.42] sm:text-sm">
                  {stat.label}
                </dt>
                <dd
                  className="font-display text-2xl font-bold tabular-nums tracking-tight sm:text-4xl"
                  style={{
                    lineHeight: 1.06,
                    color: stat.green ? GREEN_DISPLAY : INK,
                  }}
                >
                  {loading ? (
                    <span
                      aria-hidden
                      className="block h-[1.05em] w-[1.4em] animate-pulse rounded-lg bg-[#f0ebe0]/[0.07]"
                    />
                  ) : (
                    <>
                      <span className="sr-only">{stat.value.toLocaleString("en-US")}</span>
                      <CountUp value={stat.value} delay={i * 0.12} />
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// FAQ — hairline accordion, one row open at a time (+ FAQPage JSON-LD)
// ---------------------------------------------------------------------------

/** FaqSection — six honest questions in the site's voice. Full-width rows
 *  separated by hairlines (no card boxes), single-open accordion, chevron
 *  rotates 180°, and the whole row is the button. */
function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section aria-labelledby="faq-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
        <Reveal>
          <div className="max-w-xl">
            <Eyebrow>FAQ</Eyebrow>
            <h2
              id="faq-title"
              className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-balance text-[#f0ebe0]"
            >
              Questions, answered.
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#f0ebe0]/60">
              The stuff people actually ask us, answered plainly.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-10 sm:mt-12 max-w-3xl">
            {FAQS.map((item, i) => (
              <FaqItem
                key={item.q}
                item={item}
                index={i}
                open={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        </Reveal>

        {/* Structured data — the single FAQPage JSON-LD for this page. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
        />
      </div>
    </section>
  )
}

/** One FAQ row — a full-width button (≥44px touch target) + an animated
 *  panel. Opening a row collapses its siblings (single-open, owned by the
 *  parent). Reduced motion collapses the animations to instant swaps. */
function FaqItem({
  item,
  index,
  open,
  onToggle,
}: {
  item: { q: string; a: string }
  index: number
  open: boolean
  onToggle: () => void
}) {
  const reduced = useReducedMotion()
  const buttonId = `faq-question-${index}`
  const panelId = `faq-answer-${index}`

  return (
    <div className="border-b border-[#f0ebe0]/[0.09] last:border-b-0">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          // Pin the theme ring var to the landing green so the global
          // :focus-visible ring reads green on this always-dark page.
          style={{ "--ring": GREEN_DISPLAY } as CSSProperties}
          className="group flex min-h-[44px] w-full items-center justify-between gap-4 rounded-2xl py-5 pl-4 -ml-4 text-left outline-none transition-colors hover:bg-[#f0ebe0]/[0.035] focus-visible:ring-2 focus-visible:ring-[#4ade80]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171310]"
        >
          <span className="text-[15px] sm:text-base font-semibold leading-snug text-[#f0ebe0]">
            {item.q}
          </span>
          {/* The chevron — spins 180° when open (instant under reduced
              motion, where globals.css also freezes transforms). */}
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
            className="grid h-6 w-6 shrink-0 place-items-center text-[#f0ebe0]/[0.45] transition-colors group-hover:text-[#f0ebe0]"
          >
            <ChevronDown className="h-[18px] w-[18px]" aria-hidden />
          </motion.span>
        </button>
      </h3>
      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!open}
        initial={false}
        animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
        className="overflow-hidden"
      >
        <p className="max-w-2xl pb-6 pl-4 pr-10 text-sm sm:text-[15px] leading-relaxed text-[#f0ebe0]/60">
          {item.a}
        </p>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Club card — banner-first, big + visual, soft corners, hover lift.
// ---------------------------------------------------------------------------

function PublicClubCard({ club }: { club: PublicClubSummary }) {
  const focalPct = Math.round((club.bannerFocalY ?? 0.5) * 100)
  const needsApproval = club.joinMode === "request"
  const since = format(parseISO(club.createdAt), "MMM yyyy")

  return (
    <Link
      href={`/?public=${encodeURIComponent(club.clubCode)}`}
      aria-label={`View ${club.name} club profile`}
      className={cn(
        CARD,
        CARD_HOVER,
        "group block overflow-hidden outline-none",
        // A touch more lift than the generic card hover, an accent ring
        // in the landing green, and a matching keyboard focus ring — the
        // whole card stays ONE tap target (the Link wraps everything).
        "hover:-translate-y-1.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.28),0_28px_56px_-18px_rgba(0,0,0,0.55)] hover:ring-[#4ade80]/[0.3]",
        "focus-visible:ring-2 focus-visible:ring-[#4ade80]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171310]",
      )}
    >
      {/* Banner — real club banner where set, quiet accent wash fallback.
          Tall + object-cover keeps the grid lush even when clubs upload
          banners with different aspect ratios. */}
      <div className="relative h-44 sm:h-48 overflow-hidden">
        {club.bannerUrl ? (
          <img
            src={club.bannerUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            style={{ objectPosition: `center ${focalPct}%` }}
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(
                club.accentColor,
                0.32,
              )} 0%, ${hexToRgba(club.accentColor, 0.08)} 100%)`,
            }}
          />
        )}
        {/* Soft contrast scrim, faded bottom. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
        />
        {/* Join mode chip — dark glass pill, top-right. Micro-scales with
            the card hover (as does the logo tile below) so the whole card
            feels alive under the cursor. */}
        <span className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-[#f0ebe0] shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:scale-[1.05]">
          {needsApproval ? (
            <UserCheck className="h-3.5 w-3.5 text-[#4ade80]" aria-hidden />
          ) : (
            <KeyRound className="h-3.5 w-3.5 text-[#4ade80]" aria-hidden />
          )}
          {needsApproval ? "Approval required" : "Code to join"}
        </span>
        {/* Logo tile + name riding the fade. */}
        <div className="absolute bottom-0 inset-x-0 p-4 flex items-end gap-3 min-w-0">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl overflow-hidden text-sm font-bold ring-2 ring-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out group-hover:scale-[1.07]"
            style={{
              backgroundColor: club.accentColor,
              color: readableForeground(club.accentColor),
            }}
          >
            {club.logoUrl ? (
              <img src={club.logoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              initials(club.name)
            )}
          </span>
          <p className="font-display text-lg font-semibold text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.65)] truncate min-w-0 pb-0.5">
            {club.name}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col p-5">
        <p className="text-sm leading-relaxed text-[#f0ebe0]/60 line-clamp-2 min-h-[2.6rem]">
          {club.description ?? "A club at Burnaby North."}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-[#f0ebe0]/40">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: club.accentColor }}
          />
          <span className="truncate">
            {club.memberCount} {club.memberCount === 1 ? "member" : "members"} · since {since}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#f0ebe0]/[0.08] pt-3.5">
          <span className="text-sm font-semibold text-[#4ade80] transition-colors duration-200 group-hover:text-[#86efac]">
            View club
          </span>
          <ArrowRight
            className="h-4 w-4 text-[#4ade80] transition-all duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5 group-hover:text-[#86efac]"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Empty / no-match states
// ---------------------------------------------------------------------------

function EmptyDirectory() {
  return (
    <div className={cn(CARD, "py-16 px-6 text-center")}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4ade80]/[0.12] text-[#4ade80]">
        <Compass className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-[#f0ebe0]">No clubs are listed yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#f0ebe0]/55">
        New clubs show up here automatically. Club leaders can manage their
        listing from{" "}
        <span className="font-semibold text-[#f0ebe0]">Members → Club settings</span>.
      </p>
    </div>
  )
}

function NoMatchState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className={cn(CARD, "py-14 px-6 text-center")}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4ade80]/[0.12] text-[#4ade80]">
        <SearchX className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-[#f0ebe0]">No clubs match “{query}”</h3>
      <p className="mt-1.5 text-sm text-[#f0ebe0]/55">
        Try a different name, word, or club code.
      </p>
      <button
        type="button"
        onClick={onClear}
        className={cn(
          PILL_BASE,
          "mt-5 h-11 px-5 text-sm text-[#f0ebe0] bg-[#f0ebe0]/[0.06] ring-1 ring-[#f0ebe0]/15 hover:bg-[#f0ebe0]/[0.1]",
        )}
      >
        Clear search
      </button>
    </div>
  )
}

// ── Local color helpers (same as public-club-profile — kept local to avoid
//    pulling client-provider import graphs into this page). ─────────────────

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
