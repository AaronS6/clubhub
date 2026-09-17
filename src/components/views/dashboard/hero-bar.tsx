import Image from "next/image"
import { format } from "date-fns"
import { initials } from "@/components/shared/page-header"
import { RoleBadgePill } from "./badges"

/** Slim hero bar at the top of the dashboard — club name, logo, member count. */
export function HeroBar({
  name,
  logoUrl,
  memberCount,
  createdAt,
  role,
}: {
  name: string
  logoUrl: string | null
  memberCount: number
  createdAt: string
  role: "member" | "executive"
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-club-muted to-transparent animate-fade-in">
      <div aria-hidden className="absolute left-0 top-0 h-full w-1.5 bg-club" />
      <div className="flex items-center justify-between gap-4 p-4 sm:p-5 pl-5 sm:pl-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-club text-club-foreground text-xs font-bold shrink-0 overflow-hidden">
            {logoUrl ? (
              // Explicit 40×40 to prevent CLS. `unoptimized` because club logos
              // can come from arbitrary user-uploaded sources (no remotePatterns
              // configured in next.config.ts).
              <Image
                src={logoUrl}
                alt={`${name} logo`}
                width={40}
                height={40}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              initials(name)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-page-title truncate min-w-0">{name}</h1>
              <RoleBadgePill role={role} />
            </div>
            <p className="text-caption mt-0.5">
              {memberCount} {memberCount === 1 ? "member" : "members"} · joined{" "}
              {format(new Date(createdAt), "MMM yyyy")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
