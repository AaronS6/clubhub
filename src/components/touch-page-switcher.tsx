"use client"

import { useCallback, useEffect, useRef, useState, type ElementType, type PointerEvent } from "react"
import { Menu } from "lucide-react"
import { draggedTabIndex, tabPosition } from "@/lib/touch-navigation"
import type { View } from "@/lib/store"

interface GlassTab { view: View; label: string; icon: ElementType<{ className?: string }> }
interface Gesture {
  pointerId: number
  startX: number
  startY: number
  navigationKey: string
  dragged: boolean
}

/** Floating touch navigation: the glass selection follows the finger across
 *  the actual buttons. Native buttons preserve tapping and keyboard access. */
export function TouchPageSwitcher({
  tabs,
  view,
  contextKey,
  onNavigate,
  onMore,
  moreOpen,
}: {
  tabs: readonly GlassTab[]
  view: View
  contextKey: string
  onNavigate: (view: View) => void
  onMore: () => void
  moreOpen: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClickUntil = useRef(0)
  const [preview, setPreview] = useState<{ position: number; key: string } | null>(null)
  const navigationKey = `${contextKey}:${view}:${moreOpen}`
  const tabIndex = tabs.findIndex((tab) => tab.view === view)
  const activeIndex = moreOpen || tabIndex < 0 ? tabs.length : tabIndex
  const dragging = preview?.key === navigationKey
  const position = preview && dragging ? preview.position : activeIndex
  const count = tabs.length + 1

  const reset = useCallback(() => {
    gesture.current = null
    setPreview(null)
  }, [])
  const cancel = useCallback(() => {
    if (gesture.current) suppressClickUntil.current = performance.now() + 500
    reset()
  }, [reset])

  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch" && !event.isPrimary) cancel()
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [cancel])

  function canDrag() {
    return !moreOpen
      && navigator.maxTouchPoints > 0
      && window.matchMedia("(any-pointer: coarse)").matches
      && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
  }

  function select(index: number) {
    if (index === tabs.length) onMore()
    else if (tabs[index]) onNavigate(tabs[index].view)
  }

  function start(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || !event.isPrimary || !canDrag()) return
    suppressClickUntil.current = 0
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      navigationKey,
      dragged: false,
    }
    // Capture on the original BUTTON so an ordinary tap still produces its
    // native click. Capturing on the nav would swallow button taps.
    const target = (event.target as Element).closest("button") ?? event.currentTarget
    target.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.startX
    const dy = event.clientY - active.startY
    if (active.navigationKey !== navigationKey || !canDrag()
      || (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx))) {
      cancel()
      return
    }
    if (!active.dragged && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5)) return
    const bounds = track.current?.getBoundingClientRect()
    if (!bounds) return
    active.dragged = true
    setPreview({ position: tabPosition(event.clientX, bounds.left, bounds.width, count), key: navigationKey })
  }

  function finish(event: PointerEvent<HTMLElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    reset()
    if (event.pointerType !== "touch" || active.navigationKey !== navigationKey || !canDrag()) {
      suppressClickUntil.current = performance.now() + 500
      return
    }
    // No drag: let the original button handle its normal click.
    if (!active.dragged) return
    suppressClickUntil.current = performance.now() + 500
    event.preventDefault()
    const bounds = track.current?.getBoundingClientRect()
    if (!bounds) return
    const index = draggedTabIndex(active.startX, active.startY, event.clientX, event.clientY,
      bounds.left, bounds.width, count)
    if (index !== null) select(index)
  }

  const highlightedIndex = Math.round(position)
  return (
    <nav
      className="ch-glass-dock"
      aria-label="Primary"
      data-dragging={dragging || undefined}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onClickCapture={(event) => {
        // A drag must not also activate the button where it began.
        // Keyboard activation (detail=0) remains available.
        if (event.detail !== 0 && performance.now() < suppressClickUntil.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div ref={track} className="ch-glass-track">
        <span
          aria-hidden="true"
          className="ch-glass-selection"
          style={{ width: `${100 / count}%`, transform: `translate3d(${position * 100}%, 0, 0)` }}
        />
        {tabs.map((tab, index) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.view}
              type="button"
              className="ch-glass-tab"
              data-selected={highlightedIndex === index || undefined}
              aria-label={tab.label}
              title={tab.label}
              aria-current={view === tab.view ? "page" : undefined}
              onClick={() => onNavigate(tab.view)}
            >
              <span aria-hidden="true" className="ch-glass-icon"><Icon className="h-5 w-5" /></span>
              
            </button>
          )
        })}
        <button
          type="button"
          className="ch-glass-tab"
          data-selected={highlightedIndex === tabs.length || undefined}
          aria-label="More"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={onMore}
        >
          <span aria-hidden="true" className="ch-glass-icon"><Menu className="h-5 w-5" /></span>
          
        </button>
      </div>
    </nav>
  )
}
