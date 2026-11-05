"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/layout/page-header";
import type { Category, ChannelComboBanner, ChannelComboTier, ChannelHeroSlide, ChannelTrustBadge, Product } from "@/lib/types";

interface SlideForm {
  image: string;
  title: string;
  description: string;
  couponEnabled: boolean;
  couponLabel: string;
  couponCode: string;
}

interface ReviewForm {
  customerName: string;
  location: string;
  rating: number;
  text: string;
  productId: string;
  enabled: boolean;
}

const EMPTY_REVIEW: ReviewForm = {
  customerName: "",
  location: "",
  rating: 5,
  text: "",
  productId: "",
  enabled: true,
};

interface HealthTipForm {
  title: string;
  categoryId: string;
  readMinutes: string;
  enabled: boolean;
}

const EMPTY_HEALTH_TIP: HealthTipForm = {
  title: "",
  categoryId: "",
  readMinutes: "3",
  enabled: true,
};

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

// Matches the storefront's component defaults — pre-filled here so a
// channel that's never touched this tab starts from what's already live.
const DEFAULT_COMBO_BANNER: ChannelComboBanner = {
  newBadge: true,
  title: "নিজের কম্বো বানান",
  description: "পরিবার বা নিজের জন্য পছন্দের পণ্য বেছে একটা প্যাকেজ বানান",
  tiers: [
    { title: "৳১,২০০+", description: "ফ্রি ডেলিভারি", enabled: true },
    { title: "৳২,০০০+", description: "+ ৫% ছাড়", enabled: true },
    { title: "৳৩,০০০+", description: "+ ৬% ছাড় + VIP", enabled: true },
  ],
  enabled: true,
};
const MAX_COMBO_TIERS = 10;
const MAX_COMBO_BANNERS = 2;

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
  { key: "combo", label: "Home Page Combo" },
  { key: "flashSale", label: "Flash Sale" },
  { key: "reviews", label: "Review" },
  { key: "healthTips", label: "Health Tips" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// <input type="datetime-local"> wants/returns "YYYY-MM-DDTHH:mm" in the
// browser's local time, with no timezone — these two convert that to/from
// the ISO string actually saved (and read by the storefront's countdown).
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
  const router = useRouter();
  const { channels, refresh, setActiveChannelId } = useChannelScope();
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
  // Up to MAX_COMBO_BANNERS separate combo promos — shown side by side on
  // larger screens once there are 2 (see the storefront's ComboBanner).
  const [comboBanners, setComboBanners] = useState<ChannelComboBanner[]>([DEFAULT_COMBO_BANNER]);
  // Flash Sale — selected products (order = display order) + countdown.
  const [flashSaleEnabled, setFlashSaleEnabled] = useState(false);
  const [flashSaleEndsAt, setFlashSaleEndsAt] = useState("");
  const [flashSaleProductIds, setFlashSaleProductIds] = useState<string[]>([]);
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);
  const [productToAdd, setProductToAdd] = useState("");
  // Review — admin-entered testimonials, each optionally linked to a real
  // product on this storefront (same channelProducts list as Flash Sale).
  const [reviews, setReviews] = useState<ReviewForm[]>([]);
  // Health Tips — admin-entered article teasers, each optionally linked to
  // a real shared category (same list the Categories/Badge tab uses).
  const [healthTips, setHealthTips] = useState<HealthTipForm[]>([]);
  const [allCategories, setAllCategories] = useState<Category[] | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [editingPositionSlug, setEditingPositionSlug] = useState<string | null>(null);
  const [editingPositionValue, setEditingPositionValue] = useState("");
  const [existingCategoryToAdd, setExistingCategoryToAdd] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingSlides, setUploadingSlides] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The floating Save bar is portaled straight to <body> (see its render
  // below) so it's truly fixed to the viewport — nested inside this page it
  // would get dragged along by the dashboard layout's own scrolling <main>.
  // document.body only exists once mounted on the client.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const savedCombos = channel.themeConfig?.comboBanners;
    // Missing `enabled` (saved before the toggle existed) defaults to on.
    setComboBanners(
      savedCombos?.length ? savedCombos.map((c) => ({ ...c, enabled: c.enabled ?? true })) : [DEFAULT_COMBO_BANNER],
    );
    const flashSale = channel.themeConfig?.flashSale;
    setFlashSaleEnabled(flashSale?.enabled ?? false);
    setFlashSaleEndsAt(isoToLocalInput(flashSale?.endsAt));
    setFlashSaleProductIds(flashSale?.productIds ?? []);
    setReviews(
      (channel.themeConfig?.reviews ?? []).map((r) => ({
        customerName: r.customerName,
        location: r.location ?? "",
        rating: r.rating,
        text: r.text,
        productId: r.productId ?? "",
        enabled: r.enabled ?? true,
      })),
    );
    setHealthTips(
      (channel.themeConfig?.healthTips ?? []).map((t) => ({
        title: t.title,
        categoryId: t.categoryId ?? "",
        readMinutes: t.readMinutes !== undefined ? String(t.readMinutes) : "",
        enabled: t.enabled ?? true,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  useEffect(() => {
    api
      .get<Category[]>("/admin/categories")
      .then(setAllCategories)
      .catch((err) => setCategoryError(err instanceof ApiError ? err.message : "Failed to load categories"));
    api.get<Product[]>("/admin/products").then(setAllProducts).catch(() => {});
  }, []);

  // Only products actually published on this storefront are offered for
  // Flash Sale — picking from the full catalog could select one that isn't
  // even live here yet.
  const channelProducts = (allProducts ?? []).filter((p) =>
    p.channels?.some((c) => c.channelId === id),
  );
  const orderedFlashProducts = flashSaleProductIds
    .map((pid) => channelProducts.find((p) => p.id === pid))
    .filter((p): p is Product => !!p);
  const offFlashProducts = channelProducts.filter((p) => !flashSaleProductIds.includes(p.id));

  function moveFlashProduct(productId: string, dir: -1 | 1) {
    setFlashSaleProductIds((prev) => {
      const index = prev.indexOf(productId);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addFlashProduct(productId: string) {
    setFlashSaleProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  }

  function removeFlashProduct(productId: string) {
    setFlashSaleProductIds((prev) => prev.filter((pid) => pid !== productId));
  }

  function addReview() {
    setReviews((prev) => [...prev, { ...EMPTY_REVIEW }]);
  }
  function removeReview(index: number) {
    setReviews((prev) => prev.filter((_, i) => i !== index));
  }
  function updateReview(index: number, patch: Partial<ReviewForm>) {
    setReviews((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addHealthTip() {
    setHealthTips((prev) => [...prev, { ...EMPTY_HEALTH_TIP }]);
  }
  function removeHealthTip(index: number) {
    setHealthTips((prev) => prev.filter((_, i) => i !== index));
  }
  function updateHealthTip(index: number, patch: Partial<HealthTipForm>) {
    setHealthTips((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  // The working "is this category included on this storefront" list —
  // categorySlugs===null means every category currently counts as on.
  const activeCategorySlugs = categorySlugs ?? (allCategories ?? []).map((c) => c.slug);

  // In activeCategorySlugs' own order — that order is the storefront's
  // display order (see the backend's getCategories). Unpublishing a
  // category from this storefront happens from the Categories page now
  // (its own Publish checkboxes), not here — but adding an existing,
  // already-global category back onto this storefront still happens here
  // via the picker below, alongside creating a brand-new one.
  const orderedOnCategories = activeCategorySlugs
    .map((slug) => (allCategories ?? []).find((c) => c.slug === slug))
    .filter((c): c is Category => !!c);
  // Only globally-published categories are offered here — adding an
  // unpublished one's slug would be a silent no-op (the storefront's own
  // category endpoint filters isPublished:true first regardless).
  const offCategories = (allCategories ?? []).filter(
    (c) => c.isPublished && !activeCategorySlugs.includes(c.slug),
  );

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

  // Swaps this slug with its neighbor — the array's own order is the
  // storefront's display order (see the backend's getCategories), so this
  // is what the numbering on each row reflects.
  function moveCategoryOrder(slug: string, dir: -1 | 1) {
    setCategorySlugs((prev) => {
      const base = prev ?? (allCategories ?? []).map((c) => c.slug);
      const index = base.indexOf(slug);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= base.length) return base;
      const next = [...base];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Jumps this slug straight to a typed position (1-based) — everything
  // between its old and new spot shifts down/up by one, unlike the ▲/▼
  // buttons above which only ever swap one adjacent pair.
  function moveCategoryToPosition(slug: string, position: number) {
    setCategorySlugs((prev) => {
      const base = prev ?? (allCategories ?? []).map((c) => c.slug);
      const from = base.indexOf(slug);
      if (from < 0 || !Number.isFinite(position)) return base;
      const to = Math.min(Math.max(Math.round(position), 1), base.length) - 1;
      if (to === from) return base;
      const next = [...base];
      next.splice(from, 1);
      next.splice(to, 0, slug);
      return next;
    });
  }

  // Adds an already-global category (created elsewhere, or previously
  // unpublished from this storefront via the Categories page) back onto
  // this storefront — append-only, never removes, so it can't be used to
  // accidentally unpublish something. It's added at the end of the current
  // order; drag/reorder it from there like any other row.
  function addExistingCategory(slug: string) {
    setCategorySlugs((prev) => {
      const base = prev ?? (allCategories ?? []).map((c) => c.slug);
      return base.includes(slug) ? base : [...base, slug];
    });
  }

  function addComboBanner() {
    setComboBanners((prev) =>
      prev.length >= MAX_COMBO_BANNERS
        ? prev
        : [...prev, { newBadge: false, title: "", description: "", tiers: [], enabled: true }],
    );
  }

  function removeComboBanner(index: number) {
    setComboBanners((prev) => prev.filter((_, i) => i !== index));
  }

  function updateComboBanner(index: number, patch: Partial<ChannelComboBanner>) {
    setComboBanners((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addComboTier(comboIndex: number) {
    setComboBanners((prev) =>
      prev.map((c, i) =>
        i !== comboIndex
          ? c
          : c.tiers.length >= MAX_COMBO_TIERS
            ? c
            : { ...c, tiers: [...c.tiers, { title: "", description: "", enabled: true }] },
      ),
    );
  }

  function removeComboTier(comboIndex: number, tierIndex: number) {
    setComboBanners((prev) =>
      prev.map((c, i) => (i !== comboIndex ? c : { ...c, tiers: c.tiers.filter((_, ti) => ti !== tierIndex) })),
    );
  }

  function updateComboTier(comboIndex: number, tierIndex: number, patch: Partial<ChannelComboTier>) {
    setComboBanners((prev) =>
      prev.map((c, i) =>
        i !== comboIndex
          ? c
          : { ...c, tiers: c.tiers.map((t, ti) => (ti === tierIndex ? { ...t, ...patch } : t)) },
      ),
    );
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
      // Blank combos (never given a title) are dropped, same as blank tiers.
      themeConfig.comboBanners = comboBanners
        .filter((c) => c.title.trim())
        .map((c) => ({
          newBadge: c.newBadge,
          title: c.title.trim(),
          description: c.description.trim(),
          tiers: c.tiers
            .filter((t) => t.title.trim())
            .map((t) => ({ title: t.title.trim(), description: t.description.trim(), enabled: t.enabled })),
          enabled: c.enabled,
        }));
      themeConfig.flashSale = {
        enabled: flashSaleEnabled,
        endsAt: localInputToIso(flashSaleEndsAt),
        productIds: flashSaleProductIds,
      };
      // Blank reviews (never given a name or text) are dropped, same as
      // blank combos/tiers elsewhere on this page.
      themeConfig.reviews = reviews
        .filter((r) => r.customerName.trim() && r.text.trim())
        .map((r) => ({
          customerName: r.customerName.trim(),
          location: r.location.trim() || undefined,
          rating: r.rating,
          text: r.text.trim(),
          productId: r.productId || undefined,
          enabled: r.enabled,
        }));
      // Blank tips (never given a title) are dropped, same as blank reviews.
      themeConfig.healthTips = healthTips
        .filter((t) => t.title.trim())
        .map((t) => ({
          title: t.title.trim(),
          categoryId: t.categoryId || undefined,
          readMinutes: t.readMinutes ? Number(t.readMinutes) : undefined,
          enabled: t.enabled,
        }));

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

  // Switches the admin's global scope to this store and drops onto the
  // Dashboard — Settings itself is deliberately scope-preserving (see
  // channels/[id]/layout.tsx), so this is the one explicit action that
  // actually enters this store's own workspace (its orders, stats, sidebar).
  function enterStoreDashboard() {
    if (!channel) return;
    setActiveChannelId(channel.id);
    router.push("/");
  }

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
            <Button variant="secondary" disabled={!channel} onClick={enterStoreDashboard}>
              Visit store dashboard →
            </Button>
          </>
        }
      />
      <form
        id="channel-settings-form"
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[380px_1fr]"
      >
        <Card>
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">General</h2>
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
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">Storefront content</h2>
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
                    Reorder the categories currently published to this storefront — this is the order the
                    storefront&rsquo;s category grid shows them in. To publish, unpublish, or re-image a category, use
                    the Categories page.
                  </p>
                  {categoryError && (
                    <p className="mb-2 rounded-lg bg-status-cancelled/10 px-3 py-2 text-xs text-status-cancelled">
                      {categoryError}
                    </p>
                  )}
                  {!allCategories ? (
                    <p className="text-xs text-foreground/50">Loading categories…</p>
                  ) : orderedOnCategories.length === 0 ? (
                    <p className="text-xs text-foreground/50">
                      No categories published to this storefront yet — publish one from the Categories page.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orderedOnCategories.map((category) => {
                        const orderIndex = activeCategorySlugs.indexOf(category.slug);
                        return (
                          <div key={category.id} className="flex items-center gap-2">
                            <span className="flex shrink-0 items-center gap-0.5">
                              {editingPositionSlug === category.slug ? (
                                // Not a <form> — this already lives inside the page's
                                // one outer <form>, and a nested <form> is invalid
                                // HTML that breaks hydration (browsers hoist it out).
                                <input
                                  type="number"
                                  min={1}
                                  max={activeCategorySlugs.length}
                                  autoFocus
                                  value={editingPositionValue}
                                  onChange={(e) => setEditingPositionValue(e.target.value)}
                                  onBlur={() => {
                                    moveCategoryToPosition(category.slug, Number(editingPositionValue));
                                    setEditingPositionSlug(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      moveCategoryToPosition(category.slug, Number(editingPositionValue));
                                      setEditingPositionSlug(null);
                                    } else if (e.key === "Escape") {
                                      setEditingPositionSlug(null);
                                    }
                                  }}
                                  className="num h-6 w-10 rounded border border-black/10 px-1 text-xs"
                                />
                              ) : (
                                <button
                                  type="button"
                                  title="Click to type a position"
                                  onClick={() => {
                                    setEditingPositionSlug(category.slug);
                                    setEditingPositionValue(String(orderIndex + 1));
                                  }}
                                  className="num grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20"
                                >
                                  {orderIndex + 1}
                                </button>
                              )}
                              <span className="flex flex-col">
                                <button
                                  type="button"
                                  onClick={() => moveCategoryOrder(category.slug, -1)}
                                  disabled={orderIndex === 0}
                                  title="Move up"
                                  className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCategoryOrder(category.slug, 1)}
                                  disabled={orderIndex === activeCategorySlugs.length - 1}
                                  title="Move down"
                                  className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                                >
                                  ▼
                                </button>
                              </span>
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {offCategories.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <Select
                        value={existingCategoryToAdd}
                        onChange={(e) => setExistingCategoryToAdd(e.target.value)}
                        className="w-full text-sm"
                      >
                        <option value="">Add an existing category…</option>
                        {offCategories.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!existingCategoryToAdd}
                        onClick={() => {
                          addExistingCategory(existingCategoryToAdd);
                          setExistingCategoryToAdd("");
                        }}
                      >
                        + Add to storefront
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "combo" && (
              <div className="space-y-4">
                <p className="text-xs text-foreground/50">
                  The &ldquo;Build your own combo&rdquo; promo shown on the homepage, right after Categories. Up to{" "}
                  {MAX_COMBO_BANNERS} combos — with 2, they show side by side on larger screens.
                </p>

                {comboBanners.map((combo, ci) => (
                  <div key={ci} className={`rounded-lg border border-black/10 p-3 ${combo.enabled ? "" : "opacity-50"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span title={combo.enabled ? "On — shown on storefront" : "Off — hidden from storefront"}>
                          <Switch
                            checked={combo.enabled}
                            onChange={() => updateComboBanner(ci, { enabled: !combo.enabled })}
                          />
                        </span>
                        <Label className="!mb-0">Combo {ci + 1}</Label>
                      </div>
                      {comboBanners.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeComboBanner(ci)}
                          className="rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                        >
                          Remove this combo
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={combo.newBadge}
                          onChange={() => updateComboBanner(ci, { newBadge: !combo.newBadge })}
                        />
                        Show the &ldquo;নতুন&rdquo; badge
                      </label>
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={combo.title}
                          onChange={(e) => updateComboBanner(ci, { title: e.target.value })}
                          maxLength={80}
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={combo.description}
                          onChange={(e) => updateComboBanner(ci, { description: e.target.value })}
                          maxLength={160}
                        />
                      </div>
                    </div>

                    <div className="mt-3 border-t border-black/5 pt-3">
                      <Label>Pricing tier cards</Label>
                      <p className="mb-2 text-xs text-foreground/50">
                        The cards inside this banner (e.g. &ldquo;৳১,২০০+ / ফ্রি ডেলিভারি&rdquo;) — add, remove, and
                        toggle each on/off. Off cards stay here but won&rsquo;t show on the storefront.
                      </p>
                      <div className="space-y-2">
                        {combo.tiers.map((tier, ti) => (
                          <div key={ti} className={`flex items-start gap-2 ${tier.enabled ? "" : "opacity-50"}`}>
                            <span
                              title={tier.enabled ? "On — shown on storefront" : "Off — hidden from storefront"}
                              className="pt-2"
                            >
                              <Switch
                                checked={tier.enabled}
                                onChange={() => updateComboTier(ci, ti, { enabled: !tier.enabled })}
                              />
                            </span>
                            <Input
                              value={tier.title}
                              onChange={(e) => updateComboTier(ci, ti, { title: e.target.value })}
                              placeholder="Card title, e.g. ৳১,২০০+"
                              maxLength={60}
                            />
                            <Textarea
                              value={tier.description}
                              onChange={(e) => updateComboTier(ci, ti, { description: e.target.value })}
                              placeholder={"Card description — one line each, e.g.\nফ্রি ডেলিভারি\nফ্রি সমাধান কিট"}
                              maxLength={160}
                              rows={2}
                              className="w-full resize-y"
                            />
                            <button
                              type="button"
                              onClick={() => removeComboTier(ci, ti)}
                              className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      {combo.tiers.length < MAX_COMBO_TIERS && (
                        <button
                          type="button"
                          onClick={() => addComboTier(ci)}
                          className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                        >
                          + Add card
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {comboBanners.length < MAX_COMBO_BANNERS && (
                  <button
                    type="button"
                    onClick={addComboBanner}
                    className="inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                  >
                    + Add another combo
                  </button>
                )}
              </div>
            )}

            {tab === "flashSale" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-black/10 p-3">
                  <div className="flex items-center gap-2">
                    <span title={flashSaleEnabled ? "On — shown on storefront" : "Off — hidden from storefront"}>
                      <Switch checked={flashSaleEnabled} onChange={() => setFlashSaleEnabled((v) => !v)} />
                    </span>
                    <Label className="!mb-0">Show the homepage Flash Deal section</Label>
                  </div>
                  <p className="mt-2 text-xs text-foreground/50">
                    The horizontally-scrolling deal strip right after the home page combo banner — pick which
                    products show, in what order, and an optional countdown deadline.
                  </p>
                  <div className="mt-3 max-w-xs">
                    <Label>Countdown ends at</Label>
                    <input
                      type="datetime-local"
                      value={flashSaleEndsAt}
                      onChange={(e) => setFlashSaleEndsAt(e.target.value)}
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <p className="mt-1 text-xs text-foreground/40">
                      Leave blank to show the section without a countdown.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Products in this Flash Deal</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    The order below is the order shown on the storefront. Only products already published to this
                    storefront can be added here.
                  </p>
                  {!allProducts ? (
                    <p className="text-xs text-foreground/50">Loading products…</p>
                  ) : orderedFlashProducts.length === 0 ? (
                    <p className="text-xs text-foreground/50">No products selected yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {orderedFlashProducts.map((product, index) => (
                        <div key={product.id} className="flex items-center gap-2">
                          <span className="flex shrink-0 items-center gap-0.5">
                            <span className="num grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {index + 1}
                            </span>
                            <span className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => moveFlashProduct(product.id, -1)}
                                disabled={index === 0}
                                title="Move up"
                                className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFlashProduct(product.id, 1)}
                                disabled={index === orderedFlashProducts.length - 1}
                                title="Move down"
                                className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                              >
                                ▼
                              </button>
                            </span>
                          </span>
                          {product.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, not part of the Next.js image pipeline
                            <img src={product.thumbnailUrl} alt={product.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/5 text-xs text-foreground/40">
                              {product.name.charAt(0)}
                            </span>
                          )}
                          <span className="flex-1">
                            <span className="block text-sm font-medium">{product.name}</span>
                            <span className="block text-xs text-foreground/40">{product.sku}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFlashProduct(product.id)}
                            className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {offFlashProducts.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <Select
                        value={productToAdd}
                        onChange={(e) => setProductToAdd(e.target.value)}
                        className="w-full text-sm"
                      >
                        <option value="">Add a product…</option>
                        {offFlashProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!productToAdd}
                        onClick={() => {
                          addFlashProduct(productToAdd);
                          setProductToAdd("");
                        }}
                      >
                        + Add to Flash Deal
                      </Button>
                    </div>
                  )}
                  {allProducts && channelProducts.length === 0 && (
                    <p className="mt-2 text-xs text-foreground/50">
                      No products are published to this storefront yet — publish one from a product&rsquo;s Details
                      page first.
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === "reviews" && (
              <div className="space-y-4">
                <p className="text-xs text-foreground/50">
                  Customer testimonials shown in the homepage&rsquo;s &ldquo;কাস্টমারদের অভিজ্ঞতা&rdquo; section —
                  type in reviews you&rsquo;ve actually collected (e.g. over WhatsApp/phone). Not a public
                  submission form; nothing shows here until you add it. Linking a product is optional.
                </p>
                {reviews.length === 0 && (
                  <p className="text-xs text-foreground/50">No reviews added yet.</p>
                )}
                {reviews.map((review, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border border-black/10 p-3 ${review.enabled ? "" : "opacity-50"}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span title={review.enabled ? "On — shown on storefront" : "Off — hidden from storefront"}>
                          <Switch
                            checked={review.enabled}
                            onChange={() => updateReview(index, { enabled: !review.enabled })}
                          />
                        </span>
                        <Label className="!mb-0">Review {index + 1}</Label>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeReview(index)}
                        className="rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="!text-sm">Customer name</Label>
                        <Input
                          value={review.customerName}
                          onChange={(e) => updateReview(index, { customerName: e.target.value })}
                          placeholder="সাবরিনা"
                          className="w-full text-sm"
                        />
                      </div>
                      <div>
                        <Label className="!text-sm">Location (optional)</Label>
                        <Input
                          value={review.location}
                          onChange={(e) => updateReview(index, { location: e.target.value })}
                          placeholder="মিরপুর, ঢাকা"
                          className="w-full text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <Label className="!text-sm">Rating</Label>
                        <Select
                          value={String(review.rating)}
                          onChange={(e) => updateReview(index, { rating: Number(e.target.value) })}
                          className="w-full text-sm"
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {"★".repeat(n)}
                              {"☆".repeat(5 - n)} ({n})
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label className="!text-sm">Linked product (optional)</Label>
                        <Select
                          value={review.productId}
                          onChange={(e) => updateReview(index, { productId: e.target.value })}
                          className="w-full text-sm"
                        >
                          <option value="">None</option>
                          {channelProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="!text-sm">Review text</Label>
                      <Textarea
                        value={review.text}
                        onChange={(e) => updateReview(index, { text: e.target.value })}
                        rows={2}
                        maxLength={500}
                        className="w-full text-sm"
                        placeholder="দাদের জন্য অনেক কিছু ট্রাই করেছি। এই ক্রিম এক সপ্তাহ নিয়মিত লাগানোর পর চুলকানি অনেক কমেছে।"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addReview}
                  className="inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                >
                  + Add review
                </button>
              </div>
            )}

            {tab === "healthTips" && (
              <div className="space-y-4">
                <p className="text-xs text-foreground/50">
                  Article teaser cards shown in the homepage&rsquo;s &ldquo;স্বাস্থ্য টিপস&rdquo; section — just a
                  title, an optional category (colors the card the same as that category elsewhere on the site),
                  and a read time. No article page exists yet, just the teaser.
                </p>
                {healthTips.length === 0 && (
                  <p className="text-xs text-foreground/50">No health tips added yet.</p>
                )}
                {healthTips.map((tip, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border border-black/10 p-3 ${tip.enabled ? "" : "opacity-50"}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span title={tip.enabled ? "On — shown on storefront" : "Off — hidden from storefront"}>
                          <Switch
                            checked={tip.enabled}
                            onChange={() => updateHealthTip(index, { enabled: !tip.enabled })}
                          />
                        </span>
                        <Label className="!mb-0">Tip {index + 1}</Label>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHealthTip(index)}
                        className="rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                      >
                        Remove
                      </button>
                    </div>
                    <div>
                      <Label className="!text-sm">Title</Label>
                      <Input
                        value={tip.title}
                        onChange={(e) => updateHealthTip(index, { title: e.target.value })}
                        placeholder="শীতে পা ফাটা রোধের ৫টি সহজ উপায়"
                        maxLength={120}
                        className="w-full text-sm"
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <Label className="!text-sm">Category (optional)</Label>
                        <Select
                          value={tip.categoryId}
                          onChange={(e) => updateHealthTip(index, { categoryId: e.target.value })}
                          className="w-full text-sm"
                        >
                          <option value="">None</option>
                          {(allCategories ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label className="!text-sm">Read time (minutes)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          value={tip.readMinutes}
                          onChange={(e) => updateHealthTip(index, { readMinutes: e.target.value })}
                          className="w-full text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addHealthTip}
                  className="inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                >
                  + Add health tip
                </button>
              </div>
            )}
          </div>
        </Card>
      </form>

      {/* Portaled straight to <body>: nested inside the page, "fixed" gets
          clipped/dragged by the dashboard layout's own scrolling <main>
          (overflow-y-auto), so it only ever appeared once scrolled into that
          container's view instead of staying pinned to the real viewport.
          `form="channel-settings-form"` keeps the submit button wired to the
          form even though it now renders outside of it in the DOM. */}
      {mounted &&
        createPortal(
          <div className="fixed bottom-6 right-6 z-20 flex items-center gap-3 rounded-card border border-black/5 bg-card p-3 shadow-card">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active (storefront is live)
            </label>
            {error && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
            )}
            <Button type="submit" form="channel-settings-form" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            {saved && <span className="text-sm text-status-delivered">Saved</span>}
          </div>,
          document.body,
        )}
    </div>
  );
}
