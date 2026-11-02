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
import { PageHeader } from "@/components/layout/page-header";
import type { ChannelHeroSlide } from "@/lib/types";

interface SlideForm {
  image: string;
  title: string;
  description: string;
  couponEnabled: boolean;
  couponLabel: string;
  couponCode: string;
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
  const { channels, refresh } = useChannelScope();
  const channel = channels?.find((c) => c.id === id);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [heroCouponEnabled, setHeroCouponEnabled] = useState(false);
  const [heroCouponLabel, setHeroCouponLabel] = useState("");
  const [heroCouponCode, setHeroCouponCode] = useState("");
  const [heroSlides, setHeroSlides] = useState<SlideForm[]>([]);
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
    const hc = channel.themeConfig?.heroCoupon;
    setHeroCouponEnabled(hc?.enabled ?? false);
    setHeroCouponLabel(hc?.label ?? "প্রথম অর্ডারে ১০% ছাড়");
    setHeroCouponCode(hc?.code ?? "");
    setHeroSlides((channel.themeConfig?.heroSlides ?? []).map(toSlideForm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const themeConfig: Record<string, unknown> = {};
      if (heroCouponCode.trim()) {
        themeConfig.heroCoupon = {
          enabled: heroCouponEnabled,
          label: heroCouponLabel.trim(),
          code: heroCouponCode.trim().toUpperCase(),
        };
      }
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
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={heroCouponEnabled}
                onChange={(e) => setHeroCouponEnabled(e.target.checked)}
              />
              Hero coupon (shown in the storefront&apos;s homepage banner)
            </label>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Description</Label>
                <Input
                  value={heroCouponLabel}
                  onChange={(e) => setHeroCouponLabel(e.target.value)}
                  placeholder="e.g. প্রথম অর্ডারে ১০% ছাড়"
                />
              </div>
              <div>
                <Label>Code</Label>
                <Input
                  value={heroCouponCode}
                  onChange={(e) => setHeroCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RELIEF10"
                  required={heroCouponEnabled}
                  pattern="[A-Za-z0-9]+"
                  title="letters and numbers only"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-foreground/50">
              Turning this off hides the coupon pill on the storefront without losing the saved text.
            </p>
          </div>
          <div className="rounded-lg border border-black/10 p-3">
            <Label>Hero slideshow</Label>
            <p className="mb-3 text-xs text-foreground/50">
              Up to 8 images, shown left-to-right in the homepage banner. Each image can have its own title,
              description and coupon — leave a field blank to use the defaults above instead. Leave the whole
              slideshow empty to keep the plain color banner.
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
