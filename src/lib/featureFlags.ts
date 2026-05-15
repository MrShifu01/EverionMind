const ADMIN_FLAGS_KEY = "openbrain_admin_flags";

export const FEATURE_FLAGS = {
  // Chat is now the primary destination for the home Ask pill (the pill
  // navigates here instead of opening the old ChatSheet modal), so it
  // needs to be enabled by default. The env-var override stays available
  // for explicit local disable in development if needed.
  chat: {
    label: "Chat",
    icon: "💬",
    prodEnabled: import.meta.env.VITE_FEATURE_CHAT !== "false",
  },
  graph: {
    label: "Knowledge Graph",
    icon: "✦",
    prodEnabled: import.meta.env.VITE_FEATURE_GRAPH === "true",
  },
  timeline: {
    label: "Timeline",
    icon: "◷",
    prodEnabled: import.meta.env.VITE_FEATURE_TIMELINE === "true",
  },
  vault: { label: "Vault", icon: "🔐", prodEnabled: import.meta.env.VITE_FEATURE_VAULT === "true" },
  multiBrain: {
    label: "Multi-brain",
    icon: "🧠",
    prodEnabled: true as boolean,
  },
  vaultTemplates: {
    label: "Vault entry templates",
    icon: "🗂",
    prodEnabled: import.meta.env.VITE_FEATURE_VAULT_TEMPLATES === "true",
  },
  vaultPinBiometric: {
    label: "Vault PIN + biometric unlock",
    icon: "🔓",
    prodEnabled: true,
  },
  appLock: {
    label: "App-level biometric re-auth",
    icon: "📱",
    prodEnabled: true,
  },
} as const satisfies Record<string, { label: string; icon: string; prodEnabled: boolean }>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function getAdminFlags(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_FLAGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function setAdminFlag(key: string, val: boolean): void {
  const flags = getAdminFlags();
  flags[key] = val;
  localStorage.setItem(ADMIN_FLAGS_KEY, JSON.stringify(flags));
}

export function isFeatureEnabled(
  key: FeatureFlagKey,
  adminFlags: Record<string, boolean>,
): boolean {
  return FEATURE_FLAGS[key].prodEnabled || (adminFlags[key] ?? false);
}
