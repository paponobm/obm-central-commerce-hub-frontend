"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Category, Brand, Product, ProductChannelOverride } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface MasterForm {
  name: string;
  description: string;
  costPrice: string;
  basePrice: string;
  unit: string;
  categoryId: string;
  brandId: string;
  isActive: boolean;
}

interface ChannelForm {
  name: string;
  slug: string;
  price: string;
  compareAtPrice: string;
  isFeatured: boolean;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [channelRows, setChannelRows] = useState<ProductChannelOverride[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [master, setMaster] = useState<MasterForm | null>(null);
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterSaved, setMasterSaved] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [channelBusyId, setChannelBusyId] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<ProductChannelOverride | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelForm | null>(null);
  const [channelSubmitting, setChannelSubmitting] = useState(false);
  const [channelFormError, setChannelFormError] = useState<string | null>(null);

  async function loadProduct() {
    try {
      const data = await api.get<Product>(`/admin/products/${productId}`);
      setProduct(data);
      setMaster({
        name: data.name,
        description: data.description ?? "",
        costPrice: data.costPrice,
        basePrice: data.basePrice,
        unit: data.unit,
        categoryId: data.categoryId ?? "",
        brandId: data.brandId ?? "",
        isActive: data.isActive,
      });
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load product");
    }
  }

  async function loadChannels() {
    try {
      const data = await api.get<ProductChannelOverride[]>(
        `/admin/products/${productId}/channels`,
      );
      setChannelRows(data);
    } catch (err) {
      setChannelError(err instanceof ApiError ? err.message : "Failed to load channels");
    }
  }

  useEffect(() => {
    loadProduct();
    loadChannels();
    api.get<Category[]>("/admin/categories").then(setCategories).catch(() => {});
    api.get<Brand[]>("/admin/brands").then(setBrands).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleMasterSubmit(e: FormEvent) {
    e.preventDefault();
    if (!master) return;
    setMasterError(null);
    setMasterSaving(true);
    setMasterSaved(false);
    try {
      await api.patch(`/admin/products/${productId}`, {
        name: master.name,
        description: master.description || undefined,
        costPrice: Number(master.costPrice),
        basePrice: Number(master.basePrice),
        unit: master.unit || undefined,
        categoryId: master.categoryId || undefined,
        brandId: master.brandId || undefined,
        isActive: master.isActive,
      });
      await loadProduct();
      setMasterSaved(true);
      setTimeout(() => setMasterSaved(false), 2000);
    } catch (err) {
      setMasterError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setMasterSaving(false);
    }
  }

  async function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    setUploadingImage(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      await api.post(`/admin/products/${productId}/images`, { url });
      await loadProduct();
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleRemoveImage(imageId: string) {
    setImageError(null);
    try {
      await api.delete(`/admin/products/${productId}/images/${imageId}`);
      await loadProduct();
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : "Failed to remove image");
    }
  }

  async function togglePublish(row: ProductChannelOverride) {
    setChannelError(null);
    setChannelBusyId(row.channelId);
    try {
      const action = row.isPublished ? "unpublish" : "publish";
      await api.post(`/admin/products/${productId}/channels/${row.channelId}/${action}`);
      await loadChannels();
    } catch (err) {
      setChannelError(err instanceof ApiError ? err.message : "Failed to update publish state");
    } finally {
      setChannelBusyId(null);
    }
  }

  function openChannelEditor(row: ProductChannelOverride) {
    setChannelFormError(null);
    setEditingChannel(row);
    setChannelForm({
      name: row.name ?? "",
      slug: row.slug ?? "",
      price: row.price ?? "",
      compareAtPrice: row.compareAtPrice ?? "",
      isFeatured: row.isFeatured,
    });
  }

  async function handleChannelFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingChannel || !channelForm) return;
    setChannelFormError(null);
    setChannelSubmitting(true);
    try {
      await api.post(`/admin/products/${productId}/channels/${editingChannel.channelId}`, {
        name: channelForm.name || undefined,
        slug: channelForm.slug || undefined,
        price: channelForm.price ? Number(channelForm.price) : undefined,
        compareAtPrice: channelForm.compareAtPrice ? Number(channelForm.compareAtPrice) : undefined,
        isFeatured: channelForm.isFeatured,
      });
      setEditingChannel(null);
      await loadChannels();
    } catch (err) {
      setChannelFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setChannelSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-status-cancelled">{loadError}</p>;
  }
  if (!product || !master) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }

  const inv = product.inventory;
  const available = inv ? inv.currentStock - inv.reservedStock : 0;

