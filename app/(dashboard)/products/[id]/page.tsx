"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Category, Channel, Product, ProductVariant } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { LoadingLine } from "@/components/ui/spinner";

interface MasterForm {
  name: string;
  baseSku: string;
  urlSlug: string;
  slogan: string;
  shortDescription: string;
  description: string;
  unit: string;
  categoryId: string;
  isActive: boolean;
}

// Simple-product pricing + stock — its own card/save (matching the New
// Product page's "Pricing & Variants" section), separate from the Details
// form above it.
interface PricingForm {
  basePrice: string;
  compareAtPrice: string;
  stock: string;
}

interface SpecRow {
  key: number;
  label: string;
  value: string;
}

let specRowSeq = 1;
function nextSpecRowId() {
  return specRowSeq++;
}

// One row of the single Pricing & Variants table — same shape whether it
// already exists (id set) or is a new, not-yet-saved row (id null), so the
// table looks and behaves exactly like the New Product page's Step 2,
// just pre-populated from this product's real variants.
interface VariantDraft {
  id: string | null;
  sku: string;
  unitLabel: string;
  basePrice: string;
  compareAtPrice: string;
  stock: string;
  imageUrl: string;
  isDefault: boolean;
  isActive: boolean;
  uploading: boolean;
}

function draftFromVariant(v: ProductVariant): VariantDraft {
  return {
    id: v.id,
    sku: v.sku,
    unitLabel: v.unitLabel ?? "",
    basePrice: v.basePrice,
    compareAtPrice: v.compareAtPrice ?? "",
    stock: String(v.stock),
    imageUrl: v.imageUrl ?? "",
    isDefault: v.isDefault,
    isActive: v.isActive,
    uploading: false,
  };
}

const EMPTY_VARIANT_DRAFT: VariantDraft = {
  id: null,
  sku: "",
  unitLabel: "",
  basePrice: "",
  compareAtPrice: "",
  stock: "",
  imageUrl: "",
  isDefault: false,
  isActive: true,
  uploading: false,
};

// "Step 1 — Options (attributes)" generator — identical to the New Product
// page's: batch-creates new rows in the one Variants table below instead of
// typing each one by hand with "+ Add row". Purely a convenience for adding
// several at once; generated rows land in the same table, nothing separate.
const MAX_OPTIONS = 3;

interface ProductOption {
  id: number;
  name: string;
  values: string[];
  draft: string;
}

let optionIdSeq = 1;
function nextOptionId() {
  return optionIdSeq++;
}

function skuToken(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "X";
  if (words.length === 1) {
    return words[0].replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "X";
  }
  return words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

function cartesianProduct(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (acc, list) => acc.flatMap((combo) => list.map((v) => [...combo, v])),
    [[]],
  );
}

