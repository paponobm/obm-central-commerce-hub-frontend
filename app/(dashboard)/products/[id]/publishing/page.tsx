"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Category, Product, ProductChannelOverride } from "@/lib/types";
import { money } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/badge";

interface ChannelForm {
  name: string;
  slug: string;
  price: string;
  isFeatured: boolean;
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-3.17 4.24M6.6 6.6C3.9 8.35 2 11 2 11s4 7 11 7a10.9 10.9 0 0 0 5-1.2M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export default function ProductPublishingTab() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [channelRows, setChannelRows] = useState<ProductChannelOverride[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [channelBusyId, setChannelBusyId] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  const [editingChannel, setEditingChannel] = useState<ProductChannelOverride | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelForm | null>(null);
  const [channelSubmitting, setChannelSubmitting] = useState(false);
  const [channelFormError, setChannelFormError] = useState<string | null>(null);

  // Extra storefront categories — on top of the single Category field on
  // the Details tab, a product can show up under several category pages.
  // Shown read-only as the table's Category column; only editable from the
  // Publish confirmation modal below.
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Publishing a not-yet-published channel asks which categories the
  // product should show under on that storefront first — same category set
  // as the "Storefront Categories" card, just confirmed at publish time.
  const [publishTarget, setPublishTarget] = useState<ProductChannelOverride | null>(null);
  const [publishDraftCategoryIds, setPublishDraftCategoryIds] = useState<string[]>([]);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishFormError, setPublishFormError] = useState<string | null>(null);

  async function loadChannels() {
    try {
      const rows = await api.get<ProductChannelOverride[]>(`/admin/products/${productId}/channels`);
      setChannelRows(rows);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load channels");
    }
  }

