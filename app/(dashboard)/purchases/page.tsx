"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { PurchaseListItem } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";

export default function PurchasesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PurchaseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PurchaseListItem[]>("/admin/purchases")
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load purchases"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Stock you buy from suppliers. Receiving a purchase adds it to inventory."
        actions={
          <Button variant="primary" onClick={() => router.push("/purchases/new")}>
            New Purchase
          </Button>
        }
      />
      <Card>
        {error && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
        )}
        {!rows ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground/50">No purchases yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Created</th>
                <th className="pb-2 font-medium">Supplier</th>
                <th className="pb-2 font-medium text-right">Items</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
                  onClick={() => router.push(`/purchases/${p.id}`)}
                >
                  <td className="py-2.5">{formatDateTime(p.createdAt)}</td>
                  <td className="py-2.5 font-medium text-foreground">{p.supplier.name}</td>
                  <td className="py-2.5 text-right text-foreground/60">{p._count.items}</td>
                  <td className="py-2.5">
                    <Pill tone={p.status === "RECEIVED" ? "primary" : p.status === "CANCELLED" ? "warning" : "default"}>
                      {p.status}
                    </Pill>
                  </td>
                  <td className="py-2.5 text-right font-medium">{money(p.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
