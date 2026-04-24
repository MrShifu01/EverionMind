export type TierId = "free" | "free_byok" | "starter" | "starter_byok" | "pro" | "pro_byok";

export interface TierDef {
  id: TierId;
  label: string;
  subtitle: string;
  included: string[];
  missing: string[];
}

export const TIERS: TierDef[] = [
  {
    id: "free",
    label: "Free",
    subtitle: "No AI keys — storage only",
    included: [
      "Manual capture & storage",
      "Basic keyword search",
      "Tags, types & organisation",
      "Offline support",
      "Vault (encrypted secrets)",
    ],
    missing: [
      "AI parsing & classification",
      "Vector embeddings",
      "Semantic search",
      "Concept extraction & graph",
      "AI insights per entry",
      "Gmail scanning",
      "Calendar integration",
    ],
  },
  {
    id: "free_byok",
    label: "Free + Keys",
    subtitle: "Free plan · Your own API keys",
    included: [
      "Full AI enrichment pipeline",
      "AI parsing, classification & metadata extraction",
      "Vector embeddings & semantic search",
      "Concept extraction & knowledge graph",
      "AI insights per entry",
      "Gmail scanning & smart classification",
      "Calendar integration",
    ],
    missing: [
      "Platform-managed quota (pay per key use)",
      "Priority processing",
    ],
  },
  {
    id: "starter",
    label: "Starter",
    subtitle: "Starter plan · Platform AI included",
    included: [
      "500 AI-assisted captures / month",
      "200 AI chats / month",
      "20 voice notes / month",
      "20 improve scans / month",
      "AI parsing, classification & metadata extraction",
      "Vector embeddings & semantic search",
      "Gmail scanning & calendar integration",
    ],
    missing: [
      "Premium AI models (Sonnet / GPT-4o)",
      "All features unlocked",
    ],
  },
  {
    id: "starter_byok",
    label: "Starter + Keys",
    subtitle: "Starter plan · Your own API keys",
    included: [
      "All Starter features",
      "Full AI via your own keys (no quota)",
      "Custom model selection",
    ],
    missing: [
      "Premium AI models (Sonnet / GPT-4o)",
      "All features unlocked",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    subtitle: "Pro plan · Platform API keys",
    included: [
      "Full AI enrichment pipeline",
      "AI parsing, classification & metadata extraction",
      "Vector embeddings & semantic search",
      "Concept extraction & knowledge graph",
      "AI insights per entry",
      "Gmail scanning & smart classification",
      "Calendar integration",
      "Platform-managed quota (no key required)",
      "Priority processing & support",
    ],
    missing: [
      "Custom model selection",
      "Unlimited AI quota (quota applies)",
    ],
  },
  {
    id: "pro_byok",
    label: "Pro + Keys",
    subtitle: "Pro plan · Your own API keys",
    included: [
      "Full AI enrichment pipeline",
      "AI parsing, classification & metadata extraction",
      "Vector embeddings & semantic search",
      "Concept extraction & knowledge graph",
      "AI insights per entry",
      "Gmail scanning & smart classification",
      "Calendar integration",
      "Custom model selection",
      "No platform quota limits",
      "Priority processing & support",
    ],
    missing: [],
  },
];

export const TIER_LABELS: Record<TierId, string> = {
  free: "Free",
  free_byok: "Free + Keys",
  starter: "Starter",
  starter_byok: "Starter + Keys",
  pro: "Pro",
  pro_byok: "Pro + Keys",
};

export function deriveTierId(plan: string, hasAnyKey: boolean): TierId {
  if (plan === "pro"     && hasAnyKey) return "pro_byok";
  if (plan === "pro")                  return "pro";
  if (plan === "starter" && hasAnyKey) return "starter_byok";
  if (plan === "starter")              return "starter";
  if (hasAnyKey)                       return "free_byok";
  return "free";
}
