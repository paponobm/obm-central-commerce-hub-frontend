import { api, ApiError } from "./api-client";
import type { OrderLockHolder } from "./types";

// Kept well inside the backend's 30s staleness window (order-locks.service.ts)
// so a lock never expires out from under an admin who still has the page open.
export const HEARTBEAT_INTERVAL_MS = 10_000;

export async function listOrderLocks(): Promise<{ orderId: string; holder: OrderLockHolder }[]> {
  return api.get<{ orderId: string; holder: OrderLockHolder }[]>("/admin/order-locks");
}

// Throws an ApiError with status 409 and `{ holder }` on its body when
// someone else already has the order open — the detail page catches that
// to show the Access Restricted panel.
export async function acquireOrderLock(orderId: string, force = false): Promise<{ holder: OrderLockHolder }> {
  return api.post<{ holder: OrderLockHolder }>(`/admin/order-locks/${orderId}/acquire`, force ? { force: true } : undefined);
}

export async function heartbeatOrderLock(orderId: string): Promise<{ ok: boolean; holder: OrderLockHolder | null }> {
  return api.post<{ ok: boolean; holder: OrderLockHolder | null }>(`/admin/order-locks/${orderId}/heartbeat`);
}

export async function releaseOrderLock(orderId: string): Promise<void> {
  await api.delete(`/admin/order-locks/${orderId}`);
}

export function lockHolderFromError(err: unknown): OrderLockHolder | null {
  if (err instanceof ApiError && err.status === 409) {
    const holder = (err.body as { holder?: OrderLockHolder })?.holder;
    if (holder) return holder;
  }
  return null;
}
