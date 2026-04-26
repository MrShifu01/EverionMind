// ─────────────────────────────────────────────────────────────────────────────
// adminPrefs
//
// Per-user, admin-only display preferences. Distinct from FEATURE_FLAGS:
//   - feature flags decide what's shipped to *all* users
//   - admin prefs decide which admin-only debug overlays the admin user
//     wants to see at any given moment
//
// Persisted in localStorage, surfaced via a small hook with cross-tab
// syncing via the storage event. All prefs default ON (an admin who's
// never opened Settings still sees their debug stuff).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

const KEY = "everion_admin_prefs.v1";

export interface AdminPrefs {
  /** P/I/C/E enrichment chips on entry cards + rows. */
  showEnrichmentChips: boolean;
  /** Debug payload (model, latency, retrieved IDs, …) under each AI chat message. */
  showChatDebug: boolean;
  /** "Diagnostics" expander in Settings → AI (provider status, counts, etc.). */
  showAIDiagnostics: boolean;
  /** Inline debug detail in Settings → Gmail Sync after a scan. */
  showGmailScanDebug: boolean;
  /** "Admin: …" extras inside the Enrichment settings tab. */
  showEnrichmentAdminExtras: boolean;
}

export const ADMIN_PREF_DEFS: Array<{
  key: keyof AdminPrefs;
  label: string;
  hint: string;
}> = [
  {
    key: "showEnrichmentChips",
    label: "Enrichment chips",
    hint: "P / I / C / E badges on entry cards and rows.",
  },
  {
    key: "showChatDebug",
    label: "Chat debug payload",
    hint: "Model, latency, retrieved-entry IDs under each AI response.",
  },
  {
    key: "showAIDiagnostics",
    label: "AI diagnostics panel",
    hint: "Provider status, missing-flag counts, top-12 unenriched.",
  },
  {
    key: "showGmailScanDebug",
    label: "Gmail scan debug",
    hint: "Raw scan result detail after a manual scan.",
  },
  {
    key: "showEnrichmentAdminExtras",
    label: "Enrichment admin extras",
    hint: "Admin-only sections inside Settings → Enrichment.",
  },
];

const DEFAULTS: AdminPrefs = {
  showEnrichmentChips: true,
  showChatDebug: true,
  showAIDiagnostics: true,
  showGmailScanDebug: true,
  showEnrichmentAdminExtras: true,
};

export function getAdminPrefs(): AdminPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAdminPref<K extends keyof AdminPrefs>(key: K, val: AdminPrefs[K]): void {
  if (typeof window === "undefined") return;
  const next = { ...getAdminPrefs(), [key]: val };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    // Notify same-tab listeners.
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  } catch { /* storage full / disabled */ }
}

export function useAdminPrefs(): AdminPrefs {
  const [prefs, setPrefs] = useState<AdminPrefs>(() => getAdminPrefs());
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && e.key !== KEY) return;
      setPrefs(getAdminPrefs());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return prefs;
}
