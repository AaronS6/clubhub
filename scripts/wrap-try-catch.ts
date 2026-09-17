/**
 * One-off script: wraps every `export async function GET/POST/PATCH/PUT/DELETE`
 * in every route.ts under src/app/api/ in a try/catch with descriptive logging.
 *
 * Skips:
 *   - auth/signup/route.ts (already wrapped)
 *   - clubs/route.ts (already wrapped)
 *   - functions already wrapped (detected by leading `try {`)
 *
 * Run with: bun run scripts/wrap-try-catch.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const ROOT = "/home/z/my-project"
const API_ROOT = join(ROOT, "src/app/api")

const SKIP_FILES = new Set<string>([
  join(API_ROOT, "auth/signup/route.ts"),
  join(API_ROOT, "clubs/route.ts"),
])

function listRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      listRouteFiles(full, acc)
    } else if (entry === "route.ts") {
      acc.push(full)
    }
  }
  return acc
}

/** Strip a leading run of line/block comments and whitespace from a string. */
function stripLeadingWhitespaceAndComments(s: string): string {
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++
      continue
    }
    if (ch === "/" && s[i + 1] === "/") {
      // line comment
      while (i < s.length && s[i] !== "\n") i++
      continue
    }
    if (ch === "/" && s[i + 1] === "*") {
      i += 2
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++
      i += 2
      continue
    }
    break
  }
  return s.slice(i)
}

/**
 * Find the matching closing brace for the `{` at position `openIdx`.
 * Handles strings, template literals, line/block comments.
 * Template-literal `${...}` expressions are handled with a stack so braces
 * inside them don't unbalance the count.
 */
function findMatchingBrace(content: string, openIdx: number): number {
  if (content[openIdx] !== "{") return -1
  let depth = 0
  let i = openIdx
  // Stack to track when we're inside a template literal expression.
  // Each entry: { kind: 'tmpl' | 'string', quote: string }
  // For simplicity, we treat template literals like strings but allow
  // ${...} to push a 'tmpl-expr' frame.
  const stack: Array<{ kind: "string" | "tmpl-expr"; quote: string }> = []
  let inLineComment = false
  let inBlockComment = false
  while (i < content.length) {
    const ch = content[i]
    const next = content[i + 1]

    if (inLineComment) {
      if (ch === "\n") inLineComment = false
      i++
      continue
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }

    const top = stack[stack.length - 1]
    if (top) {
      if (top.kind === "string") {
        if (ch === "\\") {
          i += 2
          continue
        }
        if (ch === top.quote) {
          stack.pop()
          i++
          continue
        }
        i++
        continue
      }
      // tmpl-expr: scan normally but watch for `}` (closes expr) and `}` not consumed by deeper braces
      // We handle this below in the normal flow, but mark we're in a tmpl-expr
    }

    if (ch === "/" && next === "/") {
      inLineComment = true
      i += 2
      continue
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true
      i += 2
      continue
    }
    if (ch === '"' || ch === "'") {
      stack.push({ kind: "string", quote: ch })
      i++
      continue
    }
    if (ch === "`") {
      // template literal: scan until matching backtick, but `${...}` enters expression mode
      i++
      while (i < content.length) {
        const c2 = content[i]
        if (c2 === "\\") {
          i += 2
          continue
        }
        if (c2 === "`") {
          i++
          break
        }
        if (c2 === "$" && content[i + 1] === "{") {
          // enter expression — recursively find matching `}`
          i += 2
          let d = 1
          while (i < content.length && d > 0) {
            const c3 = content[i]
            if (c3 === "\\") {
              i += 2
              continue
            }
            if (c3 === '"' || c3 === "'" || c3 === "`") {
              // skip a nested string
              const q = c3
              i++
              while (i < content.length) {
                if (content[i] === "\\") {
                  i += 2
                  continue
                }
                if (content[i] === q) {
                  i++
                  break
                }
                i++
              }
              continue
            }
            if (c3 === "{") d++
            else if (c3 === "}") d--
            i++
          }
          continue
        }
        i++
      }
      continue
    }

    if (ch === "{") {
      depth++
      i++
      continue
    }
    if (ch === "}") {
      depth--
      if (depth === 0) return i
      i++
      continue
    }
    i++
  }
  return -1
}

