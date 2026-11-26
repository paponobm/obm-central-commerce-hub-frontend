// Remembers the Products list's "N / page" choice across visits — same
// localStorage + try/catch convention as lib/sidebar-prefs.ts.
const PRODUCTS_PAGE_SIZE_KEY = "obm-products-page-size";

export function getStoredProductsPageSize(fallback: number): number {
  try {
    const raw = localStorage.getItem(PRODUCTS_PAGE_SIZE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function setStoredProductsPageSize(pageSize: number) {
  try {
    localStorage.setItem(PRODUCTS_PAGE_SIZE_KEY, String(pageSize));
  } catch {
    // Storage unavailable (private mode or blocked) — the choice still
    // applies for this visit, it just won't be remembered on the next one.
  }
}
