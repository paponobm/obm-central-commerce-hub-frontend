"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface Settings {
  businessName: string;
  phone: string;
  email: string;
  address: string;
  defaultLowStockThreshold: number;
}

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<Settings>("/admin/settings")
      .then(setForm)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load settings"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const { businessName, phone, email, address, defaultLowStockThreshold } = form;
      setForm(
        await api.patch<Settings>("/admin/settings", {
          businessName,
          phone,
          address,
          ...(email ? { email } : {}),
          defaultLowStockThreshold: Number(defaultLowStockThreshold),
        }),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return error ? (
      <p className="text-sm text-status-cancelled">{error}</p>
    ) : (
      <p className="text-sm text-foreground/60">Loading…</p>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" description="Business-wide settings — not specific to any one store." />
      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Business profile</h2>
          <div className="space-y-4">
            <div>
              <Label>Business name</Label>
              <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Inventory</h2>
          <p className="mb-4 text-xs text-foreground/50">
            Low-stock threshold given to every new product. Existing products keep their own threshold.
          </p>
          <div className="max-w-[10rem]">
            <Label>Default low-stock threshold</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.defaultLowStockThreshold}
              onChange={(e) => setForm({ ...form, defaultLowStockThreshold: Number(e.target.value) })}
            />
          </div>
        </Card>

        {error && (
          <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          {saved && <span className="text-sm text-status-delivered">Saved</span>}
        </div>
      </form>
    </div>
  );
}
