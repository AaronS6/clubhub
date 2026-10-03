"use client"

import * as React from "react"
import {
  Bold,
  Italic,
  Heading2,
  Quote,
  List,
  Code2,
  Link as LinkIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * RichText — renders a compact markdown subset for announcement/comment
 * bodies. Supports:
 *
 *   **bold**, *italic*, `code`, [label](url), bare URLs
 *   # H1, ## H2, ### H3
 *   - unordered lists, 1. ordered lists
 *   > blockquotes
 *   ``` fenced code blocks
 *   line breaks (single newline → <br/>, blank line → paragraph break)
 *
 * @mentions (@name) are styled with the club accent color.
 *
 * No external runtime dependency — a tiny purpose-built parser keeps the
 * bundle small and the output fully controlled (no raw-HTML injection risk).
 */

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

// Order matters: longer/earlier patterns win. **bold** before *italic*.
const INLINE_RE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|https?:\/\/[^\s<>\n]+|@[A-Za-z0-9_.-]+)/g

function parseInline(text: string, baseKey: string): React.ReactNode[] {
  if (!text) return []
  const nodes: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  let i = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<React.Fragment key={`${baseKey}-t${i}`}>{text.slice(last, m.index)}</React.Fragment>)
    }
    const tok = m[0]
    const k = `${baseKey}-i${i++}`
    if (tok.startsWith("**") && tok.endsWith("**")) {
      nodes.push(
        <strong key={k} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      )
    } else if (tok.startsWith("*") && tok.endsWith("*")) {
      nodes.push(<em key={k}>{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      nodes.push(
        <code
          key={k}
          className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono text-foreground/90"
        >
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith("[")) {
      const lm = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/.exec(tok)
      if (lm) {
        nodes.push(
          <a
            key={k}
            href={lm[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-club hover:underline break-all"
          >
            {lm[1]}
          </a>,
        )
      } else {
        nodes.push(<React.Fragment key={k}>{tok}</React.Fragment>)
      }
    } else if (tok.startsWith("http")) {
      nodes.push(
        <a
          key={k}
          href={tok}
          target="_blank"
          rel="noopener noreferrer"
          className="text-club hover:underline break-all"
        >
          {tok}
        </a>,
      )
    } else if (tok.startsWith("@")) {
      nodes.push(
        <span key={k} className="text-club font-medium">
          {tok}
        </span>,
      )
    } else {
      nodes.push(<React.Fragment key={k}>{tok}</React.Fragment>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) {
    nodes.push(<React.Fragment key={`${baseKey}-t-end`}>{text.slice(last)}</React.Fragment>)
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Block-level parsing
// ---------------------------------------------------------------------------

interface Block {
  kind: "p" | "h1" | "h2" | "h3" | "quote" | "ul" | "ol" | "code"
  text: string
  items?: string[] // for ul/ol
}

function toBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```...```
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ kind: "code", text: buf.join("\n") + (lang ? `\n` : "") })
      continue
    }

    // Blank line — skip (paragraph separators are implicit)
    if (line.trim() === "") {
      i++
      continue
    }

    // Heading
    const hm = /^(#{1,3})\s+(.+)$/.exec(line)
    if (hm) {
      blocks.push({ kind: (`h${hm[1].length}` as Block["kind"]), text: hm[2] })
      i++
      continue
    }

    // Blockquote (consecutive > lines merge)
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ kind: "quote", text: buf.join("\n") })
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""))
        i++
      }
      blocks.push({ kind: "ul", text: "", items })
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""))
        i++
      }
      blocks.push({ kind: "ol", text: "", items })
      continue
    }

    // Paragraph: gather consecutive non-blank, non-special lines
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i].trim()) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: "p", text: buf.join("\n") })
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RichText({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  const blocks = React.useMemo(() => toBlocks(children), [children])
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((b, idx) => {
        const k = `b${idx}`
        switch (b.kind) {
          case "h1":
            return (
              <h1 key={k} className="text-xl font-bold leading-tight">
                {parseInline(b.text, k)}
              </h1>
            )
          case "h2":
            return (
              <h2 key={k} className="text-lg font-bold leading-tight">
                {parseInline(b.text, k)}
              </h2>
            )
          case "h3":
            return (
              <h3 key={k} className="text-base font-semibold leading-tight">
                {parseInline(b.text, k)}
              </h3>
            )
          case "quote":
            return (
              <blockquote
                key={k}
                className="border-l-2 border-club/50 pl-3 italic text-muted-foreground"
              >
                {b.text.split("\n").map((ln, j) => (
                  <p key={`${k}-q${j}`} className="whitespace-pre-wrap break-words">
                    {parseInline(ln, `${k}-q${j}`)}
                  </p>
                ))}
              </blockquote>
            )
          case "ul":
            return (
              <ul key={k} className="list-disc pl-5 space-y-1">
                {b.items!.map((it, j) => (
                  <li key={`${k}-li${j}`}>
                    {parseInline(it, `${k}-li${j}`)}
                  </li>
                ))}
              </ul>
            )
          case "ol":
            return (
              <ol key={k} className="list-decimal pl-5 space-y-1">
                {b.items!.map((it, j) => (
                  <li key={`${k}-li${j}`}>
                    {parseInline(it, `${k}-li${j}`)}
                  </li>
                ))}
              </ol>
            )
          case "code":
            return (
              <pre
                key={k}
                className="overflow-x-auto rounded-lg bg-muted p-3 text-[0.85em] font-mono text-foreground/90 scrollbar-thin"
              >
                <code>{b.text.replace(/\n$/, "")}</code>
              </pre>
            )
          case "p":
          default:
            return (
              <p key={k} className="whitespace-pre-wrap break-words leading-relaxed">
                {b.text.split("\n").map((ln, j, arr) => (
                  <React.Fragment key={`${k}-l${j}`}>
                    {parseInline(ln, `${k}-l${j}`)}
                    {j < arr.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            )
        }
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formatting toolbar — wraps the textarea selection in markdown syntax
// ---------------------------------------------------------------------------

export type FormatKind = "bold" | "italic" | "h2" | "quote" | "ul" | "code" | "link"

/**
 * Apply a markdown wrap to the currently-selected range of a textarea.
 * If there's no selection, inserts empty syntax with the cursor inside.
 */
export function applyFormat(
  el: HTMLTextAreaElement | null,
  kind: FormatKind,
  onValueChange: (next: string) => void,
) {
  if (!el) return
  const { selectionStart: s, selectionEnd: e, value } = el
  const sel = value.slice(s, e)
  const before = value.slice(0, s)
  const after = value.slice(e)
  let insert = sel
  let cursorOffset = 0

  switch (kind) {
    case "bold":
      insert = `**${sel || "bold text"}**`
      cursorOffset = sel ? 0 : 2 // place inside if empty
      break
    case "italic":
      insert = `*${sel || "italic text"}*`
      cursorOffset = sel ? 0 : 1
      break
    case "h2": {
      // Prefix the line (or selection) with "## "
      const lineStart = before.lastIndexOf("\n") + 1
      const newBefore = value.slice(0, lineStart)
      const rest = value.slice(lineStart)
      insert = `## ${sel || rest.match(/^[^\n]*/)?.[0] || "Heading"}`
      const next = newBefore + insert + value.slice(lineStart + (sel ? sel.length : (rest.match(/^[^\n]*/)?.[0].length ?? 0)))
      onValueChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = newBefore.length + insert.length
        el.setSelectionRange(pos, pos)
      })
      return
    }
    case "quote": {
      const lineStart = before.lastIndexOf("\n") + 1
      const sel2 = sel || "quote"
      insert = `> ${sel2}`
      const next = value.slice(0, lineStart) + insert + after
      onValueChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = lineStart + insert.length
        el.setSelectionRange(pos, pos)
      })
      return
    }
    case "ul": {
      const lineStart = before.lastIndexOf("\n") + 1
      insert = `- ${sel || "list item"}`
      const next = value.slice(0, lineStart) + insert + after
      onValueChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = lineStart + insert.length
        el.setSelectionRange(pos, pos)
      })
      return
    }
    case "code":
      insert = `\`${sel || "code"}\``
      cursorOffset = sel ? 0 : 1
      break
    case "link": {
      const label = sel || "link text"
      insert = `[${label}](https://)`
      cursorOffset = sel ? -(1) : -(1 + "https://".length) // place cursor inside url
      // place cursor between () — simpler: at the url position
      const next = before + insert + after
      onValueChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const urlStart = before.length + label.length + 3 // "[label](" length
        const urlEnd = urlStart + "https://".length
        el.setSelectionRange(urlStart, urlEnd)
      })
      return
    }
  }

  const next = before + insert + after
  onValueChange(next)
  requestAnimationFrame(() => {
    el.focus()
    if (sel) {
      // select the wrapped content
      const start = before.length + (insert.length - sel.length) / 2
      el.setSelectionRange(start, start + sel.length)
    } else {
      // place cursor in the middle
      const pos = before.length + Math.floor(insert.length / 2) + cursorOffset
      el.setSelectionRange(pos, pos)
    }
  })
}

