"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

const INITIAL_ROWS = 10;

export default function ProductOrderHistoryTab() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [orderHistory, setOrderHistory] = useState<OrderListItem[]>([]);
  const [showAllOrderHistory, setShowAllOrderHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OrderListItem[]>(`/admin/orders?productId=${productId}`)
      .then(setOrderHistory)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load order history"));
  }, [productId]);

  if (loadError) {
    return <p className="text-base text-status-cancelled">{loadError}</p>;
  }

  const rows = showAllOrderHistory ? orderHistory : orderHistory.slice(0, INITIAL_ROWS);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold text-primary">Order History</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-base">
          <thead>
            <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
              <th className="rounded-l-lg px-3 py-2 font-bold">Order</th>
              <th className="px-3 py-2 font-bold">Customer</th>
              <th className="px-3 py-2 font-bold">Channel</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-3 py-2 font-bold">Total</th>
              <th className="rounded-r-lg px-3 py-2 font-bold">Placed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id} className="border-b border-black/5">
                <td className="px-3 py-2">
                  <Link href={`/orders/${order.id}`} className="font-bold text-primary hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-3 py-2">{order.customer.name}</td>
                <td className="px-3 py-2">{order.channel?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-3 py-2">{money(order.total)}</td>
                <td className="px-3 py-2">{formatDateTime(order.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-foreground/50">
                  No orders yet for this product.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {orderHistory.length > INITIAL_ROWS && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={() => setShowAllOrderHistory((v) => !v)}>
            {showAllOrderHistory ? "Show less" : `Show all (${orderHistory.length})`}
          </Button>
        </div>
      )}
    </Card>
  );
}
