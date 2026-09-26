"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { DashboardData } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { StackedBarChart } from "@/components/ui/stacked-bar-chart";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="text-sm text-foreground/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-foreground/50">{hint}</div>}
    </Card>
  );
}

export default function DashboardPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    const qs = activeChannelId ? `?channelId=${activeChannelId}` : "";
    api
      .get<DashboardData>(`/admin/reports/dashboard${qs}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, [activeChannelId]);

  if (error) {
    return <p className="text-sm text-status-cancelled">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }

  const pending = data.ordersByStatus.PENDING ?? 0;

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
        <StatCard label="Today's Orders" value={String(data.today.orderCount)} />
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

      <div className="mt-6">
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

      </div>

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
            }))}
          />
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
