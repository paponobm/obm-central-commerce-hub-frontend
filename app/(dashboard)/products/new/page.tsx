"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Category, Channel, Product } from "@/lib/types";
import { slugify } from "@/lib/slugify";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  ComingSoonTab,
  PRODUCT_TABS,
  ProductFooterBar,
  ProductTabNav,
  PublishChecklist,
  type ChecklistItem,
  type ProductTabKey,
} from "@/components/products/product-form-tabs";

const MAX_OPTIONS = 3;

interface ProductOption {
  id: number;
  name: string;
  values: string[];
  draft: string;
}

interface VariantRowData {
  sku: string;
  basePrice: string;
  discountPrice: string;
  stock: string;
  imageUrl: string;
  isActive: boolean;
}

const EMPTY_VARIANT_ROW: VariantRowData = {
  sku: "",
  basePrice: "",
  discountPrice: "",
  stock: "",
  imageUrl: "",
  isActive: true,
};

let idSeq = 1;
function nextId() {
  return idSeq++;
}

// Matches the storefront's own flag lookup (relief-care-bd's
// components/flash-deal.tsx COUNTRY_FLAGS) — keeping the same list and
// spelling here is what makes a product's flag badge actually show up.
const ORIGIN_COUNTRIES = [
  "Bangladesh",
  "India",
  "Thailand",
  "China",
  "Indonesia",
  "Malaysia",
  "USA",
  "UK",
  "Germany",
  "Japan",
  "Pakistan",
  "Sri Lanka",
];

// "কার জন্য" (Who is this for) — multi-select, unlike Origin, so it's a
// checkbox list rather than a single dropdown. Not a fixed enum: shown here
// as a starting point merged with GET /admin/products/for-who-tags (the
// distinct set already used across every product), so a tag typed once in
// "+ Add new" becomes a real checkbox for every product after that.
const DEFAULT_FOR_WHO_TAGS = ["নিজের জন্য", "পরিবারের জন্য", "বাবা-মায়ের জন্য", "শিশুর জন্য"];

// Abbreviates one option value into a SKU token — a single word becomes
// itself (alnum only, "250g" -> "250G"); multiple words become initials
// ("Gift Box" -> "GB"). Purely a convenience suggestion — every variant's
// SKU is still a plain editable field.
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

