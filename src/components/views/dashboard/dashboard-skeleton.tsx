import { StatCardSkeleton } from "@/components/shared/page-header"

/** Loading skeleton — matches the bento-grid layout. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero bar */}
      <div className="card-quiet h-20 animate-pulse" />
      {/* Tier 1 strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {/* Chart + Leaderboard row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="card-quiet p-5 lg:col-span-8 h-64 animate-pulse" />
        <div className="card-quiet p-5 lg:col-span-4 h-64 animate-pulse" />
      </div>
      {/* Snapshot + Announcements + Meetings row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="card-quiet p-5 lg:col-span-4 h-56 animate-pulse" />
        <div className="card-quiet p-5 lg:col-span-4 h-56 animate-pulse" />
        <div className="card-quiet p-5 lg:col-span-4 h-56 animate-pulse" />
      </div>
      {/* Club stats strip */}
      <div className="card-quiet p-4 h-24 animate-pulse" />
    </div>
  )
}
