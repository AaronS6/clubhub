"use client"

import { useAppStore, type View } from "@/lib/store"
import { useRealtimeStore, type RemoteChangeType } from "@/lib/realtime-store"
import { openChatAt } from "@/lib/chat-deep-link"

/**
 * Hub → club deep links.
 *
 * Every aggregated item on a My Hub surface (dashboard cards, combined
 * calendar, cross-club tasks/updates, combined inbox) lives in ONE specific
 * club. Clicking it must take the student to the ORIGINAL location — the
 * club workspace — never a duplicated hub copy.
 *
 * `openInClub` does that in one call:
 *   1. switches the navigation context into the club (selectClub semantics:
 *      lands on the club home),
 *   2. sets the target view,
 *   3. records a flash entry so the target card highlights the moment the
 *      view mounts (same mechanism realtime updates use — `useRemoteChange`),
 *   4. for chat, hands off to the existing chat-deep-link module.
 *
 * The flash is recorded on a short delay so the lazily-loaded view chunk has
 * mounted before the 4s TTL window starts counting (belt-and-suspenders —
 * chunks stream in well under a second).
 */

export interface ClubFocus {
  type: RemoteChangeType
  id: string
}

export function openInClub(clubId: string, view: View, focus?: ClubFocus) {
  const app = useAppStore.getState()
  if (app.clubs.some((c) => c.clubId === clubId)) {
    app.selectClub(clubId)
    app.setView(view)
  } else {
    // Unknown membership (stale cache) — still switch context; the store
    // reconciles on the next /api/me sync.
    app.selectClub(clubId)
    return
  }
  if (focus) {
    window.setTimeout(() => {
      useRealtimeStore.getState().recordRemoteChange(focus.type, focus.id)
    }, 250)
  }
}

/** Jump from any hub surface straight into a club conversation (+
 *  optional message highlight). Uses the established chat deep-link. */
export function openClubConversation(clubId: string, conversationId: string, messageId?: string) {
  const app = useAppStore.getState()
  app.selectClub(clubId)
  app.setView("chat")
  // ChatPane consumes the pending target on mount; the rAF dispatch also
  // covers an already-mounted pane (same ordering insurance as the global
  // search's goMessage).
  requestAnimationFrame(() => {
    openChatAt(conversationId, messageId)
  })
}

/** Jump to a club's home (dashboard) — e.g. a "quick access" club card. */
export function openClubHome(clubId: string) {
  useAppStore.getState().selectClub(clubId)
}
