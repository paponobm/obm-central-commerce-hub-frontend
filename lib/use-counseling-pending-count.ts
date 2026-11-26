"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import type { CallRequest } from "./types";

// Same polling + event hybrid as useInventoryAlertCount — the Counseling
// page itself dispatches this event right after marking one Solved for an
// instant update, while the short poll is what keeps the badge live for
// everything else (a new request coming in from any storefront).
const REFRESH_EVENT = "counseling:refresh";
const POLL_INTERVAL_MS = 10_000;

export function useCounselingPendingCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    let cancelled = false;
    function refresh() {
      api
        .get<CallRequest[]>("/admin/call-requests?status=PENDING")
        .then((rows) => {
          if (cancelled) return;
          setCount(rows.length);
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
