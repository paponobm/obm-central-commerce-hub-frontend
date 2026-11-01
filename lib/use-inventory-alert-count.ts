"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import type { InventorySummary } from "./types";

// Low Stock + Out of Stock, active products only — same bucketing the
// Inventory page itself uses (InventoryList's stockBucket: "out" when
// availableStock <= 0, "low" when availableStock <= lowStockThreshold).
// Since lowStockThreshold is never negative, "out" is always a subset of
// "availableStock <= lowStockThreshold", so the two buckets collapse into
// this one comparison.
// Pages that change stock, thresholds, or a product's active flag dispatch
// this event (window-level, no shared store needed) so the sidebar badge —
// which fetched once on mount and otherwise has no way to know — updates
// immediately instead of only after a full page reload.
const REFRESH_EVENT = "inventory-alert:refresh";

export function useInventoryAlertCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    let cancelled = false;
    function refresh() {
      api
        .get<InventorySummary[]>("/admin/inventory")
        .then((rows) => {
          if (cancelled) return;
          const n = rows.filter((r) => r.isActive && r.availableStock <= r.lowStockThreshold).length;
          setCount(n);
        })
        .catch(() => {
          if (!cancelled) setCount(null);
        });
    }
    refresh();
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(REFRESH_EVENT, refresh);
    };
  }, [enabled]);

  return count;
}
