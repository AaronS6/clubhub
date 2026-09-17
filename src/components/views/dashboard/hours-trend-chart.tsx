"use client"

/**
 * HoursTrendChart — extracted into its own file so recharts (a heavy dep) can
 * be lazy-loaded via next/dynamic({ ssr: false }) in dashboard-view.tsx.
 * See §5 of the R10 perf pass.
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

export type HoursTrendPoint = { date: string; hours: number }

export function HoursTrendChart({ data }: { data: HoursTrendPoint[] }) {
  return (
    <div className="h-56 w-full min-w-0" aria-label="Approved hours trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--club-accent)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--club-accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "currentColor" }}
            tickFormatter={(d) => format(parseISO(d), "MMM d")}
            interval={Math.floor(data.length / 6)}
            axisLine={false}
            tickLine={false}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "currentColor" }}
            allowDecimals={false}
            width={32}
            axisLine={false}
            tickLine={false}
            className="text-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border, 220 13% 91%))",
              background: "hsl(var(--popover, 0 0% 100%))",
              color: "hsl(var(--popover-foreground, 0 0% 0%))",
              fontSize: 12,
            }}
            labelFormatter={(d) => format(parseISO(String(d)), "MMM d, yyyy")}
            formatter={(value: number) => [`${fmtHours(value)}h`, "Approved hours"]}
          />
          <Area type="monotone" dataKey="hours" stroke="var(--club-accent)" strokeWidth={2} fill="url(#hoursGradient)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
