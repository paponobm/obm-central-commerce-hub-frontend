"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { SupplierDetail } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SupplierDetail>(`/admin/suppliers/${params.id}`)
      .then(setSupplier)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load supplier"));
  }, [params.id]);

  if (error) return <p className="text-sm text-status-cancelled">{error}</p>;
  if (!supplier) return <p className="text-sm text-foreground/60">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={supplier.name}
        description={[supplier.phone, supplier.email, supplier.address].filter(Boolean).join(" · ") || "No contact details"}
        actions={
          <Button variant="secondary" onClick={() => router.push("/suppliers")}>
            Back to Suppliers
          </Button>
        }
      />
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-foreground">Purchases</h2>
        {supplier.purchases.length === 0 ? (
          <p className="text-sm text-foreground/50">No purchases from this supplier yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Created</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Received</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {supplier.purchases.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
                  onClick={() => router.push(`/purchases/${p.id}`)}
                >
                  <td className="py-2.5">{formatDateTime(p.createdAt)}</td>
                  <td className="py-2.5">
                    <Pill tone={p.status === "RECEIVED" ? "primary" : "default"}>{p.status}</Pill>
                  </td>
                  <td className="py-2.5 text-foreground/60">{p.receivedAt ? formatDateTime(p.receivedAt) : "—"}</td>
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
