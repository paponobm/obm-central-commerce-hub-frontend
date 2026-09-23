"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type {
  Channel,
  OrderListItem,
  OrderStatus,
  OrderSource,
  PaymentStatus,
} from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StatusBadge, Pill } from "@/components/ui/badge";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
];
const SOURCES: OrderSource[] = ["WEBSITE", "MANUAL", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER"];
const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"];

export default function OrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [channelId, setChannelId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  async function loadOrders() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    if (channelId) params.set("channelId", channelId);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    const qs = params.toString();
    try {
      const data = await api.get<OrderListItem[]>(`/admin/orders${qs ? `?${qs}` : ""}`);
      setOrders(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load orders");
    }
  }

  useEffect(() => {
    api.get<Channel[]>("/admin/channels?includeInactive=true").then(setChannels).catch(() => {});
  }, []);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, source, channelId, paymentStatus]);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order, from every storefront and every manual channel, in one place."
        actions={
          <Button variant="primary" onClick={() => router.push("/orders/new")}>
            New Order
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">All payments</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}

        {!orders ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-foreground/50">No orders match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Order</th>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">Channel</th>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Payment</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
                  onClick={() => router.push(`/orders/${o.id}`)}
                >
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{o.orderNumber}</div>
                    <div className="text-xs text-foreground/50">{formatDateTime(o.createdAt)}</div>
                  </td>
                  <td className="py-2.5 text-foreground/70">
                    {o.customer.name}
                    <div className="text-xs text-foreground/50">{o.customer.phone}</div>
                  </td>
                  <td className="py-2.5 text-foreground/60">
                    {o.channel?.name ?? "No channel (manual)"}
                  </td>
                  <td className="py-2.5 text-foreground/60">{o.source}</td>
                  <td className="py-2.5">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-2.5">
                    <Pill tone={o.paymentStatus === "PAID" ? "primary" : "default"}>
                      {o.paymentStatus}
                    </Pill>
                  </td>
                  <td className="py-2.5 text-right font-medium text-foreground">
                    {money(o.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
