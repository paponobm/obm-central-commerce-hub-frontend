"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { Brand } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface FormState {
  id: string | null;
  name: string;
  logoUrl: string;
}

export default function BrandsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("products.manage");
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      setBrands(await api.get<Brand[]>("/admin/brands"));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load brands");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFormError(null);
    setUploading(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      setForm((f) => (f ? { ...f, logoUrl: url } : f));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    const payload = { name: form.name, logoUrl: form.logoUrl || undefined };
    try {
      if (form.id) await api.patch(`/admin/brands/${form.id}`, payload);
      else await api.post("/admin/brands", payload);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(b: Brand) {
    if (!confirm(`Delete "${b.name}"?`)) return;
    setDeletingId(b.id);
    try {
      await api.delete(`/admin/brands/${b.id}`);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to delete brand");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Brands"
        description="Product brands shared across every storefront."
        actions={
          canManage && (
            <Button variant="primary" onClick={() => { setFormError(null); setForm({ id: null, name: "", logoUrl: "" }); }}>
              New Brand
            </Button>
          )
        }
      />
      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{loadError}</p>
        )}
        {!brands ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : brands.length === 0 ? (
          <p className="text-sm text-foreground/50">No brands yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Name</th>
                {canManage && <th className="pb-2 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {b.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo, not part of the Next.js image pipeline
                        <img src={b.logoUrl} alt={b.name} className="h-8 w-8 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-medium text-foreground/40">
                          {b.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="font-medium text-foreground">{b.name}</span>
                    </div>
                  </td>
                  {canManage && (
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => { setFormError(null); setForm({ id: b.id, name: b.name, logoUrl: b.logoUrl ?? "" }); }}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-status-cancelled hover:bg-status-cancelled/10"
                          disabled={deletingId === b.id}
                          onClick={() => handleDelete(b)}
                        >
                          {deletingId === b.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit Brand" : "New Brand"}>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded file
                  <img src={form.logoUrl} alt="Logo" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-md bg-black/5 text-xs text-foreground/40">
                    No logo
                  </span>
                )}
                <div className="flex flex-col items-start gap-1">
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
                    {uploading ? "Uploading…" : form.logoUrl ? "Replace logo" : "Upload from computer"}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading} onChange={handleLogo} />
                  </label>
                  {form.logoUrl && (
                    <button type="button" onClick={() => setForm({ ...form, logoUrl: "" })} className="text-xs text-foreground/50 hover:text-status-cancelled">
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{formError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting || uploading}>
                {submitting ? "Saving…" : form.id ? "Save Changes" : "Create Brand"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
