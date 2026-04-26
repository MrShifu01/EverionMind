/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DesignThemeCtx } from "./design/DesignThemeContext";

// Adapter over DesignThemeContext: when DesignThemeProvider is present, route
// isDark/toggleTheme through it. When it isn't (e.g. in component tests that
// only wrap with ThemeProvider), fall back to a local dark/light state so the
// component still mounts.

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const design = useContext(DesignThemeCtx);

  // Local fallback — only used when DesignThemeProvider is absent (tests).
  const [localDark, setLocalDark] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("openbrain_theme");
      return v === "dark";
    } catch {
      return false;
    }
  });
  const localToggle = useCallback(() => setLocalDark((d) => !d), []);
  useEffect(() => {
    if (design) return;
    const html = document.documentElement;
    html.classList.toggle("dark", localDark);
    html.classList.toggle("light", !localDark);
  }, [design, localDark]);

  const value: ThemeContextValue = design
    ? { isDark: design.mode === "dark", toggleTheme: design.toggleMode }
    : { isDark: localDark, toggleTheme: localToggle };

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

// Legacy token snapshot — used only by the accessibility test suite as a
// static contrast-ratio reference. Real runtime color comes from the active
// design family in design/family-*.css (via --bg, --ink, --ember, etc.).
// Values here are the Neural Obsidian / Alabaster snapshot the contrast
// assertions were written against.
export const DARK = {
  bg: "oklch(11% 0.010 60)",
  surface: "oklch(11% 0.010 60)",
  text: "oklch(96% 0.007 80)",
  textMuted: "oklch(62% 0.012 70)",
  textDim: "oklch(75% 0.009 75)",
  textFaint: "oklch(50% 0.010 70)",
  accent: "oklch(68% 0.09 75)",
  accentContainer: "oklch(24% 0.05 75)",
};

export const LIGHT = {
  bg: "oklch(98.5% 0.009 85)",
  surface: "oklch(100% 0 0)",
  text: "oklch(18% 0.012 65)",
  textMuted: "oklch(36% 0.013 65)",
  textDim: "oklch(28% 0.012 65)",
  textFaint: "oklch(42% 0.012 65)",
  accent: "oklch(46% 0.09 75)",
  accentContainer: "oklch(95% 0.013 85)",
};
