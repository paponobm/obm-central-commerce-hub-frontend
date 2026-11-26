"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { getStoredProductsPageSize, setStoredProductsPageSize } from "@/lib/products-list-prefs";
import type { Category, Product } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { LoadingLine } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100, 200, 500] as const;

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// Draft products aren't live anywhere, so there's no real storefront page
// to open — this opens a quick read-only summary modal instead (see
// previewProduct below), the next best thing to "see what it looks like".
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
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

// Product list's Stock Status column — Expired beats Expiring Soon beats
// Low Stock, since an expired product is the most urgent of the three.
// Mirrors the Inventory page's own isLowStock rule (currentStock <=
// lowStockThreshold) so this column never disagrees with that page.
function getStockStatus(p: Product): { label: string; tone: "danger" | "warning" | "success" } | null {
  const inventory = p.inventory;
  if (!inventory) return null;
  const now = Date.now();
  if (inventory.expiryDate && new Date(inventory.expiryDate).getTime() < now) {
    return { label: "Expired", tone: "danger" };
  }
  if (inventory.expiryDate && inventory.expiryAlertDays) {
    const msUntilExpiry = new Date(inventory.expiryDate).getTime() - now;
    if (msUntilExpiry <= inventory.expiryAlertDays * 24 * 60 * 60 * 1000) {
      return { label: "Expiring Soon", tone: "warning" };
    }
  }
  if (inventory.currentStock <= inventory.lowStockThreshold) {
    return { label: "Low Stock", tone: "danger" };
  }
  return { label: "In Stock", tone: "success" };
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
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "draft" | "all">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  // Which image the preview's big hero slot is currently showing — starts
  // at the thumbnail (or the first gallery image if there's no thumbnail),
  // then switches to whichever thumbnail strip image was clicked.
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Restored after mount (not in the initializer above) so the server-
  // rendered first pass and the client's first render still match — same
  // pattern the dashboard sidebar's collapsed state already uses.
  useEffect(() => {
    setPageSize(getStoredProductsPageSize(PAGE_SIZE_OPTIONS[0]));
  }, []);

  function changePageSize(next: number) {
    setPageSize(next);
    setStoredProductsPageSize(next);
  }

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
        }. Marking it inactive will immediately remove it from ${
          product.channels!.length > 1 ? "those storefronts" : "that storefront"
        } — every storefront already requires a product to be active to show it at all. Continue?`,
      );
      if (!ok) return;
    }
    setTogglingId(product.id);
    setLoadError(null);
    try {
      await api.patch(`/admin/products/${product.id}`, {
        isActive: !product.isActive,
        // Turning a draft on promotes it out of Draft — same "no longer a
        // work in progress" meaning as actually publishing it.
        ...(!product.isActive ? { isDraft: false } : {}),
      });
      await loadProducts();
      window.dispatchEvent(new Event("inventory-alert:refresh"));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to update product status");
    } finally {
      setTogglingId(null);
    }
  }

  // Only ever called from the "#" column while the list is unfiltered (see
  // canReorder below) — position is the 1-indexed target, same numbering
  // the # column itself shows.
  async function handleReorder(productId: string, position: number) {
    setReorderingId(productId);
    setReorderError(null);
    try {
      await api.patch(`/admin/products/${productId}/reorder`, { position });
      await loadProducts();
    } catch (err) {
      setReorderError(err instanceof ApiError ? err.message : "Failed to reorder");
    } finally {
      setReorderingId(null);
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
    if (statusFilter === "inactive") return !p.isActive && !p.isDraft;
    if (statusFilter === "draft") return p.isDraft;
    return true;
  });

  const totalPages = filteredProducts ? Math.max(1, Math.ceil(filteredProducts.length / pageSize)) : 1;
  const pagedProducts = filteredProducts?.slice((page - 1) * pageSize, page * pageSize);

  // "#" is only ever editable here — with no search/category filter and
  // Status set to Active, what's on screen is exactly the active-only set
  // the backend reorders (see ProductsService.reorder), so a typed position
  // means the same thing on both ends. All/Inactive/Draft mix in rows the
  // backend doesn't reorder against, which would make "position 4" wrong.
  const canReorder = !search && !categoryFilter && statusFilter === "active";

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
            <option value="draft">Draft</option>
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
        {reorderError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {reorderError}
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
                <th className="px-3 py-3 font-bold">Stock Status</th>
                <th className="px-3 py-3 font-bold">Published Stores</th>
                <th className="px-3 py-3 text-right font-bold">Base Price</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="rounded-r-lg px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts!.map((p, i) => {
                const image = p.thumbnailUrl ?? p.images?.[0]?.url;
                const activeVariants = p.variants?.filter((v) => v.isActive) ?? [];
                const position = (page - 1) * pageSize + i + 1;
                return (
                  <tr key={p.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-3 text-foreground/50">
                      {canReorder ? (
                        <input
                          key={`${p.id}-${position}`}
                          type="number"
                          min={1}
                          defaultValue={position}
                          disabled={reorderingId === p.id}
                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isFinite(next) && next >= 1 && next !== position) {
                              handleReorder(p.id, next);
                            } else {
                              e.target.value = String(position);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          title="Type a new position to move this product"
                          className="w-14 rounded border border-black/10 bg-white px-1.5 py-1 text-center text-base text-foreground/70 focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      ) : (
                        <span title="Set Status to Active (with no search/category filter) to reorder">
                          {position}
                        </span>
                      )}
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
                            {activeVariants.length > 1 && (
                              <span className="font-normal text-foreground/50">
                                {" "}
                                ({activeVariants.length} variants)
                              </span>
                            )}
                          </button>
                          <div className="text-sm text-foreground/50">{p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const stockStatus = getStockStatus(p);
                        return stockStatus ? (
                          <Pill tone={stockStatus.tone}>{stockStatus.label}</Pill>
                        ) : (
                          <span className="text-sm text-foreground/40">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3">
                      {p.channels && p.channels.length > 0 ? (
                        <div className="flex flex-col items-start gap-1">
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
                    <td className="px-3 py-3 text-right font-medium text-foreground">
                      {activeVariants.length > 1
                        ? (() => {
                            const prices = activeVariants.map((v) => Number(v.basePrice));
                            const min = Math.min(...prices);
                            const max = Math.max(...prices);
                            return min === max ? money(min) : `${money(min)} - ${money(max)}`;
                          })()
                        : money(p.basePrice)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={p.isActive}
                          disabled={togglingId === p.id}
                          onChange={() => handleToggleActive(p)}
                        />
                        <Pill tone={p.isActive ? "success" : p.isDraft ? "default" : "danger"}>
                          {p.isActive ? "Active" : p.isDraft ? "Draft" : "Inactive"}
                        </Pill>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.isDraft && (
                          <button
                            type="button"
                            title="Preview"
                            aria-label={`Preview ${p.name}`}
                            onClick={() => {
                              setPreviewProduct(p);
                              setPreviewImage(p.thumbnailUrl ?? p.images?.[0]?.url ?? null);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                        )}
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
                onChange={(e) => changePageSize(Number(e.target.value))}
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

      {previewProduct && (
        <Modal open onClose={() => setPreviewProduct(null)} title={`Preview — ${previewProduct.name}`} size="xl">
          {/* Big hero image + a clickable thumbnail strip (thumbnail first,
              then every gallery image) — clicking one swaps the hero, same
              "main image + strip" pattern as a real storefront product
              page, instead of the small fixed-size thumbnail this used to
              be stuck showing. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
              <img
                src={previewImage}
                alt={previewProduct.name}
                className="h-72 w-72 shrink-0 rounded-lg border border-black/10 object-cover"
              />
            ) : (
              <span className="flex h-72 w-72 shrink-0 items-center justify-center rounded-lg border border-dashed border-black/15 bg-black/5 text-sm text-foreground/40">
                No image
              </span>
            )}
            {(() => {
              const thumbs = [
                ...(previewProduct.thumbnailUrl ? [previewProduct.thumbnailUrl] : []),
                ...(previewProduct.images ?? []).map((img) => img.url),
              ].filter((url, i, all) => all.indexOf(url) === i);
              return (
                thumbs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
                    {thumbs.map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setPreviewImage(url)}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 ${
                          previewImage === url ? "border-primary" : "border-black/10 hover:border-black/30"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )
              );
            })()}
          </div>

          <div className="mt-5 space-y-2.5 text-base">
            <div>
              <span className="text-foreground/50">Name: </span>
              <span className="font-medium text-foreground">{previewProduct.name}</span>{" "}
              <span className="inline-block">
                <Pill tone="default">Draft</Pill>
              </span>
            </div>
            <div>
              <span className="text-foreground/50">SKU: </span>
              <span className="font-medium text-foreground">{previewProduct.sku}</span>
            </div>
            <div>
              <span className="text-foreground/50">Slug: </span>
              <span className="font-medium text-foreground">{previewProduct.slug ?? "—"}</span>
            </div>
            <div>
              <span className="text-foreground/50">Slogan: </span>
              <span className="font-medium text-foreground">{previewProduct.slogan ?? "—"}</span>
            </div>
            <div>
              <span className="text-foreground/50">Category: </span>
              <span className="font-medium text-foreground">{previewProduct.category?.name ?? "—"}</span>
            </div>
            <div>
              <span className="text-foreground/50">Origin: </span>
              <span className="font-medium text-foreground">
                {previewProduct.specifications?.find((s) => /^origin$|^country$/i.test(s.key))?.value ?? "—"}
              </span>
            </div>
            <div>
              <span className="mr-1 text-foreground/50">For Who:</span>
              {previewProduct.forWho.length > 0 ? (
                <span className="inline-flex flex-wrap gap-1.5 align-middle">
                  {previewProduct.forWho.map((tag) => (
                    <Pill key={tag} tone="default">
                      {tag}
                    </Pill>
                  ))}
                </span>
              ) : (
                <span className="font-medium text-foreground">—</span>
              )}
            </div>
            <div>
              <div className="text-foreground/50">Short Description:</div>
              <p className="text-foreground">{previewProduct.shortDescription ?? "—"}</p>
            </div>
            <div>
              <div className="text-foreground/50">Full Description:</div>
              {previewProduct.description ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: previewProduct.description }}
                />
              ) : (
                <p className="text-foreground">—</p>
              )}
            </div>

            {previewProduct.hasVariants && (previewProduct.variants?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-foreground/50">
                  Variants{previewProduct.variantOptionLabel ? ` (${previewProduct.variantOptionLabel})` : ""}:
                </div>
                <div className="overflow-x-auto rounded-lg border border-black/10">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-black/[0.03] text-xs font-bold text-foreground/60">
                        <th className="px-3 py-2">Variant</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2 text-right">Sell Price</th>
                        <th className="px-3 py-2 text-right">Regular Price</th>
                        <th className="px-3 py-2 text-right">Stock</th>
                        <th className="px-3 py-2 text-center">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewProduct.variants!.map((v) => (
                        <tr key={v.id} className="border-t border-black/5">
                          <td className="px-3 py-2 font-medium text-foreground">{v.unitLabel ?? "—"}</td>
                          <td className="px-3 py-2 text-foreground/60">{v.sku}</td>
                          <td className="px-3 py-2 text-right text-foreground">{money(v.basePrice)}</td>
                          <td className="px-3 py-2 text-right text-foreground/60">
                            {v.compareAtPrice ? money(v.compareAtPrice) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">{v.stock}</td>
                          <td className="px-3 py-2 text-center">{v.isActive ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-base sm:grid-cols-3">
            {/* <div>
              <div className="text-sm text-foreground/50">Brand</div>
              <div className="font-medium text-foreground">{previewProduct.brand?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-foreground/50">Unit</div>
              <div className="font-medium text-foreground">{previewProduct.unit}</div>
            </div>
            <div>
              <div className="text-sm text-foreground/50">Cost Price</div>
              <div className="font-medium text-foreground">{money(previewProduct.costPrice)}</div>
            </div> */}
            {/* Always shown from the product's own master fields — these
                exist no matter the mode (kept in sync with the cheapest
                variant automatically once any variant exists — see
                ProductsService.recomputeBasePriceFromVariants), so pricing
                is never blank even for a variant product with no rows
                added yet. The Variants table above adds the per-row detail
                on top of this summary once real rows exist. */}
            {/* <div>
              <div className="text-sm text-foreground/50">Sell Price</div>
              <div className="font-medium text-foreground">{money(previewProduct.basePrice)}</div>
            </div>
            <div>
              <div className="text-sm text-foreground/50">Regular Price</div>
              <div className="font-medium text-foreground">
                {previewProduct.compareAtPrice ? money(previewProduct.compareAtPrice) : "—"}
              </div>
            </div>
            <div>
              <div className="text-sm text-foreground/50">Stock</div>
              <div className="font-medium text-foreground">
                {previewProduct.inventory ? previewProduct.inventory.currentStock : "—"}
              </div>
            </div> */}
          </div>

          <div className="mt-4">
            <div className="mb-1 text-sm text-foreground/50">Published Stores</div>
            {previewProduct.channels && previewProduct.channels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {previewProduct.channels.map((c) => (
                  <Pill key={c.channelId} tone="primary">
                    {c.channel.name}
                  </Pill>
                ))}
              </div>
            ) : (
              <p className="text-base text-foreground/40">Not published</p>
            )}
          </div>

          {(previewProduct.metaTitle || previewProduct.metaDescription || previewProduct.focusKeywords.length > 0) && (
            <div className="mt-4 rounded-lg border border-black/10 p-3">
              <div className="mb-2 text-sm font-semibold text-foreground/70">SEO &amp; Social Sharing</div>
              {previewProduct.metaTitle && (
                <div className="mb-2">
                  <div className="text-sm text-foreground/50">Meta Title</div>
                  <p className="text-base text-foreground">{previewProduct.metaTitle}</p>
                </div>
              )}
              {previewProduct.metaDescription && (
                <div className="mb-2">
                  <div className="text-sm text-foreground/50">Meta Description</div>
                  <p className="text-base text-foreground">{previewProduct.metaDescription}</p>
                </div>
              )}
              {previewProduct.focusKeywords.length > 0 && (
                <div>
                  <div className="mb-1 text-sm text-foreground/50">Focus Keywords</div>
                  <div className="flex flex-wrap gap-1.5">
                    {previewProduct.focusKeywords.map((kw) => (
                      <Pill key={kw} tone="default">
                        {kw}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              onClick={() => {
                const id = previewProduct.id;
                setPreviewProduct(null);
                router.push(`/products/${id}`);
              }}
            >
              Edit Product
            </Button>
          </div>
        </Modal>
      )}

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
