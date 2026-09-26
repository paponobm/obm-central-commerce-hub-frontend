"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { StockMovement } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";

export default function StockMovementsPage() {
  const [rows, setRows] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StockMovement[]>("/admin/inventory/movements?limit=200")
      .then(setRows)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load stock movements"),
      );
  }, []);

  return (
    <div>
      <PageHeader
        title="Stock Movements"
        description="Every change to stock, newest first — the ledger behind the numbers."
      />
      <Card>
        {error && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {error}
          </p>
        )}
        {!rows ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground/50">No stock movements yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Balance</th>
                <th className="pb-2 font-medium">Note / By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0">
                  <td className="whitespace-nowrap py-2.5 text-xs text-foreground/50">
                    {formatDateTime(m.createdAt)}
                  </td>
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{m.product?.name ?? "—"}</div>
                    <div className="text-xs text-foreground/50">{m.product?.sku}</div>
                  </td>
                  <td className="py-2.5">
                    <Pill>{m.type}</Pill>
                  </td>
                  <td
                    className={`py-2.5 text-right font-medium ${
                      m.quantity < 0 ? "text-status-cancelled" : "text-foreground"
                    }`}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="py-2.5 text-right text-foreground/70">{m.balanceAfter}</td>
                  <td className="py-2.5 text-foreground/60">
                    {m.note && <div>{m.note}</div>}
                    {m.createdBy && (
                      <div className="text-xs text-foreground/40">by {m.createdBy.name}</div>
                    )}
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
