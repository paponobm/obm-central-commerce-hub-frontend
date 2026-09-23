"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { OrderDetail, OrderStatus } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { StatusBadge, Pill } from "@/components/ui/badge";

// Mirrors OrdersService's TRANSITIONS map — server enforces this
// regardless, but showing only valid next steps here avoids a round trip
// just to be told "no."
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nextStatus, setNextStatus] = useState("");
  const [returnAction, setReturnAction] = useState<"restock" | "write_off">("restock");
  const [note, setNote] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  async function loadOrder() {
    try {
      const data = await api.get<OrderDetail>(`/admin/orders/${orderId}`);
      setOrder(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load order");
    }
  }

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleTransition(e: FormEvent) {
    e.preventDefault();
    if (!nextStatus) return;
    setTransitionError(null);
    setTransitioning(true);
    try {
      await api.patch(`/admin/orders/${orderId}/status`, {
        status: nextStatus,
        note: note || undefined,
        ...(nextStatus === "RETURNED" ? { returnAction } : {}),
      });
      setNextStatus("");
      setNote("");
      await loadOrder();
    } catch (err) {
      setTransitionError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setTransitioning(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-status-cancelled">{loadError}</p>;
  }
  if (!order) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }

  const validNextStatuses = TRANSITIONS[order.status];

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={formatDateTime(order.createdAt)}
        actions={
          <Button variant="secondary" onClick={() => router.push("/orders")}>
            Back to Orders
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <Pill tone={order.paymentStatus === "PAID" ? "primary" : "default"}>
          Payment: {order.paymentStatus}
        </Pill>
        <Pill>Shipment: {order.shipmentStatus.replaceAll("_", " ")}</Pill>
        <Pill>{order.source}</Pill>
        {order.channel && <Pill>{order.channel.name}</Pill>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Unit Price</th>
                <th className="pb-2 font-medium text-right">Discount</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{item.productName}</div>
                    <div className="text-xs text-foreground/50">{item.sku}</div>
                  </td>
                  <td className="py-2.5 text-right">{item.quantity}</td>
                  <td className="py-2.5 text-right">{money(item.unitPrice)}</td>
                  <td className="py-2.5 text-right">{money(item.discount)}</td>
                  <td className="py-2.5 text-right font-medium text-foreground">
                    {money(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground/60">Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/60">Discount</span>
              <span>-{money(order.discount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground/60">Shipping</span>
              <span>{money(order.shippingFee)}</span>
            </div>
            <div className="flex justify-between border-t border-black/5 pt-1 font-semibold text-foreground">
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
          </div>

          {order.notes && (
            <p className="mt-4 rounded-lg bg-black/5 px-3 py-2 text-sm text-foreground/70">
              Note: {order.notes}
            </p>
          )}

          <h2 className="mb-3 mt-6 text-sm font-semibold text-foreground">Status History</h2>
          <div className="space-y-2">
            {order.statusHistory.map((h) => (
              <div key={h.id} className="flex items-start justify-between text-sm">
                <div>
                  <span className="font-medium text-foreground">
                    {h.fromStatus ? `${h.fromStatus.replaceAll("_", " ")} → ` : ""}
                    {h.toStatus.replaceAll("_", " ")}
                  </span>
                  {h.note && <div className="text-xs text-foreground/50">{h.note}</div>}
                </div>
                <span className="whitespace-nowrap text-xs text-foreground/50">
                  {formatDateTime(h.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Customer</h2>
            <div className="space-y-1 text-sm">
              <div className="font-medium text-foreground">{order.customer.name}</div>
              <div className="text-foreground/60">{order.customer.phone}</div>
              {order.customer.email && (
                <div className="text-foreground/60">{order.customer.email}</div>
              )}
            </div>
            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-foreground/40">
              Shipping To
            </h3>
            <div className="space-y-1 text-sm text-foreground/70">
              <div>{order.shippingName}</div>
              <div>{order.shippingPhone}</div>
              <div>{order.shippingAddress}</div>
            </div>
          </Card>

          {order.payments.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Payments</h2>
              <div className="space-y-2 text-sm">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-foreground/60">{p.method}</span>
                    <span className="font-medium text-foreground">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Update Status</h2>
            {validNextStatuses.length === 0 ? (
              <p className="text-sm text-foreground/50">
                This order is in a final state — no further transitions possible.
              </p>
            ) : (
              <form onSubmit={handleTransition} className="space-y-3">
                <div>
                  <Label>New Status</Label>
                  <Select
                    required
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {validNextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </div>

                {nextStatus === "RETURNED" && (
                  <div>
                    <Label>Return Action</Label>
                    <Select
                      value={returnAction}
                      onChange={(e) =>
                        setReturnAction(e.target.value as "restock" | "write_off")
                      }
                    >
                      <option value="restock">Restock (goods came back sellable)</option>
                      <option value="write_off">Write off (damaged / unsellable)</option>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Note (optional)</Label>
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>

                {transitionError && (
                  <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                    {transitionError}
                  </p>
                )}

                <Button type="submit" disabled={!nextStatus || transitioning} className="w-full">
                  {transitioning ? "Updating…" : "Update Status"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
