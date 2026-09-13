import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { Suspense } from "react";
import { ClubAccentProvider } from "@/components/club-accent-provider";

// Plus Jakarta Sans — slightly more distinctive geometric warmth than Geist,
// still very readable at small sizes (tables, badges, chat timestamps).
// Pairs with Geist Mono for code/mono. Wired into --font-sans.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClubHub — Multi-Club Management Platform",
  description:
    "Create or join clubs, track service hours, manage tasks, post announcements, schedule meetings, and more.",
  icons: { icon: "/club-logo.png", apple: "/club-logo.png" },
};

// Explicit viewport config — critical for mobile:
// - viewportFit: "cover" lets content extend under the notch/home indicator
//   on iPhones (combined with safe-area-inset padding on fixed elements).
// - themeColor matches the actual light/dark backgrounds.
// - We do NOT set maximumScale/userScalable — pinch-zoom is an accessibility
//   requirement, not just a preference.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
        className={`${jakarta.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>
          <ClubAccentProvider>
            <Suspense>{children}</Suspense>
          </ClubAccentProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