  return (
    <div>
      <PageHeader
        title={product.name}
        description={`SKU ${product.sku}`}
        actions={
          <Button variant="secondary" onClick={() => router.push("/products")}>
            Back to Products
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Details</h2>
          <form onSubmit={handleMasterSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={master.name}
                onChange={(e) => setMaster((m) => (m ? { ...m, name: e.target.value } : m))}
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={master.description}
                onChange={(e) =>
                  setMaster((m) => (m ? { ...m, description: e.target.value } : m))
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Cost Price</Label>
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={master.costPrice}
                  onChange={(e) =>
                    setMaster((m) => (m ? { ...m, costPrice: e.target.value } : m))
                  }
                />
              </div>
              <div>
                <Label>Base Price</Label>
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={master.basePrice}
                  onChange={(e) =>
                    setMaster((m) => (m ? { ...m, basePrice: e.target.value } : m))
                  }
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input
                  value={master.unit}
                  onChange={(e) => setMaster((m) => (m ? { ...m, unit: e.target.value } : m))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={master.categoryId}
                  onChange={(e) =>
                    setMaster((m) => (m ? { ...m, categoryId: e.target.value } : m))
                  }
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
                  value={master.brandId}
                  onChange={(e) =>
                    setMaster((m) => (m ? { ...m, brandId: e.target.value } : m))
                  }
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

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={master.isActive}
                onChange={(e) =>
                  setMaster((m) => (m ? { ...m, isActive: e.target.checked } : m))
                }
              />
              Active (sellable — uncheck to hide from ordering everywhere, including storefronts)
            </label>

            {masterError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {masterError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={masterSaving}>
                {masterSaving ? "Saving…" : "Save Changes"}
              </Button>
              {masterSaved && <span className="text-sm text-status-delivered">Saved</span>}
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Inventory</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground/60">Current Stock</span>
                <span className="font-medium text-foreground">{inv?.currentStock ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/60">Reserved</span>
                <span className="font-medium text-foreground">{inv?.reservedStock ?? 0}</span>
              </div>
              <div className="flex justify-between border-t border-black/5 pt-2">
                <span className="text-foreground/60">Available</span>
                <span
                  className={`font-semibold ${available <= 0 ? "text-status-cancelled" : "text-foreground"}`}
                >
                  {available}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Images</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {product.images?.map((img) => (
                <div key={img.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image */}
                  <img
                    src={img.url}
                    alt={product.name}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(img.id)}
                    className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-status-cancelled text-xs text-white group-hover:flex"
                    aria-label="Remove image"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {(!product.images || product.images.length === 0) && (
                <p className="text-xs text-foreground/50">No images yet.</p>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-black/5">
              {uploadingImage ? "Uploading…" : "Add Image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploadingImage}
                onChange={handleImageSelect}
              />
            </label>
            {imageError && <p className="mt-2 text-xs text-status-cancelled">{imageError}</p>}
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Storefront Publishing</h2>
        <p className="mb-4 text-xs text-foreground/50">
          Publish this product to any storefront, with an optional different name/price per
          channel. Unpublished channels never show this product.
        </p>

        {channelError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {channelError}
          </p>
        )}

        {!channelRows ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Channel</th>
                <th className="pb-2 font-medium">Published</th>
                <th className="pb-2 font-medium">Name Override</th>
                <th className="pb-2 font-medium text-right">Price</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((row) => (
                <tr key={row.channelId} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5 font-medium text-foreground">{row.channelName}</td>
                  <td className="py-2.5">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.isPublished}
                        disabled={channelBusyId === row.channelId}
                        onChange={() => togglePublish(row)}
                      />
                      <span className="text-xs text-foreground/60">
                        {row.isPublished ? "Published" : "Unpublished"}
                      </span>
                    </label>
                  </td>
                  <td className="py-2.5 text-foreground/60">{row.name ?? "(uses product name)"}</td>
                  <td className="py-2.5 text-right text-foreground">
                    {row.price ? money(row.price) : "(base price)"}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button variant="ghost" onClick={() => openChannelEditor(row)}>
                      Edit Override
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!editingChannel}
        onClose={() => setEditingChannel(null)}
        title={editingChannel ? `${editingChannel.channelName} Override` : ""}
      >
        {channelForm && (
          <form onSubmit={handleChannelFormSubmit} className="space-y-4">
            <div>
              <Label>Name Override</Label>
              <Input
                value={channelForm.name}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, name: e.target.value } : f))
                }
                placeholder={product.name}
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={channelForm.slug}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, slug: e.target.value } : f))
                }
                placeholder="auto-generated if left blank"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="lowercase kebab-case"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={channelForm.price}
                  onChange={(e) =>
                    setChannelForm((f) => (f ? { ...f, price: e.target.value } : f))
                  }
                  placeholder={product.basePrice}
                />
              </div>
              <div>
                <Label>Compare-at Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={channelForm.compareAtPrice}
                  onChange={(e) =>
                    setChannelForm((f) =>
                      f ? { ...f, compareAtPrice: e.target.value } : f,
                    )
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={channelForm.isFeatured}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, isFeatured: e.target.checked } : f))
                }
              />
              Featured on this storefront
            </label>

            {channelFormError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {channelFormError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={channelSubmitting}>
                {channelSubmitting ? "Saving…" : "Save Override"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingChannel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
