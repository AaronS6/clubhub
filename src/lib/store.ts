"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type View =
  | "dashboard"
  | "announcements"
  | "hours"
  | "approvals"
  | "tasks"
  | "meetings"
  | "teams"
  | "members"
  | "activity"
  | "chat"
  | "financials"
  | "notes"
  | "storage"
  | "notifications"
  | "settings"

/**
 * §9 Navigation contexts.
 *
 * ONE ClubHub, ONE navigation system, multiple club contexts:
 *
 *   - "hub"  → My Hub. The student's personal, default view of their ENTIRE
 *              ClubHub experience. Shared pages (Home, Calendar, My Tasks,
 *              Updates, Messages) aggregate data across every club they
 *              belong to.
 *   - "club" → An individual club workspace. The existing club-specific
 *              experience, unchanged. Shared pages show only that club's
 *              data; club-only pages (Members, Teams, Storage, …) are
 *              reachable only here.
 *
 * Invariant: context === "club" ⇒ currentClubId points at one of `clubs`.
 * `currentClub`/`currentClubId` keep their original meaning ("the selected
 * club") and SURVIVE a switch to My Hub, so returning to the last club is
 * instant and per-club accents don't flash. Code that needs "the club whose
 * data is on screen" should use `activeClubIdForContext(context, …)` or read
 * `context === "club" ? currentClub : null`.
 */
export type NavContext = "hub" | "club"

/**
 * Views that only make sense inside an individual club workspace. When My Hub
 * is active these are NOT reachable — `resolveView` redirects them to the
 * hub home so switching contexts never lands the student on an orphan page.
 */
const CLUB_ONLY_VIEWS: readonly View[] = [
  "hours",
  "approvals",
  "teams",
  "members",
  "activity",
  "financials",
  "notes",
  "storage",
  "settings",
]

/** True when `view` can render inside the given context. */
export function viewAllowedInContext(view: View, context: NavContext): boolean {
  if (context === "club") return true
  return !CLUB_ONLY_VIEWS.includes(view)
}

/**
 * Guard used by every context/view mutation: club-only views fall back to the
 * home view when My Hub is active (or when no club is selectable).
 */
function resolveView(view: View, context: NavContext, hasClub: boolean): View {
  if (viewAllowedInContext(view, context) && (context === "hub" || hasClub)) {
    return view
  }
  return "dashboard"
}

interface ClubSummary {
  clubId: string
  clubName: string
  logoUrl: string | null
  accentColor: string
  clubCode: string
  role: "member" | "executive"
  /** Null until an executive confirms the Executive Admin Handbook popup
   *  for this club (stamped once per club lifetime in the DB). Optional —
   *  older cached payloads may not include it. */
  handbookAcceptedAt?: string | null
}

interface AppState {
  currentClubId: string | null
  currentClub: ClubSummary | null
  clubs: ClubSummary[]
  view: View
  /** §9 Active navigation context — "hub" (My Hub) or "club" workspace. */
  context: NavContext
  authView: "login" | "signup"
  setClubs: (clubs: ClubSummary[]) => void
  selectClub: (clubId: string | null) => void
  /** Switch to My Hub (lands on the hub home view). */
  selectHub: () => void
  /** Switch context WITHOUT resetting the view — used by the URL/popstate
   *  sync so browser back/forward restores exactly what was there. Falls
   *  back to the hub home when the target view isn't valid in the target
   *  context. */
  setContext: (context: NavContext, view?: View) => void
  /** Atomically apply a full navigation state (context + club + view) —
   *  used by the URL/popstate sync so restoring a history entry never
   *  passes through an intermediate state (e.g. selectClub's view reset),
   *  which would otherwise fight the URL-write effect. */
  applyNavState: (context: NavContext, clubId: string | null | undefined, view?: View) => void
  setView: (view: View) => void
  setAuthView: (v: "login" | "signup") => void
  patchCurrentClub: (patch: Partial<ClubSummary>) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentClubId: null,
      currentClub: null,
      clubs: [],
      view: "dashboard",
      // My Hub is the student's default view of their entire ClubHub
      // experience — new (and upgrading) users land there first.
      context: "hub",
      authView: "login",
      setClubs: (clubs) => {
        const existing = get().currentClubId
        const stillThere = existing && clubs.find((c) => c.clubId === existing)
        set({
          clubs,
          currentClubId: stillThere ? existing : clubs[0]?.clubId ?? null,
          currentClub: stillThere ? clubs.find((c) => c.clubId === existing)! : clubs[0] ?? null,
          view: stillThere ? get().view : "dashboard",
          // No memberships left → My Hub is the only valid context (the shell
          // shows the discovery screen, but keep the invariant airtight).
          context: clubs.length === 0 ? "hub" : get().context,
        })
      },
      selectClub: (clubId) => {
        const club = get().clubs.find((c) => c.clubId === clubId) ?? null
        set({
          currentClubId: clubId,
          currentClub: club,
          context: clubId ? "club" : "hub",
          view: "dashboard",
        })
      },
      selectHub: () => set({ context: "hub", view: "dashboard" }),
      setContext: (context, view) => {
        const s = get()
        // A club context is impossible without a membership — fall back to
        // My Hub rather than breaking the context ⇒ currentClubId invariant.
        if (context === "club" && !s.currentClubId && s.clubs.length === 0) {
          set({ context: "hub", view: resolveView(view ?? s.view, "hub", false) })
          return
        }
        // Entering a club context with no club selected → fall back to the
        // first membership (selectClub semantics without the view reset).
        if (context === "club" && !s.currentClubId && s.clubs.length > 0) {
          const club = s.clubs[0]
          set({
            context: "club",
            currentClubId: club.clubId,
            currentClub: club,
            view: resolveView(view ?? s.view, "club", true),
          })
          return
        }
        set({ context, view: resolveView(view ?? s.view, context, !!s.currentClubId) })
      },
      applyNavState: (context, clubId, view) => {
        const s = get()
        // Resolve the club for a club context: the requested id (validated
        // against actual memberships), else the current club, else the first
        // membership. A hub context keeps the last club selected so
        // returning to it is one click.
        let cid = clubId ?? null
        if (cid && !s.clubs.some((c) => c.clubId === cid)) cid = null
        if (context === "club" && !cid) {
          cid =
            s.currentClubId && s.clubs.some((c) => c.clubId === s.currentClubId)
              ? s.currentClubId
              : s.clubs[0]?.clubId ?? null
        }
        const finalContext: NavContext = context === "club" && cid ? "club" : "hub"
        const club =
          finalContext === "club"
            ? s.clubs.find((c) => c.clubId === cid) ?? null
            : s.currentClub
        set({
          context: finalContext,
          currentClubId: finalContext === "club" ? cid : s.currentClubId,
          currentClub: club,
          view: resolveView(view ?? s.view, finalContext, !!cid),
        })
      },
      setView: (view) => set({ view: resolveView(view, get().context, !!get().currentClubId) }),
      setAuthView: (authView) => set({ authView }),
      patchCurrentClub: (patch) =>
        set((state) => {
          if (!state.currentClub) return {}
          const updated = { ...state.currentClub, ...patch }
          const clubs = state.clubs.map((c) =>
            c.clubId === updated.clubId ? { ...c, ...patch } : c
          )
          return { currentClub: updated, clubs }
        }),
    }),
    { name: "clubhub-app" }
  )
)

/** The club whose data is on screen right now — null when My Hub is active. */
export function activeClubOf(state: {
  context: NavContext
  currentClub: ClubSummary | null
}): ClubSummary | null {
  return state.context === "club" ? state.currentClub : null
}
