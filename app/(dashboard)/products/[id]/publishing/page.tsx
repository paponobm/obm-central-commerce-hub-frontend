"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Product, ProductChannelOverride } from "@/lib/types";
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
  compareAtPrice: string;
  isFeatured: boolean;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function togglePublish(row: ProductChannelOverride) {
    setChannelError(null);
    setChannelBusyId(row.channelId);
    try {
      const action = row.isPublished ? "unpublish" : "publish";
      await api.post(`/admin/products/${productId}/channels/${row.channelId}/${action}`, {});
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

  return (
    <>
      <Card>
        <h2 className="mb-4 text-lg font-bold text-primary">Storefront Publishing</h2>
        {channelError && (
          <p className="mb-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {channelError}
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
                <th className="rounded-r-lg px-3 py-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((row) => (
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
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => openChannelEditor(row)}>
                        Edit
                      </Button>
                      <Button
                        variant={row.isPublished ? "ghost" : "primary"}
                        disabled={channelBusyId === row.channelId}
                        onClick={() => togglePublish(row)}
                      >
                        {channelBusyId === row.channelId
                          ? "…"
                          : row.isPublished
                            ? "Unpublish"
                            : "Publish"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {channelRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-foreground/50">
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
      >
        {channelForm && (
          <form onSubmit={handleChannelFormSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                placeholder={product.name}
                value={channelForm.name}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, name: e.target.value } : f))
                }
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={channelForm.slug}
                onChange={(e) =>
                  setChannelForm((f) => (f ? { ...f, slug: e.target.value } : f))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={product.basePrice}
                  value={channelForm.price}
                  onChange={(e) =>
                    setChannelForm((f) => (f ? { ...f, price: e.target.value } : f))
                  }
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
                    setChannelForm((f) => (f ? { ...f, compareAtPrice: e.target.value } : f))
                  }
                />
              </div>
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
    </>
  );
}
