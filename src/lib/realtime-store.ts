"use client"

import { create } from "zustand"
import type { ConnectionState } from "@/lib/use-realtime-sync"

/**
 * Realtime connection + remote-change tracking, shared across the app.
 *
 * DESIGN (documented decision per the sync-hardening round):
 * - Realtime push is the PRIMARY delivery path for every view (tasks,
 *   meetings, teams, members, announcements, hours, approvals, chat,
 *   notifications, dashboard, activity).
 * - Polling is a ALWAYS-ON safety net that tightens while the socket is
 *   down (see usePollingFallback): when connected, views poll at a relaxed
 *   cadence (2× the fallback interval) so a zombie socket can't silently
 *   starve the UI; when the socket drops, every view tightens to the full
 *   fallback rate so the UI never goes stale.
 * - On reconnect (disconnected → connected), `useRealtimeSync` invalidates
 *   every current-club query once to catch up on any events missed while the
 *   socket was down. This is a single batched invalidation, not a per-view
 *   refetch storm.
 *
 * REMOTE-CHANGE FLASH:
 * When a `realtime:club` event arrives that carries an entity id (taskId,
 * meetingId, teamId, userId, announcementId, …), `useRealtimeSync` records
 * it here in `recentChanges`. Views call `useRemoteChange(type, id)` to find
 * out whether a specific card was just touched by someone else, and apply a
 * brief highlight animation so the update doesn't feel like it teleported in
 * silently. Entries auto-expire after `FLASH_TTL_MS`.
 *
 * CROSS-CHUNK SINGLETON:
 * The store is assigned to `globalThis.__clubhubRealtimeStore` so that every
 * webpack chunk (the eagerly-loaded app-shell AND the lazily-loaded views)
 * shares ONE store instance. Without this, code-splitting can create
 * duplicate module instances per chunk, which would break both the flash
 * (writer in app-shell, reader in view) and the polling-fallback (connection
 * state writer in app-shell, reader in view).
 */

export type RemoteChangeType =
  | "task"
  | "meeting"
  | "team"
  | "member"
  | "announcement"
  | "hours"
  | "chat"
  | "note"

interface RemoteChangeEntry {
  /** Monotonic id for React keys. */
  n: number
  ts: number
}

interface RealtimeState {
  connectionState: ConnectionState
  setConnectionState: (s: ConnectionState) => void

  /** Map of `${type}:${entityId}` -> { n, ts }. */
  recentChanges: Record<string, RemoteChangeEntry>
  /** Counter bumped on every recorded change, so consumers can trigger effects. */
  changeCounter: number
  recordRemoteChange: (type: RemoteChangeType, id: string) => void
  /** Remove a specific entry (called by the auto-expire timer). */
  clearRemoteChange: (key: string) => void
}

export const FLASH_TTL_MS = 4000

let seq = 0

/**
 * Force a single store instance across all webpack chunks by pinning it to
 * globalThis. Each chunk that imports this module reuses the same store.
 */
const glob = typeof globalThis !== "undefined" ? (globalThis as any) : ({} as any)

function createStore() {
  return create<RealtimeState>((set) => ({
    connectionState: "connecting",
    setConnectionState: (connectionState) => set({ connectionState }),

    recentChanges: {},
    changeCounter: 0,
    recordRemoteChange: (type, id) => {
      const key = `${type}:${id}`
      seq += 1
      set((s) => ({
        recentChanges: { ...s.recentChanges, [key]: { n: seq, ts: Date.now() } },
        changeCounter: s.changeCounter + 1,
      }))
      // Auto-expire so the flash class doesn't stick forever.
      setTimeout(() => {
        set((s) => {
          if (!s.recentChanges[key]) return {}
          const next = { ...s.recentChanges }
          delete next[key]
          return { recentChanges: next }
        })
      }, FLASH_TTL_MS)
    },
    clearRemoteChange: (key) =>
      set((s) => {
        if (!s.recentChanges[key]) return {}
        const next = { ...s.recentChanges }
        delete next[key]
        return { recentChanges: next }
      }),
  }))
}

export const useRealtimeStore: ReturnType<typeof createStore> =
  glob.__clubhubRealtimeStore ?? (glob.__clubhubRealtimeStore = createStore())

/**
 * Returns the per-entity "just changed remotely" flag for a card.
 * Re-renders the caller when the matching entry is added or expires.
 *
 * Usage:
 *   const flash = useRemoteChange("task", task.id)
 *   <Card className={flash ? "ring-2 ring-club/40 animate-in fade-in" : ""} />
 */
export function useRemoteChange(type: RemoteChangeType, id: string | undefined): boolean {
  const key = id ? `${type}:${id}` : null
  return useRealtimeStore((s) => (key ? Boolean(s.recentChanges[key]) : false))
}

/**
 * Returns the connection-aware polling interval for `useQuery.refetchInterval`.
 * Polling is ALWAYS ON as a safety net — the interval just relaxes when the
 * realtime socket is connected (events push updates; the slower poll is
 * belt-and-suspenders against zombie/half-open sockets that look connected
 * but deliver nothing) and tightens when it isn't:
 *
 *   - connected    → intervalMs * 2 (e.g. 20s)
 *   - connecting /
 *     disconnected → intervalMs     (e.g. 10s)
 *
 *   refetchInterval: usePollingFallback(5000)
 */
export function usePollingFallback(intervalMs: number): number | false {
  const state = useRealtimeStore((s) => s.connectionState)
  return state === "connected" ? intervalMs * 2 : intervalMs
}
