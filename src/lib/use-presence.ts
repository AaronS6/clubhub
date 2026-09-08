"use client"

import { useEffect, useState } from "react"
import { onRealtimeEvent, getRealtimeSocket } from "@/lib/realtime-client"

/**
 * Tracks which users are currently online in the current club.
 * Listens for `presence_update` realtime events (broadcast by the mini-service
 * whenever someone connects/disconnects/switches clubs). Returns a Set of
 * userIds. Falls back to empty (no dots) if realtime is down — the app still
 * works, just without presence.
 */
export function usePresence(clubId: string | null) {
  const [online, setOnline] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!clubId) return
    const unsub = onRealtimeEvent("realtime:club", (data: any) => {
      if (data?.type === "presence_update" && data.clubId === clubId) {
        setOnline(new Set(data.online ?? []))
      }
    })
    // Request a fresh presence snapshot by re-joining the club room (the server
    // broadcasts on join). We do a no-op join to trigger it.
    const s = getRealtimeSocket()
    if (s.connected) s.emit("join-club", clubId)
    else {
      const onConn = () => s.emit("join-club", clubId)
      s.on("connect", onConn)
      return () => { unsub(); s.off("connect", onConn) }
    }
    return unsub
  }, [clubId])
  return online
}

/**
 * Reports that the current user is viewing a specific view (e.g. "approvals")
 * so other executives can see "X people viewing this". Call with view=null to
 * stop reporting (on unmount / view change).
 */
export function useViewingIndicator(clubId: string | null, view: string | null) {
  useEffect(() => {
    if (!clubId || !view) return
    const s = getRealtimeSocket()
    const emit = () => s.emit("viewing", { clubId, view })
    if (s.connected) emit()
    else s.on("connect", emit)
    const stop = () => {
      if (s.connected) s.emit("stop-viewing", { clubId, view })
    }
    return () => {
      s.off("connect", emit)
      stop()
    }
  }, [clubId, view])
}

/**
 * Returns the count of OTHER users currently viewing the given view in the
 * current club (for the "X people viewing" indicator).
 */
export function useViewingCount(clubId: string | null, view: string | null, myUserId?: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!clubId || !view) return
    const viewers = new Map<string, string>() // userId -> view
    const onViewing = (data: any) => {
      if (data?.clubId === clubId && data?.userId && data?.view === view) {
        viewers.set(data.userId, data.view)
        setCount(Array.from(viewers.keys()).filter((id) => id !== myUserId).length)
      }
    }
    const onStop = (data: any) => {
      if (data?.clubId === clubId && data?.view === view && data?.userId) {
        viewers.delete(data.userId)
        setCount(Array.from(viewers.keys()).filter((id) => id !== myUserId).length)
      }
    }
    const a = onRealtimeEvent("realtime:viewing", onViewing)
    const b = onRealtimeEvent("realtime:stop-viewing", onStop)
    return () => { a(); b() }
  }, [clubId, view, myUserId])
  return count
}
