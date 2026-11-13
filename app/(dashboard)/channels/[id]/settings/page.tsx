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
import type {
  Category,
  ChannelComboBanner,
  ChannelComboTier,
  ChannelHeroSlide,
  ChannelQuizProblem,
  ChannelQuizSub,
  ChannelSocialLink,
  ChannelSocialPlatform,
  ChannelTrustBadge,
  Product,
} from "@/lib/types";

interface SpendingRewardForm {
  amount: string;
  description: string;
  discountPercent: string;
  freeDelivery: boolean;
}

interface QuantityDiscountForm {
  quantity: string;
  discountPercent: string;
  description: string;
}

interface SlideForm {
  image: string;
  title: string;
  description: string;
  couponEnabled: boolean;
  couponLabel: string;
  couponCode: string;
  couponDiscountPercent: string;
}

interface CouponForm {
  code: string;
  discountPercent: string;
  description: string;
}

const EMPTY_COUPON: CouponForm = { code: "", discountPercent: "", description: "" };

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
  description: string;
  points: string[];
  productIds: string[];
  enabled: boolean;
}

const EMPTY_HEALTH_TIP: HealthTipForm = {
  title: "",
  categoryId: "",
  readMinutes: "3",
  description: "",
  points: [],
  productIds: [],
  enabled: true,
};
const MAX_HEALTH_TIP_POINTS = 20;

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
const MAX_QUIZ_PROBLEMS = 20;
const MAX_QUIZ_SUBS = 12;

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
  { key: "checkoutUpsell", label: "Checkout Management" },
  { key: "problem", label: "Problem" },
  { key: "reviews", label: "Review" },
  { key: "healthTips", label: "Health Tips" },
  { key: "social", label: "Social & Contact" },
  { key: "other", label: "Other Settings" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Must match SOCIAL_LINK_PLATFORMS in the backend's social-link.dto.ts, and
// the PLATFORM_ICONS map in the storefront's side-menu component.
const SOCIAL_PLATFORM_OPTIONS: { value: ChannelSocialPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
];
const MAX_SOCIAL_LINKS = 8;

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
    couponDiscountPercent: s.coupon?.discountPercent ? String(s.coupon.discountPercent) : "",
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
  // Cart Suggestions — the storefront cart drawer's "Suggested Products for
  // you" row: selected products (order = display order), same shape as
  // Flash Sale but no enabled flag/countdown (see cartSuggestions.dto.ts).
  const [cartSuggestionProductIds, setCartSuggestionProductIds] = useState<string[]>([]);
  const [cartSuggestionSearch, setCartSuggestionSearch] = useState("");
  // Problem — the storefront's "কোনটা নেবেন বুঝছেন না?" quiz: admin-curated
  // categories (e.g. "ব্যথা"), each with its own sub-categories (e.g.
  // "মাথাব্যথা বা মাইগ্রেন") and real product assignments. Replaces the old
  // hardcoded lib/quiz-data.ts list on the storefront. quizSubSearch is
  // keyed "<problemIndex>:<subIndex>" since many sub-category search boxes
  // can exist on screen at once (unlike Flash Sale/Cart Suggestions' single
  // search/select).
  const [quizProblems, setQuizProblems] = useState<ChannelQuizProblem[]>([]);
  const [quizSubSearch, setQuizSubSearch] = useState<Record<string, string>>({});
  // Up to MAX_COMBO_BANNERS separate combo promos — shown side by side on
  // larger screens once there are 2 (see the storefront's ComboBanner).
  const [comboBanners, setComboBanners] = useState<ChannelComboBanner[]>([DEFAULT_COMBO_BANNER]);
  // Flash Sale — selected products (order = display order) + countdown.
  const [flashSaleEnabled, setFlashSaleEnabled] = useState(false);
  const [flashSaleEndsAt, setFlashSaleEndsAt] = useState("");
  const [flashSaleProductIds, setFlashSaleProductIds] = useState<string[]>([]);
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);
  const [productToAdd, setProductToAdd] = useState("");
  // Checkout Management — the order-confirmation page's "একই পার্সেলে যোগ
  // করুন" upsell strip: selected products (order = display order) + a
  // relative countdown length (minutes, not a shared deadline like Flash
  // Sale) + the extra discount percent advertised for adding one.
  const [checkoutUpsellEnabled, setCheckoutUpsellEnabled] = useState(false);
  const [checkoutUpsellDuration, setCheckoutUpsellDuration] = useState("15");
  const [checkoutUpsellDiscount, setCheckoutUpsellDiscount] = useState("10");
  const [checkoutUpsellProductIds, setCheckoutUpsellProductIds] = useState<string[]>([]);
  const [checkoutUpsellProductToAdd, setCheckoutUpsellProductToAdd] = useState("");
  // Review — admin-entered testimonials, each optionally linked to a real
  // product on this storefront (same channelProducts list as Flash Sale).
  const [reviews, setReviews] = useState<ReviewForm[]>([]);
  // Health Tips — admin-entered article teasers, each optionally linked to
  // a real shared category (same list the Categories/Badge tab uses).
  const [healthTips, setHealthTips] = useState<HealthTipForm[]>([]);
  // Keyed by tip index — same reasoning as quizSubSearch, several tips'
  // search boxes can exist on screen at once.
  const [healthTipSearch, setHealthTipSearch] = useState<Record<number, string>>({});
  // Social & Contact — the storefront side menu's "কাস্টমার কেয়ার" phone
  // number and "আমাদের ফলো করুন" social links.
  const [customerCarePhone, setCustomerCarePhone] = useState("");
  const [socialLinks, setSocialLinks] = useState<ChannelSocialLink[]>([]);
  // Other Settings — the storefront cart's minimum order gate (taka). Kept
  // as a string while editing; blank/zero means no minimum.
  const [minimumOrderAmount, setMinimumOrderAmount] = useState("");
  // Other Settings — the cart drawer's stacked spend-more nudges (e.g.
  // ৳1,300 → "ফ্রি ডেলিভারি", ৳2,000 → "১০% ছাড়"). Discount % (when set) is
  // real, applied to the order at checkout; the rest is just display text.
  const [spendingRewards, setSpendingRewards] = useState<SpendingRewardForm[]>([]);
  // Other Settings — the product page's buy-box quantity tiers (e.g. 2 →
  // 5% off, 3 → 10% off). Real — applied per line item at checkout.
  const [quantityDiscounts, setQuantityDiscounts] = useState<QuantityDiscountForm[]>([]);
  // Other Settings — the flat delivery charge (taka) added at checkout,
  // waived whenever a spend-more reward with "Free delivery" ticked is met.
  const [deliveryCharge, setDeliveryCharge] = useState("");
  // Other Settings — admin-defined, code-redeemable coupons (independent of
  // the hero banner's own coupon code above, but checked together at
  // checkout — see CouponDto). Real: the best of this and the spend-more
  // reward discount is applied, whichever is higher, not both.
  const [coupons, setCoupons] = useState<CouponForm[]>([]);
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
    setCartSuggestionProductIds(channel.themeConfig?.cartSuggestions?.productIds ?? []);
    setQuizProblems(channel.themeConfig?.quizProblems ?? []);
    const savedCombos = channel.themeConfig?.comboBanners;
    // Missing `enabled` (saved before the toggle existed) defaults to on.
    setComboBanners(
      savedCombos?.length ? savedCombos.map((c) => ({ ...c, enabled: c.enabled ?? true })) : [DEFAULT_COMBO_BANNER],
    );
    const flashSale = channel.themeConfig?.flashSale;
    setFlashSaleEnabled(flashSale?.enabled ?? false);
    setFlashSaleEndsAt(isoToLocalInput(flashSale?.endsAt));
    setFlashSaleProductIds(flashSale?.productIds ?? []);
    const checkoutUpsell = channel.themeConfig?.checkoutUpsell;
    setCheckoutUpsellEnabled(checkoutUpsell?.enabled ?? false);
    setCheckoutUpsellDuration(
      checkoutUpsell?.durationMinutes !== undefined ? String(checkoutUpsell.durationMinutes) : "15",
    );
    setCheckoutUpsellDiscount(
      checkoutUpsell?.discountPercent !== undefined ? String(checkoutUpsell.discountPercent) : "10",
    );
    setCheckoutUpsellProductIds(checkoutUpsell?.productIds ?? []);
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
        description: t.description ?? "",
        points: t.points ?? [],
        productIds: t.productIds ?? [],
        enabled: t.enabled ?? true,
      })),
    );
    setCustomerCarePhone(channel.themeConfig?.customerCarePhone ?? "");
    setSocialLinks(channel.themeConfig?.socialLinks ?? []);
    setMinimumOrderAmount(
      channel.themeConfig?.minimumOrderAmount ? String(channel.themeConfig.minimumOrderAmount) : "",
    );
    setSpendingRewards(
      (channel.themeConfig?.spendingRewards ?? []).map((r) => ({
        amount: String(r.amount),
        description: r.description,
        discountPercent: r.discountPercent ? String(r.discountPercent) : "",
        freeDelivery: r.freeDelivery ?? false,
      })),
    );
    setQuantityDiscounts(
      (channel.themeConfig?.quantityDiscounts ?? []).map((q) => ({
        quantity: String(q.quantity),
        discountPercent: String(q.discountPercent),
        description: q.description ?? "",
      })),
    );
    setDeliveryCharge(
      channel.themeConfig?.deliveryCharge ? String(channel.themeConfig.deliveryCharge) : "",
    );
    setCoupons(
      (channel.themeConfig?.coupons ?? []).map((c) => ({
        code: c.code,
        discountPercent: String(c.discountPercent),
        description: c.description ?? "",
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

  // Checkout Management — same ordered-pick pattern as Flash Sale above,
  // over the same channelProducts (already-published-here) list.
  const orderedCheckoutUpsellProducts = checkoutUpsellProductIds
    .map((pid) => channelProducts.find((p) => p.id === pid))
    .filter((p): p is Product => !!p);
  const offCheckoutUpsellProducts = channelProducts.filter(
    (p) => !checkoutUpsellProductIds.includes(p.id),
  );

  function moveCheckoutUpsellProduct(productId: string, dir: -1 | 1) {
    setCheckoutUpsellProductIds((prev) => {
      const index = prev.indexOf(productId);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addCheckoutUpsellProduct(productId: string) {
    setCheckoutUpsellProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  }

  function removeCheckoutUpsellProduct(productId: string) {
    setCheckoutUpsellProductIds((prev) => prev.filter((pid) => pid !== productId));
  }

  // Cart Suggestions — same channelProducts list as Flash Sale (only
  // products already published to this storefront), but added via a typed
  // name search instead of a dropdown.
  const orderedCartSuggestionProducts = cartSuggestionProductIds
    .map((pid) => channelProducts.find((p) => p.id === pid))
    .filter((p): p is Product => !!p);
  const cartSuggestionMatches = cartSuggestionSearch.trim()
    ? channelProducts
        .filter(
          (p) =>
            !cartSuggestionProductIds.includes(p.id) &&
            p.name.toLowerCase().includes(cartSuggestionSearch.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  function moveCartSuggestion(productId: string, dir: -1 | 1) {
    setCartSuggestionProductIds((prev) => {
      const index = prev.indexOf(productId);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addCartSuggestion(productId: string) {
    setCartSuggestionProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  }

  function removeCartSuggestion(productId: string) {
    setCartSuggestionProductIds((prev) => prev.filter((pid) => pid !== productId));
  }

  function addQuizProblem() {
    setQuizProblems((prev) =>
      prev.length >= MAX_QUIZ_PROBLEMS ? prev : [...prev, { label: "", description: "", subs: [] }],
    );
  }

  function removeQuizProblem(pi: number) {
    setQuizProblems((prev) => prev.filter((_, i) => i !== pi));
  }

  function updateQuizProblem(pi: number, patch: Partial<ChannelQuizProblem>) {
    setQuizProblems((prev) => prev.map((p, i) => (i === pi ? { ...p, ...patch } : p)));
  }

  function addQuizSub(pi: number) {
    setQuizProblems((prev) =>
      prev.map((p, i) =>
        i === pi && p.subs.length < MAX_QUIZ_SUBS
          ? { ...p, subs: [...p.subs, { label: "", description: "", productIds: [] }] }
          : p,
      ),
    );
  }

  function removeQuizSub(pi: number, si: number) {
    setQuizProblems((prev) => prev.map((p, i) => (i === pi ? { ...p, subs: p.subs.filter((_, j) => j !== si) } : p)));
  }

  function updateQuizSub(pi: number, si: number, patch: Partial<ChannelQuizSub>) {
    setQuizProblems((prev) =>
      prev.map((p, i) =>
        i === pi ? { ...p, subs: p.subs.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : p,
      ),
    );
  }

  function addQuizSubProduct(pi: number, si: number, productId: string) {
    setQuizProblems((prev) =>
      prev.map((p, i) =>
        i === pi
          ? {
              ...p,
              subs: p.subs.map((s, j) =>
                j === si
                  ? { ...s, productIds: s.productIds.includes(productId) ? s.productIds : [...s.productIds, productId] }
                  : s,
              ),
            }
          : p,
      ),
    );
  }

  function removeQuizSubProduct(pi: number, si: number, productId: string) {
    setQuizProblems((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, subs: p.subs.map((s, j) => (j === si ? { ...s, productIds: s.productIds.filter((id) => id !== productId) } : s)) }
          : p,
      ),
    );
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

  function addHealthTipPoint(index: number) {
    setHealthTips((prev) =>
      prev.map((t, i) =>
        i === index && t.points.length < MAX_HEALTH_TIP_POINTS ? { ...t, points: [...t.points, ""] } : t,
      ),
    );
  }
  function removeHealthTipPoint(index: number, pointIndex: number) {
    setHealthTips((prev) =>
      prev.map((t, i) => (i === index ? { ...t, points: t.points.filter((_, j) => j !== pointIndex) } : t)),
    );
  }
  function updateHealthTipPoint(index: number, pointIndex: number, value: string) {
    setHealthTips((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, points: t.points.map((p, j) => (j === pointIndex ? value : p)) } : t,
      ),
    );
  }

  function addHealthTipProduct(index: number, productId: string) {
    setHealthTips((prev) =>
      prev.map((t, i) =>
        i === index
          ? { ...t, productIds: t.productIds.includes(productId) ? t.productIds : [...t.productIds, productId] }
          : t,
      ),
    );
  }
  function removeHealthTipProduct(index: number, productId: string) {
    setHealthTips((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, productIds: t.productIds.filter((id) => id !== productId) } : t,
      ),
    );
  }

  function addSocialLink() {
    setSocialLinks((prev) =>
      prev.length >= MAX_SOCIAL_LINKS ? prev : [...prev, { platform: "facebook", url: "" }],
    );
  }
  function removeSocialLink(index: number) {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  }
  function updateSocialLink(index: number, patch: Partial<ChannelSocialLink>) {
    setSocialLinks((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSpendingReward() {
    setSpendingRewards((prev) => [
      ...prev,
      { amount: "", description: "", discountPercent: "", freeDelivery: false },
    ]);
  }
  function removeSpendingReward(index: number) {
    setSpendingRewards((prev) => prev.filter((_, i) => i !== index));
  }
  function updateSpendingReward(index: number, patch: Partial<SpendingRewardForm>) {
    setSpendingRewards((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addQuantityDiscount() {
    setQuantityDiscounts((prev) => [...prev, { quantity: "", discountPercent: "", description: "" }]);
  }
  function removeQuantityDiscount(index: number) {
    setQuantityDiscounts((prev) => prev.filter((_, i) => i !== index));
  }
  function updateQuantityDiscount(index: number, patch: Partial<QuantityDiscountForm>) {
    setQuantityDiscounts((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addCoupon() {
    setCoupons((prev) => [...prev, { ...EMPTY_COUPON }]);
  }
  function removeCoupon(index: number) {
    setCoupons((prev) => prev.filter((_, i) => i !== index));
  }
  function updateCoupon(index: number, patch: Partial<CouponForm>) {
    setCoupons((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
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
        uploaded.push({
          image: url,
          title: "",
          description: "",
          couponEnabled: false,
          couponLabel: "",
          couponCode: "",
          couponDiscountPercent: "",
        });
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
                ...(s.couponDiscountPercent.trim() && Number(s.couponDiscountPercent) > 0
                  ? { discountPercent: Number(s.couponDiscountPercent) }
                  : {}),
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
      themeConfig.cartSuggestions = { productIds: cartSuggestionProductIds };
      themeConfig.quizProblems = quizProblems
        .filter((p) => p.label.trim())
        .map((p) => ({
          label: p.label.trim(),
          description: p.description?.trim() || undefined,
          subs: p.subs
            .filter((s) => s.label.trim())
            .map((s) => ({
              label: s.label.trim(),
              description: s.description?.trim() || undefined,
              productIds: s.productIds,
            })),
        }));
      // Blank combos (never given a title) are dropped, same as blank tiers.
      themeConfig.comboBanners = comboBanners
        .filter((c) => c.title.trim())
        .map((c) => ({
          newBadge: c.newBadge,
          title: c.title.trim(),
          description: c.description.trim(),
          tiers: c.tiers
            .filter((t) => t.title.trim())
            .map((t) => ({
              title: t.title.trim(),
              description: t.description.trim(),
              enabled: t.enabled,
              ...(t.discountPercent ? { discountPercent: t.discountPercent } : {}),
              ...(t.freeDelivery ? { freeDelivery: true } : {}),
            })),
          enabled: c.enabled,
        }));
      themeConfig.flashSale = {
        enabled: flashSaleEnabled,
        endsAt: localInputToIso(flashSaleEndsAt),
        productIds: flashSaleProductIds,
      };
      themeConfig.checkoutUpsell = {
        enabled: checkoutUpsellEnabled,
        durationMinutes: checkoutUpsellDuration ? Number(checkoutUpsellDuration) : undefined,
        discountPercent: checkoutUpsellDiscount ? Number(checkoutUpsellDiscount) : undefined,
        productIds: checkoutUpsellProductIds,
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
          description: t.description.trim() || undefined,
          points: t.points.map((p) => p.trim()).filter(Boolean),
          productIds: t.productIds,
          enabled: t.enabled,
        }));
      themeConfig.customerCarePhone = customerCarePhone.trim() || undefined;
      // Blank URLs (row added but never filled in) are dropped.
      themeConfig.socialLinks = socialLinks
        .filter((s) => s.url.trim())
        .map((s) => ({ platform: s.platform, url: s.url.trim() }));
      const minOrder = Number(minimumOrderAmount);
      themeConfig.minimumOrderAmount = minimumOrderAmount.trim() && minOrder > 0 ? minOrder : undefined;
      // Blank rows (no description, or no amount entered) are dropped, same
      // as blank combos/tiers/reviews elsewhere on this page.
      themeConfig.spendingRewards = spendingRewards
        .filter((r) => r.description.trim() && Number(r.amount) > 0)
        .map((r) => ({
          amount: Number(r.amount),
          description: r.description.trim(),
          ...(r.discountPercent.trim() && Number(r.discountPercent) > 0
            ? { discountPercent: Number(r.discountPercent) }
            : {}),
          ...(r.freeDelivery ? { freeDelivery: true } : {}),
        }));
      // A row needs a quantity and a discount % to mean anything — the
      // description is optional (blank falls back to the storefront's own
      // "X% বাড়তি ছাড়" text).
      themeConfig.quantityDiscounts = quantityDiscounts
        .filter((q) => Number(q.quantity) >= 2 && Number(q.discountPercent) > 0)
        .map((q) => ({
          quantity: Number(q.quantity),
          discountPercent: Number(q.discountPercent),
          ...(q.description.trim() ? { description: q.description.trim() } : {}),
        }));
      const delivery = Number(deliveryCharge);
      themeConfig.deliveryCharge = deliveryCharge.trim() && delivery > 0 ? delivery : undefined;
      // A row needs a code and a discount % to mean anything, same rule as
      // quantityDiscounts above.
      themeConfig.coupons = coupons
        .filter((c) => c.code.trim() && Number(c.discountPercent) > 0)
        .map((c) => ({
          code: c.code.trim().toUpperCase(),
          discountPercent: Number(c.discountPercent),
          ...(c.description.trim() ? { description: c.description.trim() } : {}),
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
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={slide.couponDiscountPercent}
                                onChange={(e) => updateSlide(i, { couponDiscountPercent: e.target.value })}
                                placeholder="Rate %"
                                title="Discount % this code applies at checkout — leave blank to keep it cosmetic only"
                                className="w-20 shrink-0 text-xs"
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
                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Cart Suggestions</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    The &ldquo;Suggested Products for you&rdquo; row shown in the storefront&rsquo;s cart drawer —
                    pick which products show, in what order. Only products already published to this storefront can
                    be added here.
                  </p>
                  {!allProducts ? (
                    <p className="text-xs text-foreground/50">Loading products…</p>
                  ) : orderedCartSuggestionProducts.length === 0 ? (
                    <p className="text-xs text-foreground/50">No products selected yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {orderedCartSuggestionProducts.map((product, index) => (
                        <div key={product.id} className="flex items-center gap-2">
                          <span className="flex shrink-0 items-center gap-0.5">
                            <span className="num grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {index + 1}
                            </span>
                            <span className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => moveCartSuggestion(product.id, -1)}
                                disabled={index === 0}
                                title="Move up"
                                className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCartSuggestion(product.id, 1)}
                                disabled={index === orderedCartSuggestionProducts.length - 1}
                                title="Move down"
                                className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                              >
                                ▼
                              </button>
                            </span>
                          </span>
                          {product.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, not part of the Next.js image pipeline
                            <img
                              src={product.thumbnailUrl}
                              alt={product.name}
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                            />
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
                            onClick={() => removeCartSuggestion(product.id)}
                            className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {channelProducts.length > 0 && (
                    <div className="mt-3">
                      <Input
                        value={cartSuggestionSearch}
                        onChange={(e) => setCartSuggestionSearch(e.target.value)}
                        placeholder="Search this storefront's products by name…"
                        className="w-full text-sm"
                      />
                      {cartSuggestionSearch.trim() &&
                        (cartSuggestionMatches.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {cartSuggestionMatches.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center gap-2 rounded-lg border border-black/10 px-2.5 py-1.5"
                              >
                                <span className="flex-1 text-sm">
                                  {p.name} <span className="text-xs text-foreground/40">({p.sku})</span>
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => {
                                    addCartSuggestion(p.id);
                                    setCartSuggestionSearch("");
                                  }}
                                >
                                  + Add
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-foreground/50">No matching products.</p>
                        ))}
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
                        toggle each on/off. Off cards stay here but won&rsquo;t show on the storefront. Rate % and
                        Free delivery are the real parts: when a customer&rsquo;s combo reaches this card&rsquo;s
                        amount, that percent is actually taken off the combo&rsquo;s items at checkout
                        (highest-amount tier reached wins, not stacked with other tiers), and/or the delivery charge
                        is waived for the whole order. Leave both unset for a purely informational card.
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
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={tier.discountPercent !== undefined ? String(tier.discountPercent) : ""}
                              onChange={(e) =>
                                updateComboTier(ci, ti, {
                                  discountPercent: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              placeholder="Rate %"
                              title="Discount % this tier applies to the combo's own subtotal — leave blank for an informational-only card"
                              className="w-20 shrink-0 text-sm"
                            />
                            <label className="flex shrink-0 items-center gap-1.5 pt-2 text-xs text-foreground/70">
                              <input
                                type="checkbox"
                                checked={tier.freeDelivery ?? false}
                                onChange={(e) => updateComboTier(ci, ti, { freeDelivery: e.target.checked })}
                              />
                              Free delivery
                            </label>
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

            {tab === "checkoutUpsell" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-black/10 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      title={
                        checkoutUpsellEnabled ? "On — shown on the order-confirmation page" : "Off — hidden"
                      }
                    >
                      <Switch checked={checkoutUpsellEnabled} onChange={() => setCheckoutUpsellEnabled((v) => !v)} />
                    </span>
                    <Label className="!mb-0">
                      Show the &ldquo;একই পার্সেলে যোগ করুন&rdquo; strip after checkout
                    </Label>
                  </div>
                  <p className="mt-2 text-xs text-foreground/50">
                    Shown on the order-confirmation page right after a customer places an order — a countdown
                    strip suggesting products to add to the same parcel at an extra discount, with no added
                    delivery charge.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-md">
                    <div>
                      <Label>Countdown length (minutes)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="120"
                        step="1"
                        value={checkoutUpsellDuration}
                        onChange={(e) => setCheckoutUpsellDuration(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-foreground/40">
                        Starts fresh each time a customer reaches their own confirmation page.
                      </p>
                    </div>
                    <div>
                      <Label>Extra discount (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={checkoutUpsellDiscount}
                        onChange={(e) => setCheckoutUpsellDiscount(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-foreground/40">Advertised on each product in the strip.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Products in this strip</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    The order below is the order shown on the storefront. Only products already published to
                    this storefront can be added here.
                  </p>
                  {!allProducts ? (
                    <p className="text-xs text-foreground/50">Loading products…</p>
                  ) : orderedCheckoutUpsellProducts.length === 0 ? (
                    <p className="text-xs text-foreground/50">No products selected yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {orderedCheckoutUpsellProducts.map((product, index) => (
                        <div key={product.id} className="flex items-center gap-2">
                          <span className="flex shrink-0 items-center gap-0.5">
                            <span className="num grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {index + 1}
                            </span>
                            <span className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => moveCheckoutUpsellProduct(product.id, -1)}
                                disabled={index === 0}
                                title="Move up"
                                className="leading-none text-foreground/40 hover:text-foreground disabled:opacity-20"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCheckoutUpsellProduct(product.id, 1)}
                                disabled={index === orderedCheckoutUpsellProducts.length - 1}
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
                            onClick={() => removeCheckoutUpsellProduct(product.id)}
                            className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {offCheckoutUpsellProducts.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <Select
                        value={checkoutUpsellProductToAdd}
                        onChange={(e) => setCheckoutUpsellProductToAdd(e.target.value)}
                        className="w-full text-sm"
                      >
                        <option value="">Add a product…</option>
                        {offCheckoutUpsellProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!checkoutUpsellProductToAdd}
                        onClick={() => {
                          addCheckoutUpsellProduct(checkoutUpsellProductToAdd);
                          setCheckoutUpsellProductToAdd("");
                        }}
                      >
                        + Add to strip
                      </Button>
                    </div>
                  )}
                  {allProducts && channelProducts.length === 0 && (
                    <p className="mt-2 text-xs text-foreground/50">
                      No products are published to this storefront yet — publish one from a product&rsquo;s
                      Details page first.
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === "problem" && (
              <div className="space-y-4">
                <p className="text-xs text-foreground/50">
                  The storefront&rsquo;s &ldquo;কোনটা নেবেন বুঝছেন না?&rdquo; symptom-finder quiz — each category
                  (e.g. &ldquo;ব্যথা&rdquo;) holds its own sub-categories (e.g. &ldquo;মাথাব্যথা বা
                  মাইগ্রেন&rdquo;), each with real products customers get recommended. Only products already
                  published to this storefront can be added.
                </p>

                {quizProblems.map((problem, pi) => (
                  <div key={pi} className="rounded-lg border border-black/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Label className="!mb-0">Problem {pi + 1}</Label>
                      <button
                        type="button"
                        onClick={() => removeQuizProblem(pi)}
                        className="rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label>Category name</Label>
                        <Input
                          value={problem.label}
                          onChange={(e) => updateQuizProblem(pi, { label: e.target.value })}
                          placeholder="e.g. ব্যথা"
                          maxLength={80}
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={problem.description ?? ""}
                          onChange={(e) => updateQuizProblem(pi, { description: e.target.value })}
                          placeholder="e.g. মাথা, ঘাড়, কোমর, জয়েন্ট"
                          maxLength={160}
                        />
                      </div>
                    </div>

                    <div className="mt-3 border-t border-black/5 pt-3">
                      <Label>Sub-categories</Label>
                      <div className="space-y-3">
                        {problem.subs.map((sub, si) => {
                          const key = `${pi}:${si}`;
                          const search = quizSubSearch[key] ?? "";
                          const matches = search.trim()
                            ? channelProducts
                                .filter(
                                  (p) =>
                                    !sub.productIds.includes(p.id) &&
                                    p.name.toLowerCase().includes(search.trim().toLowerCase()),
                                )
                                .slice(0, 8)
                            : [];
                          const assigned = sub.productIds
                            .map((id) => channelProducts.find((p) => p.id === id))
                            .filter((p): p is Product => !!p);
                          return (
                            <div key={si} className="rounded-lg border border-black/10 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground/50">Sub-category {si + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removeQuizSub(pi, si)}
                                  className="rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="space-y-2">
                                <Input
                                  value={sub.label}
                                  onChange={(e) => updateQuizSub(pi, si, { label: e.target.value })}
                                  placeholder="Sub-category title, e.g. মাথাব্যথা বা মাইগ্রেন"
                                  maxLength={80}
                                />
                                <Input
                                  value={sub.description ?? ""}
                                  onChange={(e) => updateQuizSub(pi, si, { description: e.target.value })}
                                  placeholder="Description (optional)"
                                  maxLength={160}
                                />
                              </div>

                              <div className="mt-2">
                                <Label>Products</Label>
                                {assigned.length === 0 ? (
                                  <p className="text-xs text-foreground/50">No products selected yet.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {assigned.map((p) => (
                                      <div
                                        key={p.id}
                                        className="flex items-center gap-2 rounded-lg border border-black/10 px-2.5 py-1.5"
                                      >
                                        <span className="flex-1 text-sm">
                                          {p.name} <span className="text-xs text-foreground/40">({p.sku})</span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => removeQuizSubProduct(pi, si, p.id)}
                                          className="shrink-0 rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                                          title="Remove"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {channelProducts.length > 0 && (
                                  <div className="mt-2">
                                    <Input
                                      value={search}
                                      onChange={(e) =>
                                        setQuizSubSearch((prev) => ({ ...prev, [key]: e.target.value }))
                                      }
                                      placeholder="Search this storefront's products by name…"
                                      className="w-full text-sm"
                                    />
                                    {search.trim() &&
                                      (matches.length > 0 ? (
                                        <div className="mt-2 space-y-1.5">
                                          {matches.map((p) => (
                                            <div
                                              key={p.id}
                                              className="flex items-center gap-2 rounded-lg border border-black/10 px-2.5 py-1.5"
                                            >
                                              <span className="flex-1 text-sm">
                                                {p.name} <span className="text-xs text-foreground/40">({p.sku})</span>
                                              </span>
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => {
                                                  addQuizSubProduct(pi, si, p.id);
                                                  setQuizSubSearch((prev) => ({ ...prev, [key]: "" }));
                                                }}
                                              >
                                                + Add
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-xs text-foreground/50">No matching products.</p>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {problem.subs.length < MAX_QUIZ_SUBS && (
                        <button
                          type="button"
                          onClick={() => addQuizSub(pi)}
                          className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                        >
                          + Add sub-category
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {quizProblems.length < MAX_QUIZ_PROBLEMS && (
                  <button
                    type="button"
                    onClick={addQuizProblem}
                    className="inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                  >
                    + Add problem category
                  </button>
                )}
                {allProducts && channelProducts.length === 0 && (
                  <p className="text-xs text-foreground/50">
                    No products are published to this storefront yet — publish one from a product&rsquo;s Details
                    page first.
                  </p>
                )}
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
                  Article cards shown in the homepage&rsquo;s &ldquo;স্বাস্থ্য টিপস&rdquo; section — a title, an
                  optional category (colors the card the same as that category elsewhere on the site), a read
                  time, and now a real detail page: a short description and a numbered list of points. The detail
                  page also shows real products from the tip&rsquo;s category, when one is set.
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
                    <div className="mt-3">
                      <Label className="!text-sm">Description</Label>
                      <Textarea
                        value={tip.description}
                        onChange={(e) => updateHealthTip(index, { description: e.target.value })}
                        placeholder="শীতে বাতাস শুষ্ক থাকে, তাই গোড়ালির চামড়া শক্ত হয়ে ফেটে যায়। কয়েকটা অভ্যাস বদলালেই এটা অনেকটা ঠেকানো যায়।"
                        maxLength={600}
                        rows={2}
                        className="w-full resize-y text-sm"
                      />
                    </div>
                    <div className="mt-3">
                      <Label className="!text-sm">Points</Label>
                      <div className="space-y-2">
                        {tip.points.map((point, pointIndex) => (
                          <div key={pointIndex} className="flex items-center gap-2">
                            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {pointIndex + 1}
                            </span>
                            <Input
                              value={point}
                              onChange={(e) => updateHealthTipPoint(index, pointIndex, e.target.value)}
                              placeholder="রাতে ঘুমানোর আগে পা ধুয়ে মুছে হিল ক্রিম লাগান"
                              maxLength={300}
                              className="w-full text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeHealthTipPoint(index, pointIndex)}
                              className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      {tip.points.length < MAX_HEALTH_TIP_POINTS && (
                        <button
                          type="button"
                          onClick={() => addHealthTipPoint(index)}
                          className="mt-2 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                        >
                          + Add point
                        </button>
                      )}
                    </div>
                    <div className="mt-3">
                      <Label className="!text-sm">Suggested products</Label>
                      <p className="mb-2 text-xs text-foreground/50">
                        Shown on the detail page&rsquo;s &ldquo;এই সমস্যায় কাজে লাগবে&rdquo; row. Leave empty to
                        fall back to real products from the category above.
                      </p>
                      {(() => {
                        const search = healthTipSearch[index] ?? "";
                        const matches = search.trim()
                          ? channelProducts
                              .filter(
                                (p) =>
                                  !tip.productIds.includes(p.id) &&
                                  p.name.toLowerCase().includes(search.trim().toLowerCase()),
                              )
                              .slice(0, 8)
                          : [];
                        const assigned = tip.productIds
                          .map((id) => channelProducts.find((p) => p.id === id))
                          .filter((p): p is Product => !!p);
                        return (
                          <>
                            {assigned.length === 0 ? (
                              <p className="text-xs text-foreground/50">No products selected yet.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {assigned.map((p) => (
                                  <div
                                    key={p.id}
                                    className="flex items-center gap-2 rounded-lg border border-black/10 px-2.5 py-1.5"
                                  >
                                    <span className="flex-1 text-sm">
                                      {p.name} <span className="text-xs text-foreground/40">({p.sku})</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeHealthTipProduct(index, p.id)}
                                      className="shrink-0 rounded border border-black/10 px-2 py-1 text-xs text-status-cancelled"
                                      title="Remove"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {channelProducts.length > 0 && (
                              <div className="mt-2">
                                <Input
                                  value={search}
                                  onChange={(e) =>
                                    setHealthTipSearch((prev) => ({ ...prev, [index]: e.target.value }))
                                  }
                                  placeholder="Search this storefront's products by name…"
                                  className="w-full text-sm"
                                />
                                {search.trim() &&
                                  (matches.length > 0 ? (
                                    <div className="mt-2 space-y-1.5">
                                      {matches.map((p) => (
                                        <div
                                          key={p.id}
                                          className="flex items-center gap-2 rounded-lg border border-black/10 px-2.5 py-1.5"
                                        >
                                          <span className="flex-1 text-sm">
                                            {p.name} <span className="text-xs text-foreground/40">({p.sku})</span>
                                          </span>
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => {
                                              addHealthTipProduct(index, p.id);
                                              setHealthTipSearch((prev) => ({ ...prev, [index]: "" }));
                                            }}
                                          >
                                            + Add
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs text-foreground/50">No matching products.</p>
                                  ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
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

            {tab === "social" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Customer care number</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    Shown (and WhatsApp-linked/copyable) in the storefront&rsquo;s side menu. Leave blank to hide
                    that box.
                  </p>
                  <Input
                    value={customerCarePhone}
                    onChange={(e) => setCustomerCarePhone(e.target.value)}
                    placeholder="e.g. 01712345678"
                    className="w-full text-sm"
                  />
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Social links</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    Shown as &ldquo;আমাদের ফলো করুন&rdquo; in the storefront&rsquo;s side menu. Empty means that
                    section doesn&rsquo;t render.
                  </p>
                  <div className="space-y-2">
                    {socialLinks.map((link, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={link.platform}
                          onChange={(e) =>
                            updateSocialLink(i, { platform: e.target.value as ChannelSocialPlatform })
                          }
                          className="rounded-lg border border-black/10 bg-white px-2 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          {SOCIAL_PLATFORM_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={link.url}
                          onChange={(e) => updateSocialLink(i, { url: e.target.value })}
                          placeholder="https://..."
                          className="w-full text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeSocialLink(i)}
                          className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  {socialLinks.length < MAX_SOCIAL_LINKS && (
                    <button
                      type="button"
                      onClick={addSocialLink}
                      className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                    >
                      + Add social link
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === "other" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Minimum order amount (৳)</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    The storefront cart nudges the customer toward this amount and the checkout button is
                    disabled until it&rsquo;s reached. Orders placed below it are rejected server-side too, even
                    if the storefront is bypassed. Leave blank for no minimum.
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={minimumOrderAmount}
                    onChange={(e) => setMinimumOrderAmount(e.target.value)}
                    placeholder="e.g. 300"
                    className="w-full max-w-xs text-sm"
                  />
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Spend-more rewards</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    A single stacked &ldquo;আর ৳X নিলে …&rdquo; progress nudge in the cart drawer, shown once the
                    minimum order (above) is met — each row is its own milestone, e.g. ৳1,300 → &ldquo;ফ্রি
                    ডেলিভারি&rdquo;, ৳2,000 → &ldquo;১০% ছাড়&rdquo;. The description is just text — it alone
                    applies nothing. Discount % and Free delivery are the real parts: when set, the order
                    actually created at checkout has that percent taken off (the highest-amount tier the order
                    qualifies for wins, not stacked) and/or the delivery charge below waived. Leave both unset
                    for a purely informational row. Shown lowest amount first regardless of row order below.
                  </p>
                  <div className="space-y-2">
                    {spendingRewards.map((reward, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={reward.amount}
                          onChange={(e) => updateSpendingReward(i, { amount: e.target.value })}
                          placeholder="e.g. 1300"
                          className="w-28 shrink-0 text-sm"
                        />
                        <Input
                          value={reward.description}
                          onChange={(e) => updateSpendingReward(i, { description: e.target.value })}
                          placeholder="e.g. ফ্রি ডেলিভারি"
                          className="w-full text-sm"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={reward.discountPercent}
                          onChange={(e) => updateSpendingReward(i, { discountPercent: e.target.value })}
                          placeholder="Discount %"
                          title="Discount % — leave blank for an informational-only row"
                          className="w-28 shrink-0 text-sm"
                        />
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-foreground/70">
                          <input
                            type="checkbox"
                            checked={reward.freeDelivery}
                            onChange={(e) => updateSpendingReward(i, { freeDelivery: e.target.checked })}
                          />
                          Free delivery
                        </label>
                        <button
                          type="button"
                          onClick={() => removeSpendingReward(i)}
                          className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addSpendingReward}
                    className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                  >
                    + Add reward
                  </button>
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Quantity discounts</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    The product page&rsquo;s buy-box quantity tiles — e.g. 2 → 5% off, 3 → 10% off. Quantity 1 is
                    always the free baseline tile and isn&rsquo;t configured here. Real: applied per line item
                    when the order is actually created, same as a spend-more reward&rsquo;s Discount %
                    (highest-quantity tier a line reaches wins, not stacked). Description optionally overrides
                    the tile&rsquo;s auto-generated &ldquo;X% বাড়তি ছাড়&rdquo; badge text.
                  </p>
                  <div className="space-y-2">
                    {quantityDiscounts.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={2}
                          value={q.quantity}
                          onChange={(e) => updateQuantityDiscount(i, { quantity: e.target.value })}
                          placeholder="Qty, e.g. 2"
                          className="w-28 shrink-0 text-sm"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={q.discountPercent}
                          onChange={(e) => updateQuantityDiscount(i, { discountPercent: e.target.value })}
                          placeholder="Discount %"
                          className="w-28 shrink-0 text-sm"
                        />
                        <Input
                          value={q.description}
                          onChange={(e) => updateQuantityDiscount(i, { description: e.target.value })}
                          placeholder="e.g. ৫% বাড়তি ছাড় (optional)"
                          className="w-full text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeQuantityDiscount(i)}
                          className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addQuantityDiscount}
                    className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                  >
                    + Add tier
                  </button>
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Delivery charge (৳)</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    Added to every order at checkout, shown as its own &ldquo;ডেলিভারি চার্জ&rdquo; line in the
                    cart drawer — unless the order already qualifies for a spend-more reward (above) with
                    &ldquo;Free delivery&rdquo; ticked, in which case it&rsquo;s shown and charged as ৳0. Leave
                    blank for no delivery charge at all.
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(e.target.value)}
                    placeholder="e.g. 60"
                    className="w-full max-w-xs text-sm"
                  />
                </div>

                <div className="rounded-lg border border-black/10 p-3">
                  <Label>Coupons</Label>
                  <p className="mb-2 text-xs text-foreground/50">
                    Every coupon code the storefront&rsquo;s checkout field actually matches — typing one of
                    these codes applies its Discount % to the order. Independent of the Logo &amp; Banner
                    tab&rsquo;s own hero coupon code (which also works at checkout once it has a Rate %), but
                    checked together: if a customer somehow qualifies for both a spend-more reward and a coupon,
                    the better percent wins — they&rsquo;re never stacked together.
                  </p>
                  <div className="space-y-2">
                    {coupons.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={c.code}
                          onChange={(e) => updateCoupon(i, { code: e.target.value.toUpperCase() })}
                          placeholder="CODE"
                          pattern="[A-Za-z0-9]+"
                          className="w-28 shrink-0 text-sm uppercase"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={c.discountPercent}
                          onChange={(e) => updateCoupon(i, { discountPercent: e.target.value })}
                          placeholder="Discount %"
                          className="w-28 shrink-0 text-sm"
                        />
                        <Input
                          value={c.description}
                          onChange={(e) => updateCoupon(i, { description: e.target.value })}
                          placeholder="e.g. নতুন গ্রাহক (optional note)"
                          className="w-full text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeCoupon(i)}
                          className="shrink-0 rounded border border-black/10 px-2 py-2 text-xs text-status-cancelled"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addCoupon}
                    className="mt-3 inline-flex items-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5"
                  >
                    + Add coupon
                  </button>
                </div>
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
