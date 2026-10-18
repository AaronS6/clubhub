import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Suspense } from "react";
import { ClubAccentProvider } from "@/components/club-accent-provider";
import { CustomizationProvider } from "@/components/customization-provider";
import { WhatsNewModal } from "@/components/whats-new-modal";

// Bricolage Grotesque — the display face. Used only for .text-page-title and
// .text-numeral (the big hours number). 600/700 only — keeps the bundle small.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Geist Sans — the body face. Everything else (labels, body, captions, tables).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClubHub — Multi-Club Management Platform",
  description:
    "Create or join clubs, track service hours, manage tasks, post announcements, schedule meetings, and more.",
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
        className={`${bricolage.variable} ${geistSans.variable} ${geistMono.variable} font-sans antialiased text-foreground`}
      >
        <Providers>
          <ClubAccentProvider>
            <CustomizationProvider>
              <Suspense>{children}</Suspense>
            </CustomizationProvider>
          </ClubAccentProvider>
        </Providers>
        {/* v7 release-notes modal — mounted globally so it shows on every
            surface (landing, auth, public profiles, the app). Auto-opens once
            for returning visitors; after closing, it lives in the
            notification bell as a "What's new" row. Client-side only (all
            state is localStorage), renders nothing on the server. */}
        <WhatsNewModal />
      </body>
    </html>
  );
}