export default function NewProductPage() {
  const router = useRouter();

  const [tab, setTab] = useState<ProductTabKey>("general");

  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  // Details
  const [name, setName] = useState("");
  const [baseSku, setBaseSku] = useState("");
  const [urlSlug, setUrlSlug] = useState("");
  const [urlSlugTouched, setUrlSlugTouched] = useState(false);
  const [slogan, setSlogan] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("pcs");
  // Multi-select — the first pick becomes the product's primary categoryId,
  // every pick (including that one) also gets tagged via the shared
  // ProductCategory join (see handleSubmit's categoryIds).
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  // Specifications / Key Features — just the one field (country of origin)
  // in practice, so it's a single dropdown rather than a generic key/value
  // list (which only ever led to inconsistent keys like "Country" vs
  // "Origin" across products).
  const [origin, setOrigin] = useState("");
  // The checkbox list itself — starts with the defaults, grows with
  // whatever GET /admin/products/for-who-tags returns plus anything typed
  // into "+ Add new" during this session.
  const [forWhoTags, setForWhoTags] = useState<string[]>(DEFAULT_FOR_WHO_TAGS);
  const [selectedForWho, setSelectedForWho] = useState<string[]>([]);
  const [newForWhoTag, setNewForWhoTag] = useState("");

  // Thumbnail / gallery — same staged-upload pattern as before: upload
  // immediately to get a URL, attach to the product right after it's created.
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Pricing & Variants
  const [mode, setMode] = useState<"single" | "variable">("single");
  const [singleRow, setSingleRow] = useState({ basePrice: "", discountPrice: "", stock: "" });
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [variantData, setVariantData] = useState<Record<string, VariantRowData>>({});
  const [defaultComboKey, setDefaultComboKey] = useState("");
  const [uploadingVariantKey, setUploadingVariantKey] = useState<string | null>(null);

  // SEO & Social Sharing
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [focusKeywords, setFocusKeywords] = useState<string[]>([]);
  const [focusKeywordDraft, setFocusKeywordDraft] = useState("");

  // Publish
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [channelCategoryIds, setChannelCategoryIds] = useState<Record<string, string[]>>({});

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  useEffect(() => {
    api.get<Category[]>("/admin/categories").then(setCategories).catch(() => {});
    api.get<Channel[]>("/admin/channels").then(setChannels).catch(() => {});
    api
      .get<string[]>("/admin/products/for-who-tags")
      .then((tags) => setForWhoTags((prev) => Array.from(new Set([...prev, ...tags]))))
      .catch(() => {});
  }, []);

  function toggleForWho(tag: string) {
    setSelectedForWho((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }
  function toggleChannelCategory(channelId: string, categoryId: string) {
    setChannelCategoryIds((prev) => {
      const current = prev[channelId] ?? [];
      const next = current.includes(categoryId)
        ? current.filter((c) => c !== categoryId)
        : [...current, categoryId];
      return { ...prev, [channelId]: next };
    });
  }
  function addForWhoTag() {
    const tag = newForWhoTag.trim();
    if (!tag) return;
    setForWhoTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setSelectedForWho((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setNewForWhoTag("");
  }

  function addFocusKeyword() {
    const kw = focusKeywordDraft.trim();
    setFocusKeywordDraft("");
    if (!kw) return;
    setFocusKeywords((prev) => (prev.includes(kw) ? prev : [...prev, kw]));
  }
  function removeFocusKeyword(kw: string) {
    setFocusKeywords((prev) => prev.filter((k) => k !== kw));
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!urlSlugTouched) setUrlSlug(slugify(value));
  }

  async function handleThumbnailSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setThumbnailError(null);
    setUploadingThumbnail(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      setThumbnailUrl(url);
    } catch (err) {
      setThumbnailError(err instanceof ApiError ? err.message : "Failed to upload thumbnail");
    } finally {
      setUploadingThumbnail(false);
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
      setGalleryUrls((urls) => [...urls, url]);
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  // Options (attributes)
  function addOption() {
    setOptions((prev) =>
      prev.length >= MAX_OPTIONS ? prev : [...prev, { id: nextId(), name: "", values: [], draft: "" }],
    );
  }
  function removeOption(id: number) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }
  function updateOptionName(id: number, value: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, name: value } : o)));
  }
  function updateOptionDraft(id: number, value: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, draft: value } : o)));
  }
  function addOptionValue(id: number) {
    setOptions((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        // The option's name feeds the storefront's "২টি সাইজ · বাছুন"-style
        // button label now, not just a cosmetic column header — so a value
        // can't be added until it's named.
        const v = o.name.trim() ? o.draft.trim() : "";
        if (!v || o.values.includes(v)) return { ...o, draft: "" };
        return { ...o, values: [...o.values, v], draft: "" };
      }),
    );
  }
  function removeOptionValue(id: number, value: string) {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, values: o.values.filter((v) => v !== value) } : o)),
    );
  }

  const optionValueLists = options.map((o) => o.values).filter((v) => v.length > 0);
  const generatedCombos: string[][] = optionValueLists.length > 0 ? cartesianProduct(optionValueLists) : [];

  function comboKey(combo: string[]) {
    return combo.join("|");
  }
  function getVariantRow(key: string): VariantRowData {
    return variantData[key] ?? EMPTY_VARIANT_ROW;
  }
  function updateVariantRow(key: string, patch: Partial<VariantRowData>) {
    setVariantData((prev) => ({ ...prev, [key]: { ...getVariantRow(key), ...patch } }));
  }
  function autoVariantSku(combo: string[]) {
    const base = baseSku.trim() || "SKU";
    return `${base}-${combo.map(skuToken).join("-")}`;
  }

  // Sum of every active row's Stock — same "combined total" the product's
  // own Inventory ends up with once created (see create()'s stock-summing).
  const totalVariantStock = generatedCombos.reduce((sum, combo) => {
    const row = getVariantRow(comboKey(combo));
    if (row.isActive === false) return sum;
    return sum + (row.stock ? Number(row.stock) || 0 : 0);
  }, 0);

  // Active (not explicitly turned off) rows with a Sell Price filled in —
  // shared by the publish checklist and the Live Preview's price line.
  const activeVariantRows = generatedCombos
    .map((combo) => getVariantRow(comboKey(combo)))
    .filter((row) => row.isActive !== false && row.basePrice);
  const sellPriceFilled = mode === "single" ? !!singleRow.basePrice : activeVariantRows.length > 0;
  const previewSellPrice =
    mode === "single"
      ? singleRow.basePrice
      : activeVariantRows.length
        ? String(Math.min(...activeVariantRows.map((r) => Number(r.basePrice))))
        : "";
  const previewRegularPrice = mode === "single" ? singleRow.discountPrice : "";

  async function handleVariantImageSelect(key: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingVariantKey(key);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      updateVariantRow(key, { imageUrl: url });
    } catch {
      // Non-fatal — the row just keeps no image; the form's own error
      // banner is reserved for submit-time failures.
    } finally {
      setUploadingVariantKey(null);
    }
  }

  function bulkSetPrice() {
    const value = window.prompt("Set this price on every variant below:");
    if (value === null || !value.trim() || Number.isNaN(Number(value))) return;
    setVariantData((prev) => {
      const next = { ...prev };
      for (const combo of generatedCombos) {
        const key = comboKey(combo);
        next[key] = { ...getVariantRow(key), basePrice: value.trim() };
      }
      return next;
    });
  }
  function bulkSetStock() {
    const value = window.prompt("Set this stock on every variant below:");
    if (value === null || !value.trim() || Number.isNaN(Number(value))) return;
    setVariantData((prev) => {
      const next = { ...prev };
      for (const combo of generatedCombos) {
        const key = comboKey(combo);
        next[key] = { ...getVariantRow(key), stock: value.trim() };
      }
      return next;
    });
  }

  function toggleChannel(channelId: string) {
    setSelectedChannelIds((ids) => {
      if (ids.includes(channelId)) {
        const next = ids.filter((id) => id !== channelId);
        setChannelCategoryIds((m) => {
          const rest = { ...m };
          delete rest[channelId];
          return rest;
        });
        return next;
      }
      return [...ids, channelId];
    });
  }

  // A channel's own curated category list (Settings → Badge & Category →
  // categorySlugs) when it has one, else every published category — same
  // fallback the storefront's own category endpoint uses.
  function categoriesForChannel(channel: Channel): Category[] {
    const curatedSlugs = channel.themeConfig?.categorySlugs;
    const published = categories.filter((c) => c.isPublished);
    if (!curatedSlugs) return published;
    return published.filter((c) => curatedSlugs.includes(c.slug));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitProduct(false);
  }

  async function handleSaveDraft() {
    await submitProduct(true);
  }

  // asDraft forces isActive:false and skips publishing to any channel
  // regardless of what's checked (see ProductsService.create, which also
  // enforces this independently) — a draft is never live anywhere, full
  // stop. Everything else about the product (name, pricing, categories,
  // variants) still saves normally, so no work typed in is lost.
  async function submitProduct(asDraft: boolean) {
    setFormError(null);

    if (!name.trim()) {
      setFormError("Please enter a product name.");
      return;
    }
    if (!baseSku.trim()) {
      setFormError("Please enter a Base SKU.");
      return;
    }

    let basePrice: number;
    let variantsPayload:
      | {
          sku: string;
          unitLabel?: string;
          basePrice: number;
          compareAtPrice?: number;
          stock: number;
          imageUrl?: string;
          isDefault?: boolean;
        }[]
      | undefined;
    let compareAtPrice: number | undefined;
    let initialStock: number | undefined;

    if (mode === "single") {
      if (!singleRow.basePrice) {
        setFormError("Please fill out Sell Price.");
        return;
      }
      basePrice = Number(singleRow.basePrice);
      compareAtPrice = singleRow.discountPrice ? Number(singleRow.discountPrice) : undefined;
      initialStock = singleRow.stock ? Number(singleRow.stock) : 0;
    } else {
      const rows = generatedCombos
        .map((combo) => {
          const key = comboKey(combo);
          const row = getVariantRow(key);
          return { combo, key, row };
        })
        .filter(({ row }) => row.isActive !== false && row.basePrice);
      if (rows.length === 0) {
        setFormError("Please add at least one option value and fill out a variant's Sell Price.");
        return;
      }
      basePrice = Math.min(...rows.map(({ row }) => Number(row.basePrice)));
      variantsPayload = rows.map(({ combo, key, row }) => ({
        sku: row.sku.trim() || autoVariantSku(combo),
        unitLabel: combo.join(" / "),
        basePrice: Number(row.basePrice),
        compareAtPrice: row.discountPrice ? Number(row.discountPrice) : undefined,
        stock: row.stock ? Number(row.stock) : 0,
        imageUrl: row.imageUrl || undefined,
        isDefault: defaultComboKey === key,
      }));
    }

    const categoryIdSet = new Set<string>(selectedCategoryIds);
    for (const ids of Object.values(channelCategoryIds)) {
      for (const id of ids) categoryIdSet.add(id);
    }

    const specifications = origin.trim() ? [{ key: "Origin", value: origin.trim() }] : [];

    // The storefront's "২টি সাইজ · বাছুন"-style button label — only
    // meaningful when every variant came from exactly one named option;
    // two or more (e.g. Size + Flavor combined) falls back to a generic
    // "ভ্যারিয়েন্ট" label on the storefront instead of naming just one of them.
    const usedOptions = options.filter((o) => o.name.trim() && o.values.length > 0);
    const variantOptionLabel =
      mode === "variable" && usedOptions.length === 1 ? usedOptions[0].name.trim() : undefined;

    (asDraft ? setSubmittingDraft : setSubmitting)(true);
    try {
      const product = await api.post<Product>("/admin/products", {
        sku: baseSku.trim(),
        name: name.trim(),
        slug: urlSlug.trim() || undefined,
        slogan: slogan.trim() || undefined,
        shortDescription: shortDescription.trim() || undefined,
        description: description.trim() || undefined,
        specifications: specifications.length ? specifications : undefined,
        forWho: selectedForWho.length ? selectedForWho : undefined,
        costPrice: 0,
        basePrice,
        compareAtPrice,
        unit: unit || undefined,
        categoryId: selectedCategoryIds[0] || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        // A normal create starts sellable; a draft starts (and stays)
        // off, regardless of the Publish checkboxes below — see
        // ProductsService.create, which enforces this pairing itself too.
        isActive: !asDraft,
        isDraft: asDraft,
        hasVariants: mode === "variable",
        variantOptionLabel,
        initialStock: mode === "single" ? initialStock : undefined,
        variants: variantsPayload,
        channelIds: asDraft || !selectedChannelIds.length ? undefined : selectedChannelIds,
        categoryIds: categoryIdSet.size ? Array.from(categoryIdSet) : undefined,
        metaTitle: metaTitle.trim() || undefined,
        metaDescription: metaDescription.trim() || undefined,
        focusKeywords: focusKeywords.length ? focusKeywords : undefined,
      });
      for (const url of galleryUrls) {
        await api.post(`/admin/products/${product.id}/images`, { url });
      }
      router.push("/products");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      (asDraft ? setSubmittingDraft : setSubmitting)(false);
    }
  }

  const activeChannels = channels.filter((c) => c.isActive);

  // Drives both the tab-dot indicators and the footer's "Ready to publish"
  // line — `tab: null` means the field lives in the sidebar (always
  // visible), not under any one tab.
  const checklist: ChecklistItem[] = [
    { label: "Product Name", done: !!name.trim(), tab: "general" },
    { label: "Base SKU", done: !!baseSku.trim(), tab: "general" },
    { label: "Short Description", done: !!shortDescription.trim(), tab: "general" },
    { label: "Thumbnail", done: !!thumbnailUrl, tab: null },
    { label: "Price", done: sellPriceFilled, tab: "priceVariants" },
    { label: "Meta Description", done: !!metaDescription.trim(), tab: "seo" },
  ];
  const currentTabIndex = PRODUCT_TABS.findIndex((t) => t.key === tab);
  const nextTab = PRODUCT_TABS[currentTabIndex + 1];

  return (
    <div className="pb-20">
      <PageHeader
        title="New Product"
        description="Create a product — pricing/stock, publish channels, and categories all in one place."
      />

      <form onSubmit={handleSubmit}>
        <div className="-mx-4 mb-6  px-4 shadow-card sm:-mx-6 sm:px-6 font-bold text-xl">
          <ProductTabNav tab={tab} onChange={setTab} checklist={checklist} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {tab === "general" && (
              <>
                <Card>
                  <h2 className="mb-4 text-lg font-bold text-primary">Details</h2>
                  <div className="space-y-4">
                    <div>
                      <Label className="!text-base">
                        Product Name <span className="text-status-cancelled">*</span>
                      </Label>
                      <Input
                        className="w-full !text-base"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="e.g. Premium Shutki"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="!text-base">
                          Base SKU <span className="text-status-cancelled">*</span>
                        </Label>
                        <Input
                          className="w-full !text-base"
                          value={baseSku}
                          onChange={(e) => setBaseSku(e.target.value)}
                          placeholder="e.g. SHK-001"
                        />
                        <p className="mt-1 text-xs text-foreground/50">
                          Variant SKUs auto-generate from here, e.g. {baseSku.trim() || "SHK-001"}-500G
                        </p>
                      </div>
                      <div>
                        <Label className="!text-base">URL Slug</Label>
                        <Input
                          className="w-full !text-base"
                          value={urlSlug}
                          onChange={(e) => {
                            setUrlSlug(e.target.value);
                            setUrlSlugTouched(true);
                          }}
                          placeholder="e.g. premium-shutki"
                        />
                        <p className="mt-1 text-xs text-foreground/50">Auto from name, lowercase, English</p>
                      </div>
                    </div>

                    <div>
                      <Label className="!text-base">Slogan / Tagline</Label>
                      <Input
                        className="w-full !text-base"
                        maxLength={80}
                        value={slogan}
                        onChange={(e) => setSlogan(e.target.value)}
                        placeholder="e.g. Fresh from the sea, straight to your home"
                      />
                      <p className="mt-1 text-xs text-foreground/50">
                        Shown under the name on the product page &amp; ad creative · max 80 chars
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="!text-base">Short Description</Label>
                        <span className="text-xs text-foreground/40">{shortDescription.length}/250</span>
                      </div>
                      <Textarea
                        className="w-full !text-base"
                        rows={3}
                        maxLength={250}
                        value={shortDescription}
                        onChange={(e) => setShortDescription(e.target.value)}
                        placeholder="3–4 lines — shown on the product card, cart & checkout"
                      />
                    </div>

                    <div>
                      <Label className="!text-base">Full Description</Label>
                      <RichTextEditor value={description} onChange={setDescription} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="!text-base">Unit</Label>
                        <Input
                          className="w-full !text-base"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder="pcs"
                        />
                      </div>
                      <div>
                        <Label className="!text-base">Category</Label>
                        <p className="mb-2 text-xs text-foreground/50">
                          Pick any that apply — the first one picked is the product&rsquo;s primary category.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {categories.length === 0 && (
                            <span className="text-sm text-foreground/50">No categories yet.</span>
                          )}
                          {categories.map((c) => (
                            <label
                              key={c.id}
                              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                                selectedCategoryIds.includes(c.id)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-black/10 text-foreground/70"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedCategoryIds.includes(c.id)}
                                onChange={() => toggleCategory(c.id)}
                                className="mr-1.5"
                              />
                              {c.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h2 className="mb-3 text-lg font-bold text-primary">Specifications / Key Features</h2>
                  <div>
                    <Label className="!text-base">Origin</Label>
                    <Input
                      list="origin-countries"
                      className="w-full !text-base"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="Select or type a country"
                    />
                    <datalist id="origin-countries">
                      {ORIGIN_COUNTRIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div className="mt-4">
                    <Label className="!text-base">For Who</Label>
                    <p className="mb-2 text-xs text-foreground/50">
                      Powers the storefront combo builder&rsquo;s &ldquo;কম্বোটা কার জন্য?&rdquo; filter. Pick any
                      that apply, or add a brand new tag — it becomes a real option for every product after this.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {forWhoTags.map((tag) => (
                        <label
                          key={tag}
                          className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                            selectedForWho.includes(tag)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-black/10 text-foreground/70"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedForWho.includes(tag)}
                            onChange={() => toggleForWho(tag)}
                            className="mr-1.5"
                          />
                          {tag}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newForWhoTag}
                        onChange={(e) => setNewForWhoTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addForWhoTag();
                          }
                        }}
                        placeholder="e.g. প্রবীণদের জন্য"
                        className="!text-sm"
                      />
                      <Button type="button" variant="secondary" onClick={addForWhoTag}>
                        + Add new
                      </Button>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {tab === "priceVariants" && (
              <Card>
                <h2 className="mb-1 text-lg font-bold text-primary">Pricing &amp; Variants</h2>
                <p className="mb-4 text-xs text-foreground/50">
                  One product, one price — or variants by size/weight/color, each its own price, SKU &amp; stock?
                </p>

                <div className="mb-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("single")}
                    className={`rounded-lg border p-3 text-left ${
                      mode === "single" ? "border-primary bg-primary/5" : "border-black/10 hover:bg-black/5"
                    }`}
                  >
                    <div className="font-bold text-foreground">Simple Product</div>
                    <div className="text-xs text-foreground/50">One price, one SKU, one stock</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("variable")}
                    className={`rounded-lg border p-3 text-left ${
                      mode === "variable" ? "border-primary bg-primary/5" : "border-black/10 hover:bg-black/5"
                    }`}
                  >
                    <div className="font-bold text-foreground">Variable Product</div>
                    <div className="text-xs text-foreground/50">Weight / size / color — each its own price, SKU, stock</div>
                  </button>
                </div>

                {mode === "single" ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="!text-base">Sell Price</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full !text-base"
                        value={singleRow.basePrice}
                        onChange={(e) => setSingleRow((r) => ({ ...r, basePrice: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="!text-base">Regular Price</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full !text-base"
                        value={singleRow.discountPrice}
                        onChange={(e) => setSingleRow((r) => ({ ...r, discountPrice: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <Label className="!text-base">Stock</Label>
                      <Input
                        type="number"
                        min="0"
                        className="w-full !text-base"
                        value={singleRow.stock}
                        onChange={(e) => setSingleRow((r) => ({ ...r, stock: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-foreground">Step 1 — Options (attributes)</h3>
                        {options.length > 0 && optionValueLists.length > 0 && (
                          <span className="text-xs text-foreground/50">
                            {optionValueLists.map((l) => l.length).join(" × ")} = {generatedCombos.length} variants
                            auto-generated
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {options.map((option) => (
                          <div key={option.id} className="grid grid-cols-[1fr_2fr_auto] items-start gap-3">
                            <Input
                              className="w-full !text-base"
                              value={option.name}
                              onChange={(e) => updateOptionName(option.id, e.target.value)}
                              placeholder="e.g. Weight"
                            />
                            <div
                              className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2 py-1.5 ${
                                option.name.trim() ? "" : "opacity-50"
                              }`}
                            >
                              {option.values.map((v) => (
                                <span
                                  key={v}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                                >
                                  {v}
                                  <button
                                    type="button"
                                    onClick={() => removeOptionValue(option.id, v)}
                                    aria-label={`Remove ${v}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              <input
                                className="min-w-[80px] flex-1 border-none text-sm outline-none disabled:cursor-not-allowed"
                                value={option.draft}
                                onChange={(e) => updateOptionDraft(option.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addOptionValue(option.id);
                                  }
                                }}
                                onBlur={() => addOptionValue(option.id)}
                                disabled={!option.name.trim()}
                                placeholder={option.name.trim() ? "value, Enter…" : "Name this option first…"}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOption(option.id)}
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
                          disabled={options.length >= MAX_OPTIONS}
                          onClick={addOption}
                          className="!text-sm"
                        >
                          + Add option (Color, Size…)
                        </Button>
                        <span className="text-xs text-foreground/40">up to {MAX_OPTIONS} options</span>
                      </div>
                    </div>

                    {generatedCombos.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="text-sm font-bold text-foreground">Step 2 — Variant table</h3>
                            <span className="text-xs text-foreground/50">
                              Total Stock: <span className="font-bold text-foreground">{totalVariantStock}</span>
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" onClick={bulkSetPrice} className="!text-xs">
                              Bulk set price
                            </Button>
                            <Button type="button" variant="secondary" onClick={bulkSetStock} className="!text-xs">
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
                              </tr>
                            </thead>
                            <tbody>
                              {generatedCombos.map((combo) => {
                                const key = comboKey(combo);
                                const row = getVariantRow(key);
                                return (
                                  <tr key={key} className="border-t border-black/5">
                                    <td className="py-2 pr-2">
                                      <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-black/15 bg-black/5 text-xs text-foreground/40 hover:bg-black/10">
                                        {row.imageUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, per-variant preview
                                          <img src={row.imageUrl} alt={combo.join(" / ")} className="h-9 w-9 rounded-lg object-cover" />
                                        ) : uploadingVariantKey === key ? (
                                          "…"
                                        ) : (
                                          "+"
                                        )}
                                        <input
                                          type="file"
                                          accept="image/jpeg,image/png,image/webp,image/gif"
                                          className="hidden"
                                          disabled={uploadingVariantKey === key}
                                          onChange={(e) => handleVariantImageSelect(key, e)}
                                        />
                                      </label>
                                    </td>
                                    <td className="py-2 pr-2 font-medium text-foreground">{combo.join(" / ")}</td>
                                    <td className="py-2 pr-2">
                                      <Input
                                        className="w-32 !text-sm"
                                        // Shows (but doesn't commit) the Base-SKU-prefixed
                                        // suggestion until the admin actually edits this row —
                                        // any edit "locks in" their own value from then on.
                                        value={row.sku || autoVariantSku(combo)}
                                        onChange={(e) => updateVariantRow(key, { sku: e.target.value })}
                                      />
                                    </td>
                                    <td className="py-2 pr-2">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-24 !text-sm"
                                        value={row.basePrice}
                                        onChange={(e) => updateVariantRow(key, { basePrice: e.target.value })}
                                      />
                                    </td>
                                    <td className="py-2 pr-2">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="w-24 !text-sm"
                                        value={row.discountPrice}
                                        onChange={(e) => updateVariantRow(key, { discountPrice: e.target.value })}
                                        placeholder="—"
                                      />
                                    </td>
                                    <td className="py-2 pr-2">
                                      <Input
                                        type="number"
                                        min="0"
                                        className="w-20 !text-sm"
                                        value={row.stock}
                                        onChange={(e) => updateVariantRow(key, { stock: e.target.value })}
                                      />
                                    </td>
                                    <td className="py-2 pr-2 text-center">
                                      <input
                                        type="radio"
                                        name="defaultVariant"
                                        checked={defaultComboKey === key}
                                        onChange={() => setDefaultComboKey(key)}
                                      />
                                    </td>
                                    <td className="py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={row.isActive}
                                        onChange={(e) => updateVariantRow(key, { isActive: e.target.checked })}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {tab === "stockDelivery" && <ComingSoonTab label="Stock & Delivery" />}
            {tab === "detailsCompliance" && <ComingSoonTab label="Details & Compliance" />}

            {tab === "seo" && (
              <Card>
                <h2 className="mb-1 text-lg font-bold text-primary">SEO &amp; Social Sharing</h2>
                <p className="mb-4 text-xs text-foreground/50">
                  Leave blank to auto-use the product name &amp; Short Description.
                </p>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="!text-base">Meta Title</Label>
                      <span className="text-xs text-foreground/40">{metaTitle.length}/60</span>
                    </div>
                    <Input
                      className="w-full !text-base"
                      maxLength={60}
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      placeholder={name.trim() || "Auto from product name"}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="!text-base">Meta Description</Label>
                      <span className="text-xs text-foreground/40">{metaDescription.length}/160</span>
                    </div>
                    <Textarea
                      className="w-full !text-base"
                      rows={3}
                      maxLength={160}
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      placeholder="140–160 characters: key benefit + delivery/offer"
                    />
                  </div>
                  <div>
                    <Label className="!text-base">Focus Keywords</Label>
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2 py-1.5">
                      {focusKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {kw}
                          <button type="button" onClick={() => removeFocusKeyword(kw)} aria-label={`Remove ${kw}`}>
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        className="min-w-[100px] flex-1 border-none text-sm outline-none"
                        value={focusKeywordDraft}
                        onChange={(e) => setFocusKeywordDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addFocusKeyword();
                          }
                        }}
                        onBlur={addFocusKeyword}
                        placeholder="Add keyword"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {tab === "marketing" && <ComingSoonTab label="Marketing" />}
            {tab === "activity" && <ComingSoonTab label="Activity" />}

            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
                {formError}
              </p>
            )}
          </div>

          <div className="space-y-6 lg:sticky lg:top-16 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-2">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-primary">Live Preview</h2>
                <span className="text-xs text-foreground/40">Product card</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-black/10">
                <div className="flex h-40 items-center justify-center bg-black/5 text-sm text-foreground/40">
                  {thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                    <img src={thumbnailUrl} alt="Thumbnail preview" className="h-full w-full object-cover" />
                  ) : (
                    "Thumbnail"
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="font-bold leading-snug text-foreground">{name.trim() || "Product name"}</p>
                  {slogan.trim() && <p className="text-xs text-foreground/60">{slogan.trim()}</p>}
                  <p className="flex items-center gap-2 font-bold text-primary">
                    {previewSellPrice ? `৳ ${previewSellPrice}` : "৳ [PRICE]"}
                    {previewRegularPrice && (
                      <span className="text-xs font-normal text-foreground/40 line-through">
                        ৳ {previewRegularPrice}
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-medium text-status-delivered">Free delivery inside Dhaka</p>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="mb-10 text-lg font-bold text-primary">Thumbnail</h2>
              <div className="flex items-center justify-center gap-3">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail preview"
                    className="h-20 w-20 shrink-0 rounded-md border border-black/10 object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-black/15 bg-black/5 text-sm text-foreground/40">
                    None
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg hover:opacity-90">
                    {uploadingThumbnail ? "Uploading…" : thumbnailUrl ? "Replace" : "Add Thumbnail"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingThumbnail}
                      onChange={handleThumbnailSelect}
                    />
                  </label>
                  {thumbnailUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-2.5 !py-1 !text-xs"
                      onClick={() => setThumbnailUrl(null)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {thumbnailError && <p className="mt-2 text-center text-sm text-status-cancelled">{thumbnailError}</p>}
            </Card>

            <Card>
              <h2 className="mb-10 text-lg font-bold text-primary">Gallery Images</h2>
              <div className="mb-3 flex flex-wrap justify-center gap-2">
                {galleryUrls.map((url) => (
                  <div key={url} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image */}
                    <img src={url} alt="Gallery preview" className="h-16 w-16 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => setGalleryUrls((urls) => urls.filter((u) => u !== url))}
                      className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-status-cancelled text-xs text-white group-hover:flex"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {galleryUrls.length === 0 && <p className="text-sm text-foreground/50">No gallery images yet.</p>}
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
                          <div className="flex flex-wrap gap-2">
                            {channelCategories.length === 0 && (
                              <span className="text-sm text-foreground/50">No categories yet.</span>
                            )}
                            {channelCategories.map((c) => (
                              <label
                                key={c.id}
                                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                                  (channelCategoryIds[channel.id] ?? []).includes(c.id)
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-black/10 text-foreground/70"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={(channelCategoryIds[channel.id] ?? []).includes(c.id)}
                                  onChange={() => toggleChannelCategory(channel.id, c.id)}
                                  className="mr-1.5"
                                />
                                {c.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        <ProductFooterBar>
          <PublishChecklist checklist={checklist} />
          <div className="flex items-center justify-end gap-3 pb-3">
            <Button type="button" variant="secondary" onClick={() => router.push("/products")} className="!text-base">
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveDraft}
              disabled={submitting || submittingDraft}
              className="!text-base"
              title="Save without publishing — won't appear on any storefront until reactivated from the Products list"
            >
              {submittingDraft ? "Saving…" : "Save as Draft"}
            </Button>
            {nextTab && (
              <Button type="button" variant="secondary" onClick={() => setTab(nextTab.key)} className="!text-base">
                Next: {nextTab.label} →
              </Button>
            )}
            {/* type="button", not "submit" — this bar is portaled straight
                to <body>, outside the <form>'s own DOM subtree, so a native
                submit button here would never actually fire the form. */}
            <Button
              type="button"
              onClick={() => submitProduct(false)}
              disabled={submitting || submittingDraft}
              className="!text-base"
            >
              {submitting ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </ProductFooterBar>
      </form>
    </div>
  );
}