// ---------------------------------------------------------------------------
// MarkdownToolbar — small formatting button row for a textarea
// ---------------------------------------------------------------------------

export function MarkdownToolbar({
  textareaRef,
  onValueChange,
  className,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onValueChange: (next: string) => void
  className?: string
}) {
  const btns: { kind: FormatKind; label: string; icon: React.ReactNode }[] = [
    { kind: "bold", label: "Bold", icon: <Bold className="h-4 w-4" /> },
    { kind: "italic", label: "Italic", icon: <Italic className="h-4 w-4" /> },
    { kind: "h2", label: "Heading", icon: <Heading2 className="h-4 w-4" /> },
    { kind: "ul", label: "List", icon: <List className="h-4 w-4" /> },
    { kind: "quote", label: "Quote", icon: <Quote className="h-4 w-4" /> },
    { kind: "code", label: "Code", icon: <Code2 className="h-4 w-4" /> },
    { kind: "link", label: "Link", icon: <LinkIcon className="h-4 w-4" /> },
  ]
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1",
        className,
      )}
      role="toolbar"
      aria-label="Text formatting"
    >
      {btns.map((b) => (
        <button
          key={b.kind}
          type="button"
          title={b.label}
          aria-label={b.label}
          onClick={() => applyFormat(textareaRef.current, b.kind, onValueChange)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {b.icon}
        </button>
      ))}
    </div>
  )
}
