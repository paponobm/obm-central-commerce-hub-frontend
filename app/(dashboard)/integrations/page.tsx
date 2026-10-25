"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { Integration, IntegrationProviderMeta, IntegrationStatus } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill, StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { LoadingLine } from "@/components/ui/spinner";

const PROVIDER_LABELS: Record<string, string> = {
  STEADFAST: "Steadfast Courier",
};

interface FormState {
  id: string | null;
  provider: string;
  label: string;
  isEnabled: boolean;
  // Keyed by the provider's own credential field keys — populated fresh
  // (empty) on create, and left blank on edit (blank = "keep existing",
  // see the backend's merge-on-update behavior).
  credentials: Record<string, string>;
}

function emptyForm(provider: string): FormState {
  return { id: null, provider, label: "", isEnabled: true, credentials: {} };
}

export default function IntegrationsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("integrations.manage");

  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [providers, setProviders] = useState<IntegrationProviderMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IntegrationStatus | "">("");
  const [providerFilter, setProviderFilter] = useState("");

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  // Webhook setup dialog — only the id is kept so the shown data always
  // reflects the latest load() result, not a stale snapshot from when the
  // dialog opened.
  const [webhookUserId, setWebhookUserId] = useState<string | null>(null);
  // The plaintext secret from the most recent generate/regenerate call —
  // shown once, in-memory only, never refetched or persisted client-side.
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);

  async function load() {
    try {
      const [rows, providerMeta] = await Promise.all([
        api.get<Integration[]>("/admin/integrations"),
        api.get<IntegrationProviderMeta[]>("/admin/integrations/providers"),
      ]);
      setIntegrations(rows);
      setProviders(providerMeta);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load integrations");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!integrations) return [];
    const q = search.trim().toLowerCase();
    return integrations.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (providerFilter && i.provider !== providerFilter) return false;
      if (q && !i.label.toLowerCase().includes(q) && !(PROVIDER_LABELS[i.provider] ?? i.provider).toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [integrations, search, statusFilter, providerFilter]);

  const selectedProviderMeta = providers.find((p) => p.provider === form?.provider);
  const webhookUser = integrations?.find((i) => i.id === webhookUserId) ?? null;

  function openCreate() {
    setFormError(null);
    setForm(emptyForm(providers[0]?.provider ?? ""));
  }

  function openEdit(i: Integration) {
    setFormError(null);
    setForm({
      id: i.id,
      provider: i.provider,
      label: i.label,
      isEnabled: i.isEnabled,
      credentials: {},
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (form.id) {
        await api.patch(`/admin/integrations/${form.id}`, {
          label: form.label,
          isEnabled: form.isEnabled,
          credentials: form.credentials,
        });
      } else {
        await api.post("/admin/integrations", {
          provider: form.provider,
          label: form.label,
          isEnabled: form.isEnabled,
          credentials: form.credentials,
        });
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(i: Integration) {
    if (!confirm(`Delete "${i.label}"? This cannot be undone.`)) return;
    setDeletingId(i.id);
    try {
      await api.delete(`/admin/integrations/${i.id}`);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to delete integration");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleEnabled(i: Integration) {
    if (i.isEnabled && !confirm(`Disable "${i.label}"? It will stop being usable for new shipments.`)) {
      return;
    }
    setWorkingId(i.id);
    try {
      await api.patch(`/admin/integrations/${i.id}`, { isEnabled: !i.isEnabled });
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to update integration");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleSetDefault(i: Integration) {
    setWorkingId(i.id);
    try {
      await api.post(`/admin/integrations/${i.id}/set-default`);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to set default");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleTestConnection(i: Integration) {
    setTestingId(i.id);
    try {
      await api.post(`/admin/integrations/${i.id}/test`);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to test connection");
    } finally {
      setTestingId(null);
    }
  }

  function openWebhook(i: Integration) {
    setGeneratedSecret(null);
    setWebhookUserId(i.id);
  }

  async function handleGenerateWebhookSecret(i: Integration) {
    if (
      i.hasWebhookSecret &&
      !confirm("Regenerate the webhook secret? The old one stops working immediately — update it on the provider's side too.")
    ) {
      return;
    }
    setWorkingId(i.id);
    try {
      const result = await api.post<{ secret: string; webhookUrl: string }>(
        `/admin/integrations/${i.id}/webhook-secret/regenerate`,
      );
      setGeneratedSecret(result.secret);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to generate webhook secret");
    } finally {
      setWorkingId(null);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permission denied or unavailable — nothing meaningful to
      // recover into, same as the rest of this app's copy buttons.
    }
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Manage courier services and external API connections."
        actions={
          canManage && (
            <Button variant="primary" onClick={openCreate} disabled={providers.length === 0}>
              Add Integration
            </Button>
          )
        }
      />
      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            className="w-64"
            placeholder="Search by label or provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select className="w-44" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {PROVIDER_LABELS[p.provider] ?? p.provider}
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IntegrationStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="CONNECTED">Connected</option>
            <option value="DISCONNECTED">Disconnected</option>
            <option value="ERROR">Error</option>
            <option value="DISABLED">Disabled</option>
          </Select>
        </div>

        {!integrations ? (
          <LoadingLine />
        ) : integrations.length === 0 ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-foreground/50">No integrations configured yet.</p>
            {canManage && providers.length > 0 && (
              <Button variant="primary" onClick={openCreate}>
                Add Integration
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-foreground/50">No integrations match your search.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Provider</th>
                <th className="pb-2 font-medium">Label</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Default</th>
                <th className="pb-2 font-medium">Last tested</th>
                <th className="pb-2 font-medium">Last updated</th>
                {canManage && <th className="pb-2 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-black/5 last:border-0 align-top">
                  <td className="py-2.5 font-medium text-foreground">
                    {PROVIDER_LABELS[i.provider] ?? i.provider}
                  </td>
                  <td className="py-2.5 text-foreground/70">{i.label}</td>
                  <td className="py-2.5">
                    <StatusBadge status={i.status} />
                    {i.lastTestMessage && (
                      <p className="mt-1 max-w-xs text-xs text-foreground/50">{i.lastTestMessage}</p>
                    )}
                  </td>
                  <td className="py-2.5">{i.isDefault && <Pill tone="primary">Default</Pill>}</td>
                  <td className="py-2.5 text-xs text-foreground/60">
                    {i.lastTestedAt ? new Date(i.lastTestedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="py-2.5 text-xs text-foreground/60">
                    {new Date(i.updatedAt).toLocaleString()}
                  </td>
                  {canManage && (
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          disabled={testingId === i.id}
                          onClick={() => handleTestConnection(i)}
                        >
                          {testingId === i.id ? "Testing…" : "Test Connection"}
                        </Button>
                        <Button variant="ghost" onClick={() => openEdit(i)}>
                          Configure
                        </Button>
                        <Button variant="ghost" onClick={() => openWebhook(i)}>
                          Webhook
                        </Button>
                        {!i.isDefault && (
                          <Button
                            variant="ghost"
                            disabled={workingId === i.id}
                            onClick={() => handleSetDefault(i)}
                          >
                            Set Default
                          </Button>
                        )}
                        <span className="mx-1 inline-flex items-center gap-1.5 text-xs text-foreground/50">
                          <Switch
                            checked={i.isEnabled}
                            disabled={workingId === i.id}
                            onChange={() => handleToggleEnabled(i)}
                          />
                          {i.isEnabled ? "Enabled" : "Disabled"}
                        </span>
                        <Button
                          variant="ghost"
                          className="text-status-cancelled hover:bg-status-cancelled/10"
                          disabled={deletingId === i.id}
                          onClick={() => handleDelete(i)}
                        >
                          {deletingId === i.id ? "Deleting…" : "Delete"}
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

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Configure Integration" : "Add Integration"}
      >
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!form.id && (
              <div>
                <Label>Provider</Label>
                <Select
                  required
                  value={form.provider}
                  onChange={(e) => setForm({ ...emptyForm(e.target.value), label: form.label })}
                >
                  {providers.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {PROVIDER_LABELS[p.provider] ?? p.provider}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>Label</Label>
              <Input
                required
                placeholder="e.g. Main Steadfast account"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            {selectedProviderMeta?.credentialFields.map((field) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <Input
                  type={field.secret ? "password" : "text"}
                  placeholder={form.id && field.secret ? "Leave blank to keep existing" : field.placeholder}
                  value={form.credentials[field.key] ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      credentials: { ...form.credentials, [field.key]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
              />
              Enabled
            </label>
            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{formError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : form.id ? "Save Configuration" : "Add Integration"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!webhookUser}
        onClose={() => {
          setWebhookUserId(null);
          setGeneratedSecret(null);
        }}
        title="Webhook"
      >
        {webhookUser && (
          <div className="space-y-4">
            <div>
              <Label>Callback URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUser.webhookUrl} className="flex-1 font-mono text-xs" />
                <Button type="button" variant="secondary" onClick={() => copyText(webhookUser.webhookUrl)}>
                  Copy
                </Button>
              </div>
              <p className="mt-1 text-xs text-foreground/50">
                Paste this into {PROVIDER_LABELS[webhookUser.provider] ?? webhookUser.provider}&apos;s own webhook
                settings, as the callback/endpoint URL.
              </p>
            </div>

            {generatedSecret ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <Label>Auth token (shown once — copy it now)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generatedSecret} className="flex-1 font-mono text-xs" />
                  <Button type="button" variant="secondary" onClick={() => copyText(generatedSecret)}>
                    Copy
                  </Button>
                </div>
                <p className="mt-1 text-xs text-amber-700">
                  This won&apos;t be shown again after you close this window. Paste it into the provider&apos;s
                  &quot;Auth token&quot; field.
                </p>
              </div>
            ) : (
              <div>
                <Label>Auth token</Label>
                <p className="mb-2 text-xs text-foreground/50">
                  {webhookUser.hasWebhookSecret
                    ? "A secret is already configured for this integration. Regenerating replaces it immediately — update it on the provider's side too."
                    : "No secret generated yet — the provider needs one to sign its requests so we can verify they're genuine."}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={workingId === webhookUser.id}
                  onClick={() => handleGenerateWebhookSecret(webhookUser)}
                >
                  {workingId === webhookUser.id
                    ? "Generating…"
                    : webhookUser.hasWebhookSecret
                      ? "Regenerate Secret"
                      : "Generate Secret"}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-black/5 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setWebhookUserId(null);
                  setGeneratedSecret(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
