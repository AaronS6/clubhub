"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getRealtimeSocket, onRealtimeEvent } from "@/lib/realtime-client"
import { useAppStore } from "@/lib/store"
import { useRealtimeStore, type RemoteChangeType } from "@/lib/realtime-store"

export type ConnectionState = "connecting" | "connected" | "disconnected"

/**
 * REALTIME SYNC — single source of truth for live updates across every view.
 *
 * Architecture (documented decision — sync-hardening round):
 *
 * 1. PRIMARY PATH = realtime push. Every mutating API route calls
 *    `emitClubEvent(clubId, "<type>", { ...entityId })` after committing.
 *    The socket.io mini-service fans the event out to every connected client
 *    currently viewing that club. This hook receives `realtime:club` events
 *    and maps the `data.type` to the React-Query cache keys that need to be
 *    invalidated. This is true live sync (sub-second), not polling.
 *
 * 2. FALLBACK PATH = polling, ONLY while disconnected. Views read
 *    `connectionState` from `useRealtimeStore` and pass
 *    `refetchInterval: usePollingFallback(N)` to their queries. When the
 *    socket is connected (the normal case), polling is OFF (returns `false`)
 *    so there's zero redundant traffic. When the socket drops, every view
 *    automatically degrades to polling so the UI never goes stale. This is
 *    the graceful-degradation resilience design.
 *
 * 3. RECONNECT CATCH-UP. When the socket transitions disconnected →
 *    connected, we invalidate every query scoped to the current club in one
 *    batched pass. This recovers any events missed while offline. TanStack
 *    Query dedupes + batches these invalidations within a tick, so it's a
 *    single wave of parallel requests, not a per-view storm.
 *
 * 4. REMOTE-CHANGE FLASH. For events that carry an entity id (taskId,
 *    meetingId, teamId, userId, …), we record the change in
 *    `useRealtimeStore.recentChanges`. Views call `useRemoteChange(type, id)`
 *    to apply a brief highlight to the affected card so the update is
 *    perceptible rather than silently teleporting in. Entries auto-expire
 *    after ~2.6s.
 *
 * Coverage (event type → query keys invalidated):
 *  - task_*            → tasks, dashboard, activity
 *  - announcement_*    → announcements, dashboard, activity
 *  - announcement_comment/reaction → announcements, comments
 *  - meeting_*         → meetings, dashboard, activity
 *  - hours_*           → hours, approvals, dashboard, activity
 *  - team_*            → teams, members, dashboard, activity
 *  - member_*          → members, dashboard, activity
 *  - chat_message      → conversations, messages
 *  - chat_typing*      → no-op (ephemeral; ChatView subscribes directly)
 *  - presence_update   → presence, members
 */
