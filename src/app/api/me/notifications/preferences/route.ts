import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"
import { mergePrefs, parsePrefsString } from "@/lib/notif-prefs"

/** GET /api/me/notifications/preferences → returns the normalized prefs object. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return error("Unauthorized", 401)
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { notifPrefs: true, email: true },
  })
  if (!dbUser) return error("Not found", 404)
  const prefs = parsePrefsString(dbUser.notifPrefs)
  return json({ prefs, email: dbUser.email })
}

// Note: we use `z.record(z.string(), z.boolean())` rather than
// `z.record(z.enum([...]), z.boolean())` because the latter requires
// every enum key to be present (rejects partial patches). The mergePrefs
// helper already filters unknown keys, so accepting any string→boolean map
// here lets clients send partial patches safely.
const flagMap = z.record(z.string(), z.boolean())

const patchSchema = z.object({
  email: flagMap.optional(),
  inApp: flagMap.optional(),
  emailMode: z.enum(["instant", "digest"]).optional(),
})

/** PATCH /api/me/notifications/preferences → merge partial prefs over existing; save. */
export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return error("Unauthorized", 401)
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return error("Invalid preferences payload", 400)
  }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { notifPrefs: true, email: true },
  })
  if (!dbUser) return error("Not found", 404)

  const current = parsePrefsString(dbUser.notifPrefs)
  const merged = mergePrefs(current, parsed.data)

  await db.user.update({
    where: { id: user.id },
    data: { notifPrefs: JSON.stringify(merged) },
  })

  return json({ prefs: merged, email: dbUser.email })
}
