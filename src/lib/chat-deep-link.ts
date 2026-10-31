"use client"

/**
 * Chat deep-link — lets any surface (global search, notifications, future
 * features) jump straight to a conversation AND highlight a specific message.
 *
 * Usage:
 *   openChatAt(conversationId)               // just open the conversation
 *   openChatAt(conversationId, messageId)    // open + scroll to + flash it
 *
 * The caller is responsible for switching the app view to "chat" first
 * (setView("chat")); this module handles the rest. Two delivery paths:
 *
 *   1. Module-level "pending target" — consumed by ChatPane on mount. Covers
 *      the case where the chat view wasn't mounted yet when the link fired
 *      (the event would fire before the listener attaches).
 *   2. window CustomEvent — covers the case where ChatPane is already
 *      mounted (e.g. jumping between conversations while already in chat).
 *
 * Same pattern as openGlobalSearch / open-settings.
 */

export interface ChatTarget {
  conversationId: string
  messageId?: string
}

let pendingTarget: ChatTarget | null = null

const EVENT = "clubhub:open-chat-at"

export function openChatAt(conversationId: string, messageId?: string) {
  pendingTarget = { conversationId, messageId }
  window.dispatchEvent(new CustomEvent<ChatTarget>(EVENT, { detail: pendingTarget }))
}

/** One-shot: ChatPane calls this on mount; returns (and clears) any target
 *  that fired while the pane wasn't mounted. */
export function consumePendingChatTarget(): ChatTarget | null {
  const t = pendingTarget
  pendingTarget = null
  return t
}

/** Subscribe to live deep-link events (ChatPane). Returns an unsubscribe. */
export function onOpenChatAt(cb: (target: ChatTarget) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ChatTarget>).detail
    if (detail) {
      // Also clear the pending slot so a later mount doesn't replay it.
      pendingTarget = null
      cb(detail)
    }
  }
  window.addEventListener(EVENT, handler as EventListener)
  return () => window.removeEventListener(EVENT, handler as EventListener)
}
