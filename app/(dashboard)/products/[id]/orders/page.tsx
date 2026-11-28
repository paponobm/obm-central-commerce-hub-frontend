"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem, ProductActivityPage, ProductAnalytics } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

export default function ProductDetailsTab() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  // Performance — Orders/Returns from this product's real order history;
  // Page views/Conversion from AnalyticsEvent (see the Analytics nav page
  // for the cross-product version of the same data).
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [activity, setActivity] = useState<ProductActivityPage | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    api
      .get<OrderListItem[]>(`/admin/orders?productId=${productId}`)
      .then(setOrders)
      .catch((err) => setOrdersError(err instanceof ApiError ? err.message : "Failed to load orders"));
  }, [productId]);

  useEffect(() => {
    api
      .get<ProductAnalytics>(`/admin/products/${productId}/analytics`)
      .then(setAnalytics)
      .catch((err) => setAnalyticsError(err instanceof ApiError ? err.message : "Failed to load analytics"));
  }, [productId]);

  useEffect(() => {
    api
      .get<ProductActivityPage>(
        `/admin/products/${productId}/activity?page=${activityPage}&pageSize=${activityPageSize}`,
      )
      .then(setActivity)
      .catch((err) => setActivityError(err instanceof ApiError ? err.message : "Failed to load activity"));
  }, [productId, activityPage, activityPageSize]);

  useEffect(() => {
    setActivityPage(1);
  }, [activityPageSize]);

  const totalOrders = orders?.length ?? 0;
  const byChannel = orders
    ? Object.entries(
        orders.reduce<Record<string, number>>((acc, o) => {
          const name = o.channel?.name ?? "Manual / Direct";
          acc[name] = (acc[name] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1])
    : [];
  const returnedCount = orders?.filter((o) => o.status === "RETURNED").length ?? 0;
  const returnPct = totalOrders > 0 ? ((returnedCount / totalOrders) * 100).toFixed(1) : null;
  // Same range the Page views card itself shows (trailing 30 days) — orders
  // outside that window aren't counted here, so this stays "orders per
  // view, this range" rather than silently mixing two different periods.
  const conversionPct =
    analytics && orders && analytics.totalViews > 0
      ? (
          (orders.filter((o) => new Date(o.createdAt) >= new Date(analytics.range.from)).length /
            analytics.totalViews) *
          100
        ).toFixed(1)
      : null;

  const activityTotalPages = Math.max(1, Math.ceil((activity?.total ?? 0) / activityPageSize));

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-bold text-primary">Performance</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-black/10 p-4">
            <div className="text-sm text-foreground/50">Page views</div>
            {analyticsError ? (
              <div className="mt-2 text-sm text-status-cancelled">{analyticsError}</div>
            ) : analytics === null ? (
              <div className="mt-2 text-2xl font-bold text-foreground">—</div>
            ) : (
              <>
                <div className="mt-2 text-2xl font-bold text-foreground">{analytics.totalViews}</div>
                <div className="mt-1 text-xs text-foreground/50">{analytics.uniqueVisitors} unique visitors</div>
              </>
            )}
          </div>
          <div className="rounded-xl border border-black/10 p-4">
            <div className="text-sm text-foreground/50">Orders</div>
            {ordersError ? (
              <div className="mt-2 text-sm text-status-cancelled">{ordersError}</div>
            ) : orders === null ? (
              <div className="mt-2 text-2xl font-bold text-foreground">—</div>
            ) : (
              <>
                <div className="mt-2 text-2xl font-bold text-foreground">{totalOrders}</div>
                {byChannel.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {byChannel.map(([name, count]) => (
                      <div key={name} className="flex justify-between text-xs text-foreground/60">
                        <span>{name}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="rounded-xl border border-black/10 p-4">
            <div className="text-sm text-foreground/50">Conversion</div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {conversionPct !== null ? `${conversionPct}%` : "—"}
            </div>
            <div className="mt-1 text-xs text-foreground/50">orders ÷ page views</div>
          </div>
          <div className="rounded-xl border border-black/10 p-4">
            <div className="text-sm text-foreground/50">Returns</div>
            {orders === null ? (
              <div className="mt-2 text-2xl font-bold text-foreground">—</div>
            ) : (
              <>
                <div className="mt-2 text-2xl font-bold text-foreground">{returnedCount}</div>
                {returnPct !== null && (
                  <div className="mt-1 text-xs text-foreground/50">{returnPct}% of orders</div>
                )}
              </>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-foreground/40">Page views &amp; conversion: trailing 30 days.</p>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-bold text-primary">Activity Log</h2>
        {activityError ? (
          <p className="text-base text-status-cancelled">{activityError}</p>
        ) : activity === null ? (
          <LoadingLine className="text-base text-foreground/60" />
        ) : (
          <>
            <div className="divide-y divide-black/5">
              {activity.items.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {(entry.actorRole ?? entry.actorName).charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-base text-foreground">
                      {entry.actorRole && <span className="font-bold">[{entry.actorRole}] </span>}
                      {entry.message}
                    </p>
                    <p className="text-sm text-foreground/50">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
              {activity.items.length === 0 && (
                <p className="py-6 text-center text-base text-foreground/50">No activity recorded yet.</p>
              )}
            </div>
            {activity.total > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-base">
                <span className="font-bold text-primary">
                  Showing {(activityPage - 1) * activityPageSize + 1}–
                  {Math.min(activityPage * activityPageSize, activity.total)} of {activity.total}
                </span>
                <div className="flex items-center gap-2">
                  <Select
                    className="w-auto !text-base font-bold !text-primary"
                    value={activityPageSize}
                    onChange={(e) => setActivityPageSize(Number(e.target.value))}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-base !font-bold !text-primary"
                    disabled={activityPage <= 1}
                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="font-bold text-primary">
                    Page {activityPage} of {activityTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-base !font-bold !text-primary"
                    disabled={activityPage >= activityTotalPages}
                    onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
