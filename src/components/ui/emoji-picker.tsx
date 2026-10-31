"use client"

/**
 * EmojiPicker — a dependency-free emoji picker for the chat composer.
 *
 * Design notes:
 *   - Curated ~360 emojis in 8 categories (Smileys, Gestures, Hearts,
 *     People, Animals & Nature, Food, Activity, Objects & Symbols) — the
 *     set people actually use in club chats, rendered as plain text glyphs
 *     (no image assets, no font downloads).
 *   - "Recent" row (up to 24) persisted to localStorage, updated on insert.
 *   - Insertion APPENDS to the target textarea's value at the caret via the
 *     onPick callback — the parent owns the state, this component is dumb.
 *   - Keyboard: buttons are real <button>s so Tab/Enter work; the popover
 *     closes on Escape and on outside click (custom light dismiss, since we
 *     deliberately avoid Radix Popover to keep the chat bundle lean).
 */

import * as React from "react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Curated emoji set (grouped). Keep each row ≤ 24 glyphs for the 8×3 grid.
// ---------------------------------------------------------------------------

const CATEGORIES: { id: string; label: string; emojis: string[] }[] = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜",
      "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶",
      "😏", "😒", "🙄", "😬", "😮", "😯", "😴", "🤤", "😪", "😵", "🤯", "🥱",
      "🥴", "😷", "🤒", "🤕", "🤢", "🥵", "🥶", "😵‍💫", "🤠", "🥳", "😎", "🤓",
      "🧐", "😕", "😟", "🙁", "😮", "😲", "😳", "🥺", "😦", "😧", "😨", "😰",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘", "🤙", " 👈", "👉", "👆",
      "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "💪", "🦾", "✍️",
      "👏", "🙌", "👐", "🤲", "🤜", "🤛", "✊", "👊", "🫶", "🫡", "🤳", "💅",
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💕", "💞", "💓",
      "💗", "💖", "💘", "💝", "💟", "♥️", "💔", "❣️", "🫀", "💯", "💢", "💥",
      "💫", "⚡", "🔥", "✨", "🌟", "⭐", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇",
    ],
  },
  {
    id: "people",
    label: "People",
    emojis: [
      "👶", "🧒", "👦", "👧", "🧑", "👨", "👩", "🧓", "👴", "👵", "👮", "🕵️",
      "👩‍💻", "👨‍💻", "🧑‍🎓", "👩‍🎓", "👨‍🎓", "👩‍🏫", "👨‍🏫", "👩‍⚕️", "👨‍⚕️", "🧑‍🔬", "👩‍🔬", "👨‍🔬",
      "🤷", "🤷‍♂️", "🤷‍♀️", "🙅", "🙆", "💁", "🙋", "🕺", "💃", "🧘", "🏃", "🚶",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
      "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉", "🦇", "🐺", "🐗", "🐴",
      "🦋", "🐌", "🐝", "🐞", "🐜", "🕷️", "🌸", "🌼", "🌻", "🌴", "🌵", "🍀",
    ],
  },
  {
    id: "food",
    label: "Food",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒",
      "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🍔", "🍟", "🍕", "🌭", "🥪",
      "🌮", "🌯", "🥗", "🍝", "🍜", "🍣", "🍱", "🍤", "🍚", "🍦", "🍰", "🍫",
    ],
  },
  {
    id: "activity",
    label: "Activity",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓", "🏸",
      "🥊", "🥋", "⛳", "🏹", "🎣", "🛹", "🛼", "🎮", "🕹️", "🎲", "🧩", "🎯",
      "🎨", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🪕", "🎻", "🎬",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      "💡", " 🔦", "🕯️", "📎", "✂️", "📌", "📏", "📐", "🔒", "🔑", "🔨", "🛠️",
      "⚙️", "🧰", "🔬", "🔭", "📡", "💊", "🩹", "🚀", "🛸", "🚗", "✈️", "🗺️",
      "⏰", "⏳", "📅", "📅", "📋", "📊", "📈", "📉", "💰", "💳", "📝", "📚",
      "📱", "💻", "🖥️", "⌨️", "🖨️", "📷", "🎥", "🔋", "🔌", "🔦", "🧲", "🧪",
    ],
  },
]

// Fix the couple of accidental leading spaces above (defensive trim).
CATEGORIES.forEach((c) => {
  c.emojis = c.emojis.map((e) => e.trim()).filter(Boolean)
})

const RECENT_KEY = "clubhub:recent-emoji"
const RECENT_MAX = 24

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string") : []
  } catch {
    return []
  }
}

function saveRecent(next: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_MAX)))
  } catch {
    // private browsing etc. — recents are best-effort
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmojiPicker({
  onPick,
  className,
}: {
  /** Called with the chosen emoji — the parent appends it to the draft. */
  onPick: (emoji: string) => void
  className?: string
}) {
  const [activeCat, setActiveCat] = React.useState(CATEGORIES[0].id)
  const [recent, setRecent] = React.useState<string[]>([])

  // Load recents once on mount (client-only component).
  React.useEffect(() => {
    setRecent(loadRecent())
  }, [])

  function pick(emoji: string) {
    onPick(emoji)
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX)
    setRecent(next)
    saveRecent(next)
  }

  const category = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0]

  return (
    <div
      role="dialog"
      aria-label="Emoji picker"
      className={cn(
        "w-[288px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
    >
      {/* Recent row — always visible when there are recents */}
      {recent.length > 0 && (
        <div className="border-b border-border/70 px-2 pb-1.5 pt-2">
          <div className="flex flex-wrap gap-0.5">
            {recent.map((e) => (
              <button
                key={`r-${e}`}
                type="button"
                onClick={() => pick(e)}
                aria-label={`Insert ${e}`}
                className="flex size-8 items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Emoji categories"
        className="flex items-center gap-0.5 overflow-x-auto border-b border-border/70 px-2 py-1.5 scrollbar-none"
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={c.id === activeCat}
            onClick={() => setActiveCat(c.id)}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              c.id === activeCat
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Emoji grid — 8 columns of 36px cells */}
      <div
        role="tabpanel"
        aria-label={`${category.label} emojis`}
        className="max-h-[216px] overflow-y-auto px-2 py-2 scrollbar-thin"
      >
        <div className="flex flex-wrap gap-0.5">
          {category.emojis.map((e, i) => (
            <button
              key={`${activeCat}-${i}-${e}`}
              type="button"
              onClick={() => pick(e)}
              aria-label={`Insert ${e}`}
              className="flex size-8 items-center justify-center rounded-md text-xl leading-none transition-transform hover:scale-110 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
