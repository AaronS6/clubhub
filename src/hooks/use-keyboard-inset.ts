"use client"

import { useEffect, useState } from "react"

/**
 * useKeyboardInset — measures the on-screen (soft) keyboard height on mobile
 * using the VisualViewport API.
 *
 * Why: on iOS Safari, opening the keyboard does NOT resize the layout
 * viewport (and `100dvh` only tracks the URL bar, not the keyboard). The
 * page scrolls under the keyboard instead, which shoves fixed/anchored
 * bottom UI (like the chat composer) underneath the keys. Android/Chrome
 * resizes the layout itself, so this hook correctly computes ~0 there.
 *
 * Returns the keyboard height in px (0 when closed / unsupported /
 * non-touch). Callers can use it to shrink or pad their layout so the
 * composer stays visible above the keys while typing.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !("ontouchstart" in window)) return

    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Keyboard height ≈ layout viewport − visual viewport (minus any
        // offset the visual viewport has been scrolled). The 60px guard
        // filters URL-bar wobble and tiny sub-pixel changes.
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        setInset(kb > 60 ? Math.round(kb) : 0)
      })
    }

    // NOTE: we deliberately listen ONLY to `resize` — NOT `scroll` — here.
    // The visual viewport also fires `scroll` when iOS caret-reveal pans the
    // page under the keyboard; feeding those events back into setInset
    // created an oscillating measure→patch→remeasure loop that made the
    // chat composer visibly jump on every keystroke. Resize alone tracks
    // the keyboard opening/closing; the 60px guard below filters URL-bar
    // wobble and tiny sub-pixel changes.
    vv.addEventListener("resize", update)
    update()
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener("resize", update)
    }
  }, [])

  return inset
}
