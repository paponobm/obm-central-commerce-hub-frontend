"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { Category } from "@/lib/types";
import { slugify } from "@/lib/slugify";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface CategoryNode extends Category {
  children: CategoryNode[];
}

interface FlatRow {
  category: Category;
  depth: number;
}

// The API returns a flat, alphabetically-sorted list — nest it into a tree
// here so the table can render real hierarchy (indentation + parent-child
// ordering) instead of a flat list with a "Parent" text column.
function buildTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  categories.forEach((c) => nodes.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  nodes.forEach((node) => {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function flattenTree(nodes: CategoryNode[], depth = 0): FlatRow[] {
  return nodes.flatMap((node) => [
    { category: node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
}

interface FormState {
  id: string | null; // null = creating, else editing this id
  name: string;
  slug: string;
  slugTouched: boolean;
  imageUrl: string;
  parentId: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  slug: "",
  slugTouched: false,
  imageUrl: "",
  parentId: "",
};

function CategoryThumb({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-entered URLs, not part of the Next.js image pipeline
      <img
        src={imageUrl}
        alt={name}
        className="h-8 w-8 shrink-0 rounded-md object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs font-medium text-foreground/40">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null); // null = modal closed
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function loadCategories() {
    try {
      const data = await api.get<Category[]>("/admin/categories");
      setCategories(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load categories");
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function openCreateForm() {
    setFormError(null);
    setPreviewFailed(false);
    setUploadError(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEditForm(category: Category) {
    setFormError(null);
    setPreviewFailed(false);
    setUploadError(null);
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      slugTouched: true, // editing an existing slug shouldn't auto-regenerate under the admin
      imageUrl: category.imageUrl ?? "",
      parentId: category.parentId ?? "",
    });
  }

  function closeForm() {
    setForm(null);
    setFormError(null);
  }

  function handleNameChange(name: string) {
    setForm((prev) =>
      prev
        ? { ...prev, name, slug: prev.slugTouched ? prev.slug : slugify(name) }
        : prev,
    );
  }

  function handleSlugChange(slug: string) {
    setForm((prev) => (prev ? { ...prev, slug, slugTouched: true } : prev));
  }

  async function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a failed upload
    if (!file) return;

    setUploadError(null);
    setPreviewFailed(false);
    setUploading(true);
    try {
      const { url } = await api.upload<{ url: string }>(
        "/admin/uploads/image",
        file,
      );
      setForm((prev) => (prev ? { ...prev, imageUrl: url } : prev));
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "Failed to upload image",
      );
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    setForm((prev) => (prev ? { ...prev, imageUrl: "" } : prev));
    setPreviewFailed(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);

    const payload = {
      name: form.name,
      slug: form.slug,
      imageUrl: form.imageUrl.trim() || undefined,
      parentId: form.parentId || undefined,
    };

    try {
      if (form.id) {
        await api.patch(`/admin/categories/${form.id}`, payload);
      } else {
        await api.post("/admin/categories", payload);
      }
      closeForm();
      await loadCategories();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(category: Category) {
    if (!confirm(`Delete "${category.name}"? This can't be undone.`)) return;
    setDeletingId(category.id);
    setLoadError(null);
    try {
      await api.delete(`/admin/categories/${category.id}`);
      await loadCategories();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete category",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const parentOptions = (categories ?? []).filter((c) => c.id !== form?.id);
  const rows = categories ? flattenTree(buildTree(categories)) : [];

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organize products into a category tree shared across every storefront."
        actions={
          <Button variant="primary" onClick={openCreateForm}>
            New Category
          </Button>
        }
      />

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}

        {!categories ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-foreground/50">
            No categories yet. Create the first one to start organizing products.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Slug</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ category: c, depth }) => (
                <tr key={c.id} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: depth * 24 }}
                    >
                      {depth > 0 && <span className="text-foreground/30">└</span>}
                      <CategoryThumb imageUrl={c.imageUrl} name={c.name} />
                      <span className="font-medium text-foreground">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-foreground/60">{c.slug}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => openEditForm(c)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-status-cancelled hover:bg-status-cancelled/10"
                        disabled={deletingId === c.id}
                        onClick={() => handleDelete(c)}
                      >
                        {deletingId === c.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!form}
        onClose={closeForm}
        title={form?.id ? "Edit Category" : "New Category"}
      >
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Dried Seafood"
              />
            </div>

            <div>
              <Label>Slug</Label>
              <Input
                required
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. dried-seafood"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="lowercase kebab-case, e.g. dried-seafood"
              />
            </div>

            <div>
              <Label>Image</Label>
              <div className="flex items-center gap-3">
                {form.imageUrl && !previewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded file, not part of the Next.js image pipeline
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="h-16 w-16 rounded-md object-cover"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-md bg-black/5 text-xs text-foreground/40">
                    No image
                  </span>
                )}
                <div className="flex flex-col items-start gap-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-black/5">
                    {uploading
                      ? "Uploading…"
                      : form.imageUrl
                        ? "Replace image"
                        : "Upload from computer"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleImageSelect}
                    />
                  </label>
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={removeImage}
                      className="text-xs text-foreground/50 hover:text-status-cancelled"
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
              {uploadError && (
                <p className="mt-2 text-xs text-status-cancelled">{uploadError}</p>
              )}
            </div>

            <div>
              <Label>Parent Category</Label>
              <Select
                value={form.parentId}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, parentId: e.target.value } : prev))
                }
              >
                <option value="">None (top-level)</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting || uploading}>
                {submitting ? "Saving…" : form.id ? "Save Changes" : "Create Category"}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
