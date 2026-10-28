// Remembers the desktop sidebar's collapsed/expanded state across visits —
// same localStorage + try/catch convention as lib/theme.ts.
const SIDEBAR_COLLAPSED_KEY = "obm-sidebar-collapsed";

export function getStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoredSidebarCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    else localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    // Storage unavailable (private mode or blocked) — state still applies
    // for this visit, it just won't be remembered on the next one.
  }
}
