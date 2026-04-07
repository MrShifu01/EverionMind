import { TC } from "../data/constants";

const STORAGE_KEY = (brainId: string) => `ob:typeIcons:${brainId}`;

/**
 * Broad fallback hints for common custom types not covered by TC.
 * Used only when a type is encountered via manual edit (no AI call available).
 */
const TYPE_EMOJI_HINTS: Record<string, string> = {
  recipe: "🍳",
  food: "🍽️",
  ingredient: "🥬",
  meal: "🥘",
  drink: "🥤",
  supplier: "📦",
  vendor: "🏭",
  manufacturer: "🏭",
  employee: "👷",
  staff: "👥",
  director: "🏢",
  vehicle: "🚗",
  car: "🚗",
  truck: "🚛",
  property: "🏠",
  building: "🏢",
  contract: "📋",
  agreement: "📋",
  lease: "📋",
  project: "📊",
  task: "✅",
  milestone: "🎯",
  company: "🏢",
  business: "💼",
  client: "🤝",
  product: "📦",
  item: "🏷️",
  stock: "📦",
  event: "📅",
  appointment: "📅",
  booking: "📅",
  certificate: "🏆",
  license: "📜",
  permit: "📜",
  insurance: "🛡️",
  policy: "🛡️",
  invoice: "🧾",
  payment: "💳",
  bank: "🏦",
  account: "💰",
  medicine: "💊",
  medical: "🏥",
  address: "📍",
};

/** Return the stored type→icon map for a brain. */
export function getTypeIcons(brainId: string): Record<string, string> {
  if (!brainId) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(brainId)) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Register an icon for a type only if no icon is stored yet.
 * First-one-wins ensures consistency across all entries of the same type.
 */
export function registerTypeIcon(brainId: string, type: string, icon: string): void {
  if (!brainId || !type || !icon) return;
  const map = getTypeIcons(brainId);
  if (map[type]) return; // already locked in
  map[type] = icon;
  try {
    localStorage.setItem(STORAGE_KEY(brainId), JSON.stringify(map));
  } catch {
    // localStorage may be unavailable (private browsing quota)
  }
}

/**
 * Pick a best-effort emoji for a type without an AI call.
 * Used when a type changes via manual edit and has no registered icon yet.
 */
export function pickDefaultIcon(type: string): string {
  const lower = type.toLowerCase();
  // Check TC first
  if (TC[lower]) return TC[lower].i;
  // Keyword match
  for (const [key, emoji] of Object.entries(TYPE_EMOJI_HINTS)) {
    if (lower.includes(key)) return emoji;
  }
  return TC.note.i; // "📝" final fallback
}

/**
 * Resolve the display icon for a type.
 * Priority: registered typeIcons map → TC built-ins → note fallback.
 */
export function resolveIcon(type: string, typeIcons: Record<string, string>): string {
  return typeIcons[type] ?? TC[type as string]?.i ?? TC.note.i;
}
