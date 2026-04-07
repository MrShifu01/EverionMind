import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  surfaceHigh: string;
  surfaceHighest: string;
  border: string;
  borderStrong: string;
  text: string;
  textSoft: string;
  textMid: string;
  textMuted: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentLight: string;
  accentBorder: string;
  accentContainer: string;
  secondary: string;
  secondaryLight: string;
  secondaryBorder: string;
  tertiary: string;
  tertiaryLight: string;
  error: string;
  success: string;
}

export const DARK: ThemeColors = {
  bg: "#0e0e0e",
  surface: "#1a1919",
  surface2: "#131313",
  surfaceHigh: "#201f1f",
  surfaceHighest: "#262626",
  border: "rgba(72,72,71,0.15)",
  borderStrong: "rgba(72,72,71,0.30)",
  text: "#ffffff",
  textSoft: "#ffffff",
  textMid: "#adaaaa",
  textMuted: "#adaaaa",
  textDim: "#777575",
  textFaint: "#777575",
  // Cyan — primary (actions)
  accent: "#72eff5",
  accentLight: "rgba(114,239,245,0.08)",
  accentBorder: "rgba(114,239,245,0.25)",
  accentContainer: "#1fb1b7",
  // Violet — secondary (AI/intelligence)
  secondary: "#8b5cf6",
  secondaryLight: "rgba(139,92,246,0.10)",
  secondaryBorder: "rgba(139,92,246,0.25)",
  // Rose — tertiary (security)
  tertiary: "#ff9ac3",
  tertiaryLight: "rgba(255,154,195,0.10)",
  error: "#ff6e84",
  success: "#51cf66",
};

export const LIGHT: ThemeColors = {
  bg: "#fafafa",
  surface: "#ffffff",
  surface2: "#f5f5f5",
  surfaceHigh: "#efefef",
  surfaceHighest: "#e8e8e8",
  border: "rgba(0,0,0,0.08)",
  borderStrong: "rgba(0,0,0,0.15)",
  text: "#1a1a1a",
  textSoft: "#1a1a1a",
  textMid: "#4a4a4a",
  textMuted: "#6b7280",
  textDim: "#9ca3af",
  textFaint: "#9ca3af",
  accent: "#0891b2",
  accentLight: "rgba(8,145,178,0.08)",
  accentBorder: "rgba(8,145,178,0.25)",
  accentContainer: "#0e7490",
  secondary: "#7c3aed",
  secondaryLight: "rgba(124,58,237,0.08)",
  secondaryBorder: "rgba(124,58,237,0.20)",
  tertiary: "#db2777",
  tertiaryLight: "rgba(219,39,119,0.08)",
  error: "#ef4444",
  success: "#22c55e",
};

interface ThemeContextValue {
  t: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  t: DARK,
  isDark: true,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // App is dark-mode only — inline styles use hardcoded dark colors
  const [isDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    root.classList.add("dark");
    root.classList.remove("light");
    localStorage.setItem("openbrain_theme", "dark");
  }, []);

  const toggleTheme = () => {}; // no-op — dark mode only
  const t = isDark ? DARK : LIGHT;

  return <ThemeCtx.Provider value={{ t, isDark, toggleTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
