// Types and helpers for Important Memories — durable facts Everion always
// trusts. User-authored memories stay distinguishable from deterministic and
// conservative LLM-assisted system extraction.

export type ImportantMemoryType = "fact" | "preference" | "decision" | "obligation";
export type ImportantMemoryStatus = "active" | "retired";
export type ImportantMemoryCreatedBy = "user" | "system" | "system_llm";

export const IMPORTANT_MEMORY_TYPES: ImportantMemoryType[] = [
  "fact",
  "preference",
  "decision",
  "obligation",
];

export const IMPORTANT_MEMORY_TYPE_LABEL: Record<ImportantMemoryType, string> = {
  fact: "Fact",
  preference: "Preference",
  decision: "Decision",
  obligation: "Obligation",
};

// Deterministic key from type + title. Same type + same title always produces
// the same key — that's how the unique-active constraint catches duplicates.
//
// Example: ('fact', "Wi-Fi password for the studio") -> "fact:wifi_password_for_the_studio"
export function generateMemoryKey(type: ImportantMemoryType, title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[‘’']/g, "") // strip smart quotes + apostrophes
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!slug) {
    throw new Error("Cannot generate memory key from empty title");
  }
  return `${type}:${slug}`;
}
