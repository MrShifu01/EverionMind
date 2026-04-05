import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textSoft: string;
  textMid: string;
  textMuted: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentLight: string;
  accentBorder: string;
  error: string;
  success: string;
}

export const DARK: ThemeColors = {
  bg: "#0f0f23",
  surface: "#1a1a2e",
  surface2: "#16162a",
  border: "#2a2a4a",
  text: "#EAEAEA",
  textSoft: "#ddd",
  textMid: "#bbb",
  textMuted: "#a0a0b8",
  textDim: "#9090a8",
  textFaint: "#7a7a9a",
  accent: "#4ECDC4",
  accentLight: "#4ECDC415",
  accentBorder: "#4ECDC440",
  error: '#FF6B6B',
  success: '#51CF66',
};

export const LIGHT: ThemeColors = {
  bg: "#f0f0f8",
  surface: "#ffffff",
  surface2: "#f8f7ff",
  border: "#e0dff0",
  text: "#1a1a2e",
  textSoft: "#2a2a4a",
  textMid: "#4a4a6a",
  textMuted: "#5a5a80",
  textDim: "#6a6a88",
  textFaint: "#7a7a96",
  accent: "#4ECDC4",
  accentLight: "#4ECDC415",
  accentBorder: "#4ECDC440",
  error: '#FF6B6B',
  success: '#51CF66',
};

interface ThemeContextValue {
  t: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({ t: DARK, isDark: true, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("openbrain_theme");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.body.style.background = isDark ? DARK.bg : LIGHT.bg;
    document.body.style.color = isDark ? DARK.text : LIGHT.text;
    localStorage.setItem("openbrain_theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggleTheme = () => setIsDark(d => !d);
  const t = isDark ? DARK : LIGHT;

  return (
    <ThemeCtx.Provider value={{ t, isDark, toggleTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