/** Singularize a resource name (best-effort). */
function singular(s: string): string {
  if (s.endsWith("ies")) return s.slice(0, -3) + "y"
  if (s.endsWith("ses")) return s.slice(0, -2)
  if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1)
  return s
}

/**
 * Derive a route-name label like `clubs/announcements` for the console.error tag.
 * Filters out dynamic segments (`[...]`) and route groups (`(...)`).
 */
function deriveRouteTag(filePath: string): string {
  const rel = filePath.replace(API_ROOT + "/", "").replace(/\/route\.ts$/, "")
  const segments = rel
    .split("/")
    .filter((s) => !s.startsWith("[") && !s.startsWith("(") && s.length > 0)
  return segments.join("/")
}

/**
 * Helper: return the named (non-dynamic) segments of a route path.
 */
function namedSegmentsOf(filePath: string): string[] {
  const rel = filePath.replace(API_ROOT + "/", "").replace(/\/route\.ts$/, "")
  return rel
    .split("/")
    .filter((s) => !s.startsWith("[") && !s.startsWith("(") && s.length > 0)
}

/**
 * Derive the `<action>` for the catch response, e.g. "create announcement".
 * Uses the last *named* segment (ignoring dynamic `[id]` segments) and
 * whether a dynamic segment follows it (single-resource vs collection).
 */
