"use client"

/**
 * BannerTrendChart — the dashboard banner's 30-day approved-hours trend.
 *
 * Extracted into its own file so recharts (a heavy dep that also drags in
 * lodash) can be lazy-loaded via next/dynamic({ ssr: false }) in
 * dashboard-view.tsx. The chart sits inside fixed-height containers
 * (h-16 mobile / h-28 lg:h-32 desktop) and the dynamic fallback matches
 * those bounds, so the lazy stream-in causes zero layout shift — and
 * anonymous landing visitors no longer download chart libraries at all.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, parseISO } from "date-fns"
import { fmtHours } from "./dashboard-utils"

export type TrendPoint = { date: string; hours: number }

/** The 30-day approved-hours trend as a clean banner chart: thin accent
 *  line, soft gradient fill, subtle vertical gridlines, muted date labels
 *  and an endpoint marker. `compact` trims the chart for the mobile banner:
 *  fewer axis labels, smaller margins. */
export function BannerTrendChart({
  data,
  compact,
}: {
  data: TrendPoint[]
  compact?: boolean
}) {
  const interval = compact
    ? Math.max(0, Math.floor(data.length / 3))
    : Math.max(0, Math.floor(data.length / 5))
  const lastIndex = data.length - 1
  return (
    <div
      className="h-full w-full min-w-0"
      aria-label="Approved hours trend, last 30 days"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={compact ? { top: 4, right: 10, left: 0, bottom: 0 } : { top: 8, right: 14, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="bannerHoursFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--club-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--club-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical
            horizontal={false}
            stroke="var(--border)"
            strokeOpacity={0.6}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "currentColor" }}
            tickFormatter={(d) => format(parseISO(d), "MMM d")}
            interval={interval}
            axisLine={false}
            tickLine={false}
            dy={4}
            className="text-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelFormatter={(d) => format(parseISO(String(d)), "MMM d, yyyy")}
            formatter={(value: number) => [`${fmtHours(value)}h`, "Approved hours"]}
          />
          <Area
            type="monotone"
            dataKey="hours"
            stroke="var(--club-accent)"
            strokeWidth={2}
            fill="url(#bannerHoursFill)"
            activeDot={{ r: 3.5 }}
            dot={
              // Endpoint marker on the last data point only. Typed loosely —
              // recharts' AreaDot signature wants a ReactElement (not null),
              // but returning null for non-endpoint dots is the documented
              // pattern; the cast keeps tsc happy without changing behavior.
              ((props: { cx?: number; cy?: number; index?: number }) =>
                props.index === lastIndex ? (
                  <circle
                    key={`banner-endpoint-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={3}
                    fill="var(--club-accent)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ) : null) as any
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
