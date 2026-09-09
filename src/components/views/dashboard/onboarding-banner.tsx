import type { View } from "@/lib/store"
import { cn } from "@/lib/utils"
import { CheckCircle2, Target, PartyPopper, X } from "lucide-react"

/** Onboarding banner — shown on new clubs with a setup checklist. */
export function OnboardingBanner({
  clubCode,
  onDismiss,
  onNavigate,
  teamsCount,
  announcementsCount,
  meetingsCount,
  memberCount,
}: {
  clubCode: string | null
  onDismiss: () => void
  onNavigate: (v: View) => void
  teamsCount: number
  announcementsCount: number
  meetingsCount: number
  memberCount: number
}) {
  const items: { done: boolean; label: string; view: View }[] = [
    { done: teamsCount > 0, label: "Create a team", view: "teams" },
    {
      done: announcementsCount > 0,
      label: "Post an announcement",
      view: "announcements",
    },
    {
      done: meetingsCount > 0,
      label: "Schedule a meeting",
      view: "meetings",
    },
    {
      done: memberCount >= 3,
      label: clubCode ? `Invite members (code: ${clubCode})` : "Invite members",
      view: "members",
    },
  ]
  return (
    <div className="card-quiet p-5 bg-club-muted/40 border-club/30 animate-fade-in relative">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss onboarding banner"
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 mb-1 pr-8">
        <PartyPopper className="h-4 w-4 text-club shrink-0" />
        <h2 className="text-section-title">Welcome! Let&apos;s set up your club</h2>
      </div>
      <p className="text-caption text-muted-foreground mb-4">
        A few quick steps will get your members engaged.
      </p>
      <ul className="grid sm:grid-cols-2 gap-2">
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onNavigate(it.view)}
              className="flex items-center gap-2 w-full text-left rounded-lg border bg-card/60 px-3 py-2 hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {it.done ? (
                <CheckCircle2 className="h-4 w-4 text-club shrink-0" />
              ) : (
                <Target className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span
                className={cn("text-body", it.done && "text-muted-foreground line-through")}
              >
                {it.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