function deriveAction(filePath: string, method: string): string {
  const rel = filePath.replace(API_ROOT + "/", "").replace(/\/route\.ts$/, "")
  const allSegments = rel.split("/")
  const named = namedSegmentsOf(filePath)
  if (named.length === 0) {
    return method === "GET" ? "load resource" : "process request"
  }
  const last = named[named.length - 1]
  const prev = named[named.length - 2] || ""

  // Is there a dynamic segment after the last named segment? (single-resource route)
  const lastIdx = allSegments.lastIndexOf(last)
  const hasDynamicAfter = allSegments.slice(lastIdx + 1).some((s) => s.startsWith("["))

  // Special-case routes (matched on the last named segment).
  if (last === "join") return method === "POST" ? "join club" : "process join"
  if (last === "verify-admin-passcode") return "verify admin passcode"
  if (last === "leave") return "leave club"
  if (last === "regenerate") return "regenerate club code"
  if (last === "password") return "update club password"
  if (last === "dashboard") return "load dashboard"
  if (last === "leaderboard") return "load leaderboard"
  if (last === "search") return "search club"
  if (last === "ics") return "generate calendar feed"
  if (last === "export") return "export data"
  if (last === "bulk-review") return "review hours"
  if (last === "import") return "import members"
  if (last === "urgent") return "load urgent announcements"
  if (last === "restore") {
    return `restore ${singular(prev || "item")}`
  }
  if (last === "read") return "mark notification read"
  if (last === "read-all") return "mark all notifications read"
  if (last === "pinned") return "load pinned messages"
  if (last === "pin") return "pin message"
  if (last === "reactions") {
    if (method === "POST") return "toggle reaction"
    if (method === "DELETE") return "remove reaction"
    return "load reactions"
  }
  if (last === "rsvp") return "RSVP to meeting"
  if (last === "attendees") return "load attendees"
  if (last === "activity") return "load activity"
  if (last === "comments") {
    if (method === "POST") return "create comment"
    if (method === "DELETE") return "delete comment"
    return "load comments"
  }
  if (last === "subtasks") {
    if (method === "POST") return "create subtask"
    if (method === "DELETE") return "delete subtask"
    return "load subtasks"
  }
  if (last === "badges") return "load badges"
  if (last === "categories") {
    if (method === "POST") return "create category"
    if (method === "PATCH" || method === "PUT") return "update category"
    if (method === "DELETE") return "delete category"
    return "load categories"
  }
  if (last === "members") {
    if (method === "POST") return "add member"
    if (method === "DELETE") return "remove member"
    return "load members"
  }
  if (last === "messages") {
    if (method === "POST") return "send message"
    if (method === "DELETE") return "delete message"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update message"
      return "load message"
    }
    return "load messages"
  }
  if (last === "conversations") {
    if (method === "POST") return "create conversation"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update conversation"
      if (method === "DELETE") return "delete conversation"
      return "load conversation"
    }
    return "load conversations"
  }
  if (last === "meetings") {
    if (method === "POST") return "create meeting"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update meeting"
      if (method === "DELETE") return "delete meeting"
      return "load meeting"
    }
    return "load meetings"
  }
  if (last === "tasks") {
    if (method === "POST") return "create task"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update task"
      if (method === "DELETE") return "delete task"
      return "load task"
    }
    return "load tasks"
  }
  if (last === "teams") {
    if (method === "POST") return "create team"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update team"
      if (method === "DELETE") return "delete team"
      return "load team"
    }
    return "load teams"
  }
  if (last === "announcements") {
    if (method === "POST") return "create announcement"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update announcement"
      if (method === "DELETE") return "delete announcement"
      return "load announcement"
    }
    return "load announcements"
  }
  if (last === "hours") {
    if (method === "POST") return "submit hours"
    if (method === "PATCH" || method === "PUT") return "review hours"
    if (hasDynamicAfter) {
      if (method === "DELETE") return "delete hours entry"
      return "load hours entry"
    }
    return "load hours"
  }
  if (last === "notifications") {
    if (method === "POST") return "create notification"
    return "load notifications"
  }
  if (last === "preferences") {
    if (method === "PATCH" || method === "PUT") return "update notification preferences"
    return "load notification preferences"
  }
  if (last === "me") {
    if (method === "PUT") return "change password"
    if (method === "PATCH") return "update profile"
    return "load user"
  }
  if (last === "clubs") {
    if (method === "POST") return "create club"
    if (hasDynamicAfter) {
      if (method === "PATCH" || method === "PUT") return "update club"
      if (method === "DELETE") return "delete club"
      return "load club"
    }
    return "load clubs"
  }
  if (last === "club") {
    if (method === "PATCH" || method === "PUT") return "update club"
    return "load club"
  }
  if (rel === "public/club/[code]" || rel === "public/club/code") return "load public club"
  if (rel === "") return "handle root request"

  // Generic fallback
  const resource = singular(last)
  switch (method) {
    case "GET":
      return hasDynamicAfter ? `load ${resource}` : `load ${last}`
    case "POST":
      return `create ${resource}`
    case "PATCH":
    case "PUT":
      return `update ${resource}`
    case "DELETE":
      return `delete ${resource}`
    default:
      return `process ${resource}`
  }
}

interface WrapResult {
  file: string
  functionsWrapped: number
  functionsSkipped: number
  tag: string
  addedImport: boolean
}

