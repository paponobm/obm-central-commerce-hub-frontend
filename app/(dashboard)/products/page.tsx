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
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}

        {!products ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-foreground/50">
            No products match. Create one to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">Category / Brand</th>
                <th className="pb-2 font-medium">Published Stores</th>
                {!activeChannelId && <th className="pb-2 font-medium text-right">Stock</th>}
                <th className="pb-2 font-medium text-right">Base Price</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const image = p.images?.[0]?.url;
                const available = p.inventory
                  ? p.inventory.currentStock - p.inventory.reservedStock
                  : 0;
                return (
                  <tr key={p.id} className="border-b border-black/5 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image, not part of the Next.js image pipeline
                          <img
                            src={image}
                            alt={p.name}
                            className="h-8 w-8 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-medium text-foreground/40">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <button
                            onClick={() => router.push(`/products/${p.id}`)}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {p.name}
                          </button>
                          <div className="text-xs text-foreground/50">{p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-foreground/60">
                      {p.category?.name ?? "—"}
                      {p.brand?.name && ` · ${p.brand.name}`}
                    </td>
                    <td className="py-2.5">
                      {p.channels && p.channels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.channels.map((c) => (
                            <Pill key={c.channelId} tone="primary">
                              {c.channel.name}
                            </Pill>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-foreground/40">Not published</span>
                      )}
                    </td>
                    {!activeChannelId && (
                    <td className="py-2.5 text-right">
                      <span className={available <= 0 ? "text-status-cancelled" : "text-foreground"}>
                        {available}
                      </span>
                    </td>
                    )}
                    <td className="py-2.5 text-right font-medium text-foreground">
                      {money(p.basePrice)}
                    </td>
                    <td className="py-2.5">
                      <Pill tone={p.isActive ? "primary" : "default"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Pill>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => router.push(`/products/${p.id}`)}>
                          Edit
                        </Button>
                        {!activeChannelId && (
                        <Button
                          variant="ghost"
                          className="text-status-cancelled hover:bg-status-cancelled/10"
                          disabled={deletingId === p.id}
                          onClick={() => handleDelete(p)}
                        >
                          {deletingId === p.id ? "Deleting…" : "Delete"}
                        </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
