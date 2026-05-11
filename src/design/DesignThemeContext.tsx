import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type DesignVariant = "bronze";
export type DesignMode = "light" | "dark";

interface DesignThemeValue {
  variant: DesignVariant;
  mode: DesignMode;
  setVariant: (v: DesignVariant) => void;
  setMode: (m: DesignMode) => void;
  toggleMode: () => void;
}

const STORAGE_MODE = "everion:design:mode";
const LEGACY_THEME_KEY = "openbrain_theme";

const MODES: DesignMode[] = ["light", "dark"];

function loadMode(): DesignMode {
  const stored = localStorage.getItem(STORAGE_MODE);
  if (stored && (MODES as string[]).includes(stored)) return stored as DesignMode;
  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === "dark" || legacy === "light") return legacy;
  return "dark";
}

function applyToDocument(mode: DesignMode) {
  const html = document.documentElement;
  html.classList.add("family-bronze");
  html.classList.remove("theme-dark", "theme-light");
  html.classList.add(`theme-${mode}`);
  html.classList.toggle("dark", mode === "dark");
  html.classList.toggle("light", mode === "light");
  html.setAttribute("data-theme", mode);
  html.style.colorScheme = mode;
  syncThemeColor();
}

// iOS paints the safe-area chin from index.html's static theme-color
// until we overwrite it; sample body bg after styles compute.
function syncThemeColor() {
  if (typeof window === "undefined" || !document.body) return;
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === "rgba(0, 0, 0, 0)") return;
    document
      .querySelectorAll('meta[name="theme-color"][media]')
      .forEach((el) => el.parentNode?.removeChild(el));
    let meta = document.querySelector(
      'meta[name="theme-color"]:not([media])',
    ) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    if (meta.getAttribute("content") !== bg) meta.setAttribute("content", bg);
  });
}

export const DesignThemeCtx = createContext<DesignThemeValue | null>(null);

export function DesignThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DesignMode>(() => loadMode());

  useEffect(() => {
    applyToDocument(mode);
    localStorage.setItem(STORAGE_MODE, mode);
    localStorage.setItem(LEGACY_THEME_KEY, mode);
  }, [mode]);

  const setVariant = useCallback(() => {}, []);
  const setMode = useCallback((m: DesignMode) => setModeState(m), []);
  const toggleMode = useCallback(() => setModeState((m) => (m === "dark" ? "light" : "dark")), []);

  return (
    <DesignThemeCtx.Provider value={{ variant: "bronze", mode, setVariant, setMode, toggleMode }}>
      {children}
    </DesignThemeCtx.Provider>
  );
}

export function useDesignTheme(): DesignThemeValue {
  const ctx = useContext(DesignThemeCtx);
  if (!ctx) throw new Error("useDesignTheme must be used inside DesignThemeProvider");
  return ctx;
}

export const VARIANT_LABEL: Record<DesignVariant, string> = {
  bronze: "Bronze / Slate",
};

export const VARIANT_BLURB: Record<DesignVariant, string> = {
  bronze: "cooler slate, brass accent, monumental serif. architectural.",
};

export function applyInitialDesignTheme() {
  applyToDocument(loadMode());
}
