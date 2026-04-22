/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type DesignVariant = "dusk" | "paper" | "bronze";
export type DesignMode = "light" | "dark";

interface DesignThemeValue {
  variant: DesignVariant;
  mode: DesignMode;
  setVariant: (v: DesignVariant) => void;
  setMode: (m: DesignMode) => void;
  toggleMode: () => void;
}

const STORAGE_VARIANT = "everion:design:variant";
const STORAGE_MODE = "everion:design:mode";
const LEGACY_THEME_KEY = "openbrain_theme";

const VARIANTS: DesignVariant[] = ["dusk", "paper", "bronze"];
const MODES: DesignMode[] = ["light", "dark"];

const VARIANT_DEFAULT_MODE: Record<DesignVariant, DesignMode> = {
  dusk: "dark",
  paper: "light",
  bronze: "dark",
};

function loadVariant(): DesignVariant {
  const stored = localStorage.getItem(STORAGE_VARIANT);
  if (stored && (VARIANTS as string[]).includes(stored)) return stored as DesignVariant;
  return "bronze";
}

function loadMode(variant: DesignVariant): DesignMode {
  const stored = localStorage.getItem(STORAGE_MODE);
  if (stored && (MODES as string[]).includes(stored)) return stored as DesignMode;
  // fall back to legacy theme key so existing users keep their preference
  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === "dark" || legacy === "light") return legacy;
  return VARIANT_DEFAULT_MODE[variant];
}

function applyToDocument(variant: DesignVariant, mode: DesignMode) {
  const html = document.documentElement;
  html.classList.remove("family-dusk", "family-paper", "family-bronze");
  html.classList.add(`family-${variant}`);
  html.classList.remove("theme-dark", "theme-light");
  html.classList.add(`theme-${mode}`);
  // Keep legacy shadcn/Tailwind hooks in sync — they still gate some styles
  html.classList.toggle("dark", mode === "dark");
  html.classList.toggle("light", mode === "light");
  html.setAttribute("data-theme", mode);
  html.style.colorScheme = mode;
}

export const DesignThemeCtx = createContext<DesignThemeValue | null>(null);

export function DesignThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<DesignVariant>(() => loadVariant());
  const [mode, setModeState] = useState<DesignMode>(() => loadMode(loadVariant()));

  useEffect(() => {
    applyToDocument(variant, mode);
    localStorage.setItem(STORAGE_VARIANT, variant);
    localStorage.setItem(STORAGE_MODE, mode);
    // keep legacy key in sync so the old ThemeContext persistence still resolves
    localStorage.setItem(LEGACY_THEME_KEY, mode);
  }, [variant, mode]);

  const setVariant = useCallback((v: DesignVariant) => setVariantState(v), []);
  const setMode = useCallback((m: DesignMode) => setModeState(m), []);
  const toggleMode = useCallback(() => setModeState((m) => (m === "dark" ? "light" : "dark")), []);

  return (
    <DesignThemeCtx.Provider value={{ variant, mode, setVariant, setMode, toggleMode }}>
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
  dusk: "Dusk / Vellum",
  paper: "Paper / Ink",
  bronze: "Bronze / Slate",
};

export const VARIANT_BLURB: Record<DesignVariant, string> = {
  dusk: "warm charcoal at night, ivory by day. ember accent. humanist serif.",
  paper: "ivory paper, oxblood ink, sharp corners. editorial, book-like.",
  bronze: "cooler slate, brass accent, monumental serif. architectural.",
};

export function applyInitialDesignTheme() {
  // Call this in main.tsx so the correct family class is present before React mounts,
  // preventing a brief flash of legacy theme tokens.
  const variant = loadVariant();
  const mode = loadMode(variant);
  applyToDocument(variant, mode);
}
