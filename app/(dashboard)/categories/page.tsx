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
import { Pill } from "@/components/ui/badge";
import { LoadingLine } from "@/components/ui/spinner";

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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
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

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "primary" | "delivered" | "pending";
  icon: React.ReactNode;
}) {
  const dotClasses = { primary: "bg-primary", delivered: "bg-status-delivered", pending: "bg-status-pending" };
  const badgeClasses = {
    primary: "bg-primary/10",
    delivered: "bg-status-delivered/10",
    pending: "bg-status-pending/10",
  };
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/60">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${badgeClasses[tone]}`}>
          <span className={`h-2 w-2 rounded-full ${dotClasses[tone]}`} />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

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
  isPublished: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  slug: "",
  slugTouched: false,
  imageUrl: "",
  parentId: "",
  isPublished: true,
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
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);

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
      isPublished: category.isPublished,
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
      isPublished: form.isPublished,
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

  async function togglePublish(category: Category) {
    setPublishBusyId(category.id);
    setLoadError(null);
    try {
      await api.patch(`/admin/categories/${category.id}`, {
        isPublished: !category.isPublished,
      });
      await loadCategories();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to update category",
      );
    } finally {
      setPublishBusyId(null);
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
  const totalCategories = categories?.length ?? 0;
  const publishedCount = categories?.filter((c) => c.isPublished).length ?? 0;
  const unpublishedCount = totalCategories - publishedCount;

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

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total Categories"
          value={String(totalCategories)}
          tone="primary"
          icon={<FolderIcon className="h-5 w-5" />}
        />
        <SummaryCard
          label="Published"
          value={String(publishedCount)}
          tone="delivered"
          icon={<CheckCircleIcon className="h-5 w-5" />}
        />
        <SummaryCard
          label="Unpublished"
          value={String(unpublishedCount)}
          tone="pending"
          icon={<EyeOffIcon className="h-5 w-5" />}
        />
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {loadError}
          </p>
        )}

        {!categories ? (
          <LoadingLine className="text-base text-foreground/60" />
        ) : categories.length === 0 ? (
          <p className="text-base text-foreground/50">
            No categories yet. Create the first one to start organizing products.
          </p>
        ) : (
          <table className="w-full text-left text-base">
            <thead>
              <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                <th className="rounded-l-lg px-3 py-3 font-bold">#</th>
                <th className="px-3 py-3 font-bold">Name</th>
                <th className="px-3 py-3 font-bold">Slug</th>
                <th className="px-3 py-3 font-bold">Published</th>
                <th className="rounded-r-lg px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ category: c, depth }, i) => (
                <tr key={c.id} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-3 text-foreground/50">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div
                      className="flex items-center gap-2.5"
                      style={{ paddingLeft: depth * 24 }}
                    >
                      {depth > 0 && <span className="text-foreground/30">└</span>}
                      <CategoryThumb imageUrl={c.imageUrl} name={c.name} />
                      <span className="font-bold text-primary">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-foreground/60">{c.slug}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={publishBusyId === c.id}
                      onClick={() => togglePublish(c)}
                      className="disabled:opacity-50"
                    >
                      <Pill tone={c.isPublished ? "success" : "default"}>
                        {c.isPublished ? "Published" : "Unpublished"}
                      </Pill>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Edit"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => openEditForm(c)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete ${c.name}`}
                        disabled={deletingId === c.id}
                        onClick={() => handleDelete(c)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10 disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
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
        titleClassName="!text-lg"
        size="lg"
      >
        {form && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="!text-base !font-bold">Name</Label>
              <Input
                required
                className="w-full !text-base"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Dried Seafood"
              />
            </div>

            <div>
              <Label className="!text-base !font-bold">Slug</Label>
              <Input
                required
                className="w-full !text-base"
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. dried-seafood"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="lowercase kebab-case, e.g. dried-seafood"
              />
            </div>

            <div>
              <Label className="!text-base !font-bold">Image</Label>
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
                  <span className="flex h-16 w-16 items-center justify-center rounded-md bg-black/5 text-base text-foreground/40">
                    No image
                  </span>
                )}
                <div className="flex flex-col items-start gap-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-base font-medium text-foreground hover:bg-black/5">
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
                      className="text-base text-foreground/50 hover:text-status-cancelled"
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
              {uploadError && (
                <p className="mt-2 text-base text-status-cancelled">{uploadError}</p>
              )}
            </div>

            <div>
              <Label className="!text-base !font-bold">Parent Category</Label>
              <Select
                className="w-full !text-base"
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

            <div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, isPublished: e.target.checked } : prev,
                    )
                  }
                />
                <span className="text-base text-foreground">
                  Published (visible on the storefront)
                </span>
              </label>
            </div>

            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
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
