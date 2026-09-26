"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { PurchaseDetail } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";

export default function PurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    try {
      setPurchase(await api.get<PurchaseDetail>(`/admin/purchases/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load purchase");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function act(path: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/admin/purchases/${params.id}/${path}`, {});
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string) {
    setActionError(null);
    setBusy(true);
    try {
      await api.delete(`/admin/purchases/${params.id}/items/${itemId}`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-status-cancelled">{error}</p>;
  if (!purchase) return <p className="text-sm text-foreground/60">Loading…</p>;

  const editable = purchase.status === "DRAFT";
  const receivable = purchase.status === "DRAFT" || purchase.status === "ORDERED";

  return (
    <div>
      <PageHeader
        title={`Purchase from ${purchase.supplier.name}`}
        description={`Created ${formatDateTime(purchase.createdAt)}${purchase.createdBy ? ` by ${purchase.createdBy.name}` : ""}`}
        actions={
          <Button variant="secondary" onClick={() => router.push("/purchases")}>
            Back to Purchases
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Pill tone={purchase.status === "RECEIVED" ? "primary" : purchase.status === "CANCELLED" ? "warning" : "default"}>
          {purchase.status}
        </Pill>
        {purchase.receivedAt && <Pill>Received {formatDateTime(purchase.receivedAt)}</Pill>}
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium text-right">Qty</th>
              <th className="pb-2 font-medium text-right">Unit cost</th>
              <th className="pb-2 font-medium text-right">Total</th>
              {editable && <th className="pb-2" />}
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((i) => (
              <tr key={i.id} className="border-b border-black/5 last:border-0">
                <td className="py-2.5">
                  <div className="font-medium text-foreground">{i.product.name}</div>
                  <div className="text-xs text-foreground/50">{i.product.sku}</div>
                </td>
                <td className="py-2.5 text-right">{i.quantity}</td>
                <td className="py-2.5 text-right">{money(i.unitCost)}</td>
                <td className="py-2.5 text-right font-medium">{money(i.total)}</td>
                {editable && (
                  <td className="py-2.5 text-right">
                    <Button variant="ghost" disabled={busy || purchase.items.length <= 1} onClick={() => removeItem(i.id)}>
                      Remove
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 text-right text-sm font-semibold text-foreground">
          Total: {money(purchase.totalCost)}
        </div>
      </Card>

      {actionError && (
        <p className="mt-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{actionError}</p>
      )}

      {receivable && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => act("receive", "Receive this purchase? Stock for every item will be added to inventory.")}
          >
            Receive Stock
          </Button>
          {purchase.status === "DRAFT" && (
            <Button variant="secondary" disabled={busy} onClick={() => act("order")}>
              Mark as Ordered
            </Button>
          )}
          <Button variant="ghost" className="text-status-cancelled" disabled={busy} onClick={() => act("cancel", "Cancel this purchase?")}>
            Cancel Purchase
          </Button>
        </div>
      )}
    </div>
  );
}
