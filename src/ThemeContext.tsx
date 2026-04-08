import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { loadPersistedTheme, persistTheme, resolveTheme } from "./lib/themeToggle";

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
  bg: "oklch(10% 0.004 230)",
  surface: "oklch(16% 0.005 230)",
  surface2: "oklch(7% 0.003 230)",
  surfaceHigh: "oklch(20% 0.006 230)",
  surfaceHighest: "oklch(24% 0.006 230)",
  border: "oklch(22% 0.006 230 / 0.8)",
  borderStrong: "oklch(40% 0.005 230 / 0.9)",
  text: "oklch(96% 0.003 230)",
  textSoft: "oklch(96% 0.003 230)",
  textMid: "oklch(80% 0.005 225)",
  textMuted: "oklch(66% 0.007 225)",
  textDim: "oklch(58% 0.007 225)",
  textFaint: "oklch(48% 0.007 225)",
  accent: "oklch(68% 0.09 75)",
  accentLight: "oklch(24% 0.05 75)",
  accentBorder: "oklch(24% 0.05 75)",
  accentContainer: "oklch(68% 0.09 75)",
  secondary: "oklch(60% 0.045 225)",
  secondaryLight: "oklch(22% 0.025 225)",
  secondaryBorder: "oklch(22% 0.025 225)",
  tertiary: "oklch(60% 0.045 225)",
  tertiaryLight: "oklch(22% 0.025 225)",
  error: "oklch(62% 0.18 25)",
  success: "oklch(62% 0.14 145)",
};

// Clean neutral light mode with muted gold accent
export const LIGHT: ThemeColors = {
  bg: "oklch(97.5% 0.003 230)",
  surface: "oklch(100% 0 0)",
  surface2: "oklch(95% 0.003 230)",
  surfaceHigh: "oklch(92% 0.004 230)",
  surfaceHighest: "oklch(89% 0.005 230)",
  border: "oklch(88% 0.003 230 / 0.9)",
  borderStrong: "oklch(72% 0.004 230 / 0.9)",
  text: "oklch(14% 0.005 230)",
  textSoft: "oklch(14% 0.005 230)",
  textMid: "oklch(34% 0.006 230)",
  textMuted: "oklch(44% 0.006 230)",
  textDim: "oklch(50% 0.006 230)",
  textFaint: "oklch(57% 0.006 230)",
  // Muted gold/bronze — WCAG AA on white (#A68B67 mapped dark)
  accent: "oklch(46% 0.09 75)",
  accentLight: "oklch(92% 0.05 75)",
  accentBorder: "oklch(80% 0.08 75)",
  accentContainer: "oklch(43% 0.09 75)",
  secondary: "oklch(40% 0.04 225)",
  secondaryLight: "oklch(92% 0.025 225)",
  secondaryBorder: "oklch(80% 0.035 225)",
  tertiary: "oklch(50% 0.12 20)",
  tertiaryLight: "oklch(93% 0.04 20)",
  error: "oklch(50% 0.18 25)",
  success: "oklch(45% 0.14 145)",
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
  const t = isDark ? DARK : LIGHT;

  return <ThemeCtx.Provider value={{ t, isDark, toggleTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
