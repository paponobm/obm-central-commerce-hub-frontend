"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import type { InventorySummary } from "./types";

// Low Stock + Out of Stock + Expiring Soon/Expired rows, counted at the
// same row granularity the All Stock page itself shows
// (expandVariants) — so, e.g., a 3-variant product with 2 variants running
// low counts as 2, matching what the admin actually sees when they click in.
// A handful of pages dispatch this event for an instant update right after
// their own change; everything else (publishing a product, auto-save,
// duplicating, deleting — anywhere that isn't the Inventory page itself)
// has no such wiring and would otherwise leave this badge stale until a
// full page reload, so it's also polled on a short timer as the real
// "make this actually live" fix rather than chasing every mutation site.
const REFRESH_EVENT = "inventory-alert:refresh";
const POLL_INTERVAL_MS = 10_000;

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
            return r.availableStock <= r.lowStockThreshold || isExpiryAlert(r);
          }).length;
          setCount(n);
        })
        .catch(() => {
          if (!cancelled) setCount(null);
        });
    }
    refresh();
    window.addEventListener(REFRESH_EVENT, refresh);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(REFRESH_EVENT, refresh);
      clearInterval(interval);
    };
  }, [enabled]);

  return count;
}
