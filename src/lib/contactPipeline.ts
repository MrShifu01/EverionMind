import { authFetch } from "./authFetch";
import { PROMPTS } from "../config/prompts";
import type { ParsedContact } from "./vcfParser";

type ContactCategory =
  | "plumbing"
  | "electrician"
  | "irrigation"
  | "security"
  | "pool"
  | "lawn_service"
  | "general_maintenance"
  | "garage"
  | "personal"
  | "business"
  | "unknown";

interface CategorizedContact extends ParsedContact {
  category: ContactCategory;
  tags: string[];
  confidence: number;
}

interface GraphNode {
  id: string;
  type: "person" | "company" | "service";
  label: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: "provides" | "works_at";
}

interface PipelineResult {
  contacts: CategorizedContact[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights: {
    total: number;
    duplicates_removed: number;
    top_categories: { category: string; count: number }[];
    uncategorized_count: number;
  };
}

const BATCH_SIZE = 20;

interface AICategoryResult {
  category: ContactCategory;
  tags: string[];
  confidence: number;
}

async function categorizeBatch(contacts: ParsedContact[]): Promise<AICategoryResult[]> {
  const payload = contacts.map((c) => ({
    name: c.name,
    company: c.company ?? null,
    title: c.title ?? null,
    notes: c.notes ?? null,
  }));

  const res = await authFetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash-lite",
      system: PROMPTS.CONTACT_CATEGORIZE,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      max_tokens: 1500,
    }),
  });

  if (!res.ok) throw new Error(`AI categorization HTTP ${res.status}`);

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? "";

  const match = text
    .replace(/```json|```/g, "")
    .trim()
    .match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in categorization response");

  const parsed: AICategoryResult[] = JSON.parse(match[0]);
  return parsed;
}

function fallbackCategory(c: ParsedContact): AICategoryResult {
  const haystack = [c.name, c.company, c.title, c.notes].filter(Boolean).join(" ").toLowerCase();

  const rules: [RegExp, ContactCategory][] = [
    [/\bplumb/i, "plumbing"],
    [/\belectric/i, "electrician"],
    [/\birrigat/i, "irrigation"],
    [/\balarm|security|cctv|camera|beam/i, "security"],
    [/\bpool/i, "pool"],
    [/\blawn|garden|grass|thatch/i, "lawn_service"],
    [/\bgarage|gate|motor/i, "garage"],
    [/\bpaint|build|construct|carpent|wood/i, "general_maintenance"],
  ];

  for (const [re, cat] of rules) {
    if (re.test(haystack))
      return { category: cat, tags: ["home_service", "contractor"], confidence: 0.55 };
  }
  return { category: "unknown", tags: [], confidence: 0.1 };
}

function buildGraph(contacts: CategorizedContact[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const servicesSeen = new Set<string>();
  const companiesSeen = new Set<string>();

  for (const c of contacts) {
    nodes.push({ id: c.id, type: "person", label: c.name });

    if (c.category !== "unknown") {
      if (!servicesSeen.has(c.category)) {
        nodes.push({ id: c.category, type: "service", label: c.category.replace(/_/g, " ") });
        servicesSeen.add(c.category);
      }
      edges.push({ from: c.id, to: c.category, type: "provides" });
    }

    if (c.company) {
      const companyId = c.company
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 60);
      if (!companiesSeen.has(companyId)) {
        nodes.push({ id: companyId, type: "company", label: c.company });
        companiesSeen.add(companyId);
      }
      edges.push({ from: c.id, to: companyId, type: "works_at" });
    }
  }

  return { nodes, edges };
}

export async function runContactPipeline(
  contacts: ParsedContact[],
  originalCount: number,
): Promise<PipelineResult> {
  const categorized: CategorizedContact[] = [];

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    let cats: AICategoryResult[];

    try {
      cats = await categorizeBatch(batch);
    } catch (err) {
      console.warn("[contactPipeline] AI categorization failed, using keyword fallback:", err);
      cats = batch.map(fallbackCategory);
    }

    for (let j = 0; j < batch.length; j++) {
      categorized.push({
        ...batch[j],
        category: cats[j]?.category ?? "unknown",
        tags: cats[j]?.tags ?? [],
        confidence: cats[j]?.confidence ?? 0,
      });
    }
  }

  const { nodes, edges } = buildGraph(categorized);

  const categoryCount: Record<string, number> = {};
  for (const c of categorized) {
    categoryCount[c.category] = (categoryCount[c.category] ?? 0) + 1;
  }
  const top_categories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  return {
    contacts: categorized,
    nodes,
    edges,
    insights: {
      total: categorized.length,
      duplicates_removed: originalCount - contacts.length,
      top_categories,
      uncategorized_count: categorized.filter((c) => c.category === "unknown").length,
    },
  };
}

/** Convert a categorized contact into a payload ready for /api/capture */
export function contactToEntryPayload(
  c: CategorizedContact,
  brainId?: string,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    category: c.category,
    confidence_score: c.confidence,
  };
  if (c.phones.length) metadata.phone = c.phones.length === 1 ? c.phones[0] : c.phones;
  if (c.emails.length) metadata.email = c.emails.length === 1 ? c.emails[0] : c.emails;
  if (c.company) metadata.company = c.company;
  if (c.title) metadata.job_title = c.title;
  if (c.addresses?.length) metadata.address = c.addresses[0];

  const contentParts: string[] = [];
  if (c.company) contentParts.push(`Works at ${c.company}${c.title ? ` as ${c.title}` : ""}.`);
  if (c.phones.length) contentParts.push(`Phone: ${c.phones.join(", ")}.`);
  if (c.emails.length) contentParts.push(`Email: ${c.emails.join(", ")}.`);
  if (c.notes) contentParts.push(c.notes.slice(0, 300));

  return {
    p_title: c.name,
    p_content: contentParts.join(" "),
    p_type: "person",
    p_metadata: metadata,
    p_tags: c.tags,
    ...(brainId ? { p_brain_id: brainId } : {}),
  };
}

// Saving is handled in useCaptureSheetParse.handleVcfFile so that onCreated
// fires per contact, triggering concept extraction, insight, and connections.
