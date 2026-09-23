import type { ReactNode } from "react";

const STATUS_DOT: Record<string, string> = {
  PENDING: "bg-status-pending",
  CONFIRMED: "bg-status-processing",
  PROCESSING: "bg-status-processing",
  READY_TO_SHIP: "bg-status-processing",
  SHIPPED: "bg-status-processing",
  DELIVERED: "bg-status-delivered",
  CANCELLED: "bg-status-cancelled",
  RETURNED: "bg-status-cancelled",
};

export function StatusBadge({ status }: { status: string }) {
  const dot = STATUS_DOT[status] ?? "bg-gray-400";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "warning";
}) {
  const tones: Record<string, string> = {
    default: "bg-black/5 text-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
