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
  PENDING_RETURN: "Pending Return",
  PENDING_CANCEL: "Pending Cancel",
};

export function StatusBadge({ status }: { status: string }) {
  const dot = STATUS_DOT[status] ?? "bg-gray-400";
  const label = STATUS_LABEL[status] ?? status.replaceAll("_", " ");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
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
