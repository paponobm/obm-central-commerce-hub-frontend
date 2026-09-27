"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { DashboardData, TopProduct } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { StackedBarChart } from "@/components/ui/stacked-bar-chart";
import { BarTrendChart } from "@/components/ui/bar-trend-chart";

function shortDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  // Signed percent vs a named prior period — direction picks the color,
  // matching the skill's stat-tile delta spec (color = direction, since up
  // is "good" for every metric shown here).
  delta?: { pct: number; against: string };
}) {
  return (
    <Card>
      <div className="text-sm text-foreground/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {delta && (
        <div
          className={`mt-1 text-xs font-medium ${
            delta.pct >= 0 ? "text-status-delivered" : "text-status-cancelled"
          }`}
        >
          {delta.pct >= 0 ? "↑" : "↓"} {Math.abs(delta.pct).toFixed(1)}%
          <span className="ml-1 font-normal text-foreground/40">vs {delta.against}</span>
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-foreground/50">{hint}</div>}
    </Card>
  );
}

export default function DashboardPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
  const [data, setData] = useState<DashboardData | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setTopProducts(null);
    const qs = activeChannelId ? `?channelId=${activeChannelId}` : "";
    api
      .get<DashboardData>(`/admin/reports/dashboard${qs}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
    api
      .get<{ products: TopProduct[] }>(`/admin/reports/top-products?limit=5${qs ? `&${qs.slice(1)}` : ""}`)
      .then((r) => setTopProducts(r.products))
      .catch(() => setTopProducts([]));
  }, [activeChannelId]);

  if (error) {
    return <p className="text-sm text-status-cancelled">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }

  const pending = data.ordersByStatus.PENDING ?? 0;

  const yesterday = data.salesLast7Days.at(-2)?.orderCount ?? 0;
  const orderDelta =
    yesterday > 0
      ? { pct: ((data.today.orderCount - yesterday) / yesterday) * 100, against: "yesterday" }
      : undefined;

  const maxRevenue = Math.max(1, ...(topProducts ?? []).map((p) => p.revenue));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          activeChannel
            ? `Here's what's happening at ${activeChannel.name} today.`
            : "Here's what's happening across every storefront today."
        }
      />

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${activeChannel ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        <StatCard label="Today's Orders" value={String(data.today.orderCount)} delta={orderDelta} />
        <StatCard label="Today's Sales" value={money(data.today.salesTotal)} />
        <StatCard label="Pending Orders" value={String(pending)} />
        {!activeChannel && (
          <StatCard
            label="Low Stock Products"
            value={String(data.lowStock.count)}
            hint={data.lowStock.count > 0 ? "Needs attention" : undefined}
          />
        )}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-foreground">
        {activeChannel ? "This store" : "Stores"}
      </h2>
      {data.ordersByChannel.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground/50">No orders yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.ordersByChannel.map((c) => (
            <Card key={c.channelId ?? "none"}>
              <div className="truncate text-sm text-foreground/60">{c.channelName}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{money(c.salesTotal)}</div>
              <div className="mt-1 text-xs text-foreground/50">
                {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Orders by Status</h2>
          <StackedBarChart
            segments={Object.entries(data.ordersByStatus).map(([status, count]) => ({
              label: status.replaceAll("_", " "),
              value: count,
            }))}
          />
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Orders by Source</h2>
          <StackedBarChart
            segments={data.ordersBySource.map((s) => ({
              label: s.source,
              value: s.orderCount,
              secondaryLabel: money(s.salesTotal),
            }))}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-foreground">Order Counts</h2>
        <p className="mb-4 text-xs text-foreground/50">Orders created over the last 7 days</p>
        <BarTrendChart
          points={data.salesLast7Days.map((d) => ({
            label: shortDay(d.date),
            value: d.orderCount,
          }))}
        />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Orders</h2>
            <Link href="/orders" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-foreground/50">No orders yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                  <th className="pb-2 font-medium">Order</th>
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-black/5 last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium text-foreground">{o.orderNumber}</div>
                      <div className="text-xs text-foreground/50">{formatDateTime(o.createdAt)}</div>
                    </td>
                    <td className="py-2.5 text-foreground/70">{o.channelName}</td>
                    <td className="py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-2.5 text-right font-medium">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Top Selling Products</h2>
          {!topProducts ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : topProducts.length === 0 ? (
            <p className="text-sm text-foreground/50">No sales in the last 30 days.</p>
          ) : (
            <div className="space-y-4">
              {topProducts.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs font-medium text-foreground/40">{i + 1}</span>
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image, not part of the Next.js image pipeline
                    <img src={p.image} alt={p.name} className="h-9 w-9 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-medium text-foreground/40">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-foreground">{p.quantitySold}</div>
                    <div className="text-xs text-foreground/40">{money(p.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {!activeChannel && data.lowStock.products.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Low Stock Products</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium text-right">Available</th>
                <th className="pb-2 font-medium text-right">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.products.map((p) => (
                <tr key={p.productId} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-foreground/50">{p.sku}</div>
                  </td>
                  <td className="py-2.5 text-right text-status-cancelled">{p.availableStock}</td>
                  <td className="py-2.5 text-right text-foreground/50">{p.lowStockThreshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

