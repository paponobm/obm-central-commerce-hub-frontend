"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Category, Product } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";

interface MasterForm {
  name: string;
  description: string;
  basePrice: string;
  unit: string;
  categoryId: string;
  isActive: boolean;
}

export default function ProductDetailsTab() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [master, setMaster] = useState<MasterForm | null>(null);
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterSaved, setMasterSaved] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);

  async function loadProduct() {
    try {
      const data = await api.get<Product>(`/admin/products/${productId}`);
      setProduct(data);
      setMaster({
        name: data.name,
        description: data.description ?? "",
        basePrice: data.basePrice,
        unit: data.unit,
        categoryId: data.categoryId ?? "",
        isActive: data.isActive,
      });
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load product");
    }
  }

  useEffect(() => {
    loadProduct();
    api.get<Category[]>("/admin/categories").then(setCategories).catch(() => {});
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
        basePrice: Number(master.basePrice),
        unit: master.unit || undefined,
        categoryId: master.categoryId || undefined,
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

  // Separate from the gallery above — a single dedicated image, persisted
  // directly on the product (not another ProductImage row), since this is
  // "the one" shown wherever a small product icon is needed elsewhere in
  // the app (order lines, inventory, product lists).
  async function handleThumbnailSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setThumbnailError(null);
    setUploadingThumbnail(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      await api.patch(`/admin/products/${productId}`, { thumbnailUrl: url });
      await loadProduct();
    } catch (err) {
      setThumbnailError(err instanceof ApiError ? err.message : "Failed to upload thumbnail");
    } finally {
      setUploadingThumbnail(false);
    }
  }

  async function handleRemoveThumbnail() {
    setThumbnailError(null);
    try {
      await api.patch(`/admin/products/${productId}`, { thumbnailUrl: null });
      await loadProduct();
    } catch (err) {
      setThumbnailError(err instanceof ApiError ? err.message : "Failed to remove thumbnail");
    }
  }

  if (loadError) {
    return <p className="text-base text-status-cancelled">{loadError}</p>;
  }
  if (!product || !master) {
    return <LoadingLine className="text-base text-foreground/60" />;
  }

  const inv = product.inventory;
  const available = inv ? inv.currentStock - inv.reservedStock : 0;
  const galleryImages = product.images ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="mb-4 text-lg font-bold text-primary">Details</h2>
        <form onSubmit={handleMasterSubmit} className="space-y-4 ">
          <div>
            <Label className="!text-base !font-bold">Name</Label>
            <Input
              required
              className="w-full  mb-5"
              value={master.name}
              onChange={(e) => setMaster((m) => (m ? { ...m, name: e.target.value } : m))}
            />
          </div>
            <div className="grid grid-cols-3 gap-4">
            <div>
            <Label className="!text-base !font-bold">Category</Label>
            <Select
              className="w-full "
              value={master.categoryId}
              onChange={(e) =>
                setMaster((m) => (m ? { ...m, categoryId: e.target.value } : m))
              }
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.isPublished ? " (Unpublished — not shown in storefront)" : ""}
                </option>
              ))}
            </Select>
          </div>
            <div>
              <Label className="!text-base !font-bold">Base Price</Label>
              <Input
                required
                type="number"
                min="0"
                step="0.01"
                className="w-full "
                value={master.basePrice}
                onChange={(e) =>
                  setMaster((m) => (m ? { ...m, basePrice: e.target.value } : m))
                }
              />
            </div>
            <div>
              <Label className="!text-base !font-bold">Unit</Label>
              <Input
                className="w-full  mb-5"
                value={master.unit}
                onChange={(e) => setMaster((m) => (m ? { ...m, unit: e.target.value } : m))}
              />
            </div>
          </div>

          <div>
            <Label className="!text-base !font-bold">Description</Label>
            <Textarea
              rows={7}
              className="w-full "
              value={master.description}
              onChange={(e) =>
                setMaster((m) => (m ? { ...m, description: e.target.value } : m))
              }
            />
          </div>

        

          

          <label className="flex items-center gap-2 text-base text-foreground">
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
            <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
              {masterError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={masterSaving}>
              {masterSaving ? "Saving…" : "Save Changes"}
            </Button>
            {masterSaved && <span className="text-base text-status-delivered">Saved</span>}
          </div>
        </form>
      </Card>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 text-lg font-bold text-primary">Inventory</h2>
          <div className="flex items-center justify-between">
            <span className="text-base text-foreground/60">Available</span>
            <span
              className={`text-2xl font-bold ${
                available <= 0 ? "text-status-cancelled" : "text-status-delivered"
              }`}
            >
              {available}
            </span>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold text-primary">Thumbnail</h2>
          <p className="mb-3 text-sm text-foreground/50">
            Used wherever this product shows as a small icon — order lines, inventory, and
            product lists.
          </p>
          <div className="mb-3 flex items-center justify-center gap-3">
            {product.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
              <img
                src={product.thumbnailUrl}
                alt={product.name}
                className="h-20 w-20 shrink-0 rounded-md border border-black/10 object-cover"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-black/15 bg-black/5 text-sm text-foreground/40">
                None
              </span>
            )}
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:opacity-90">
                {uploadingThumbnail ? "Uploading…" : product.thumbnailUrl ? "Replace" : "Add Thumbnail"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={uploadingThumbnail}
                  onChange={handleThumbnailSelect}
                />
              </label>
              {product.thumbnailUrl && (
                <Button variant="ghost" className="!px-2.5 !py-1 !text-xs" onClick={handleRemoveThumbnail}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          {thumbnailError && <p className="text-center text-base text-status-cancelled">{thumbnailError}</p>}
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold text-primary">Gallery Images</h2>
          <p className="mb-3 text-sm text-foreground/50">
            The full photo gallery shown on the storefront product page — add as many as you
            like.
          </p>
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            {galleryImages.map((img) => (
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
            {galleryImages.length === 0 && (
              <p className="text-sm text-foreground/50">No gallery images yet.</p>
            )}
          </div>
          <div className="flex justify-center">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:bg-black/5">
              {uploadingImage ? "Uploading…" : "Add Image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploadingImage}
                onChange={handleImageSelect}
              />
            </label>
          </div>
          {imageError && <p className="mt-2 text-center text-sm text-status-cancelled">{imageError}</p>}
        </Card>
      </div>
    </div>
  );
}
