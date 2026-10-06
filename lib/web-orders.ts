import type { OrderListItem } from "@/lib/types";

// A web order is "complete" when customer and delivery details are filled in
// and it has at least one product. Only complete pending web orders are in the
// Processing tab; the rest wait in Incomplete until the details are added.
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

export type { OrderListItem };
