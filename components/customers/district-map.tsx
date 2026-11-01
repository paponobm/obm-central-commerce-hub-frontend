"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

// geoBoundaries' own district names (ADM2, CC BY 3.0 IGO, sourced from
// Bangladesh Bureau of Statistics — see public/bd-districts.geojson)
// differ slightly in spelling from the canonical names this app's
// district parser produces (backend/src/common/bd-districts.util.ts).
// This is the one place that reconciles the two, so a shape always finds
// its customer count regardless of which spelling either side uses.
const SHAPE_NAME_TO_DISTRICT: Record<string, string> = {
  Bogra: "Bogura",
  Brahamanbaria: "Brahmanbaria",
  Jessore: "Jashore",
  Maulvibazar: "Moulvibazar",
  Nawabganj: "Chapainawabganj",
  Netrakona: "Netrokona",
};

function canonicalDistrictName(shapeName: string): string {
  return SHAPE_NAME_TO_DISTRICT[shapeName] ?? shapeName;
}

interface GeoFeature {
  properties: { shapeName: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

const WIDTH = 480;
const HEIGHT = 560;
// Bangladesh's real bounding box (public/bd-districts.geojson) — fixed
// here rather than computed from the fetched data so the projection is
// stable even before the fetch resolves.
const BOUNDS = { minLon: 88.0, maxLon: 92.7, minLat: 20.55, maxLat: 26.65 };

function project([lon, lat]: [number, number]): [number, number] {
  // Simple equirectangular projection with a cos(latitude) correction —
  // accurate enough at Bangladesh's ~20-27°N span for a thumbnail map,
  // without pulling in a full projection library (d3-geo) for one map.
  const centerLatRad = ((BOUNDS.minLat + BOUNDS.maxLat) / 2) * (Math.PI / 180);
  const lonSpan = (BOUNDS.maxLon - BOUNDS.minLon) * Math.cos(centerLatRad);
  const latSpan = BOUNDS.maxLat - BOUNDS.minLat;
  const scale = Math.min(WIDTH / lonSpan, HEIGHT / latSpan);
  const x = (lon - BOUNDS.minLon) * Math.cos(centerLatRad) * scale;
  const y = (BOUNDS.maxLat - lat) * scale;
  const offsetX = (WIDTH - lonSpan * scale) / 2;
  const offsetY = (HEIGHT - latSpan * scale) / 2;
  return [x + offsetX, y + offsetY];
}

function ringToPath(ring: [number, number][]): string {
  return ring
    .map(([lon, lat], i) => {
      const [x, y] = project([lon, lat]);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

function geometryToPath(geometry: GeoFeature["geometry"]): string {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as [number, number][][];
    return rings.map(ringToPath).join(" ");
  }
  const polygons = geometry.coordinates as [number, number][][][];
  return polygons.map((rings) => rings.map(ringToPath).join(" ")).join(" ");
}

// Light-to-dark teal, five steps — same family as the reference's own
// choropleth shading. A district with 0 customers gets the lightest step
// rather than white, so the shape still reads as "part of the map".
const SHADE_STEPS = ["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#047857"];

function shadeFor(count: number, max: number): string {
  if (max <= 0) return SHADE_STEPS[0];
  const ratio = count / max;
  const index = Math.min(SHADE_STEPS.length - 1, Math.floor(ratio * (SHADE_STEPS.length - 1)));
  return SHADE_STEPS[index];
}

export function DistrictMap({
  counts,
  orderCounts,
}: {
  counts: Record<string, number>;
  orderCounts: Record<string, number>;
}) {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: ReactMouseEvent<SVGPathElement>) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  useEffect(() => {
    fetch("/bd-districts.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("not ok");
        return res.json();
      })
      .then((data) => setFeatures(data.features))
      .catch(() => setLoadFailed(true));
  }, []);

  const maxCount = useMemo(() => Math.max(0, ...Object.values(counts)), [counts]);

  const paths = useMemo(() => {
    if (!features) return [];
    return features.map((f) => {
      const district = canonicalDistrictName(f.properties.shapeName);
      return {
        district,
        d: geometryToPath(f.geometry),
        count: counts[district] ?? 0,
      };
    });
  }, [features, counts]);

  if (loadFailed) {
    return <p className="text-sm text-foreground/50">Couldn&apos;t load the district map outline.</p>;
  }
  if (!features) {
    return <div className="flex h-80 items-center justify-center text-sm text-foreground/40">Loading map…</div>;
  }

  return (
    <div ref={containerRef} className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mx-auto h-auto w-full max-w-sm">
        {paths.map((p) => (
          <path
            key={p.district}
            d={p.d}
            fill={shadeFor(p.count, maxCount)}
            stroke="#ffffff"
            strokeWidth={0.75}
            onMouseEnter={() => setHovered(p.district)}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered((h) => (h === p.district ? null : h))}
          />
        ))}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full overflow-hidden rounded-lg shadow-lg"
          style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
        >
          <div className="bg-foreground px-3 py-1.5 text-xs font-semibold text-white">
            {hovered}: {(counts[hovered] ?? 0).toLocaleString()}
          </div>
          <div className="bg-white px-3 py-1.5 text-xs text-foreground/70">
            Orders: {(orderCounts[hovered] ?? 0).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
