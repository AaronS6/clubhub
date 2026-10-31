import type { Metadata, Viewport } from "next";
// SELF-HOSTED FONTS — zero network at build time.
// Previously these came from next/font/google, which downloads font files
// from fonts.googleapis.com DURING `next build`. In offline/restricted
// build environments (Docker, CI, school networks) that fetch fails and the
// generated CSS references font files that don't exist → the Docker build
// died with module-not-found in geist_*.module.css. Now:
//   · Geist + Geist Mono ship inside the `geist` npm package (Vercel's
//     official self-hosted build, next/font/local under the hood — same CSS
//     variable names as before: --font-geist-sans / --font-geist-mono).
//   · Bricolage Grotesque is a variable woff2 checked into src/fonts/.
// The build is now fully hermetic — no Google, no font CDN, ever.
// Geist Sans — the body face — and Geist Mono — the code/numerals face —
// come from the `geist` npm package (Vercel's official self-hosted build).
// Both set the exact CSS variables the Tailwind stack already references:
// --font-geist-sans and --font-geist-mono (see globals.css).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Suspense } from "react";
import { ClubAccentProvider } from "@/components/club-accent-provider";
import { CustomizationProvider } from "@/components/customization-provider";
import { WhatsNewModal } from "@/components/whats-new-modal";
import { getSiteUrl } from "@/lib/site";

// Bricolage Grotesque — the display face. Used only for .text-page-title and
// .text-numeral (the big hours number). 600/700 only — keeps the bundle small.
// The checked-in woff2 is a VARIABLE font (weight axis 200..800), served as
// the latin subset straight from Google's own files.
const bricolage = localFont({
  variable: "--font-bricolage",
  src: "../fonts/bricolage-grotesque-latin-var.woff2",
  weight: "600 700",
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase makes every relative OG/Twitter image URL resolve to an
  // absolute URL on the deployed origin (without it, social platforms
  // resolve images against localhost and previews come up empty).
  metadataBase: new URL(getSiteUrl()),

  title: "ClubHub — Multi-Club Management Platform",
  description:
    "Create or join clubs, track service hours, manage tasks, post announcements, schedule meetings, and more.",

  // Search engines: explicitly welcome. (Client-rendered app — the landing
  // page and public club profiles are the indexable surface; the logged-in
  // workspace is behind auth and naturally excluded from indexing value.)
  robots: { index: true, follow: true },

  // Social/link previews (iMessage, WhatsApp, Slack, X, Facebook, LinkedIn…).
  openGraph: {
    type: "website",
    siteName: "ClubHub",
    title: "ClubHub — Multi-Club Management Platform",
    description:
      "Create or join clubs, track service hours, manage tasks, post announcements, schedule meetings, and more.",
    url: "/",
    images: [{ url: "/club-logo.png", width: 512, height: 512, alt: "ClubHub logo" }],
  },
  twitter: {
    card: "summary",
    title: "ClubHub — Multi-Club Management Platform",
    description:
      "Create or join clubs, track service hours, manage tasks, post announcements, schedule meetings, and more.",
    images: ["/club-logo.png"],
  },

  // Search-console ownership verification, wired as env vars so verifying
  // the site is a CONFIG step (add env var → redeploy), never a code change:
  //   - GSC_VERIFICATION_TOKEN  → Google Search Console "HTML tag" method:
  //     copy the token from the content="..." of the meta tag they show you.
  //   - BING_VERIFICATION_TOKEN → Bing Webmaster Tools "Meta tag" method
  //     (also covers DuckDuckGo/Yahoo, which use Bing's index). Omit both in
  //     dev — no tags are emitted when the env vars are unset.
  verification: {
    google: process.env.GSC_VERIFICATION_TOKEN || undefined,
    other: process.env.BING_VERIFICATION_TOKEN
      ? { "msvalidate.01": process.env.BING_VERIFICATION_TOKEN }
      : undefined,
  },

  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/club-logo.png", sizes: "180x180" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "ClubHub",
    statusBarStyle: "default",
  },
};

// Explicit viewport config — critical for mobile:
// - viewportFit: "cover" lets content extend under the notch/home indicator
//   on iPhones (combined with safe-area-inset padding on fixed elements).
// - themeColor matches the actual light/dark canvas.
// - We do NOT set maximumScale/userScalable — pinch-zoom is an accessibility
//   requirement, not just a preference.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F6F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1216" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bricolage.variable} ${GeistSans.variable} ${GeistMono.variable} font-sans antialiased text-foreground`}
      >
        <Providers>
          <ClubAccentProvider>
            <CustomizationProvider>
              <Suspense>{children}</Suspense>
            </CustomizationProvider>
          </ClubAccentProvider>
        </Providers>
        {/* Release-notes modal — mounted globally so it shows on every
            surface (landing, auth, public profiles, the app). Auto-opens once
            for returning visitors; after closing, it lives in the
            notification bell as a "What's new" row. Client-side only (all
            state is localStorage), renders nothing on the server. */}
        <WhatsNewModal />
      </body>
    </html>
  );
}