function processFile(filePath: string): WrapResult {
  const original = readFileSync(filePath, "utf-8")
  const tag = deriveRouteTag(filePath)
  let content = original
  let functionsWrapped = 0
  let functionsSkipped = 0

  // We'll iterate over the content with a regex to find `export async function NAME(...) {`
  // but we must use `findMatchingBrace` to find the body's end since the body can
  // contain nested braces. We do a single forward pass, modifying in place.
  const methodRegex = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g
  const out: string[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = methodRegex.exec(content)) !== null) {
    const method = m[1]
    const fnStart = m.index
    // Find the `{` that opens the function body — first `{` after the `)`.
    // We need to skip over the parameter list (which may contain `(` `)` and type braces).
    let i = m.index + m[0].length
    // Track paren depth to find the end of the parameter list.
    let parenDepth = 1
    while (i < content.length && parenDepth > 0) {
      const ch = content[i]
      if (ch === "(") parenDepth++
      else if (ch === ")") parenDepth--
      i++
    }
    // Now find the opening `{` of the body.
    while (i < content.length && content[i] !== "{") i++
    if (i >= content.length) {
      // malformed — give up on this function, copy as-is
      methodRegex.lastIndex = m.index + m[0].length
      continue
    }
    const bodyOpenIdx = i
    const bodyCloseIdx = findMatchingBrace(content, bodyOpenIdx)
    if (bodyCloseIdx === -1) {
      methodRegex.lastIndex = m.index + m[0].length
      continue
    }
    // Body content (between braces, exclusive).
    const bodyContent = content.slice(bodyOpenIdx + 1, bodyCloseIdx)

    // Detect if already wrapped: first non-whitespace/comment token is `try`.
    const stripped = stripLeadingWhitespaceAndComments(bodyContent)
    const alreadyWrapped = stripped.startsWith("try") &&
      (stripped[3] === " " || stripped[3] === "{" || stripped[3] === "\n" || stripped[3] === "\r" || stripped[3] === "\t")

    // Append everything up to the body open brace (inclusive).
    out.push(content.slice(lastIdx, bodyOpenIdx + 1))
    lastIdx = bodyCloseIdx

    if (alreadyWrapped) {
      functionsSkipped++
      // leave body untouched; we'll append body and close brace in the final pass.
      continue
    }

    // Re-indent the body by 2 spaces (skip empty/whitespace-only lines).
    const bodyLines = bodyContent.split("\n")
    const reindented = bodyLines
      .map((line) => {
        if (line.trim() === "") return line
        return "  " + line
      })
      .join("\n")

    const action = deriveAction(filePath, method)
    const wrapped =
      "\n  try {" +
      reindented +
      `\n  } catch (err: any) {\n` +
      `    console.error("[${tag} ${method}] error:", err?.message, err?.code, err?.meta)\n` +
      `    return NextResponse.json({ error: "Failed to ${action}: " + (err?.message || "Unknown error") }, { status: 500 })\n` +
      `  }\n`

    out.push(wrapped)
    functionsWrapped++

    // Move lastIndex past the closing brace so we don't re-match inside the body.
    methodRegex.lastIndex = bodyCloseIdx + 1
  }
  // Append the rest.
  out.push(content.slice(lastIdx))

  let addedImport = false
  let finalContent = out.join("")
  if (functionsWrapped > 0) {
    // Ensure `NextResponse` is imported so the catch block can use NextResponse.json().
    const hasImport = /import\s*\{[^}]*\bNextResponse\b[^}]*\}\s*from\s*["']next\/server["']/.test(original)
    if (!hasImport) {
      finalContent = `import { NextResponse } from "next/server"\n` + finalContent
      addedImport = true
    }
    writeFileSync(filePath, finalContent, "utf-8")
  }
  return { file: filePath, functionsWrapped, functionsSkipped, tag, addedImport }
}

// ---- Main ----
const files = listRouteFiles(API_ROOT).filter((f) => !SKIP_FILES.has(f))
console.log(`Found ${files.length} route files to process (excluding ${SKIP_FILES.size} skip files).`)

let totalWrapped = 0
let totalSkipped = 0
let totalImportsAdded = 0
const results: WrapResult[] = []
for (const f of files) {
  try {
    const r = processFile(f)
    results.push(r)
    totalWrapped += r.functionsWrapped
    totalSkipped += r.functionsSkipped
    if (r.addedImport) totalImportsAdded++
    if (r.functionsWrapped === 0 && r.functionsSkipped === 0) {
      console.log(`  [skip] ${r.tag} — no async handlers found`)
    } else {
      console.log(
        `  [ok]   ${r.tag} — wrapped ${r.functionsWrapped}, skipped ${r.functionsSkipped}${r.addedImport ? ", +NextResponse import" : ""}`,
      )
    }
  } catch (e: any) {
    console.error(`  [ERR]  ${f}: ${e?.message}`)
  }
}

console.log(`\nDone. Total wrapped: ${totalWrapped}, total skipped (already wrapped): ${totalSkipped}`)
console.log(`Files processed: ${files.length}, imports added: ${totalImportsAdded}`)
