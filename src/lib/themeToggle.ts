/**
 * S5-4: Theme toggle persistence utilities.
 */

const STORAGE_KEY = "openbrain_theme";

type Theme = "dark" | "light";

export function loadPersistedTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return null;
}

export function persistTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function resolveTheme(stored: string | null): Theme {
  if (stored === "dark") return "dark";
  return "light";
}
