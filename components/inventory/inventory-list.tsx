"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { InventorySummary, StockMovement } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

// Single source of truth for which of the three buckets a row falls into —
// driven by availableStock (what's actually shown in the Available column
// and what a customer could still order), not currentStock. A product can
// have currentStock > 0 but still be unavailable once reservedStock eats
// into it, so checking currentStock === 0 alone missed that case.
function stockBucket(r: Pick<InventorySummary, "availableStock" | "lowStockThreshold">): "out" | "low" | "healthy" {
  if (r.availableStock <= 0) return "out";
  if (r.availableStock <= r.lowStockThreshold) return "low";
  return "healthy";
}

const SUMMARY_DOT_CLASSES = {
  primary: "bg-primary",
  delivered: "bg-status-delivered",
  pending: "bg-status-pending",
  cancelled: "bg-status-cancelled",
} as const;

const SUMMARY_BADGE_CLASSES = {
  primary: "bg-primary/10",
  delivered: "bg-status-delivered/10",
  pending: "bg-status-pending/10",
  cancelled: "bg-status-cancelled/10",
} as const;

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: keyof typeof SUMMARY_DOT_CLASSES;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 text-left transition hover:shadow-sm ${
        active ? "border-primary" : "border-black/10 hover:border-black/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-md font-bold text-foreground/60">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${SUMMARY_BADGE_CLASSES[tone]}`}>
          <span className={`h-2 w-2 rounded-full ${SUMMARY_DOT_CLASSES[tone]}`} />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
      {/* <div className="mt-1 text-xs text-primary">Click to filter</div> */}
    </button>
  );
}

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
  const [statusFilter, setStatusFilter] = useState<"" | "healthy" | "low" | "out">("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Independent of the searchable/filterable `rows` above — these summary
  // counts always reflect the whole catalog, not whatever the search box
  // currently narrows the table down to. Fetched once; the table's own
  // reload after an Adjust keeps rows in sync, but not this overview (an
  // edge case not worth a refetch-on-every-adjust for).
  const [summary, setSummary] = useState<InventorySummary[] | null>(null);
  useEffect(() => {
    api
      .get<InventorySummary[]>("/admin/inventory")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const [adjusting, setAdjusting] = useState<InventorySummary | null>(null);
  const [delta, setDelta] = useState("");
  const [type, setType] = useState<"ADJUSTMENT" | "DAMAGE">("ADJUSTMENT");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [activityFor, setActivityFor] = useState<InventorySummary | null>(null);
  const [activityRows, setActivityRows] = useState<StockMovement[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  function openActivityLog(row: InventorySummary) {
    setActivityFor(row);
    setActivityRows(null);
    setActivityError(null);
    api
      .get<StockMovement[]>(`/admin/inventory/${row.productId}/movements`)
      .then(setActivityRows)
      .catch((err) =>
        setActivityError(err instanceof ApiError ? err.message : "Failed to load activity log"),
      );
  }

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

  // Back to page 1 whenever the result set itself could change shape —
  // otherwise a filter narrowing the list could strand the view on a page
  // that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [search, lowStockOnly, statusFilter]);

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

  const totalProducts = summary?.length ?? 0;
  const outOfStockCount = summary?.filter((r) => stockBucket(r) === "out").length ?? 0;
  const lowStockCount = summary?.filter((r) => stockBucket(r) === "low").length ?? 0;
  const healthyStockCount = summary?.filter((r) => stockBucket(r) === "healthy").length ?? 0;

  // Same three buckets the summary cards above count, applied here as a
  // client-side filter on top of the search — the backend's own `lowStock`
  // param bundles "low but not zero" and "zero" together, which isn't
  // granular enough to pick just one of these three.
  const filteredRows = rows?.filter((r) => {
    if (statusFilter === "") return true;
    return stockBucket(r) === statusFilter;
  });

  const totalPages = filteredRows ? Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)) : 1;
  const pagedRows = filteredRows?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title={title} description={description} />

      {!lowStockOnly && (
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Total Products"
            value={totalProducts}
            tone="primary"
            active={statusFilter === ""}
            onClick={() => setStatusFilter("")}
          />
          <SummaryCard
            label="Healthy Stock"
            value={healthyStockCount}
            tone="delivered"
            active={statusFilter === "healthy"}
            onClick={() => setStatusFilter("healthy")}
          />
          <SummaryCard
            label="Low Stock"
            value={lowStockCount}
            tone="pending"
            active={statusFilter === "low"}
            onClick={() => setStatusFilter("low")}
          />
          <SummaryCard
            label="Out of Stock"
            value={outOfStockCount}
            tone="cancelled"
            active={statusFilter === "out"}
            onClick={() => setStatusFilter("out")}
          />
        </div>
      )}

      {/* <p className="mb-4 rounded-lg bg-black/5 px-3 py-2 text-xs text-foreground/60">
        Stock is shared across all stores — one pool per product, no matter which storefront sold
        or reserved it.
      </p> */}

      <div className="mb-4 flex gap-3">
        <div className="w-64">
          <Input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="">All Status</option>
            <option value="healthy">Healthy Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </Select>
        </div>
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!filteredRows ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-foreground/50">
            {rows && rows.length > 0
              ? "No products match this filter."
              : lowStockOnly
                ? "Nothing is low on stock."
                : "No inventory records."}
          </p>
        ) : (
          <table className="w-full text-md">
            <thead>
              <tr
                className="text-left text-md font-bold text-foreground"
                style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}
              >
                <th className="rounded-l-lg px-3 py-3 font-bold">Product</th>
                <th className="px-3 py-3 text-right font-bold">Available</th>
                <th className="py-3 pl-8 pr-3 font-bold">Status</th>
                <th className="rounded-r-lg px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows!.map((r) => (
                <tr key={r.productId} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      {r.imageUrl ? (
                        <img
                          src={r.imageUrl}
                          alt={r.name}
                          className="h-9 w-9 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-black/5 text-xs text-foreground/30">
                          —
                        </span>
                      )}
                      <div>
                        <div className="font-bold text-primary">{r.name}</div>
                        <div className="text-xs text-foreground/50">{r.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td
                    className={`py-2.5 text-right font-bold ${
                      stockBucket(r) === "healthy" ? "text-status-delivered" : "text-status-cancelled"
                    }`}
                  >
                    {r.availableStock}
                  </td>
                  <td className="py-2.5 pl-8">
                    {stockBucket(r) === "out" ? (
                      <Pill tone="alert">Out of Stock</Pill>
                    ) : stockBucket(r) === "low" ? (
                      <Pill tone="danger">Low stock</Pill>
                    ) : (
                      <Pill tone="success">OK</Pill>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Activity log"
                        aria-label={`Activity log for ${r.name}`}
                        onClick={() => openActivityLog(r)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                      >
                        <HistoryIcon className="h-4 w-4" />
                      </button>
                      {hasPermission("inventory.adjust") && (
                        <button
                          type="button"
                          title="Adjust stock"
                          aria-label={`Adjust stock for ${r.name}`}
                          onClick={() => openAdjust(r)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filteredRows && filteredRows.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-sm text-foreground/60">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of{" "}
              {filteredRows.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-foreground/70">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
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

      <Modal
        open={!!activityFor}
        onClose={() => setActivityFor(null)}
        title="Activity Log"
        size="lg"
      >
        <div className="overflow-y-auto">
          <div className="mb-4">
            <div className="text-lg font-bold text-primary">{activityFor?.name}</div>
            <div className="text-xs text-foreground/50">{activityFor?.sku}</div>
          </div>
          {activityError && (
            <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              {activityError}
            </p>
          )}
          {!activityRows ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : activityRows.length === 0 ? (
            <p className="text-sm text-foreground/50">No stock movements yet for this product.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium text-right">Balance</th>
                  <th className="pb-2 font-medium">Note / By</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((m) => (
                  <tr key={m.id} className="border-b border-black/5 last:border-0">
                    <td className="whitespace-nowrap py-2.5 text-xs text-foreground/50">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="py-2.5">
                      <Pill>{m.type}</Pill>
                    </td>
                    <td
                      className={`py-2.5 text-right font-medium ${
                        m.quantity < 0 ? "text-status-cancelled" : "text-status-delivered"
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
        </div>
      </Modal>
    </div>
  );
}
