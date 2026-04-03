import { createContext, useContext, useState, useEffect } from "react";

export const DARK = {
  bg: "#0f0f23",
  surface: "#1a1a2e",
  surface2: "#16162a",
  border: "#2a2a4a",
  text: "#EAEAEA",
  textSoft: "#ddd",
  textMid: "#bbb",
  textMuted: "#999",
  textDim: "#777",
  textFaint: "#555",
};

export const LIGHT = {
  bg: "#f0f0f8",
  surface: "#ffffff",
  surface2: "#f8f7ff",
  border: "#e0dff0",
  text: "#1a1a2e",
  textSoft: "#2a2a4a",
  textMid: "#4a4a6a",
  textMuted: "#7070a0",
  textDim: "#8888a8",
  textFaint: "#9a9ab8",
};

const ThemeCtx = createContext({ t: DARK, isDark: true, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
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
