import type { ReactNode } from "react";

const STATUS_DOT: Record<string, string> = {
  PENDING: "bg-status-pending",
  CONFIRMED: "bg-status-processing",
  PROCESSING: "bg-status-processing",
  READY_TO_SHIP: "bg-status-processing",
  SHIPPED: "bg-status-processing",
  PARTIAL: "bg-status-pending",
  DELIVERED: "bg-status-delivered",
  PENDING_RETURN: "bg-status-pending",
  RETURNED: "bg-status-cancelled",
  PENDING_CANCEL: "bg-status-pending",
  CANCELLED: "bg-status-cancelled",
  PREORDER: "bg-status-processing",
  LOST: "bg-status-cancelled",
};

// "RTS"/"Pending Return"/etc — short display labels for the reference's
// exact tab wording, distinct from the plain enum-derived fallback used
// everywhere else (Order Detail, dashboard charts).
const STATUS_LABEL: Record<string, string> = {
  READY_TO_SHIP: "RTS",
};

function sentenceCase(value: string): string {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const dot = STATUS_DOT[status] ?? "bg-gray-400";
  const label = STATUS_LABEL[status] ?? sentenceCase(status);
  const size = compact ? "gap-1 px-1.5 py-0.5 text-[10px]" : "gap-1.5 px-2.5 py-1 text-xs";
  const dotSize = compact ? "h-1 w-1" : "h-1.5 w-1.5";
  return (
    <span className={`inline-flex items-center rounded-full bg-black/5 font-[family-name:var(--font-status)] font-medium text-foreground ${size}`}>
      <span className={`rounded-full ${dotSize} ${dot}`} />
      {label}
    </span>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    default: "bg-black/5 text-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-status-cancelled/10 text-status-cancelled",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
