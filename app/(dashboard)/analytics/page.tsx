"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { AnalyticsOverview, Channel } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";
import { statRangeBounds, type StatRange } from "@/lib/stat-date-range";
import { StatDateRangeSelect } from "@/components/ui/stat-date-range-select";

// Central — every storefront's traffic in one place, same as Counseling.
// Deliberately simple: page/product views, on-site search terms, and a
// referrer/UTM breakdown — not an attempt at rebuilding Google Analytics
// (see AnalyticsEvent's own schema comment for why).
export default function AnalyticsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [range, setRange] = useState<StatRange>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRangeChange(next: StatRange, nextFrom?: string, nextTo?: string) {
    setRange(next);
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
  }

  useEffect(() => {
    api.get<Channel[]>("/admin/channels").then(setChannels).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOverview(null);
    setError(null);

    function load() {
      const { from, to } = statRangeBounds(range, customFrom, customTo);
      const params = new URLSearchParams({ from, to });
      if (channelId) params.set("channelId", channelId);
      api
        .get<AnalyticsOverview>(`/admin/analytics/overview?${params}`)
        .then((data) => {
          if (!cancelled) setOverview(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load analytics");
        });
    }

    load();
    // Same short-poll "stands in for real-time" convention as the
    // Dashboard's Total Orders card — a visit/search fired on either
    // storefront shows up here within one interval, no manual refresh.
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelId, range, customFrom, customTo]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Page views, searches, and traffic sources across every storefront."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label>Store</Label>
          <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">All stores</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Date range</Label>
          <StatDateRangeSelect
            value={range}
            customFrom={customFrom}
            customTo={customTo}
            onChange={handleRangeChange}
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
      )}

      {!overview ? (
        <LoadingLine />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <div className="text-sm text-foreground/50">Total page views</div>
              <div className="mt-1 text-2xl font-bold text-foreground">{overview.totalPageViews}</div>
              <p className="mt-1 text-xs text-foreground/40">for the selected range</p>
            </Card>
            <Card>
              <div className="text-sm text-foreground/50">Unique visitors</div>
              <div className="mt-1 text-2xl font-bold text-foreground">{overview.uniqueVisitors}</div>
              <p className="mt-1 text-xs text-foreground/40">by anonymous session, this range</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Top pages</h2>
              {overview.topPaths.length === 0 ? (
                <p className="text-sm text-foreground/50">No views in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                      <th className="pb-2 font-medium">Path</th>
                      <th className="pb-2 font-medium text-right">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topPaths.map((p) => (
                      <tr key={p.path} className="border-b border-black/5 last:border-0">
                        <td className="truncate py-1.5 pr-2">{p.path}</td>
                        <td className="py-1.5 text-right font-medium">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Top searches</h2>
              {overview.topSearches.length === 0 ? (
                <p className="text-sm text-foreground/50">No searches in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                      <th className="pb-2 font-medium">Query</th>
                      <th className="pb-2 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topSearches.map((s) => (
                      <tr key={s.query} className="border-b border-black/5 last:border-0">
                        <td className="truncate py-1.5 pr-2">{s.query}</td>
                        <td className="py-1.5 text-right font-medium">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Where visitors came from</h2>
              {overview.topReferrers.length === 0 ? (
                <p className="text-sm text-foreground/50">No data in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                      <th className="pb-2 font-medium">Referrer</th>
                      <th className="pb-2 font-medium text-right">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topReferrers.map((r) => (
                      <tr key={r.referrer} className="border-b border-black/5 last:border-0">
                        <td className="truncate py-1.5 pr-2">{r.referrer}</td>
                        <td className="py-1.5 text-right font-medium">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h2 className="mb-1 text-sm font-semibold text-foreground">Tagged ad sources</h2>
              <p className="mb-3 text-xs text-foreground/40">
                Only shows up for links tagged with ?utm_source=... — tag your Facebook/Google ad links to see them here.
              </p>
              {overview.topUtmSources.length === 0 ? (
                <p className="text-sm text-foreground/50">No tagged traffic in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium text-right">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.topUtmSources.map((u) => (
                      <tr key={u.source} className="border-b border-black/5 last:border-0">
                        <td className="truncate py-1.5 pr-2">{u.source}</td>
                        <td className="py-1.5 text-right font-medium">{u.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
