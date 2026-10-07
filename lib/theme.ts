export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "obm-theme";

// Applies the theme to the document and remembers it. Called by the inline
// boot script (app/layout.tsx, before paint) and by ThemeToggle.
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode or blocked) — theme still applies,
    // it just won't be remembered on the next visit.
  }
}

export function getAppliedTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
