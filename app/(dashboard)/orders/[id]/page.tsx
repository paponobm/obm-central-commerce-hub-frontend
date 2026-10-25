"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { OrderDetail, CustomerResponseStatus, Integration } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StatusBadge, Pill } from "@/components/ui/badge";
import { LoadingLine } from "@/components/ui/spinner";

const PROVIDER_LABELS: Record<string, string> = {
  STEADFAST: "Steadfast Courier",
};

function responseLabel(r: CustomerResponseStatus | null): string {
  return r ? r.replaceAll("_", " ") : "—";
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;
  const { hasPermission } = useAuth();
  const canShip = hasPermission("shipments.manage");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("");
  const [shipError, setShipError] = useState<string | null>(null);
  const [shipping, setShipping] = useState(false);

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

  useEffect(() => {
    if (!canShip) return;
    api
      .get<Integration[]>("/admin/integrations")
      .then((rows) => {
        const usable = rows.filter((i) => i.isEnabled);
        setIntegrations(usable);
        setSelectedIntegrationId((prev) => prev || usable.find((i) => i.isDefault)?.id || usable[0]?.id || "");
      })
      .catch(() => setIntegrations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShip]);

  async function handleCreateShipment() {
    if (!selectedIntegrationId) return;
    setShipError(null);
    setShipping(true);
    try {
      await api.post(`/admin/orders/${orderId}/shipment`, {
        integrationId: selectedIntegrationId,
      });
      await loadOrder();
    } catch (err) {
      setShipError(err instanceof ApiError ? err.message : "Failed to create shipment");
    } finally {
      setShipping(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-status-cancelled">{loadError}</p>;
  }
  if (!order) {
    return <LoadingLine />;
  }

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
        <Pill tone={order.customerResponse === "CONFIRMED" ? "primary" : "default"}>
          Response: {responseLabel(order.customerResponse ?? "NO_RESPONSE")}
        </Pill>
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

          <h2 className="mb-3 mt-6 text-sm font-semibold text-foreground">Timeline</h2>
          <div className="space-y-3">
            {order.timeline.map((t) => (
              <div key={t.id} className="flex items-start justify-between text-sm">
                <div>
                  {t.type === "status" ? (
                    <span className="font-medium text-foreground">
                      {t.fromStatus ? `${t.fromStatus.replaceAll("_", " ")} → ` : ""}
                      {t.toStatus.replaceAll("_", " ")}
                    </span>
                  ) : (
                    <span className="font-medium text-foreground">
                      Customer response: {responseLabel(t.fromResponse)} →{" "}
                      {responseLabel(t.toResponse)}
                    </span>
                  )}
                  {t.note && <div className="text-xs text-foreground/50">{t.note}</div>}
                  {t.changedBy && (
                    <div className="text-xs text-foreground/40">by {t.changedBy.name}</div>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs text-foreground/50">
                  {formatDateTime(t.createdAt)}
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
              {order.deliveryMethod && (
                <div className="text-xs text-foreground/50">Via {order.deliveryMethod}</div>
              )}
            </div>
          </Card>

          {canShip && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Courier Shipment</h2>
              {order.shipment?.externalConsignmentId ? (
                <div className="space-y-1 text-sm">
                  <div className="font-medium text-foreground">
                    {PROVIDER_LABELS[order.shipment.provider ?? ""] ?? order.shipment.provider}
                  </div>
                  <div className="text-foreground/60">
                    Consignment: {order.shipment.externalConsignmentId}
                  </div>
                  {order.shipment.externalTrackingCode && (
                    <div className="text-foreground/60">
                      Tracking: {order.shipment.externalTrackingCode}
                    </div>
                  )}
                  <StatusBadge status={order.shipment.status} />
                </div>
              ) : integrations === null ? (
                <LoadingLine className="text-sm text-foreground/50" />
              ) : integrations.length === 0 ? (
                <p className="text-sm text-foreground/50">
                  No enabled courier integrations — add one under Integrations.
                </p>
              ) : (
                <div className="space-y-3">
                  <Select
                    value={selectedIntegrationId}
                    onChange={(e) => setSelectedIntegrationId(e.target.value)}
                  >
                    {integrations.map((i) => (
                      <option key={i.id} value={i.id}>
                        {(PROVIDER_LABELS[i.provider] ?? i.provider) + " — " + i.label}
                      </option>
                    ))}
                  </Select>
                  {shipError && (
                    <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                      {shipError}
                    </p>
                  )}
                  <Button
                    variant="primary"
                    disabled={shipping || !selectedIntegrationId}
                    onClick={handleCreateShipment}
                  >
                    {shipping ? "Booking…" : "Create Shipment"}
                  </Button>
                </div>
              )}
            </Card>
          )}

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

        </div>
      </div>
    </div>
  );
}
