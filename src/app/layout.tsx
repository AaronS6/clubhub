import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { Suspense } from "react";
import { ClubAccentProvider } from "@/components/club-accent-provider";

// Geist Sans — Vercel's typeface. Pairs naturally with Geist Mono (already in
// use for code/mono) for a cohesive family. More character than Inter while
// staying clean and highly legible at small sizes (tables, badges, chat
// timestamps). Wired into --font-sans so the rest of the design system is
// unchanged.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
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
