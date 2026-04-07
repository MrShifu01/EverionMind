import type { Entry, Workspace } from "../types";

export function inferWorkspace(entry: Entry): Workspace {
  if (entry.metadata?.workspace) return entry.metadata.workspace;
  const tags = (entry.tags || []).map((t) => t.toLowerCase());
  const bizKeywords = [
    "smash burger bar",
    "supplier",
    "contractor",
    "business",
    "restaurant",
    "bidfoods",
    "makro",
    "econofoods",
  ];
  if (bizKeywords.some((k) => tags.some((t) => t.includes(k)))) return "business";
  const personalKeywords = [
    "id",
    "identity",
    "medical aid",
    "health",
    "insurance",
    "driving licence",
    "home affairs",
    "family",
    "personal",
    "passport",
    "medical",
  ];
  if (personalKeywords.some((k) => tags.some((t) => t.includes(k)))) return "personal";
  return "both";
}
