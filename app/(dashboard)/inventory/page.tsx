"use client";

import { InventoryList } from "@/components/inventory/inventory-list";

export default function InventoryPage() {
  return (
    <InventoryList
      title="Inventory"
      description="Current, reserved, and available stock for every product."
      lowStockOnly={false}
    />
  );
}
