import type { OrderStatus } from "@/lib/types";

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
};

// The steps to walk for the "move forward" action. Every stage steps to
// just its immediate neighbor — except PENDING, which goes straight to RTS:
// Confirmed and Processing have no tab/scan-mode of their own to stop at,
// so there's nothing there for a single action to land on. An order already
// sitting in Confirmed or Processing (reached some other way) still only
// moves one step at a time from there.
export function nextPathInPipeline(status: OrderStatus): OrderStatus[] | null {
  if (status === "PENDING") return ["CONFIRMED", "PROCESSING", "READY_TO_SHIP"];
  const i = PIPELINE.indexOf(status);
  return i >= 0 && i < PIPELINE.length - 1 ? [PIPELINE[i + 1]] : null;
}

export function prevInPipeline(status: OrderStatus): OrderStatus | null {
  // Mirrors nextPathInPipeline's own PENDING -> RTS shortcut in reverse —
  // RTS steps straight back to PENDING, not PROCESSING, since neither
  // CONFIRMED nor PROCESSING has a tab to land on.
  if (status === "READY_TO_SHIP") return "PENDING";
  const i = PIPELINE.indexOf(status);
  return i > 0 ? PIPELINE[i - 1] : null;
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
