"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/layout/page-header";
import { slugify } from "@/lib/slugify";
import type { Category, ChannelHeroSlide, ChannelTrustBadge } from "@/lib/types";

interface SlideForm {
  image: string;
  title: string;
  description: string;
  couponEnabled: boolean;
  couponLabel: string;
  couponCode: string;
}

// Matches the storefront's own fallback text+icon (components/trust-strip.tsx)
// — shown pre-filled here so the admin sees what's currently live and edits
// from there.
const DEFAULT_TRUST_BADGES: ChannelTrustBadge[] = [
  { text: "১০০% আসল পণ্য", icon: "shield", enabled: true },
  { text: "ক্যাশ অন ডেলিভারি", icon: "cash", enabled: true },
  { text: "৳১,৫০০+ এ ফ্রি ডেলিভারি", icon: "truck", enabled: true },
  { text: "সারাদেশে ডেলিভারি ৳১০০", icon: "clock", enabled: true },
];

// Must match TRUST_BADGE_ICONS in the backend's trust-badge.dto.ts, and the
// ICONS map in the storefront's trust-strip.tsx — this is the fixed palette
// the storefront knows how to render.
const TRUST_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "shield", label: "Shield (authentic)" },
  { value: "cash", label: "Cash (COD)" },
  { value: "truck", label: "Truck (delivery)" },
  { value: "clock", label: "Clock (fast)" },
  { value: "star", label: "Star (quality)" },
  { value: "gift", label: "Gift (bonus)" },
  { value: "lock", label: "Lock (secure)" },
  { value: "percent", label: "Percent (discount)" },
];
const MAX_TRUST_BADGES = 10;

// Older saves stored trustBadges as plain strings (fixed 4 slots, no icon)
// or objects without the on/off toggle yet — normalized here so an older
// channel loads cleanly into the new shape. Missing `enabled` defaults on,
// matching pre-toggle behavior (every saved badge used to always show).
function normalizeTrustBadges(
  raw: (ChannelTrustBadge | string)[] | undefined,
): ChannelTrustBadge[] {
  if (!raw || raw.length === 0) return DEFAULT_TRUST_BADGES;
  return raw.map((b, i) =>
    typeof b === "string"
      ? { text: b, icon: DEFAULT_TRUST_BADGES[i % DEFAULT_TRUST_BADGES.length].icon, enabled: true }
      : { ...b, enabled: b.enabled ?? true },
  );
}

