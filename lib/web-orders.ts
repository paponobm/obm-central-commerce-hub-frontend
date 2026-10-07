import type { CustomerResponseStatus, OrderListItem, OrderStatus, PaymentStatus } from "@/lib/types";

// A web order is "complete" when customer and delivery details are filled in
// and it has at least one product.
export function isCompleteWebOrder(o: {
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  items: unknown[];
}): boolean {
  return Boolean(
    o.shippingName?.trim() && o.shippingPhone?.trim() && o.shippingAddress?.trim() && o.items.length > 0,
  );
}

// The one stage a web order is in. Each order sits in exactly one stage, so it
// shows in one Web Orders tab and the order details page can say where it is.
export type WebStage =
  | "incomplete"
  | "processing"
  | "goodNoResponse"
  | "noResponse"
  | "advancePayment"
  | "onHold"
  | "approved"
  | "cancelled";

export const WEB_STAGE_LABELS: Record<WebStage, string> = {
  incomplete: "Incomplete",
  processing: "Processing",
  goodNoResponse: "Good But No Response",
  noResponse: "No Response",
  advancePayment: "Advance Payment",
  onHold: "On Hold",
  approved: "Approved",
  cancelled: "Cancel",
};

// One solid, saturated color per stage — eye-catching on purpose, not a
// pale tint — so the stage badge reads at a glance next to the (always-sky)
// WEB badge.
export const WEB_STAGE_COLORS: Record<WebStage, string> = {
  incomplete: "bg-amber-500 text-white",
  processing: "bg-indigo-600 text-white",
  goodNoResponse: "bg-teal-600 text-white",
  noResponse: "bg-gray-500 text-white",
  advancePayment: "bg-purple-600 text-white",
  onHold: "bg-orange-500 text-white",
  approved: "bg-green-600 text-white",
  cancelled: "bg-red-600 text-white",
};

const APPROVED_STATUSES = new Set<OrderStatus>([
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "PARTIAL",
  "DELIVERED",
  "PENDING_RETURN",
  "RETURNED",
  "LOST",
]);

// Returns null for orders that belong to no web stage (for example, a
// pre-order); they still show under All.
export function webOrderStage(o: {
  isLead?: boolean;
  status: OrderStatus;
  webApproved: boolean;
  customerResponse: CustomerResponseStatus | null;
  paymentStatus: PaymentStatus;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  items: unknown[];
  // Leads only: whether a response has been set from Order actions. Until
  // then the lead stays in Incomplete regardless of its response field.
  hasResponse?: boolean;
  // Leads only: cancelled from Order actions — takes priority over everything else.
  leadCancelled?: boolean;
}): WebStage | null {
  if (o.isLead) {
    if (o.leadCancelled) return "cancelled";
    if (!o.hasResponse) return "incomplete";
    if (o.customerResponse === "ON_HOLD") return "onHold";
    if (o.customerResponse === "ADVANCE_PAYMENT") return "advancePayment";
    if (o.customerResponse === "GOOD_BUT_NO_RESPONSE") return "goodNoResponse";
    if (o.customerResponse === "NO_RESPONSE") return "noResponse";
    return "incomplete";
  }
  if (o.status === "CANCELLED") return "cancelled";
  if (o.webApproved || APPROVED_STATUSES.has(o.status)) return "approved";
  if (o.status !== "PENDING") return null;
  if (!isCompleteWebOrder(o)) return "incomplete";
  if (o.customerResponse === "ON_HOLD") return "onHold";
  // An advance has been received, or the customer has been asked for one.
  if (o.paymentStatus === "PARTIAL" || o.customerResponse === "ADVANCE_PAYMENT") return "advancePayment";
  if (o.customerResponse === "GOOD_BUT_NO_RESPONSE") return "goodNoResponse";
  // Not reached the customer yet; anything the customer has answered
  // (call back, interested, confirmed...) stays in Processing.
  if (o.customerResponse === "NO_RESPONSE") return "noResponse";
  return "processing";
}

export type { OrderListItem };
