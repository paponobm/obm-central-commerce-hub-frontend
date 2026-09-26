"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { InventorySummary } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

export function InventoryList({
  title,
  description,
  lowStockOnly,
}: {
  title: string;
  description: string;
  lowStockOnly: boolean;
}) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<InventorySummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [adjusting, setAdjusting] = useState<InventorySummary | null>(null);
  const [delta, setDelta] = useState("");
  const [type, setType] = useState<"ADJUSTMENT" | "DAMAGE">("ADJUSTMENT");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams();
    if (lowStockOnly) params.set("lowStock", "true");
    if (search) params.set("search", search);
    const qs = params.toString();
    try {
      setRows(await api.get<InventorySummary[]>(`/admin/inventory${qs ? `?${qs}` : ""}`));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load inventory");
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, lowStockOnly]);

  function openAdjust(row: InventorySummary) {
    setAdjusting(row);
    setDelta("");
    setType("ADJUSTMENT");
    setNote("");
    setFormError(null);
  }

  async function handleAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    setFormError(null);
    setSaving(true);
    try {
      const n = Number(delta);
      await api.post(`/admin/inventory/${adjusting.productId}/adjust`, {
        // Damage is always a reduction — let the admin type a plain positive count.
        delta: type === "DAMAGE" ? -Math.abs(n) : n,
        type,
        note: note || undefined,
      });
      setAdjusting(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={title} description={description} />

      <p className="mb-4 rounded-lg bg-black/5 px-3 py-2 text-xs text-foreground/60">
        Stock is shared across all stores — one pool per product, no matter which storefront sold
        or reserved it.
      </p>

      <div className="mb-4 w-64">
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!rows ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground/50">
            {lowStockOnly ? "Nothing is low on stock." : "No inventory records."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium text-right">Current</th>
                <th className="pb-2 font-medium text-right">Reserved</th>
                <th className="pb-2 font-medium text-right">Available</th>
                <th className="pb-2 font-medium text-right">Threshold</th>
                <th className="pb-2 font-medium">Status</th>
                {hasPermission("inventory.adjust") && (
                  <th className="pb-2 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-foreground/50">{r.sku}</div>
                  </td>
                  <td className="py-2.5 text-right">{r.currentStock}</td>
                  <td className="py-2.5 text-right text-foreground/60">{r.reservedStock}</td>
                  <td className="py-2.5 text-right font-medium text-foreground">
                    {r.availableStock}
                  </td>
                  <td className="py-2.5 text-right text-foreground/50">{r.lowStockThreshold}</td>
                  <td className="py-2.5">
                    {r.isLowStock ? <Pill tone="warning">Low stock</Pill> : <Pill>OK</Pill>}
                  </td>
                  {hasPermission("inventory.adjust") && (
                    <td className="py-2.5 text-right">
                      <Button variant="ghost" onClick={() => openAdjust(r)}>
                        Adjust
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={adjusting ? `Adjust stock — ${adjusting.name}` : ""}
      >
        {adjusting && (
          <form onSubmit={handleAdjust} className="space-y-4">
            <p className="text-sm text-foreground/60">
              Current stock: <span className="font-medium text-foreground">{adjusting.currentStock}</span>
            </p>
            <div>
              <Label>Type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as "ADJUSTMENT" | "DAMAGE")}>
                <option value="ADJUSTMENT">Adjustment (count correction, + or −)</option>
                <option value="DAMAGE">Damage / write-off (reduces stock)</option>
              </Select>
            </div>
            <div>
              <Label>{type === "DAMAGE" ? "Quantity lost" : "Change (+ adds, − removes)"}</Label>
              <Input
                required
                type="number"
                step="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {formError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saving || !delta || Number(delta) === 0}>
                {saving ? "Saving…" : "Apply Adjustment"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdjusting(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
