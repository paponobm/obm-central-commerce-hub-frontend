"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import type { InventorySummary } from "./types";

// Low Stock + Expiring Soon/Expired rows — Out of Stock is deliberately left
// out (it already has its own "Out of Stock" summary card/filter; this badge
// is for "still sellable but needs attention soon", not "already at zero").
// Counted at the same row granularity the All Stock page itself shows
// (expandVariants) — so, e.g., a 3-variant product with 2 variants running
// low counts as 2, matching what the admin actually sees when they click in.
// Pages that change stock, thresholds, or a product's active flag dispatch
// this event (window-level, no shared store needed) so the sidebar badge —
// which fetched once on mount and otherwise has no way to know — updates
// immediately instead of only after a full page reload.
const REFRESH_EVENT = "inventory-alert:refresh";

function isExpiryAlert(r: Pick<InventorySummary, "expiryDate" | "expiryAlertDays">): boolean {
  if (!r.expiryDate) return false;
  const now = Date.now();
  const expiry = new Date(r.expiryDate).getTime();
  if (expiry < now) return true;
  return !!r.expiryAlertDays && expiry - now <= r.expiryAlertDays * 24 * 60 * 60 * 1000;
}

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
        .get<InventorySummary[]>("/admin/inventory?expandVariants=true")
        .then((rows) => {
          if (cancelled) return;
          const n = rows.filter((r) => {
            if (!r.isActive) return false;
            const isLowNotOut = r.availableStock > 0 && r.availableStock <= r.lowStockThreshold;
            return isLowNotOut || isExpiryAlert(r);
          }).length;
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