export default function ProductDetailsTab() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [master, setMaster] = useState<MasterForm | null>(null);
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterSaved, setMasterSaved] = useState(false);

  // Simple-product Pricing & Variants card — stock here is the product's
  // real Inventory.currentStock, edited as an absolute number but saved as
  // a delta through the same adjust endpoint the Inventory page uses.
  const [pricing, setPricing] = useState<PricingForm | null>(null);
  const [originalStock, setOriginalStock] = useState(0);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSaved, setPricingSaved] = useState(false);

  // Specifications / Key Features
  const [specs, setSpecs] = useState<SpecRow[]>([]);

  // Pricing & Variants (Variable product) — one flat list, one Save,
  // exactly like the New Product page's Step 2 table.
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
  const [variantsSaving, setVariantsSaving] = useState(false);
  const [variantsSaved, setVariantsSaved] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [genOptions, setGenOptions] = useState<ProductOption[]>([]);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);

  // Publish — same simple channel-checkbox + per-channel-category design as
  // the New Product page, not the old per-channel name/slug/price/featured
  // override table.
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [channelCategoryId, setChannelCategoryId] = useState<Record<string, string>>({});
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishSaved, setPublishSaved] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function loadProduct() {
    try {
      const data = await api.get<Product>(`/admin/products/${productId}`);
      setProduct(data);
      setMaster({
        name: data.name,
        baseSku: data.sku,
        urlSlug: data.slug ?? "",
        slogan: data.slogan ?? "",
        shortDescription: data.shortDescription ?? "",
        description: data.description ?? "",
        unit: data.unit,
        categoryId: data.categoryId ?? "",
        isActive: data.isActive,
      });
      const currentStock = data.inventory?.currentStock ?? 0;
      setPricing({
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice ?? "",
        stock: String(currentStock),
      });
      setOriginalStock(currentStock);
      setSpecs(
        (data.specifications ?? []).map((s) => ({ key: nextSpecRowId(), label: s.key, value: s.value })),
      );
      setVariantDrafts((data.variants ?? []).map(draftFromVariant));
      // Seed Step 1 with the existing variants' own labels (e.g. "red") as
      // an unnamed option's value tags, so they're visible and the admin
      // can just add more values (e.g. "blue") instead of retyping them —
      // only on first load, so it never clobbers an in-progress edit.
      setGenOptions((prev) => {
        if (prev.length > 0) return prev;
        const labels = Array.from(
          new Set(
            (data.variants ?? [])
              .map((v) => v.unitLabel?.trim())
              .filter((l): l is string => !!l),
          ),
        );
        return labels.length > 0
          ? [{ id: nextOptionId(), name: "", values: labels, draft: "" }]
          : prev;
      });
      const channelRows = await api.get<{ channelId: string; isPublished: boolean }[]>(
        `/admin/products/${productId}/channels`,
      );
      const publishedChannelIds = channelRows.filter((r) => r.isPublished).map((r) => r.channelId);
      setSelectedChannelIds(publishedChannelIds);

      // Pre-fill every currently-published channel's category picker with
      // the product's first tagged category — same single shared tag set
      // the New Product page's Publish section writes to — so the dropdown
      // doesn't look empty when a category is actually already set.
      const productCategories = await api
        .get<Category[]>(`/admin/products/${productId}/categories`)
        .catch(() => []);
      if (productCategories.length > 0) {
        const firstCategoryId = productCategories[0].id;
        setChannelCategoryId((prev) => {
          const next = { ...prev };
          for (const channelId of publishedChannelIds) {
            if (!(channelId in next)) next[channelId] = firstCategoryId;
          }
          return next;
        });
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load product");
    }
  }

  useEffect(() => {
    loadProduct();
    api.get<Category[]>("/admin/categories").then(setCategories).catch(() => {});
    api.get<Channel[]>("/admin/channels").then(setChannels).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleMasterSubmit(e: FormEvent) {
    e.preventDefault();
    if (!master) return;
    setMasterError(null);
    setMasterSaving(true);
    setMasterSaved(false);
    const specifications = specs
      .filter((s) => s.label.trim())
      .map((s) => ({ key: s.label.trim(), value: s.value.trim() }));
    try {
      await api.patch(`/admin/products/${productId}`, {
        name: master.name,
        sku: master.baseSku.trim(),
        slug: master.urlSlug.trim() || undefined,
        slogan: master.slogan.trim() || undefined,
        shortDescription: master.shortDescription.trim() || undefined,
        description: master.description || undefined,
        specifications,
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

  async function handlePricingSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pricing) return;
    setPricingError(null);
    setPricingSaving(true);
    setPricingSaved(false);
    try {
      await api.patch(`/admin/products/${productId}`, {
        basePrice: Number(pricing.basePrice),
        compareAtPrice: pricing.compareAtPrice ? Number(pricing.compareAtPrice) : null,
      });
      const newStock = pricing.stock ? Number(pricing.stock) : 0;
      const delta = newStock - originalStock;
      if (delta !== 0) {
        await api.post(`/admin/inventory/${productId}/adjust`, {
          delta,
          note: "Stock set from the product's Pricing & Variants card",
        });
      }
      await loadProduct();
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 2000);
    } catch (err) {
      setPricingError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPricingSaving(false);
    }
  }

  // Specifications
  function addSpecRow() {
    setSpecs((rows) => [...rows, { key: nextSpecRowId(), label: "", value: "" }]);
  }
  function updateSpecRow(key: number, patch: Partial<SpecRow>) {
    setSpecs((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeSpecRow(key: number) {
    setSpecs((rows) => rows.filter((r) => r.key !== key));
  }

  function updateVariantDraft(index: number, patch: Partial<VariantDraft>) {
    setVariantDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addVariantDraftRow() {
    setVariantDrafts((rows) => [...rows, { ...EMPTY_VARIANT_DRAFT }]);
  }

  function addGenOption() {
    setGenOptions((prev) =>
      prev.length >= MAX_OPTIONS
        ? prev
        : [...prev, { id: nextOptionId(), name: "", values: [], draft: "" }],
    );
  }
  function removeGenOption(id: number) {
    setGenOptions((prev) => prev.filter((o) => o.id !== id));
  }
  function updateGenOptionName(id: number, value: string) {
    setGenOptions((prev) => prev.map((o) => (o.id === id ? { ...o, name: value } : o)));
  }
  function updateGenOptionDraft(id: number, value: string) {
    setGenOptions((prev) => prev.map((o) => (o.id === id ? { ...o, draft: value } : o)));
  }
  function addGenOptionValue(id: number) {
    setGenOptions((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const v = o.draft.trim();
        if (!v || o.values.includes(v)) return { ...o, draft: "" };
        return { ...o, values: [...o.values, v], draft: "" };
      }),
    );
  }
  function removeGenOptionValue(id: number, value: string) {
    setGenOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, values: o.values.filter((v) => v !== value) } : o)),
    );
  }

  // Appends one new, not-yet-saved row per generated combination straight
  // into the single Variants table below — no separate table, nothing to
  // review elsewhere. Resets Step 1 afterward so it's ready for another batch.
  function handleGenerateVariants() {
    const base = master?.baseSku.trim() || "SKU";
    // Step 1 is pre-seeded with existing rows' own labels (see loadProduct),
    // so a combo matching one of those is already in the table below —
    // skip it instead of adding a duplicate row.
    const existingLabels = new Set(
      variantDrafts.map((d) => d.unitLabel.trim().toLowerCase()).filter(Boolean),
    );
    const newRows: VariantDraft[] = genCombos
      .filter((combo) => !existingLabels.has(combo.join(" / ").trim().toLowerCase()))
      .map((combo) => ({
        ...EMPTY_VARIANT_DRAFT,
        sku: `${base}-${combo.map(skuToken).join("-")}`,
        unitLabel: combo.join(" / "),
      }));
    const allLabels = Array.from(
      new Set([...variantDrafts, ...newRows].map((d) => d.unitLabel.trim()).filter(Boolean)),
    );
    if (newRows.length > 0) {
      setVariantDrafts((prev) => [...prev, ...newRows]);
    }
    setGenOptions(
      allLabels.length > 0 ? [{ id: nextOptionId(), name: "", values: allLabels, draft: "" }] : [],
    );
  }

  // Default is exclusive across the whole table (existing rows and any
  // not-yet-saved new ones) — enforced locally here; the backend also
  // clears every other variant's isDefault when this row is saved.
  function selectDefaultVariantDraft(index: number) {
    setVariantDrafts((rows) => rows.map((r, i) => ({ ...r, isDefault: i === index })));
  }

  async function handleVariantImageSelect(index: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    updateVariantDraft(index, { uploading: true });
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      updateVariantDraft(index, { imageUrl: url, uploading: false });
    } catch (err) {
      updateVariantDraft(index, { uploading: false });
      setVariantsError(err instanceof ApiError ? err.message : "Failed to upload image");
    }
  }

  // Removing an already-saved row deletes it right away (same confirm-then-
  // delete the row always had); a not-yet-saved row just disappears.
  async function removeVariantDraftRow(index: number) {
    const row = variantDrafts[index];
    if (!row.id) {
      setVariantDrafts((rows) => rows.filter((_, i) => i !== index));
      return;
    }
    if (!confirm(`Remove variant "${row.sku}"? Its stock will be removed from this product's total.`)) {
      return;
    }
    try {
      await api.delete(`/admin/products/${productId}/variants/${row.id}`);
      await loadProduct();
    } catch (err) {
      setVariantsError(err instanceof ApiError ? err.message : "Failed to remove this row");
    }
  }

  // Bulk-set only touches the local draft, same as the New Product page's
  // own Bulk set buttons — nothing is sent until Save is pressed.
  function bulkSetVariantPrice() {
    const value = window.prompt("Set this Sell Price on every variant below:");
    if (value === null || !value.trim() || Number.isNaN(Number(value))) return;
    setVariantDrafts((rows) => rows.map((r) => ({ ...r, basePrice: value.trim() })));
  }

  function bulkSetVariantStock() {
    const value = window.prompt("Set this Stock on every variant below:");
    if (value === null || !value.trim() || Number.isNaN(Number(value))) return;
    setVariantDrafts((rows) => rows.map((r) => ({ ...r, stock: value.trim() })));
  }

  async function handleSaveVariants() {
    setVariantsError(null);
    setVariantsSaving(true);
    setVariantsSaved(false);
    try {
      for (const row of variantDrafts) {
        if (!row.sku.trim() || !row.basePrice) continue;
        const payload = {
          sku: row.sku.trim(),
          unitLabel: row.unitLabel.trim() || undefined,
          basePrice: Number(row.basePrice),
          compareAtPrice: row.compareAtPrice ? Number(row.compareAtPrice) : undefined,
          stock: row.stock ? Number(row.stock) : 0,
          imageUrl: row.imageUrl || undefined,
          isDefault: row.isDefault,
          isActive: row.isActive,
        };
        if (row.id) {
          await api.patch(`/admin/products/${productId}/variants/${row.id}`, payload);
        } else {
          await api.post(`/admin/products/${productId}/variants`, payload);
        }
      }
      await loadProduct();
      setVariantsSaved(true);
      setTimeout(() => setVariantsSaved(false), 2000);
    } catch (err) {
      setVariantsError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setVariantsSaving(false);
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

  function toggleChannel(channelId: string) {
    setSelectedChannelIds((ids) =>
      ids.includes(channelId) ? ids.filter((id) => id !== channelId) : [...ids, channelId],
    );
  }

  // A channel's own curated category list (Settings → Badge & Category →
  // categorySlugs) when it has one, else every published category — same
  // fallback the storefront's own category endpoint uses.
  function categoriesForChannel(channel: Channel): Category[] {
    const curatedSlugs = channel.themeConfig?.categorySlugs;
    const published = categories.filter((c) => c.isPublished);
    if (!curatedSlugs?.length) return published;
    return published.filter((c) => curatedSlugs.includes(c.slug));
  }

  async function handleSavePublish() {
    setPublishError(null);
    setPublishSaved(false);
    setPublishSaving(true);
    try {
      const current = await api.get<{ channelId: string; isPublished: boolean }[]>(
        `/admin/products/${productId}/channels`,
      );
      for (const row of current) {
        const shouldBePublished = selectedChannelIds.includes(row.channelId);
        if (shouldBePublished && !row.isPublished) {
          await api.post(`/admin/products/${productId}/channels/${row.channelId}/publish`, {});
        } else if (!shouldBePublished && row.isPublished) {
          await api.post(`/admin/products/${productId}/channels/${row.channelId}/unpublish`, {});
        }
      }
      const categoryIdSet = new Set<string>();
      for (const id of Object.values(channelCategoryId)) {
        if (id) categoryIdSet.add(id);
      }
      if (categoryIdSet.size > 0) {
        await api.put(`/admin/products/${productId}/categories`, {
          categoryIds: Array.from(categoryIdSet),
        });
      }
      setPublishSaved(true);
      setTimeout(() => setPublishSaved(false), 2000);
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : "Failed to save publish changes");
    } finally {
      setPublishSaving(false);
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
  const activeChannels = channels.filter((c) => c.isActive);
  const variantsTotalStock = variantDrafts.reduce(
    (sum, r) => (r.isActive ? sum + (Number(r.stock) || 0) : sum),
    0,
  );
  const genOptionValueLists = genOptions.map((o) => o.values).filter((v) => v.length > 0);
  const genCombos: string[][] =
    genOptionValueLists.length > 0 ? cartesianProduct(genOptionValueLists) : [];
  // Combos already present as a row below (pre-seeded existing labels, or
  // ones generated earlier) don't count as "new" for the button/count.
  const genExistingLabels = new Set(
    variantDrafts.map((d) => d.unitLabel.trim().toLowerCase()).filter(Boolean),
  );
  const genNewCombos = genCombos.filter(
    (combo) => !genExistingLabels.has(combo.join(" / ").trim().toLowerCase()),
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold text-primary">Details</h2>
          <form onSubmit={handleMasterSubmit} className="space-y-4">
            <div>
              <Label className="!text-base !font-bold">Product Name</Label>
              <Input
                required
                className="w-full mb-5"
                value={master.name}
                onChange={(e) => setMaster((m) => (m ? { ...m, name: e.target.value } : m))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="!text-base !font-bold">Base SKU</Label>
                <Input
                  required
                  className="w-full"
                  value={master.baseSku}
                  onChange={(e) => setMaster((m) => (m ? { ...m, baseSku: e.target.value } : m))}
                />
              </div>
              <div>
                <Label className="!text-base !font-bold">URL Slug</Label>
                <Input
                  className="w-full"
                  value={master.urlSlug}
                  onChange={(e) => setMaster((m) => (m ? { ...m, urlSlug: e.target.value } : m))}
                  placeholder="e.g. premium-shutki"
                />
              </div>
            </div>

            <div>
              <Label className="!text-base !font-bold">Slogan / Tagline</Label>
              <Input
                className="w-full mb-5"
                maxLength={80}
                value={master.slogan}
                onChange={(e) => setMaster((m) => (m ? { ...m, slogan: e.target.value } : m))}
                placeholder="A short, punchy line shown with the product"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="!text-base !font-bold">Short Description</Label>
                <span className="text-xs text-foreground/40">{master.shortDescription.length}/250</span>
              </div>
              <Textarea
                rows={2}
                maxLength={250}
                className="w-full mb-5"
                value={master.shortDescription}
                onChange={(e) =>
                  setMaster((m) => (m ? { ...m, shortDescription: e.target.value } : m))
                }
                placeholder="One or two sentences — shown on the product card"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="!text-base !font-bold">Category</Label>
                <Select
                  className="w-full"
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
                <Label className="!text-base !font-bold">Unit</Label>
                <Input
                  className="w-full mb-5"
                  value={master.unit}
                  onChange={(e) => setMaster((m) => (m ? { ...m, unit: e.target.value } : m))}
                />
              </div>
            </div>

            <div>
              <Label className="!text-base !font-bold">Full Description</Label>
              <RichTextEditor
                value={master.description}
                onChange={(html) => setMaster((m) => (m ? { ...m, description: html } : m))}
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

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary">Specifications / Key Features</h2>
            <Button type="button" variant="secondary" onClick={addSpecRow} className="!text-sm">
              + Add row
            </Button>
          </div>
          <div className="space-y-2">
            {specs.length === 0 && (
              <p className="text-sm text-foreground/50">No specifications yet.</p>
            )}
            {specs.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_2fr_auto] items-center gap-3">
                <Input
                  className="w-full !text-base"
                  value={row.label}
                  onChange={(e) => updateSpecRow(row.key, { label: e.target.value })}
                  placeholder="e.g. Origin"
                />
                <Input
                  className="w-full !text-base"
                  value={row.value}
                  onChange={(e) => updateSpecRow(row.key, { value: e.target.value })}
                  placeholder="e.g. Cox's Bazar"
                />
                <button
                  type="button"
                  onClick={() => removeSpecRow(row.key)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10"
                  aria-label="Remove row"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-foreground/40">
            Saved together with the Details form above.
          </p>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold text-primary">Pricing &amp; Variants</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div
              className={`rounded-lg border p-3 text-left ${
                !product.hasVariants ? "border-primary bg-primary/5" : "border-black/10 opacity-50"
              }`}
            >
              <div className="font-bold text-foreground">Simple Product</div>
              <div className="text-xs text-foreground/50">One price, one SKU, one stock</div>
            </div>
            <div
              className={`rounded-lg border p-3 text-left ${
                product.hasVariants ? "border-primary bg-primary/5" : "border-black/10 opacity-50"
              }`}
            >
              <div className="font-bold text-foreground">Variable Product</div>
              <div className="text-xs text-foreground/50">
                Weight / size / color — each its own price, SKU, stock
              </div>
            </div>
          </div>

          {!product.hasVariants && pricing && (
            <form onSubmit={handlePricingSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="!text-base">Sell Price</Label>
                  <Input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full !text-base"
                    value={pricing.basePrice}
                    onChange={(e) => setPricing((p) => (p ? { ...p, basePrice: e.target.value } : p))}
                  />
                </div>
                <div>
                  <Label className="!text-base">Regular Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full !text-base"
                    value={pricing.compareAtPrice}
                    onChange={(e) =>
                      setPricing((p) => (p ? { ...p, compareAtPrice: e.target.value } : p))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label className="!text-base">Stock</Label>
                  <Input
                    type="number"
                    min="0"
                    className="w-full !text-base"
                    value={pricing.stock}
                    onChange={(e) => setPricing((p) => (p ? { ...p, stock: e.target.value } : p))}
                  />
                </div>
              </div>
              {pricingError && (
                <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                  {pricingError}
                </p>
              )}
              <div className="flex items-center justify-end gap-3">
                <Button type="submit" disabled={pricingSaving} className="!text-sm">
                  {pricingSaving ? "Saving…" : "Save"}
                </Button>
                {pricingSaved && <span className="text-sm text-status-delivered">Saved</span>}
              </div>
            </form>
          )}

          {product.hasVariants && (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Step 1 — Options (attributes)</h3>
                  {genOptions.length > 0 && genOptionValueLists.length > 0 && (
                    <span className="text-xs text-foreground/50">
                      {genOptionValueLists.map((l) => l.length).join(" × ")} = {genCombos.length} variants
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {genOptions.map((option) => (
                    <div key={option.id} className="grid grid-cols-[1fr_2fr_auto] items-start gap-3">
                      <Input
                        className="w-full !text-base"
                        value={option.name}
                        onChange={(e) => updateGenOptionName(option.id, e.target.value)}
                        placeholder="e.g. Weight"
                      />
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2 py-1.5">
                        {option.values.map((v) => (
                          <span
                            key={v}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {v}
                            <button
                              type="button"
                              onClick={() => removeGenOptionValue(option.id, v)}
                              aria-label={`Remove ${v}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          className="min-w-[80px] flex-1 border-none text-sm outline-none"
                          value={option.draft}
                          onChange={(e) => updateGenOptionDraft(option.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addGenOptionValue(option.id);
                            }
                          }}
                          onBlur={() => addGenOptionValue(option.id)}
                          placeholder="value, Enter…"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGenOption(option.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10"
                        aria-label="Remove option"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={genOptions.length >= MAX_OPTIONS}
                    onClick={addGenOption}
                    className="!text-sm"
                  >
                    + Add option (Color, Size…)
                  </Button>
                  <span className="text-xs text-foreground/40">up to {MAX_OPTIONS} options</span>
                </div>
                {genNewCombos.length > 0 && (
                  <div className="mt-3 flex justify-end">
                    <Button type="button" onClick={handleGenerateVariants} className="!text-sm">
                      + Add {genNewCombos.length} generated variant{genNewCombos.length > 1 ? "s" : ""} to table below
                    </Button>
                  </div>
                )}
              </div>

              <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-foreground">Variants</h3>
                  <span className="text-xs text-foreground/50">
                    Total Stock: <span className="font-bold text-foreground">{variantsTotalStock}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={bulkSetVariantPrice} className="!text-xs">
                    Bulk set price
                  </Button>
                  <Button type="button" variant="secondary" onClick={bulkSetVariantStock} className="!text-xs">
                    Bulk set stock
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-foreground/60">
                      <th className="pb-2 pr-2">Image</th>
                      <th className="pb-2 pr-2">Variant</th>
                      <th className="pb-2 pr-2">SKU</th>
                      <th className="pb-2 pr-2">Sell Price</th>
                      <th className="pb-2 pr-2">Regular Price</th>
                      <th className="pb-2 pr-2">Stock</th>
                      <th className="pb-2 pr-2 text-center">Default</th>
                      <th className="pb-2 text-center">Active</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {variantDrafts.map((row, index) => (
                      <tr key={row.id ?? `new-${index}`} className="border-t border-black/5">
                        <td className="py-2 pr-2">
                          <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-black/15 bg-black/5 text-xs text-foreground/40 hover:bg-black/10">
                            {row.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, per-variant preview
                              <img src={row.imageUrl} alt={row.unitLabel || row.sku} className="h-9 w-9 rounded-lg object-cover" />
                            ) : row.uploading ? (
                              "…"
                            ) : (
                              "+"
                            )}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="hidden"
                              disabled={row.uploading}
                              onChange={(e) => handleVariantImageSelect(index, e)}
                            />
                          </label>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            className="w-28 !text-sm"
                            value={row.unitLabel}
                            onChange={(e) => updateVariantDraft(index, { unitLabel: e.target.value })}
                            placeholder="e.g. 200ml"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            className="w-32 !text-sm"
                            value={row.sku}
                            onChange={(e) => updateVariantDraft(index, { sku: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-24 !text-sm"
                            value={row.basePrice}
                            onChange={(e) => updateVariantDraft(index, { basePrice: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-24 !text-sm"
                            value={row.compareAtPrice}
                            onChange={(e) => updateVariantDraft(index, { compareAtPrice: e.target.value })}
                            placeholder="—"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min="0"
                            className="w-20 !text-sm"
                            value={row.stock}
                            onChange={(e) => updateVariantDraft(index, { stock: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <input
                            type="radio"
                            name="editDefaultVariant"
                            checked={row.isDefault}
                            onChange={() => selectDefaultVariantDraft(index)}
                          />
                        </td>
                        <td className="py-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(e) => updateVariantDraft(index, { isActive: e.target.checked })}
                          />
                        </td>
                        <td className="py-2 pl-2">
                          <button
                            type="button"
                            onClick={() => removeVariantDraftRow(index)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10"
                            aria-label="Remove variant"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Button type="button" variant="secondary" onClick={addVariantDraftRow} className="!text-sm">
                  + Add row
                </Button>
                <div className="flex items-center gap-3">
                  {variantsSaved && <span className="text-sm text-status-delivered">Saved</span>}
                  <Button type="button" disabled={variantsSaving} onClick={handleSaveVariants} className="!text-sm">
                    {variantsSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
              {variantsError && (
                <p className="mt-2 text-sm text-status-cancelled">{variantsError}</p>
              )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {/* Simple products edit Stock directly in Pricing & Variants now —
            this summary only still earns its place for variant products,
            where it's the one place that shows the combined total. */}
        {product.hasVariants && (
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
            <p className="mt-2 text-sm text-foreground/50">
              Sum of every variant&rsquo;s stock below — edit a row&rsquo;s own Stock field to
              change it.
            </p>
          </Card>
        )}

        <Card>
          <h2 className="mb-1 text-lg font-bold text-primary">Thumbnail</h2>
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
          <h2 className="mb-10 text-lg font-bold text-primary">Gallery Images</h2>
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

        <Card>
          <h2 className="mb-4 text-lg font-bold text-primary">Publish</h2>
          <div className="space-y-3">
            {activeChannels.length === 0 && (
              <p className="text-base text-foreground/50">No active channels found.</p>
            )}
            {activeChannels.map((channel) => {
              const checked = selectedChannelIds.includes(channel.id);
              const channelCategories = categoriesForChannel(channel);
              return (
                <div key={channel.id} className="rounded-lg border border-black/10 p-3">
                  <label className="flex items-center gap-2 text-base font-medium text-foreground">
                    <input type="checkbox" checked={checked} onChange={() => toggleChannel(channel.id)} />
                    {channel.name}
                  </label>
                  {checked && (
                    <div className="mt-2">
                      <Label className="!text-sm">Category on {channel.name}</Label>
                      <Select
                        className="w-full !text-base"
                        value={channelCategoryId[channel.id] ?? ""}
                        onChange={(e) =>
                          setChannelCategoryId((m) => ({ ...m, [channel.id]: e.target.value }))
                        }
                      >
                        <option value="">None</option>
                        {channelCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {publishError && (
            <p className="mt-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              {publishError}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-3">
            <Button type="button" disabled={publishSaving} onClick={handleSavePublish} className="!text-sm">
              {publishSaving ? "Saving…" : "Save"}
            </Button>
            {publishSaved && <span className="text-sm text-status-delivered">Saved</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
