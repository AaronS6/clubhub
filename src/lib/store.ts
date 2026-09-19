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
  | "notifications"
  | "settings"

interface ClubSummary {
  clubId: string
  clubName: string
  logoUrl: string | null
  accentColor: string
  clubCode: string
  role: "member" | "executive"
}

interface AppState {
  currentClubId: string | null
  currentClub: ClubSummary | null
  clubs: ClubSummary[]
  view: View
  authView: "login" | "signup"
  setClubs: (clubs: ClubSummary[]) => void
  selectClub: (clubId: string | null) => void
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
      authView: "login",
      setClubs: (clubs) => {
        const existing = get().currentClubId
        const stillThere = existing && clubs.find((c) => c.clubId === existing)
        set({
          clubs,
          currentClubId: stillThere ? existing : clubs[0]?.clubId ?? null,
          currentClub: stillThere ? clubs.find((c) => c.clubId === existing)! : clubs[0] ?? null,
          view: stillThere ? get().view : "dashboard",
        })
      },
      selectClub: (clubId) => {
        const club = get().clubs.find((c) => c.clubId === clubId) ?? null
        set({ currentClubId: clubId, currentClub: club, view: "dashboard" })
      },
      setView: (view) => set({ view }),
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
