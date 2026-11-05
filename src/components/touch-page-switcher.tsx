"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { swipeDestination } from "@/lib/touch-navigation"
import type { View } from "@/lib/store"

interface SwipePage { view: View; label: string }
interface Gesture {
  pointerId: number
  startX: number
  startY: number
  navigationKey: string
}

/** Optional touch shortcut. The regular navigation remains the accessible
 *  alternative, and mouse/trackpad/pen input never starts a gesture. */
export function TouchPageSwitcher({
  pages,
  view,
  contextKey,
  onNavigate,
  disabled = false,
}: {
  pages: readonly SwipePage[]
  view: View
  contextKey: string
  onNavigate: (view: View) => void
  disabled?: boolean
}) {
  const gesture = useRef<Gesture | null>(null)
  const [dragX, setDragX] = useState(0)
  const navigationKey = `${contextKey}:${view}`
  const reset = useCallback(() => {
    gesture.current = null
    setDragX(0)
  }, [])

  // A second finger anywhere cancels the gesture, including outside the
  // handle. Pinch/zoom and cancelled system gestures must not change pages.
  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch" && !event.isPrimary) reset()
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [reset])

  function canSwipe() {
    return !disabled
      && navigator.maxTouchPoints > 0
      && window.matchMedia("(any-pointer: coarse)").matches
      && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !event.isPrimary || !canSwipe()) return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      navigationKey,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.startX
    const dy = event.clientY - active.startY
    if (active.navigationKey !== navigationKey || (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx))) {
      reset()
      return
    }
    // Only the small indicator follows the finger, never the page's forms
    // or chat composer. A completed release performs a normal setView.
    setDragX(Math.max(-32, Math.min(32, dx * 0.25)))
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    reset()
    if (!active || active.pointerId !== event.pointerId || event.pointerType !== "touch"
      || active.navigationKey !== navigationKey || !canSwipe()) return
    const next = swipeDestination(
      pages.map((page) => page.view),
      view,
      event.clientX - active.startX,
      event.clientY - active.startY,
    )
    if (next) onNavigate(next)
  }

  return (
    <div
      className="ch-page-switcher"
      aria-hidden="true"
      title="Swipe left or right to switch pages"
      data-dragging={dragX !== 0 || undefined}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span
        className="ch-page-switcher-pill"
        style={{ transform: `translateX(${dragX}px)` }}
      />
    </div>
  )
}
