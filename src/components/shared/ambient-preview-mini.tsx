"use client"

import type { CSSProperties } from "react"
import type { AmbientEffect } from "@/lib/customization-store"
import { cn } from "@/lib/utils"

/**
 * AmbientPreviewMini — a small (~h-14) canvas that mirrors the actual
 * ambient-background.tsx rendering for each preset, so the user can SEE
 * what they're picking in both the onboarding tour and Settings →
 * Appearance. Shared so the two pickers never drift apart.
 */
export function AmbientPreviewMini({
  effect,
  active,
}: {
  effect: AmbientEffect
  active: boolean
}) {
  const baseColor = "var(--club-accent, #10b981)"
  return (
    <div
      className={cn(
        "relative h-14 w-full overflow-hidden rounded-md",
        active && "ring-1 ring-club/30",
      )}
      style={{ background: "rgba(0,0,0,0.04)" }}
    >
      <div className="absolute inset-0" style={{ ["--amb" as string]: baseColor } as CSSProperties}>
        {effect === "none" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
            clean
          </div>
        )}
        {effect === "aurora" && (
          <div className="absolute inset-0">
            <div
              className="absolute left-0 top-0 h-full w-1/2 blur-md"
              style={{ background: `linear-gradient(160deg, transparent, ${baseColor} 50%, transparent)` }}
            />
            <div
              className="absolute bottom-0 right-0 h-2/3 w-1/2 blur-md"
              style={{ background: `linear-gradient(20deg, transparent, ${baseColor} 40%, transparent)` }}
            />
          </div>
        )}
        {effect === "blobs" && (
          <div className="absolute inset-0">
            <div className="absolute left-1 top-1 h-8 w-8 rounded-full blur-md" style={{ background: baseColor, opacity: 0.55 }} />
            <div className="absolute bottom-0.5 right-1 h-8 w-8 rounded-full blur-md" style={{ background: baseColor, opacity: 0.4 }} />
            <div className="absolute bottom-1 left-1/3 h-6 w-6 rounded-full blur-md" style={{ background: baseColor, opacity: 0.3 }} />
          </div>
        )}
        {effect === "bubbles" && (
          <div className="absolute inset-0 flex items-end gap-0.5 px-1 pb-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  marginBottom: (i % 3) * 6,
                  width: 9 + (i % 2) * 5,
                  height: 9 + (i % 2) * 5,
                  background: `radial-gradient(circle at 40% 40%, ${baseColor}, transparent 65%)`,
                }}
              />
            ))}
          </div>
        )}
        {effect === "mesh" && (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 60% 50% at 30% 30%, ${baseColor} 0%, transparent 70%), radial-gradient(ellipse 45% 40% at 75% 70%, ${baseColor} 0%, transparent 70%)`,
              opacity: 0.55,
            }}
          />
        )}
        {effect === "waves" && (
          <div className="absolute inset-0 flex items-end">
            <div
              className="absolute bottom-0 left-0 right-0 h-1/2"
              style={{
                background: `linear-gradient(to top, ${baseColor}, transparent)`,
                borderRadius: "50% 50% 0 0 / 30% 30% 0 0",
              }}
            />
            <div
              className="absolute bottom-0 left-[-10%] right-[40%] h-1/3 blur-[2px]"
              style={{
                background: `linear-gradient(to top, ${baseColor}, transparent)`,
                borderRadius: "50% 50% 0 0 / 40% 40% 0 0",
                opacity: 0.7,
              }}
            />
          </div>
        )}
        {effect === "particles" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${12 + i * 15}%`,
                  top: `${18 + (i % 3) * 25}%`,
                  width: 7 + (i % 2) * 5,
                  height: 7 + (i % 2) * 5,
                  background: `radial-gradient(circle, ${baseColor}, transparent 70%)`,
                }}
              />
            ))}
          </div>
        )}
        {effect === "stardust" && (
          <div className="absolute inset-0">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${8 + (i * 13) % 84}%`,
                  top: `${15 + (i * 19) % 70}%`,
                  width: 1.5 + (i % 3 === 0 ? 1 : 0),
                  height: 1.5 + (i % 3 === 0 ? 1 : 0),
                  background: baseColor,
                  boxShadow: `0 0 4px ${baseColor}`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
