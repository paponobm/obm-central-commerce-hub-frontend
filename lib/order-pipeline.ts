import type { OrderStatus } from "@/lib/types";

// Shared between New Order's Preorder panel and the Edit page's own —
// same starting set either place offers.
export const PREORDER_REASONS = ["Out of Stock", "Upcoming Launch", "Custom Order", "Other"];

// The earliest selectable Notification Date — tomorrow, Asia/Dhaka. The
// backend's auto-conversion cron only ever fires at Dhaka midnight (see
// OrdersService's processDuePreorders), so a date of today or earlier
// would either convert the order immediately or never really count as
// "notify later" — not a real preorder window.
export function minPreorderNotifyAt(): string {
  const todayDhaka = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = todayDhaka.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${tomorrow.getUTCFullYear()}-${pad(tomorrow.getUTCMonth() + 1)}-${pad(tomorrow.getUTCDate())}T00:00`;
}

// Mirrors OrdersService's TRANSITIONS map — which statuses can still reach
// CANCELLED, i.e. when the row-level Cancel shortcut should even appear.
export const CAN_CANCEL_FROM = new Set<OrderStatus>([
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "PENDING_CANCEL",
  "PREORDER",
]);

// The plain fulfillment pipeline. Bulk/scan status moves only ever step to
// an order's own immediate neighbor here — never jump ahead or behind
// several stages at once, in either direction.
const PIPELINE: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED"];
export const PIPELINE_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY_TO_SHIP: "RTS",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  PENDING_RETURN: "Pending Return",
  RETURNED: "Returned",
};

// The steps to walk for the "move forward" action. Every stage steps to
// just its immediate neighbor — except PENDING, which goes straight to RTS:
// Confirmed and Processing have no tab/scan-mode of their own to stop at,
// so there's nothing there for a single action to land on. An order already
// sitting in Confirmed or Processing (reached some other way) still only
// moves one step at a time from there. SHIPPED's own next neighbor is
// DELIVERED — mirrors OrdersService's TRANSITIONS map, which allows it
// directly (no stock effect either way; see deductOnShip's comment).
// PENDING_RETURN's own next neighbor is RETURNED — the parcel is
// confirmed physically back, so this restocks (see restockOnReturn);
// mirrors pathToReturned's own PENDING_RETURN case.
export function nextPathInPipeline(status: OrderStatus): OrderStatus[] | null {
  if (status === "PENDING") return ["CONFIRMED", "PROCESSING", "READY_TO_SHIP"];
  if (status === "SHIPPED") return ["DELIVERED"];
  if (status === "PENDING_RETURN") return ["RETURNED"];
  const i = PIPELINE.indexOf(status);
  return i >= 0 && i < PIPELINE.length - 1 ? [PIPELINE[i + 1]] : null;
}

export function prevInPipeline(status: OrderStatus): OrderStatus | null {
  // Mirrors nextPathInPipeline's own PENDING -> RTS shortcut in reverse —
  // RTS steps straight back to PENDING, not PROCESSING, since neither
  // CONFIRMED nor PROCESSING has a tab to land on.
  if (status === "READY_TO_SHIP") return "PENDING";
  // SHIPPED steps straight back to PENDING, not RTS — mirrors
  // OrdersService's TRANSITIONS map, which only allows reversing a real
  // shipment that far (restocking the same way as an rts_reversal; see
  // updateStatus's shipped_reversal branch), not back to RTS itself.
  if (status === "SHIPPED") return "PENDING";
  const i = PIPELINE.indexOf(status);
  return i > 0 ? PIPELINE[i - 1] : null;
}

// A SHIPPED/PARTIAL/DELIVERED order can be marked as entering a return —
// landing at PENDING_RETURN itself, one step, not walking the rest of the
// way to RETURNED (that's always a separate, deliberate confirmation once
// the parcel is physically back — see pathToReturned/restockOnReturn).
export function canMoveToPendingReturn(status: OrderStatus): boolean {
  return status === "SHIPPED" || status === "PARTIAL" || status === "DELIVERED";
}

// The steps to walk to RETURNED — the manual "parcel is physically back in
// hand" confirmation (see webhooks.service.ts on the backend: the Steadfast
// webhook only ever auto-advances a cancelled delivery to PENDING_RETURN,
// deliberately leaving the final RETURNED/restock step as a manual action).
// Mirrors OrdersService's TRANSITIONS map: PARTIAL, DELIVERED and
// PENDING_RETURN can all reach RETURNED directly; SHIPPED has to pass
// through PENDING_RETURN first.
export function pathToReturned(status: OrderStatus): OrderStatus[] | null {
  if (status === "SHIPPED") return ["PENDING_RETURN", "RETURNED"];
  if (status === "PARTIAL" || status === "DELIVERED" || status === "PENDING_RETURN") {
    return ["RETURNED"];
  }
  return null;
}
