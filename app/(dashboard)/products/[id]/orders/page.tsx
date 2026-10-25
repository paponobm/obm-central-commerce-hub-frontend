"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

export default function ProductOrderHistoryTab() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [orderHistory, setOrderHistory] = useState<OrderListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    api
      .get<OrderListItem[]>(`/admin/orders?productId=${productId}`)
      .then(setOrderHistory)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load order history"));
  }, [productId]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  if (loadError) {
    return <p className="text-base text-status-cancelled">{loadError}</p>;
  }

  const totalPages = Math.max(1, Math.ceil(orderHistory.length / pageSize));
  const rows = orderHistory.slice((page - 1) * pageSize, page * pageSize);

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
      {orderHistory.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-base">
          <span className="font-bold text-primary">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, orderHistory.length)} of{" "}
            {orderHistory.length}
          </span>
          <div className="flex items-center gap-2">
            <Select
              className="w-auto !text-base font-bold !text-primary"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
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
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="font-bold text-primary">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              className="!text-base !font-bold !text-primary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
