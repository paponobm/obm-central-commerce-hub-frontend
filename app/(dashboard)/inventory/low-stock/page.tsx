"use client";

import { InventoryList } from "@/components/inventory/inventory-list";

export default function LowStockPage() {
  return (
    <InventoryList
      title="Low Stock"
      description="Products at or below their low-stock threshold."
      lowStockOnly
    />
  );
}
