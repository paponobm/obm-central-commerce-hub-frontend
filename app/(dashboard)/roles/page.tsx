"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { Role } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Role[]>("/admin/roles")
      .then(setRoles)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load roles"));
  }, []);

  if (error) return <p className="text-sm text-status-cancelled">{error}</p>;
  if (!roles) return <p className="text-sm text-foreground/60">Loading…</p>;

  return (
    <div>
      <PageHeader
        title="Roles"
        description="What each role is for. Super Admin always has every permission; everyone else's actual access is granted per user on the Users page."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((r) => {
          const isFixed = r.name === "Super Admin";
          return (
            <Card key={r.id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">{r.name}</h2>
                {isFixed && (
                  <span className="text-xs text-foreground/50">{r.permissions.length} permissions</span>
                )}
              </div>
              {r.description && <p className="mb-3 text-sm text-foreground/60">{r.description}</p>}
              {isFixed ? (
                <div className="flex flex-wrap gap-1">
                  {[...r.permissions].sort().map((p) => (
                    <Pill key={p} tone={p === "channels.all_access" ? "warning" : "default"}>
                      {p}
                    </Pill>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-foreground/40">
                  Permissions are set per user when creating or editing them — see Users.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
