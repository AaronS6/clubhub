"use client"

/**
 * MentionableTextarea — wraps shadcn's Textarea with an @mention picker.
 *
 * Behavior:
 *   - Typing `@` (at start, or after whitespace) opens a popover with club
 *     members matching the name fragment typed after `@`.
 *   - Arrow keys / Enter select a member; Escape closes the popover.
 *   - On selection, `@query` is replaced with `@Name ` in the textarea and
 *     the `onMentionsChange` callback fires with the updated list of
 *     `{ userId, name }` mentions currently present in the text.
 *
 * Server-side, the API parses `@Name` patterns independently — the
 * `onMentionsChange` callback is purely for client UX (e.g. preview chips);
 * the source of truth is the message text itself.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/components/shared/page-header"

export interface MentionableMember {
  userId: string
  name: string
  avatarUrl?: string | null
}

export interface MentionEntry {
  userId: string
  name: string
}

interface MentionableTextareaProps extends React.ComponentProps<"textarea"> {
  members: MentionableMember[]
  onMentionsChange?: (mentions: MentionEntry[]) => void
  /** Accessible label for the popover list. */
  listLabel?: string
}

const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/

export function MentionableTextarea({
  members,
  onMentionsChange,
  listLabel = "Mention a member",
  value,
  onChange,
  className,
  ...props
}: MentionableTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [matchStart, setMatchStart] = React.useState(0)
  const [matchEnd, setMatchEnd] = React.useState(0)
  const [activeIdx, setActiveIdx] = React.useState(0)

  // Recompute mentions whenever the value changes; notify parent.
  const recomputeMentions = React.useCallback(
    (text: string) => {
      if (!onMentionsChange) return
      const found: MentionEntry[] = []
      const re = /(?:^|\s)@([^\s@]+)(?=\s|$)/g
      let m: RegExpExecArray | null
      const seen = new Set<string>()
      while ((m = re.exec(text)) !== null) {
        const name = m[1]
        const match = members.find(
          (mb) => mb.name.toLowerCase() === name.toLowerCase(),
        )
        if (match && !seen.has(match.userId)) {
          seen.add(match.userId)
          found.push({ userId: match.userId, name: match.name })
        }
      }
      onMentionsChange(found)
    },
    [members, onMentionsChange],
  )

  // Re-derive mentions when members load (e.g. when this textarea mounts
  // before the member list query resolves).
  React.useEffect(() => {
    if (typeof value === "string") recomputeMentions(value)
  }, [members, value, recomputeMentions])

  const filteredMembers = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.name.toLowerCase().includes(q))
  }, [members, query])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    const caret = e.target.selectionStart ?? next.length
    onChange?.(e)
    recomputeMentions(next)

    // Detect @mention pattern at the caret.
    const upto = next.slice(0, caret)
    const m = MENTION_REGEX.exec(upto)
    if (m) {
      setPickerOpen(true)
      setQuery(m[1])
      // matchStart is the index of `@` (the character after the leading
      // whitespace, or the very start of the string).
      const atIdx = m.index + (m[0].startsWith("@") ? 0 : 1)
      setMatchStart(atIdx)
      setMatchEnd(caret)
      setActiveIdx(0)
    } else {
      setPickerOpen(false)
      setQuery("")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!pickerOpen || filteredMembers.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % filteredMembers.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + filteredMembers.length) % filteredMembers.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      const member = filteredMembers[activeIdx]
      if (member) insertMention(member)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setPickerOpen(false)
    }
  }

  function insertMention(member: MentionableMember) {
    const ta = textareaRef.current
    const text = typeof value === "string" ? value : ""
    const before = text.slice(0, matchStart)
    const after = text.slice(matchEnd)
    const insertion = `@${member.name} `
    const next = before + insertion + after
    // Synthesize a ChangeEvent-like call so controlled textareas update.
    onChange?.({
      target: { value: next } as HTMLTextAreaElement,
    } as React.ChangeEvent<HTMLTextAreaElement>)
    recomputeMentions(next)
    setPickerOpen(false)
    setQuery("")
    // Restore focus + caret just after the inserted mention.
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const caret = (before + insertion).length
      el.setSelectionRange(caret, caret)
    })
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn(className)}
        {...props}
      />
      {pickerOpen && filteredMembers.length > 0 && (
        <div
          role="listbox"
          aria-label={listLabel}
          className="absolute bottom-full left-0 right-0 min-w-[240px] max-w-[400px] mb-1 rounded-md border border-border bg-popover p-1 shadow-md z-30"
        >
          <div className="px-2 py-1 text-xs  text-muted-foreground">
            {query ? `Matching “${query}”` : "Mention a member"}
          </div>
          <div className="max-h-[132px] overflow-y-auto">
            {filteredMembers.map((m, i) => (
              <button
                key={m.userId}
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  // Prevent blur on the textarea so caret stays.
                  e.preventDefault()
                  insertMention(m)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                  i === activeIdx ? "bg-club-muted text-club" : "hover:bg-accent",
                )}
              >
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={m.avatarUrl ?? undefined} alt={m.name} />
                  <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                </Avatar>
                <span className="whitespace-nowrap">{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