const TABS = [
  { key: "logoBanner", label: "Logo & Banner" },
  { key: "badges", label: "Badge & Category" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function toSlideForm(s: ChannelHeroSlide): SlideForm {
  return {
    image: s.image,
    title: s.title ?? "",
    description: s.description ?? "",
    couponEnabled: s.coupon?.enabled ?? false,
    couponLabel: s.coupon?.label ?? "",
    couponCode: s.coupon?.code ?? "",
  };
}

export default function ChannelSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { channels, refresh } = useChannelScope();
  const channel = channels?.find((c) => c.id === id);

  const [tab, setTab] = useState<TabKey>("logoBanner");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [heroSlides, setHeroSlides] = useState<SlideForm[]>([]);
  const [trustBadges, setTrustBadges] = useState<ChannelTrustBadge[]>(DEFAULT_TRUST_BADGES);
  // null = "no restriction saved yet" — every category counts as included,
  // same as the storefront's own fallback when categorySlugs is unset.
  const [categorySlugs, setCategorySlugs] = useState<string[] | null>(null);
  const [allCategories, setAllCategories] = useState<Category[] | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategorySlugTouched, setNewCategorySlugTouched] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingSlides, setUploadingSlides] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setSlug(channel.slug);
    setDomain(channel.domain ?? "");
    setLogoUrl(channel.logoUrl ?? "");
    setIsActive(channel.isActive);
    setHeroSlides((channel.themeConfig?.heroSlides ?? []).map(toSlideForm));
    setTrustBadges(normalizeTrustBadges(channel.themeConfig?.trustBadges));
    setCategorySlugs(channel.themeConfig?.categorySlugs ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  useEffect(() => {
    api
      .get<Category[]>("/admin/categories")
      .then(setAllCategories)
      .catch((err) => setCategoryError(err instanceof ApiError ? err.message : "Failed to load categories"));
  }, []);

  // The working "is this category included on this storefront" list —
  // categorySlugs===null means every category currently counts as on.
  const activeCategorySlugs = categorySlugs ?? (allCategories ?? []).map((c) => c.slug);

  async function handleLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      setLogoUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  async function handleSlides(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setUploadingSlides(true);
    try {
      const uploaded: SlideForm[] = [];
      for (const file of files) {
        const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
        uploaded.push({ image: url, title: "", description: "", couponEnabled: false, couponLabel: "", couponCode: "" });
      }
      setHeroSlides((prev) => [...prev, ...uploaded].slice(0, 8));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload image");
    } finally {
      setUploadingSlides(false);
    }
  }

  function removeSlide(index: number) {
    setHeroSlides((prev) => prev.filter((_, i) => i !== index));
  }

  function moveSlide(index: number, dir: -1 | 1) {
    setHeroSlides((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateSlide(index: number, patch: Partial<SlideForm>) {
    setHeroSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addTrustBadge() {
    setTrustBadges((prev) =>
      prev.length >= MAX_TRUST_BADGES ? prev : [...prev, { text: "", icon: "shield", enabled: true }],
    );
  }

  function removeTrustBadge(index: number) {
    setTrustBadges((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTrustBadge(index: number, patch: Partial<ChannelTrustBadge>) {
    setTrustBadges((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function toggleCategory(slug: string) {
    setCategorySlugs((prev) => {
      const base = prev ?? (allCategories ?? []).map((c) => c.slug);
      return base.includes(slug) ? base.filter((s) => s !== slug) : [...base, slug];
    });
  }

  // Auto-slugify only works for Latin names — most category names here are
  // Bengali, where it produces an empty string, so the slug field is shown
  // and editable (same slugTouched pattern as the dedicated Categories page).
  function handleNewCategoryNameChange(value: string) {
    setNewCategoryName(value);
    if (!newCategorySlugTouched) setNewCategorySlug(slugify(value));
  }

  // Categories are a shared, global taxonomy (not per-channel) — creating,
  // deleting, or re-imaging one here takes effect immediately and on every
  // storefront that uses it, same as the dedicated Categories page. Only
  // the on/off toggle above is specific to this channel.
  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    const slug = newCategorySlug.trim();
    if (!name || !slug) return;
    setCategoryError(null);
    setCreatingCategory(true);
    try {
      const created = await api.post<Category>("/admin/categories", {
        name,
        slug,
        isPublished: true,
      });
      setAllCategories((prev) => [...(prev ?? []), created]);
      setCategorySlugs((prev) => (prev === null ? null : [...prev, created.slug]));
      setNewCategoryName("");
      setNewCategorySlug("");
      setNewCategorySlugTouched(false);
    } catch (err) {
      setCategoryError(err instanceof ApiError ? err.message : "Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleCategoryImage(category: Category, file: File) {
    setCategoryError(null);
    setBusyCategoryId(category.id);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      const updated = await api.patch<Category>(`/admin/categories/${category.id}`, { imageUrl: url });
      setAllCategories((prev) => (prev ?? []).map((c) => (c.id === category.id ? updated : c)));
    } catch (err) {
      setCategoryError(err instanceof ApiError ? err.message : "Failed to upload image");
    } finally {
      setBusyCategoryId(null);
    }
  }

  async function handleDeleteCategory(category: Category) {
    if (!confirm(`Delete "${category.name}"? This removes it from every storefront, not just this one.`)) return;
    setCategoryError(null);
    setBusyCategoryId(category.id);
    try {
      await api.delete(`/admin/categories/${category.id}`);
      setAllCategories((prev) => (prev ?? []).filter((c) => c.id !== category.id));
      setCategorySlugs((prev) => (prev === null ? null : prev.filter((s) => s !== category.slug)));
    } catch (err) {
      setCategoryError(err instanceof ApiError ? err.message : "Failed to delete category");
    } finally {
      setBusyCategoryId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const themeConfig: Record<string, unknown> = {};
      // Always included (even empty) so removing the last slide actually
      // clears it server-side, instead of the merge leaving a stale array.
      themeConfig.heroSlides = heroSlides.map((s) => ({
        image: s.image,
        ...(s.title.trim() ? { title: s.title.trim() } : {}),
        ...(s.description.trim() ? { description: s.description.trim() } : {}),
        ...(s.couponCode.trim()
          ? {
              coupon: {
                enabled: s.couponEnabled,
                label: s.couponLabel.trim(),
                code: s.couponCode.trim().toUpperCase(),
              },
            }
          : {}),
      }));
      // Always included (even if it's just the defaults) so the admin
      // always knows exactly what's live, same reasoning as heroSlides above.
      // Blank-text rows are dropped rather than saved as empty pills; off
      // badges are kept (not deleted) so they can be switched back on later.
      themeConfig.trustBadges = trustBadges
        .filter((b) => b.text.trim())
        .map((b) => ({ text: b.text.trim(), icon: b.icon, enabled: b.enabled }));
      // Flattens the "no restriction yet" default into an explicit saved
      // list, same reasoning as heroSlides/trustBadges above.
      themeConfig.categorySlugs = activeCategorySlugs;

      await api.patch(`/admin/channels/${id}`, {
        name,
        slug,
        isActive,
        logoUrl: logoUrl || null,
        ...(domain.trim() ? { domain: domain.trim() } : {}),
        themeConfig,
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const storefrontHref = channel?.domain
    ? channel.domain.startsWith("http")
      ? channel.domain
      : `https://${channel.domain}`
    : null;

  return (
    <div>
      <Link href="/channels" className="mb-3 inline-block text-sm text-foreground/60 hover:text-foreground">
        ← Channels
      </Link>
      <PageHeader
        title={channel?.name ?? ""}
        description={channel ? `${channel.slug}${channel.domain ? ` · ${channel.domain}` : ""}` : undefined}
        actions={
          <>
            {channel && <Pill tone={channel.isActive ? "primary" : "default"}>{channel.isActive ? "Active" : "Inactive"}</Pill>}
            {storefrontHref ? (
              <a href={storefrontHref} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary">Visit storefront ↗</Button>
              </a>
            ) : (
              <Button variant="secondary" disabled title="Set a domain below to enable this">
                Visit storefront ↗
              </Button>
            )}
          </>
        }
      />
      <form onSubmit={handleSubmit} className="max-w-xl">
        <Card>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="lowercase kebab-case, e.g. dry-food-market"
              />
            </div>
            <div>
              <Label>Domain</Label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. dryfoodmarket.com" />
            </div>

            <div className="flex gap-1 border-b border-black/5">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    tab === t.key
                      ? "border-primary text-primary"
                      : "border-transparent text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "logoBanner" && (
              <div className="space-y-4">
                <div>
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded file
                      <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/5 text-xs text-foreground/40">
                        No logo
                      </span>
                    )}
                    <div className="flex flex-col items-start gap-1">
                      <label className="inline-flex cursor-pointer items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
                        {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload from computer"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          disabled={uploading}
                          onChange={handleLogo}
                        />
                      </label>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl("")}
                          className="text-xs text-foreground/50 hover:text-status-cancelled"
                        >
                          Remove logo
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-foreground/50">Shown in the storefront header. Square images work best.</p>
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Banner (hero slideshow)</Label>
                  <p className="mb-3 text-xs text-foreground/50">
                    Up to 8 images, shown left-to-right in the homepage banner. Each image can have its own title,
                    description and coupon — leave a field blank to use the default title/description instead. Leave
                    the whole banner empty to keep the plain color background.
                  </p>
                  {heroSlides.length > 0 && (
                    <div className="mb-3 space-y-3">
                      {heroSlides.map((slide, i) => (
                        <div key={slide.image + i} className="flex gap-3 rounded-lg border border-black/10 p-2.5">
                          <div className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded file */}
                            <img src={slide.image} alt={`Slide ${i + 1}`} className="h-20 w-28 rounded object-cover" />
                            <div className="mt-1 flex justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveSlide(i, -1)}
                                disabled={i === 0}
                                className="rounded border border-black/10 px-1.5 text-xs disabled:opacity-30"
                                title="Move left"
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSlide(i)}
                                className="rounded border border-black/10 px-1.5 text-xs text-status-cancelled"
                                title="Remove"
                              >
                                ✕
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSlide(i, 1)}
                                disabled={i === heroSlides.length - 1}
                                className="rounded border border-black/10 px-1.5 text-xs disabled:opacity-30"
                                title="Move right"
                              >
                                →
                              </button>
                            </div>
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={slide.title}
                              onChange={(e) => updateSlide(i, { title: e.target.value })}
                              placeholder="Title (optional — default title otherwise)"
                            />
                            <Input
                              value={slide.description}
                              onChange={(e) => updateSlide(i, { description: e.target.value })}
                              placeholder="Description (optional — default description otherwise)"
                            />
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1.5 text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={slide.couponEnabled}
                                  onChange={(e) => updateSlide(i, { couponEnabled: e.target.checked })}
                                />
                                Coupon
                              </label>
                              <Input
                                value={slide.couponLabel}
                                onChange={(e) => updateSlide(i, { couponLabel: e.target.value })}
                                placeholder="e.g. আজকের বিশেষ ছাড়"
                                className="w-full text-xs"
                              />
                              <Input
                                value={slide.couponCode}
                                onChange={(e) => updateSlide(i, { couponCode: e.target.value.toUpperCase() })}
                                placeholder="CODE"
                                required={slide.couponEnabled}
                                pattern="[A-Za-z0-9]+"
                                className="w-28 text-xs uppercase"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {heroSlides.length < 8 && (
                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
                      {uploadingSlides ? "Uploading…" : "Add images"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        className="hidden"
                        disabled={uploadingSlides}
                        onChange={handleSlides}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {tab === "badges" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Trust badges</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    The badges shown scrolling under the homepage banner (delivery fee, free-delivery threshold,
                    etc.) — add, remove, pick an icon, and toggle each on/off. Off badges stay here but won&rsquo;t
                    show on the storefront.
                  </p>
                  <div className="space-y-2">
                    {trustBadges.map((badge, i) => (
                      <div key={i} className={`flex items-center gap-2 ${badge.enabled ? "" : "opacity-50"}`}>
                        <span title={badge.enabled ? "On — shown on storefront" : "Off — hidden from storefront"}>
                          <Switch
                            checked={badge.enabled}
                            onChange={() => updateTrustBadge(i, { enabled: !badge.enabled })}
                          />
                        </span>
                        <select
                          value={badge.icon}
                          onChange={(e) => updateTrustBadge(i, { icon: e.target.value })}
                          className="rounded-lg border border-black/10 bg-white px-2 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          {TRUST_ICON_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={badge.text}
                          onChange={(e) => updateTrustBadge(i, { text: e.target.value })}
                          placeholder="Badge text"
                          maxLength={60}
                        />
                        <button
                          type="button"
                          onClick={() => removeTrustBadge(i)}
                          className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  {trustBadges.length < MAX_TRUST_BADGES && (
                    <button
                      type="button"
                      onClick={addTrustBadge}
                      className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                    >
                      + Add badge
                    </button>
                  )}
                </div>
                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Categories</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    Which categories this storefront shows, with an image for each. Categories are shared across
                    every storefront — adding, deleting, or changing an image here applies everywhere immediately.
                    The on/off switch only controls whether it&rsquo;s included on this storefront.
                  </p>
                  {categoryError && (
                    <p className="mb-2 rounded-lg bg-status-cancelled/10 px-3 py-2 text-xs text-status-cancelled">
                      {categoryError}
                    </p>
                  )}
                  {!allCategories ? (
                    <p className="text-xs text-foreground/50">Loading categories…</p>
                  ) : (
                    <div className="space-y-2">
                      {allCategories.map((category) => {
                        const on = activeCategorySlugs.includes(category.slug);
                        const busy = busyCategoryId === category.id;
                        return (
                          <div key={category.id} className={`flex items-center gap-2 ${on ? "" : "opacity-50"}`}>
                            <span title={on ? "On — shown on this storefront" : "Off — hidden from this storefront"}>
                              <Switch checked={on} onChange={() => toggleCategory(category.slug)} />
                            </span>
                            {category.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, not part of the Next.js image pipeline
                              <img src={category.imageUrl} alt={category.name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                            ) : (
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs text-foreground/40">
                                {category.name.charAt(0)}
                              </span>
                            )}
                            <span className="flex-1 text-sm font-medium">{category.name}</span>
                            <label className="inline-flex cursor-pointer items-center rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-black/5">
                              {busy ? "Uploading…" : category.imageUrl ? "Replace image" : "Add image"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                disabled={busy}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) handleCategoryImage(category, file);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(category)}
                              disabled={busy}
                              className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled disabled:opacity-50"
                              title="Delete"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => handleNewCategoryNameChange(e.target.value)}
                      placeholder="New category name"
                      className="w-full text-sm"
                    />
                    <Input
                      value={newCategorySlug}
                      onChange={(e) => {
                        setNewCategorySlug(e.target.value);
                        setNewCategorySlugTouched(true);
                      }}
                      placeholder="slug"
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      title="lowercase kebab-case, e.g. hair-care"
                      className="w-40 text-sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={creatingCategory || !newCategoryName.trim() || !newCategorySlug.trim()}
                      onClick={handleCreateCategory}
                    >
                      {creatingCategory ? "Adding…" : "+ Add category"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active (storefront is live)
            </label>
            {error && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              {saved && <span className="text-sm text-status-delivered">Saved</span>}
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
