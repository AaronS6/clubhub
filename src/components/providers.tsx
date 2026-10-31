"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, ReactNode } from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            // §Fresh-on-focus: refetch stale queries when the window regains
            // focus. staleTime (15s) gates this to data that is ACTUALLY
            // stale, so the cost is a handful of deduped GETs — but it heals
            // the "resumed from background shows an old snapshot" failure
            // mode instantly (backgrounded tabs pause refetchInterval, and
            // realtime sockets die silently in the background, so without
            // this a tab that sat in the background can show announcements
            // that were posted/deleted minutes or hours ago until its next
            // poll tick — on one device but not the other, which reads as
            // "some announcements disappear on my laptop/phone").
            refetchOnWindowFocus: true,
            refetchIntervalInBackground: false,
          },
        },
      })
  )
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={client}>
          <TooltipProvider delayDuration={200}>
            {children}
            {/* Themed + responsive toasts (see ui/sonner.tsx) — neutral
                popover surfaces, app font, clears the mobile tab bar. */}
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
