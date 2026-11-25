import type { OrderItem } from "./types";

// Same product at the same unit price is one line to a user, even when the
// backend holds it as two rows — e.g. an "original" row plus a later
// "suggested" quantity bump (see OrderItem.isSuggested, split out by
// OrdersService.updateOrder). Merges them back into one row for any
// read-only display of an order's items; never used to decide what gets
// submitted back to the backend, which keeps editing its own one-row-per-
// product model.
export function mergeOrderItemsByProduct(items: OrderItem[]): OrderItem[] {
  const merged: OrderItem[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    const key = `${item.productId}:${item.unitPrice}`;
    const i = indexByKey.get(key);
    if (i === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...item });
    } else {
      merged[i].quantity += item.quantity;
      merged[i].discount = String(Number(merged[i].discount || 0) + Number(item.discount || 0));
      merged[i].total = String(Number(merged[i].total || 0) + Number(item.total || 0));
    }
  }
  return merged;
}
