/**
 * §40 — Reusable status pill component.
 *
 * A small, dot-led status indicator that uses the semantic status-color
 * tokens (status-pending / status-approved / status-rejected /
 * status-progress) defined in globals.css. Reads cleanly in tables,
 * cards, lists, and badges.
 *
 * Status mapping:
 *   pending      → Pending  (amber)
 *   approved     → Approved (emerald)
 *   rejected     → Rejected (red)
 *   not_started  → Not started (amber, same as pending)
 *   in_progress  → In progress (sky)
 *   done         → Done (emerald, same as approved)
 */
export type StatusPillKind =
  | "pending"
  | "approved"
  | "rejected"
  | "not_started"
  | "in_progress"
  | "done"

const config: Record<
  StatusPillKind,
  { label: string; dot: string; text: string; bg: string }
> = {
  pending: {
    label: "Pending",
    dot: "bg-status-pending",
    text: "text-status-pending-fg",
    bg: "bg-status-pending/10",
  },
  approved: {
    label: "Approved",
    dot: "bg-status-approved",
    text: "text-status-approved-fg",
    bg: "bg-status-approved/10",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-status-rejected",
    text: "text-status-rejected-fg",
    bg: "bg-status-rejected/10",
  },
  not_started: {
    label: "Not started",
    dot: "bg-status-pending",
    text: "text-status-pending-fg",
    bg: "bg-status-pending/10",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-status-progress",
    text: "text-status-progress-fg",
    bg: "bg-status-progress/10",
  },
  done: {
    label: "Done",
    dot: "bg-status-approved",
    text: "text-status-approved-fg",
    bg: "bg-status-approved/10",
  },
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: StatusPillKind
  label?: string
  className?: string
}) {
  const c = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} px-2.5 py-0.5 text-xs font-medium ${c.text}${className ? ` ${className}` : ""}`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {label ?? c.label}
    </span>
  )
}
