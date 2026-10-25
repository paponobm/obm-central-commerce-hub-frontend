"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Product } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { LoadingLine } from "@/components/ui/spinner";

const TABS: { label: string; path: string }[] = [
  { label: "Details", path: "" },
  { label: "Publishing", path: "/publishing" },
  { label: "Order History", path: "/orders" },
];

// Shared chrome for the three product-detail tabs, each its own route/page
// (mirrors the Channels workspace's own layout+tabs pattern) — this only
// fetches enough of the product for the header; each tab page loads
// whatever full data it actually needs on its own.
export default function ProductDetailLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setProduct(null);
    setLoadError(null);
    api
      .get<Product>(`/admin/products/${id}`)
      .then(setProduct)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load product"));
  }, [id]);

  const base = `/products/${id}`;
  const suffix = pathname.startsWith(base) ? pathname.slice(base.length) : "";

  if (loadError) {
    return <p className="text-base text-status-cancelled">{loadError}</p>;
  }
  if (!product) {
    return <LoadingLine className="text-base text-foreground/60" />;
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        description={`SKU ${product.sku}`}
        actions={
          <Button variant="secondary" onClick={() => router.push("/products")}>
            Back to Products
          </Button>
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-black/5">
        {TABS.map((t) => {
          const active = suffix === t.path;
          return (
            <Link
              key={t.label}
              href={`${base}${t.path}`}
              className={`shrink-0 border-b-2 px-4 py-2 text-base font-medium transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-foreground/60 hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
