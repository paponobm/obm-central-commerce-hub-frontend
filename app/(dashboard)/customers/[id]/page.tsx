"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerDetail } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/phone";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-sm text-foreground/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CustomerDetail>(`/admin/customers/${params.id}`)
      .then(setCustomer)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load customer"));
  }, [params.id]);

  if (error) return <p className="text-sm text-status-cancelled">{error}</p>;
  if (!customer) return <p className="text-sm text-foreground/60">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDateTime(customer.createdAt)}`}
        actions={
          <Button variant="secondary" onClick={() => router.push("/customers")}>
            Back to Customers
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total Orders" value={String(customer.stats.totalOrders)} />
        <Stat label="Total Spent" value={money(customer.stats.totalSpent)} />
        <Stat
          label="Last Order"
          value={customer.stats.lastOrderAt ? formatDateTime(customer.stats.lastOrderAt) : "—"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Order History</h2>
          {customer.orders.length === 0 ? (
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
                {customer.orders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
                    onClick={() => router.push(`/orders/${o.id}`)}
                  >
                    <td className="py-2.5">
                      <div className="font-medium text-foreground">{o.orderNumber}</div>
                      <div className="text-xs text-foreground/50">{formatDateTime(o.createdAt)}</div>
                    </td>
                    <td className="py-2.5 text-foreground/60">{o.channelName}</td>
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

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Contact</h2>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-foreground/70">
                <a href={telHref(customer.phone)} title="Call" className="hover:text-primary">
                  📞
                </a>
                <a
                  href={whatsappHref(customer.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp"
                >
                  💬
                </a>
                {customer.phone}
              </div>
              {customer.email && <div className="text-foreground/60">{customer.email}</div>}
              {(customer.address || customer.city) && (
                <div className="text-foreground/60">
                  {[customer.address, customer.city].filter(Boolean).join(", ")}
                </div>
              )}
              {customer.notes && (
                <p className="mt-2 rounded-lg bg-black/5 px-3 py-2 text-foreground/70">{customer.notes}</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Orders by Store</h2>
            <div className="space-y-3">
              {customer.ordersByChannel.length === 0 && (
                <p className="text-sm text-foreground/50">No orders yet.</p>
              )}
              {customer.ordersByChannel.map((c) => (
                <div key={c.channelId ?? "none"} className="flex items-center justify-between text-sm">
                  <span className="text-foreground/70">{c.channelName}</span>
                  <span className="font-medium text-foreground">
                    {c.orderCount} · {money(c.totalSpent)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
