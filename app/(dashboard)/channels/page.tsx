"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { slugify } from "@/lib/slugify";
import type { ChannelWithStats } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  domain: string;
}

const EMPTY_FORM: FormState = { name: "", slug: "", slugTouched: false, domain: "" };

export default function ChannelsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { channels, loading, refresh } = useChannelScope();

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openCreateForm() {
    setFormError(null);
    setForm({ ...EMPTY_FORM });
  }

  function closeForm() {
    setForm(null);
    setFormError(null);
  }

  function handleNameChange(name: string) {
    setForm((prev) =>
      prev ? { ...prev, name, slug: prev.slugTouched ? prev.slug : slugify(name) } : prev,
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post("/admin/channels", {
        name: form.name,
        slug: form.slug,
        domain: form.domain.trim() || undefined,
      });
      closeForm();
      await refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function manageChannel(channel: ChannelWithStats) {
    router.push(`/channels/${channel.id}`);
  }

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Every branded storefront sharing this backend — products, inventory, and orders are centralized, but each store manages its own catalog and orders."
        actions={
          hasPermission("channels.manage") && (
            <Button variant="primary" onClick={openCreateForm}>
              + Add Channel
            </Button>
          )
        }
      />

      {!loading && channels && channels.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground/50">
            No stores yet. Create the first one to start publishing products to it.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading || !channels
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="h-40 animate-pulse">
                  <span />
                </Card>
              ))
            : channels.map((channel) => (
                <Card key={channel.id} className="flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-base font-semibold text-foreground">
                        {channel.name}
                      </div>
                      <div className="text-xs text-foreground/50">{channel.slug}</div>
                    </div>
                    <Pill tone={channel.isActive ? "primary" : "default"}>
                      {channel.isActive ? "Active" : "Inactive"}
                    </Pill>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <div className="text-lg font-semibold text-foreground">
                        {channel.productCount}
                      </div>
                      <div className="text-xs text-foreground/50">Products</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-foreground">
                        {channel.orderCount}
                      </div>
                      <div className="text-xs text-foreground/50">Orders</div>
                    </div>
                  </div>

                  <Button variant="secondary" onClick={() => manageChannel(channel)}>
                    Manage
                  </Button>
                </Card>
              ))}
        </div>
      )}

      <Modal open={!!form} onClose={closeForm} title="New Channel">
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Dry Food Market"
              />
            </div>

            <div>
              <Label>Slug</Label>
              <Input
                required
                value={form.slug}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, slug: e.target.value, slugTouched: true } : prev))
                }
                placeholder="e.g. dry-food-market"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="lowercase kebab-case, e.g. dry-food-market"
              />
            </div>

            <div>
              <Label>Domain (optional)</Label>
              <Input
                value={form.domain}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, domain: e.target.value } : prev))
                }
                placeholder="e.g. dryfoodmarket.com"
              />
            </div>

            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create Channel"}
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
