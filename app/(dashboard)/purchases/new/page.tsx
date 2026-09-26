"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Product, PurchaseDetail, Supplier } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

interface Line {
  productId: string;
  name: string;
  sku: string;
  quantity: string;
  unitCost: string;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Supplier[]>("/admin/suppliers").then(setSuppliers).catch(() => {});
    api.get<Product[]>("/admin/products").then(setProducts).catch(() => {});
  }, []);

  const matches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          !lines.some((l) => l.productId === p.id) &&
          (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [products, productSearch, lines]);

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  function addProduct(p: Product) {
    setLines((prev) => [
      ...prev,
      { productId: p.id, name: p.name, sku: p.sku, quantity: "1", unitCost: p.costPrice },
    ]);
    setProductSearch("");
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one product.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.post<PurchaseDetail>("/admin/purchases", {
        supplierId,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      });
      router.push(`/purchases/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="New Purchase"
        description="Saved as a draft — stock is only added when you receive it."
        actions={
          <Button type="button" variant="secondary" onClick={() => router.push("/purchases")}>
            Cancel
          </Button>
        }
      />
      <div className="space-y-6">
        <Card>
          <div className="max-w-sm">
            <Label>Supplier</Label>
            <Select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Items</h2>
          <div className="relative mb-4 max-w-sm">
            <Input
              placeholder="Search a product by name or SKU to add…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {matches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5"
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-foreground/50">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-foreground/50">No items added yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium w-28">Qty</th>
                  <th className="pb-2 font-medium w-36">Unit cost</th>
                  <th className="pb-2 font-medium text-right">Line total</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.productId} className="border-b border-black/5 last:border-0">
                    <td className="py-2">
                      <div className="font-medium text-foreground">{l.name}</div>
                      <div className="text-xs text-foreground/50">{l.sku}</div>
                    </td>
                    <td className="py-2">
                      <Input required type="number" min="1" step="1" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                    </td>
                    <td className="py-2">
                      <Input required type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} />
                    </td>
                    <td className="py-2 text-right font-medium">
                      {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                    </td>
                    <td className="py-2 text-right">
                      <Button type="button" variant="ghost" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 text-right text-sm font-semibold text-foreground">Total: {money(total)}</div>
        </Card>

        {error && (
          <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
        )}
        <Button type="submit" disabled={submitting || !supplierId}>
          {submitting ? "Saving…" : "Save Draft Purchase"}
        </Button>
      </div>
    </form>
  );
}
