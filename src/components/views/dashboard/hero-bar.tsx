import Image from "next/image"
import { format } from "date-fns"
import { initials } from "@/components/shared/page-header"
import { RoleBadgePill } from "./badges"

/** Plain header row at the top of the dashboard — club logo, name, role pill,
 *  member count + join date. No gradient wash, no left accent bar (per DESIGN.md
 *  — depth comes from 1px borders, not gradients/bars). */
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-club text-club-foreground text-xs font-bold shrink-0 overflow-hidden">
          {logoUrl ? (
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
  )
}
