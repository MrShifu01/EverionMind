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
  bg: "oklch(12% 0.009 60)",
  surface: "oklch(15% 0.009 60)",
  surface2: "oklch(9% 0.009 60)",
  surfaceHigh: "oklch(23% 0.009 60)",
  surfaceHighest: "oklch(27% 0.009 60)",
  border: "oklch(24% 0.009 60 / 0.6)",
  borderStrong: "oklch(38% 0.006 60 / 0.8)",
  text: "oklch(93% 0.006 60)",
  textSoft: "oklch(93% 0.006 60)",
  textMid: "oklch(75% 0.006 60)",
  textMuted: "oklch(65% 0.006 60)",
  textDim: "oklch(58% 0.006 60)",
  textFaint: "oklch(48% 0.006 60)",
  accent: "oklch(72% 0.14 75)",
  accentLight: "oklch(26% 0.07 75)",
  accentBorder: "oklch(26% 0.07 75)",
  accentContainer: "oklch(72% 0.14 75)",
  secondary: "oklch(62% 0.08 150)",
  secondaryLight: "oklch(22% 0.04 150)",
  secondaryBorder: "oklch(22% 0.04 150)",
  tertiary: "oklch(62% 0.08 150)",
  tertiaryLight: "oklch(22% 0.04 150)",
  error: "oklch(62% 0.18 25)",
  success: "oklch(62% 0.14 145)",
};

// Warm light mode — editorial off-white with amber accent
export const LIGHT: ThemeColors = {
  bg: "oklch(97% 0.004 75)",
  surface: "oklch(99% 0.002 80)",
  surface2: "oklch(95% 0.005 75)",
  surfaceHigh: "oklch(91% 0.007 75)",
  surfaceHighest: "oklch(87% 0.009 75)",
  border: "oklch(86% 0.008 75 / 0.8)",
  borderStrong: "oklch(72% 0.010 75 / 0.9)",
  text: "oklch(15% 0.010 60)",
  textSoft: "oklch(15% 0.010 60)",
  textMid: "oklch(34% 0.008 60)",
  textMuted: "oklch(42% 0.007 60)",
  textDim: "oklch(48% 0.007 60)",
  textFaint: "oklch(55% 0.007 60)",
  // Dark amber — sufficient contrast on warm off-white (WCAG AA)
  accent: "oklch(50% 0.14 75)",
  accentLight: "oklch(93% 0.06 75)",
  accentBorder: "oklch(82% 0.09 75)",
  accentContainer: "oklch(45% 0.14 75)",
  secondary: "oklch(42% 0.08 150)",
  secondaryLight: "oklch(93% 0.04 150)",
  secondaryBorder: "oklch(82% 0.06 150)",
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
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem("openbrain_theme");
      return saved !== "light"; // default to dark
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      root.classList.remove("light");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      root.style.colorScheme = "light";
    }
    try {
      localStorage.setItem("openbrain_theme", isDark ? "dark" : "light");
    } catch {}
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);
  const t = isDark ? DARK : LIGHT;

  return <ThemeCtx.Provider value={{ t, isDark, toggleTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
