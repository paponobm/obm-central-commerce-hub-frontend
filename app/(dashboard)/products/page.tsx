"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Category, Product } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { LoadingLine } from "@/components/ui/spinner";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100, 200, 500] as const;

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

const SUMMARY_DOT_CLASSES = {
  primary: "bg-primary",
  delivered: "bg-status-delivered",
  pending: "bg-status-pending",
} as const;

const SUMMARY_BADGE_CLASSES = {
  primary: "bg-primary/10",
  delivered: "bg-status-delivered/10",
  pending: "bg-status-pending/10",
} as const;

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof SUMMARY_DOT_CLASSES;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/60">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${SUMMARY_BADGE_CLASSES[tone]}`}>
          <span className={`h-2 w-2 rounded-full ${SUMMARY_DOT_CLASSES[tone]}`} />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const { activeChannelId } = useChannelScope();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Default "active" matches what admins almost always want to see day to
  // day — discontinued/inactive products stay out of the way unless asked
  // for. The backend's own default (no includeInactive) already does this,
  // but fetching everything and bucketing client-side (same pattern as the
  // Inventory page) is what lets this dropdown offer Inactive/All too.
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);

  async function loadProducts() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (activeChannelId) params.set("channelId", activeChannelId);
    params.set("includeInactive", "true");
    const qs = params.toString();
    try {
      const data = await api.get<Product[]>(`/admin/products${qs ? `?${qs}` : ""}`);
      setProducts(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load products");
    }
  }

  useEffect(() => {
    api.get<Category[]>("/admin/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadProducts, 250); // debounce search typing
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, activeChannelId]);

  // Back to page 1 whenever the result set itself could change shape —
  // otherwise a filter narrowing the list could strand the view on a page
  // that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, activeChannelId, statusFilter, pageSize]);

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    setDeletingId(product.id);
    setLoadError(null);
    try {
      await api.delete(`/admin/products/${product.id}`);
      await loadProducts();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to delete product");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(product: Product) {
    const willDeactivate = product.isActive;
    if (willDeactivate && (product.channels?.length ?? 0) > 0) {
      const ok = confirm(
        `"${product.name}" is published to ${product.channels!.length} storefront${
          product.channels!.length > 1 ? "s" : ""
        }. Marking it inactive will not remove it from ${
          product.channels!.length > 1 ? "those storefronts" : "that storefront"
        } — unpublish it from the product page if you want it fully removed. Continue?`,
      );
      if (!ok) return;
    }
    setTogglingId(product.id);
    setLoadError(null);
    try {
      await api.patch(`/admin/products/${product.id}`, { isActive: !product.isActive });
      await loadProducts();
      window.dispatchEvent(new Event("inventory-alert:refresh"));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to update product status");
    } finally {
      setTogglingId(null);
    }
  }

  // These three always reflect the whole catalog (fetched once above with
  // includeInactive=true), independent of whatever the Status dropdown is
  // currently narrowing the table down to — same pattern as the Inventory
  // page's own summary cards.
  const totalProducts = products?.length ?? 0;
  const activeProductCount = products?.filter((p) => p.isActive).length ?? 0;
  const publishedCount = products?.filter((p) => (p.channels?.length ?? 0) > 0).length ?? 0;

  const filteredProducts = products?.filter((p) => {
    if (statusFilter === "active") return p.isActive;
    if (statusFilter === "inactive") return !p.isActive;
    return true;
  });

  const totalPages = filteredProducts ? Math.max(1, Math.ceil(filteredProducts.length / pageSize)) : 1;
  const pagedProducts = filteredProducts?.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your master catalog — publish products to storefronts from each product's page."
        actions={
          !activeChannelId && (
            <Button variant="primary" onClick={() => router.push("/products/new")}>
              New Product
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total Products"
          value={String(totalProducts)}
          tone="primary"
        />
        <SummaryCard
          label="Total Active Product"
          value={String(activeProductCount)}
          tone="delivered"
        />
        <SummaryCard
          label="Published to Storefront"
          value={String(publishedCount)}
          tone="pending"
        />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="w-64">
          <Input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </div>
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {loadError}
          </p>
        )}

        {!filteredProducts ? (
          <LoadingLine className="text-base text-foreground/60" />
        ) : filteredProducts.length === 0 ? (
          <p className="text-base text-foreground/50">
            No products match. Create one to get started.
          </p>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr
                className="text-left text-base font-bold text-foreground"
                style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}
              >
                <th className="rounded-l-lg px-3 py-3 font-bold">#</th>
                <th className="px-3 py-3 font-bold">Product</th>
                <th className="px-3 py-3 font-bold">Category / Brand</th>
                <th className="px-3 py-3 font-bold">Published Stores</th>
                {!activeChannelId && <th className="px-3 py-3 text-right font-bold">Stock</th>}
                <th className="px-3 py-3 text-right font-bold">Base Price</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="rounded-r-lg px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts!.map((p, i) => {
                const image = p.thumbnailUrl ?? p.images?.[0]?.url;
                const available = p.inventory
                  ? p.inventory.currentStock - p.inventory.reservedStock
                  : 0;
                return (
                  <tr key={p.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-3 text-foreground/50">
                      {(page - 1) * pageSize + i + 1}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {image ? (
                          <button
                            type="button"
                            onClick={() => setZoomedImage({ url: image, name: p.name })}
                            className="shrink-0 rounded"
                            aria-label={`View ${p.name}'s image`}
                            title="Click to zoom"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image, not part of the Next.js image pipeline */}
                            <img
                              src={image}
                              alt={p.name}
                              className="h-9 w-9 rounded object-cover transition-transform hover:scale-105"
                            />
                          </button>
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-black/5 text-xs text-foreground/30">
                            —
                          </span>
                        )}
                        <div>
                          <button
                            onClick={() => router.push(`/products/${p.id}`)}
                            className="font-bold text-primary hover:underline"
                          >
                            {p.name}
                          </button>
                          <div className="text-sm text-foreground/50">{p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-foreground/60">
                      {p.category?.name ?? "—"}
                      {p.brand?.name && ` · ${p.brand.name}`}
                    </td>
                    <td className="px-3 py-3">
                      {p.channels && p.channels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.channels.map((c) => (
                            <Pill key={c.channelId} tone="primary">
                              {c.channel.name}
                            </Pill>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-foreground/40">Not published</span>
                      )}
                    </td>
                    {!activeChannelId && (
                    <td className="px-3 py-3 text-right">
                      <span
                        className={`font-bold ${
                          available <= 0 ? "text-status-cancelled" : "text-status-delivered"
                        }`}
                      >
                        {available}
                      </span>
                    </td>
                    )}
                    <td className="px-3 py-3 text-right font-medium text-foreground">
                      {money(p.basePrice)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={p.isActive}
                          disabled={togglingId === p.id}
                          onChange={() => handleToggleActive(p)}
                        />
                        <Pill tone={p.isActive ? "success" : "danger"}>
                          {p.isActive ? "Active" : "Inactive"}
                        </Pill>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Edit"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => router.push(`/products/${p.id}`)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {!activeChannelId && (
                          <button
                            type="button"
                            title="Delete"
                            aria-label={`Delete ${p.name}`}
                            disabled={deletingId === p.id}
                            onClick={() => handleDelete(p)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10 disabled:opacity-50"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filteredProducts && filteredProducts.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-base">
            <span className="font-bold text-primary">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredProducts.length)} of{" "}
              {filteredProducts.length}
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

      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image, zoomed view */}
            <img
              src={zoomedImage.url}
              alt={zoomedImage.name}
              className="max-h-[80vh] max-w-[80vw] rounded-xl border-4 border-white object-contain shadow-card"
            />
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              aria-label="Close"
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-status-cancelled text-base text-white hover:opacity-90"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
