"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";

// Separate from the shipment-provider Integrations list below — BD
// Courier doesn't book or track shipments, it just answers "has this
// phone number been reliable across couriers before" (shown on New
// Order/Web Orders/Edit Order). One account-wide API key, not a list.
export function BdCourierCard({ canManage }: { canManage: boolean }) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  function load() {
    api
      .get<{ hasApiKey: boolean }>("/admin/bd-courier/settings")
      .then((r) => setHasApiKey(r.hasApiKey))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (canManage) load();
  }, [canManage]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const r = await api.patch<{ hasApiKey: boolean }>("/admin/bd-courier/settings", { apiKey });
      setHasApiKey(r.hasApiKey);
      setApiKey("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    setFormError(null);
    setDisconnecting(true);
    try {
      const r = await api.delete<{ hasApiKey: boolean }>("/admin/bd-courier/settings");
      setHasApiKey(r.hasApiKey);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!canManage) return null;

  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">BD Courier — Delivery Success Check</h2>
          <p className="mt-0.5 text-xs text-foreground/50">
            Looks up a phone number&apos;s delivery success rate across couriers on New Order, Web Orders, and Edit Order.
          </p>
        </div>
        {hasApiKey !== null && (
          <Pill tone={hasApiKey ? "success" : "default"}>{hasApiKey ? "Connected" : "Not connected"}</Pill>
        )}
      </div>

      {loadError && (
        <p className="mb-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-xs text-status-cancelled">{loadError}</p>
      )}
      {formError && (
        <p className="mb-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-xs text-status-cancelled">{formError}</p>
      )}

      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <Label>API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? "••••••••  (enter a new key to replace it)" : "Paste your BD Courier API key"}
          />
        </div>
        <Button type="submit" disabled={submitting || !apiKey}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        {hasApiKey && (
          <Button type="button" variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        )}
      </form>
    </Card>
  );
}
