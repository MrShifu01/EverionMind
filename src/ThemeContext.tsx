/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { loadPersistedTheme, persistTheme, resolveTheme } from "./lib/themeToggle";

// Single source of truth for token values is index.css (@theme + light-mode overrides).
// This context only manages the dark/light class on <html> and exposes the toggle.
// Components must use CSS variables (var(--color-*)) — not JS color values.

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => resolveTheme(loadPersistedTheme()) === "dark");

  useEffect(() => {
    const root = document.documentElement;
    const theme = isDark ? "dark" : "light";
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", isDark);
    root.classList.toggle("light", !isDark);
    persistTheme(theme);
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return <ThemeCtx.Provider value={{ isDark, toggleTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

export const DARK = {
  bg:             "oklch(11% 0.010 60)",
  surface:        "oklch(11% 0.010 60)",
  text:           "oklch(96% 0.007 80)",
  textMuted:      "oklch(62% 0.012 70)",
  textDim:        "oklch(75% 0.009 75)",
  textFaint:      "oklch(50% 0.010 70)",
  accent:         "oklch(68% 0.09 75)",
  accentContainer:"oklch(24% 0.05 75)",
};

export const LIGHT = {
  bg:             "oklch(98.5% 0.009 85)",
  surface:        "oklch(100% 0 0)",
  text:           "oklch(18% 0.012 65)",
  textMuted:      "oklch(36% 0.013 65)",
  textDim:        "oklch(28% 0.012 65)",
  textFaint:      "oklch(42% 0.012 65)",
  accent:         "oklch(46% 0.09 75)",
  accentContainer:"oklch(95% 0.013 85)",
};
