"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Category, Brand, Product } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

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

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

function CashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 6v.01M18 18v-.01" />
    </svg>
  );
}

function StoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" />
      <path d="M9 20v-6h6v6" />
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
  icon,
}: {
  label: string;
  value: string;
  tone: keyof typeof SUMMARY_DOT_CLASSES;
  icon: React.ReactNode;
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

interface CreateFormState {
  sku: string;
  name: string;
  costPrice: string;
  basePrice: string;
  unit: string;
  categoryId: string;
  brandId: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  sku: "",
  name: "",
  costPrice: "",
  basePrice: "",
  unit: "pcs",
  categoryId: "",
  brandId: "",
};

export default function ProductsPage() {
  const router = useRouter();
  const { activeChannelId } = useChannelScope();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
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

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    api.get<Brand[]>("/admin/brands").then(setBrands).catch(() => {});
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

  function openCreate() {
    setFormError(null);
    setForm(EMPTY_CREATE_FORM);
    setCreateOpen(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const product = await api.post<Product>("/admin/products", {
        sku: form.sku,
        name: form.name,
        costPrice: Number(form.costPrice),
        basePrice: Number(form.basePrice),
        unit: form.unit || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
      });
      setCreateOpen(false);
      // Images and channel publishing need the product to exist first, so
      // creation always lands on the detail page rather than staying here.
      router.push(`/products/${product.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

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

  // These three always reflect the whole catalog (fetched once above with
  // includeInactive=true), independent of whatever the Status dropdown is
  // currently narrowing the table down to — same pattern as the Inventory
  // page's own summary cards.
  const totalProducts = products?.length ?? 0;
  const activeBasePriceTotal =
    products?.filter((p) => p.isActive).reduce((sum, p) => sum + Number(p.basePrice), 0) ?? 0;
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
            <Button variant="primary" onClick={openCreate}>
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
          icon={<BoxIcon className="h-5 w-5" />}
        />
        <SummaryCard
          label="Base Price (Active)"
          value={money(activeBasePriceTotal)}
          tone="delivered"
          icon={<CashIcon className="h-5 w-5" />}
        />
        <SummaryCard
          label="Published to Storefront"
          value={String(publishedCount)}
          tone="pending"
          icon={<StoreIcon className="h-5 w-5" />}
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
          <p className="text-base text-foreground/60">Loading…</p>
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
                          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image, not part of the Next.js image pipeline
                          <img
                            src={image}
                            alt={p.name}
                            className="h-9 w-9 shrink-0 rounded object-cover"
                          />
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
                      <Pill tone={p.isActive ? "success" : "danger"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Pill>
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Product">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>SKU</Label>
              <Input
                required
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. SHK-001"
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="pcs"
              />
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Premium Shutki"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cost Price</Label>
              <Input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              />
            </div>
            <div>
              <Label>Base Price</Label>
              <Input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.basePrice}
                onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Brand</Label>
              <Select
                value={form.brandId}
                onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))}
              >
                <option value="">None</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {formError && (
            <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              {formError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Product"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
