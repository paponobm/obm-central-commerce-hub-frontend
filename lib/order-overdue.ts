// Shared by the Orders list (Overdue tab) and the order Edit page (Shipped
// Action card) — a SHIPPED order counts as overdue once it's sat there this
// long without a real status change (by hand, or Steadfast's webhook
// auto-syncing an actual delivery). This is purely a filtered view, never a
// stored status: the moment the real status changes, an order stops
// matching and leaves Overdue immediately.
export const OVERDUE_AFTER_MS = 72 * 60 * 60 * 1000;

export function isOverdueShipped(o: { status: string; statusEnteredAt: string }): boolean {
  return o.status === "SHIPPED" && Date.now() - new Date(o.statusEnteredAt).getTime() > OVERDUE_AFTER_MS;
}