  useEffect(() => {
    api
      .get<Product>(`/admin/products/${productId}`)
      .then(setProduct)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load product"));
    loadChannels();
    api.get<Category[]>("/admin/categories").then(setAllCategories).catch(() => {});
    api
      .get<Category[]>(`/admin/products/${productId}/categories`)
      .then((rows) => setSelectedCategoryIds(rows.map((c) => c.id)))
      .catch((err) =>
        setCategoriesError(err instanceof ApiError ? err.message : "Failed to load categories"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleUnpublish(row: ProductChannelOverride) {
    setChannelError(null);
    setChannelBusyId(row.channelId);
    try {
      await api.post(`/admin/products/${productId}/channels/${row.channelId}/unpublish`, {});
      await loadChannels();
    } catch (err) {
      setChannelError(err instanceof ApiError ? err.message : "Failed to unpublish");
    } finally {
      setChannelBusyId(null);
    }
  }

  function openPublishModal(row: ProductChannelOverride) {
    setPublishFormError(null);
    setPublishDraftCategoryIds(selectedCategoryIds);
    setPublishTarget(row);
  }

  function togglePublishDraftCategory(categoryId: string) {
    setPublishDraftCategoryIds((ids) =>
      ids.includes(categoryId) ? ids.filter((id) => id !== categoryId) : [...ids, categoryId],
    );
  }

  async function confirmPublish(e: FormEvent) {
    e.preventDefault();
    if (!publishTarget) return;
    setPublishFormError(null);
    setPublishSubmitting(true);
    try {
      await api.put(`/admin/products/${productId}/categories`, {
        categoryIds: publishDraftCategoryIds,
      });
      setSelectedCategoryIds(publishDraftCategoryIds);
      await api.post(`/admin/products/${productId}/channels/${publishTarget.channelId}/publish`, {});
      await loadChannels();
      setPublishTarget(null);
    } catch (err) {
      setPublishFormError(err instanceof ApiError ? err.message : "Failed to publish");
    } finally {
      setPublishSubmitting(false);
    }
  }

  function openChannelEditor(row: ProductChannelOverride) {
    setChannelFormError(null);
    setEditingChannel(row);
    setChannelForm({
      name: row.name ?? "",
      slug: row.slug ?? "",
      price: row.price ?? "",
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
        isFeatured: channelForm.isFeatured,
      });
      await loadChannels();
      setEditingChannel(null);
      setChannelForm(null);
    } catch (err) {
      setChannelFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setChannelSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="text-base text-status-cancelled">{loadError}</p>;
  }
  if (!product) {
    return <p className="text-base text-foreground/60">Loading…</p>;
  }

  const publishedCategories = allCategories.filter((c) => c.isPublished);

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-bold text-primary">Storefront Publishing</h2>
        {(channelError || categoriesError) && (
          <p className="mb-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {channelError ?? categoriesError}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead>
              <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                <th className="rounded-l-lg px-3 py-2 font-bold">Channel</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Name</th>
                <th className="px-3 py-2 font-bold">Price</th>
                <th className="px-3 py-2 font-bold">Featured</th>
                <th className="px-3 py-2 font-bold">Category</th>
                <th className="rounded-r-lg px-3 py-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((row) => {
                const categoryNames = selectedCategoryIds
                  .map((id) => allCategories.find((c) => c.id === id)?.name)
                  .filter((name): name is string => !!name);
                return (
                  <tr key={row.channelId} className="border-b border-black/5">
                    <td className="px-3 py-2 font-bold text-primary">{row.channelName}</td>
                    <td className="px-3 py-2">
                      <Pill tone={row.isPublished ? "success" : "default"}>
                        {row.isPublished ? "Published" : "Not published"}
                      </Pill>
                    </td>
                    <td className="px-3 py-2">{row.name ?? product.name}</td>
                    <td className="px-3 py-2">{row.price ? money(row.price) : money(product.basePrice)}</td>
                    <td className="px-3 py-2">{row.isFeatured ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">{categoryNames.length > 0 ? categoryNames.join(", ") : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Edit"
                          aria-label={`Edit ${row.channelName} listing`}
                          onClick={() => openChannelEditor(row)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {row.isPublished ? (
                          <button
                            type="button"
                            title="Unpublish"
                            aria-label={`Unpublish from ${row.channelName}`}
                            disabled={channelBusyId === row.channelId}
                            onClick={() => handleUnpublish(row)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10 disabled:opacity-50"
                          >
                            <EyeOffIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Publish"
                            aria-label={`Publish to ${row.channelName}`}
                            disabled={channelBusyId === row.channelId}
                            onClick={() => openPublishModal(row)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-status-delivered hover:bg-status-delivered/10 disabled:opacity-50"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {channelRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-foreground/50">
                    No channels found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!editingChannel}
        onClose={() => {
          setEditingChannel(null);
          setChannelForm(null);
        }}
        title={`Edit ${editingChannel?.channelName ?? ""} Listing`}
        titleClassName="!text-lg"
        size="lg"
      >
        {channelForm && (
          <form onSubmit={handleChannelFormSubmit} className="space-y-5">
            <div>
              <Label className="!text-base !font-bold">Name</Label>
              <Input
                className="w-full !text-base"
                placeholder={product.name}
                value={channelForm.name}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, name: e.target.value } : f))
                }
              />
            </div>
            <div>
              <Label className="!text-base !font-bold">Slug</Label>
              <Input
                className="w-full !text-base"
                value={channelForm.slug}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, slug: e.target.value } : f))
                }
              />
            </div>
            <div>
              <Label className="!text-base !font-bold">Price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="w-full !text-base"
                placeholder={product.basePrice}
                value={channelForm.price}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, price: e.target.value } : f))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-base text-foreground">
              <input
                type="checkbox"
                checked={channelForm.isFeatured}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, isFeatured: e.target.checked } : f))
                }
              />
              Featured
            </label>
            {channelFormError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
                {channelFormError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button type="submit" disabled={channelSubmitting}>
                {channelSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!publishTarget}
        onClose={() => setPublishTarget(null)}
        title={`Publish to ${publishTarget?.channelName ?? ""}`}
        titleClassName="!text-lg"
        size="lg"
      >
        <form onSubmit={confirmPublish} className="space-y-5">
          <p className="text-base text-foreground/50">
            Which categories should this product show under on {publishTarget?.channelName}?
            Select as many as apply, then confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            {publishedCategories.map((cat) => {
              const active = publishDraftCategoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => togglePublishDraftCategory(cat.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-base font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-black/15 bg-white text-foreground hover:bg-black/5"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {cat.name}
                </button>
              );
            })}
            {publishedCategories.length === 0 && (
              <p className="text-base text-foreground/50">No published categories yet.</p>
            )}
          </div>
          {publishFormError && (
            <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
              {publishFormError}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={publishSubmitting}>
              {publishSubmitting ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
