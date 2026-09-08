import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"
import { rateLimit } from "@/lib/rate-limit"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BYTES = 1024 * 1024 // 1 MB
const MAX_ROWS = 500

// Bulk import is an abuse surface (an exec account could spam imports to
// mass-add members or DoS the DB with parse work). Cap at 5 imports per
// club per minute — keyed by clubId (not userId) so a compromised exec
// can't rotate to a second exec account to bypass it. Plenty for any
// legitimate workflow (a real bulk import happens once per term).
const IMPORT_RATE_LIMIT_MAX = 5
const IMPORT_RATE_LIMIT_WINDOW_MS = 60_000

// Simple, permissive email validation. We don't need to be RFC-perfect —
// we just need to weed out obviously malformed input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------------------
// Tiny CSV parser
// ---------------------------------------------------------------------------
//
// Parses a single CSV string into an array of rows, where each row is an array
// of string fields. Handles:
//   - quoted fields ("a,b" -> a,b)
//   - escaped quotes ("a""b" -> a"b)
//   quoted fields may contain newlines
//   - both \n and \r\n as record terminators
//
// This is intentionally minimal — no streaming, no type inference, no comments.
// Sufficient for a 500-row upload with two columns.

function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let i = 0
  let inQuotes = false
  const n = input.length

  while (i < n) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        // Look ahead for an escaped quote
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        // End of quoted field
        inQuotes = false
        i++
        continue
      }
      // Inside quotes — every character (including newlines) is literal.
      field += ch
      i++
      continue
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ",") {
      row.push(field)
      field = ""
      i++
      continue
    }
    if (ch === "\r") {
      // Treat \r\n and lone \r as a single record break.
      rows.push(row)
      row = []
      field = ""
      if (input[i + 1] === "\n") i += 2
      else i++
      continue
    }
    if (ch === "\n") {
      rows.push(row)
      row = []
      field = ""
      i++
      continue
    }
    field += ch
    i++
  }

  // Flush trailing field/row (file may not end in a newline).
  if (field.length > 0 || row.length > 0) {
    rows.push(row)
  }

  // Drop trailing empty rows produced by a final newline.
  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last.length === 1 && last[0] === "") rows.pop()
    else break
  }

  return rows
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface AddedMember {
  name: string
  email: string
}
interface AlreadyMember {
  email: string
}
interface InvalidRow {
  row: number
  name?: string
  email?: string
  reason: string
}
interface PendingInvite {
  name: string
  email: string
}

interface ImportResult {
  added: AddedMember[]
  alreadyMembers: AlreadyMember[]
  invalid: InvalidRow[]
  pendingInvites: PendingInvite[]
  clubCode: string
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/clubs/[clubId]/members/import
 * Executive only. Accepts multipart/form-data with a `file` field containing
 * a CSV with at least `name,email` columns (case-insensitive header match).
 *
 * For each row:
 *   - Validates email format.
 *   - If a user with that email already exists:
 *       - If they are an active member of this club  -> skip (alreadyMembers).
 *       - If they were removed                       -> reactivate as member.
 *       - Otherwise                                  -> add as member.
 *   - If no user exists with that email:
 *       - Add to `pendingInvites` — the executive should share the club code
 *         with these people so they can sign up and join. We do NOT
 *         auto-create users (security implications; no email sending in scope).
 *
 * Returns { added, alreadyMembers, invalid, pendingInvites, clubCode }.
 *
 * NOTE: A real product would email each pending invite a sign-up link with
 * the club code pre-filled. Out of scope here — the UI surfaces the list and
 * the code to share.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can import members", 403)

