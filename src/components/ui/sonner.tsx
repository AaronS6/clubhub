"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * The app's canonical Toaster — theme-token styling (popover surface, app
 * border, app font, 12px card radius) instead of Sonner's saturated
 * defaults. Neutral surfaces keep the refined look; success/error icons
 * still carry the semantic color.
 *
 * Placement answers the layout: bottom-right on desktop, bottom-center on
 * mobile — raised above the fixed bottom tab bar (min-h 52px + hairline +
 * safe-area inset) so toasts never collide with it. `mobileOffset` covers
 * Sonner's own <600px media query while `offset` (set when isMobile) covers
 * the 600–768px band where the tab bar is still visible.
 */
const MOBILE_BOTTOM_OFFSET = "calc(4.75rem + env(safe-area-inset-bottom))"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isMobile = useIsMobile()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isMobile ? "bottom-center" : "bottom-right"}
      offset={isMobile ? MOBILE_BOTTOM_OFFSET : undefined}
      mobileOffset={MOBILE_BOTTOM_OFFSET}
      closeButton
      className="toaster group"
      style={
        {
          fontFamily: "var(--font-sans)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