export function useRealtimeSync(): ConnectionState {
  const qc = useQueryClient()
  const currentClubId = useAppStore((s) => s.currentClubId)
  const setConnectionState = useRealtimeStore((s) => s.setConnectionState)
  const recordRemoteChange = useRealtimeStore((s) => s.recordRemoteChange)
  const [state, setState] = useState<ConnectionState>("connecting")
  const clubRef = useRef<string | null>(null)
  const wasConnectedRef = useRef<boolean>(false)

  useEffect(() => {
    clubRef.current = currentClubId
  }, [currentClubId])

  useEffect(() => {
    const s = getRealtimeSocket()

    const onConn = () => {
      setState("connected")
      setConnectionState("connected")
      // RECONNECT CATCH-UP: if we were previously connected (or this is the
      // first connect after a disconnect), invalidate everything for the
      // current club to recover missed events. We skip the very first
      // connect because the initial mount fetch already loads fresh data.
      if (wasConnectedRef.current && clubRef.current) {
        const cid = clubRef.current
        // Batch: invalidate all club-scoped query keys. React Query dedupes
        // overlapping invalidations within a tick, so this is one wave.
        qc.invalidateQueries({ queryKey: ["tasks", cid] })
        qc.invalidateQueries({ queryKey: ["meetings", cid] })
        qc.invalidateQueries({ queryKey: ["teams", cid] })
        qc.invalidateQueries({ queryKey: ["members", cid] })
        qc.invalidateQueries({ queryKey: ["announcements", cid] })
        qc.invalidateQueries({ queryKey: ["hours", cid] })
        qc.invalidateQueries({ queryKey: ["approvals", cid] })
        qc.invalidateQueries({ queryKey: ["dashboard", cid] })
        qc.invalidateQueries({ queryKey: ["activity", cid] })
        qc.invalidateQueries({ queryKey: ["conversations", cid] })
        qc.invalidateQueries({ queryKey: ["notifications", cid] })
      }
      wasConnectedRef.current = true
    }
    const onDisc = () => {
      setState("disconnected")
      setConnectionState("disconnected")
    }
    s.on("connect", onConn)
    s.on("disconnect", onDisc)
    s.on("connect_error", onDisc)
    // Defer the initial-state check to a microtask so we're not calling
    // setState synchronously during the effect body.
    Promise.resolve().then(() => {
      if (s.connected) {
        setState("connected")
        setConnectionState("connected")
        wasConnectedRef.current = true
      } else {
        setState("connecting")
        setConnectionState("connecting")
      }
    })

    // Helper: invalidate a set of cache keys + record a remote-change flash
    // entry for the entity (if an id was provided).
    const apply = (
      keys: string[][],
      flash?: { type: RemoteChangeType; id?: string }
    ) => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key })
      if (flash?.id) recordRemoteChange(flash.type, flash.id)
    }

    // Club-wide invalidations
    const unsubClub = onRealtimeEvent("realtime:club", (data: any) => {
      const cid = clubRef.current
      if (!cid) return
      const type = data?.type as string | undefined
      switch (type) {
        case "task_created":
        case "task_updated":
        case "task_deleted":
        case "task_status_changed":
          apply(
            [["tasks", cid], ["dashboard", cid], ["activity", cid]],
            { type: "task", id: data?.taskId }
          )
          break
        case "announcement_created":
        case "announcement_updated":
        case "announcement_deleted":
        case "new_announcement":
          apply(
            [["announcements", cid], ["dashboard", cid], ["activity", cid]],
            { type: "announcement", id: data?.announcementId }
          )
          break
        case "announcement_reaction":
        case "announcement_comment":
        case "new_comment":
        case "new_reaction":
          apply([["announcements", cid], ["comments", cid]])
          break
        case "meeting_created":
        case "meeting_updated":
        case "meeting_cancelled":
        case "meeting_rsvp":
          apply(
            [["meetings", cid], ["dashboard", cid], ["activity", cid]],
            { type: "meeting", id: data?.meetingId ?? (Array.isArray(data?.meetingIds) ? data.meetingIds[0] : undefined) }
          )
          break
        case "hours_submitted":
        case "hours_approved":
        case "hours_rejected":
          apply([["hours", cid], ["approvals", cid], ["dashboard", cid], ["activity", cid]])
          break
        case "team_created":
        case "team_updated":
        case "team_deleted":
        case "team_member_added":
        case "team_member_removed":
          apply(
            [["teams", cid], ["members", cid], ["dashboard", cid], ["activity", cid]],
            { type: "team", id: data?.teamId }
          )
          break
        case "member_promoted":
        case "member_demoted":
        case "member_removed":
        case "new_member":
          apply(
            [["members", cid], ["dashboard", cid], ["activity", cid]],
            { type: "member", id: data?.userId }
          )
          break
        case "chat_message":
          apply([["conversations", cid], ["messages", cid]])
          break
        // Typing indicator: ephemeral, no cache invalidation. The ChatView
        // subscribes directly to `realtime:club` for these (see
        // TypingIndicator in chat-view.tsx). Listing it here as a no-op
        // keeps the default branch from refreshing dashboard + activity
        // (which would refetch unnecessarily on every keystroke).
        case "chat_typing":
        case "chat_typing:stop":
          break
        case "presence_update":
          apply([["presence", cid], ["members", cid]])
          break
        default:
          // Unknown — refresh dashboard + activity as a safe default.
          apply([["dashboard", cid], ["activity", cid]])
      }
    })

    return () => {
      s.off("connect", onConn)
      s.off("disconnect", onDisc)
      s.off("connect_error", onDisc)
      unsubClub()
    }
  }, [qc, setConnectionState, recordRemoteChange])

  return state
}