  // Rate limit: 5 imports per club per minute. Keyed by clubId so a
  // compromised exec can't bypass by switching accounts.
  const rlKey = `import:${clubId}`
  const rl = rateLimit(rlKey, IMPORT_RATE_LIMIT_MAX, IMPORT_RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return Response.json(
      { error: "Too many imports. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return error("Expected multipart/form-data", 400)
  }

  const file = formData.get("file")
  if (!file || !(file instanceof File)) return error("No file uploaded", 400)

  const name = file.name.toLowerCase()
  if (!name.endsWith(".csv")) {
    return error("File must be a .csv", 400)
  }
  if (file.size === 0) return error("File is empty", 400)
  if (file.size > MAX_BYTES) return error("File too large (max 1MB)", 400)

  // Parse the raw text. csv files are typically utf-8; in Node the File.text()
  // decodes as utf-8 by default.
  const text = await file.text()
  const allRows = parseCsv(text)

  // The first row is the header. Find the `name` and `email` columns.
  if (allRows.length === 0) {
    return error("CSV has no rows", 400)
  }
  const header = allRows[0].map((h) => h.trim().toLowerCase())
  const nameIdx = header.indexOf("name")
  const emailIdx = header.indexOf("email")
  if (nameIdx === -1 || emailIdx === -1) {
    return error("CSV must have 'name' and 'email' columns (header row required)", 400)
  }

  // Cap rows at MAX_ROWS (excluding the header).
  const dataRows = allRows.slice(1)
  if (dataRows.length > MAX_ROWS) {
    return error(`Too many rows (max ${MAX_ROWS}; got ${dataRows.length})`, 400)
  }

  const added: AddedMember[] = []
  const alreadyMembers: AlreadyMember[] = []
  const invalid: InvalidRow[] = []
  const pendingInvites: PendingInvite[] = []

  // Track emails seen in this upload so we don't add the same user twice.
  const seenEmails = new Set<string>()

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const rowNumber = i + 2 // header is row 1
    const rawName = (row[nameIdx] ?? "").trim()
    const rawEmail = (row[emailIdx] ?? "").trim()
    if (!rawName && !rawEmail) {
      // Skip wholly-blank rows silently.
      continue
    }
    if (!rawName) {
      invalid.push({ row: rowNumber, email: rawEmail, reason: "Missing name" })
      continue
    }
    if (!rawEmail) {
      invalid.push({ row: rowNumber, name: rawName, reason: "Missing email" })
      continue
    }
    if (!EMAIL_RE.test(rawEmail)) {
      invalid.push({ row: rowNumber, name: rawName, email: rawEmail, reason: "Invalid email format" })
      continue
    }
    const email = rawEmail.toLowerCase()
    if (seenEmails.has(email)) {
      invalid.push({ row: rowNumber, name: rawName, email: rawEmail, reason: "Duplicate email in this file" })
      continue
    }
    seenEmails.add(email)

    // Look up an existing user with this email.
    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    })

    if (!existingUser) {
      pendingInvites.push({ name: rawName, email: rawEmail })
      continue
    }

    const existingMembership = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId: existingUser.id } },
    })

    if (existingMembership && existingMembership.status === "active") {
      alreadyMembers.push({ email: rawEmail })
      continue
    }

    if (existingMembership && existingMembership.status === "removed") {
      // Reactivate as a member (reset role for cleanliness).
      await db.clubMember.update({
        where: { id: existingMembership.id },
        data: { status: "active", role: "member" },
      })
      added.push({ name: rawName, email: rawEmail })
      // Let the user know they were re-added.
      await notify({
        userId: existingUser.id,
        clubId,
        type: "new_member",
        message: `You were re-added to ${c.club.name}`,
        linkUrl: "/?view=dashboard",
      })
      continue
    }

    // No membership at all — create one.
    await db.clubMember.create({
      data: { clubId, userId: existingUser.id, role: "member" },
    })
    added.push({ name: rawName, email: rawEmail })
    await notify({
      userId: existingUser.id,
      clubId,
      type: "new_member",
      message: `You were added to ${c.club.name}`,
      linkUrl: "/?view=dashboard",
    })
  }

  const club = await db.club.findUnique({
    where: { id: clubId },
    select: { clubCode: true },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "bulk_member_import",
    targetType: "club",
    targetId: clubId,
    description: `${c.user.name} imported members (added ${added.length}, already ${alreadyMembers.length}, pending ${pendingInvites.length}, invalid ${invalid.length})`,
  })

  // Only emit when membership actually changed.
  if (added.length > 0) {
    await emitClubEvent(clubId, "new_member", { added: added.length })
  }

  const result: ImportResult = {
    added,
    alreadyMembers,
    invalid,
    pendingInvites,
    clubCode: club?.clubCode ?? "",
  }
  return json(result, 201)
}
