/**
 * Canonical fact extraction.
 *
 * Deterministic extraction walks an entry's structured metadata (phone,
 * id_number, address, etc.) and produces atomic facts that go into
 * `important_memories` for Tier-1 fast-path retrieval.
 *
 * Prose extraction accepts already-parsed LLM candidates, then applies strict
 * shape, type, and confidence gates before anything can be persisted as an
 * important memory.
 */

export type ExtractedMemoryType = "fact" | "preference" | "decision" | "obligation";

export interface ExtractableEntry {
  id: string;
  title: string;
  type: string | null;
  metadata: Record<string, any> | null;
}

export interface ExtractedFact {
  memory_key: string;
  memory_type: ExtractedMemoryType;
  title: string;
  summary: string;
  source_entry_ids: string[];
}

export interface ProseFactCandidate {
  title?: unknown;
  summary?: unknown;
  memory_type?: unknown;
  confidence?: unknown;
}

interface FieldExtractor {
  label: string;
  /** Stable key fragment so the same field on the same entry always produces the same memory_key. */
  kind: string;
  memoryType?: ExtractedMemoryType;
}

const FIELD_MAP: Record<string, FieldExtractor> = {
  phone: { label: "Phone", kind: "phone" },
  cellphone: { label: "Cellphone", kind: "phone" },
  landline: { label: "Landline", kind: "phone" },
  mobile: { label: "Mobile", kind: "phone" },
  email: { label: "Email", kind: "email" },
  id_number: { label: "ID number", kind: "id" },
  national_id: { label: "National ID", kind: "id" },
  tax_number: { label: "Tax number", kind: "tax" },
  vat_number: { label: "VAT number", kind: "vat" },
  bank_number: { label: "Bank account", kind: "bank" },
  account_number: { label: "Account number", kind: "account" },
  address: { label: "Address", kind: "address" },
  url: { label: "Link", kind: "link" },
  due_date: { label: "Due date", kind: "due", memoryType: "obligation" },
  deadline: { label: "Deadline", kind: "deadline", memoryType: "obligation" },
  expiry_date: { label: "Expiry", kind: "expiry", memoryType: "obligation" },
  renewal_date: { label: "Renewal", kind: "renewal", memoryType: "obligation" },
};

/** Mirrors src/lib/importantMemory.ts:generateMemoryKey - kept in sync. */
export function slugifyForKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/[‘’']/g, "") // strip smart quotes + apostrophes
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/** Read a scalar value from an entry metadata field - strings, numbers, or
 * the `{value, confidence}` shape some enrichment steps produce. */
function readScalar(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return String(raw);
  if (raw && typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** Reject placeholder-ish strings that are not real values. */
function isUsefulValue(v: string): boolean {
  if (!v) return false;
  const lower = v.toLowerCase();
  return lower !== "null" && lower !== "undefined" && lower !== "n/a" && lower !== "0";
}

function normalizeMemoryType(value: unknown): ExtractedMemoryType {
  if (
    value === "preference" ||
    value === "decision" ||
    value === "obligation" ||
    value === "fact"
  ) {
    return value;
  }
  return "fact";
}

export function extractFactsFromEntry(entry: ExtractableEntry): ExtractedFact[] {
  if (!entry.title || !entry.title.trim()) return [];
  if (entry.type === "secret" || entry.type === "persona" || entry.type === "list") return [];

  const facts: ExtractedFact[] = [];
  const meta = entry.metadata ?? {};

  for (const [field, info] of Object.entries(FIELD_MAP)) {
    const raw = (meta as Record<string, unknown>)[field];
    const value = readScalar(raw);
    if (value === null || !isUsefulValue(value)) continue;

    const slug = slugifyForKey(`${entry.title} ${info.kind}`);
    if (!slug) continue;

    facts.push({
      memory_key: `${info.memoryType ?? "fact"}:${slug}`,
      memory_type: info.memoryType ?? "fact",
      title: `${entry.title} — ${info.label}`.slice(0, 200),
      summary: `${info.label}: ${value}`.slice(0, 1000),
      source_entry_ids: [entry.id],
    });
  }

  return facts;
}

export function extractFactsFromProseCandidates(
  entry: ExtractableEntry,
  candidates: ProseFactCandidate[],
  minConfidence = 0.85,
): ExtractedFact[] {
  if (!entry.title || !entry.title.trim()) return [];
  if (entry.type === "secret" || entry.type === "persona" || entry.type === "list") return [];

  const entryTitle = entry.title.trim();
  const entryTitleLower = entryTitle.toLowerCase();
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const rawConfidence = candidate.confidence;
    const confidence =
      typeof rawConfidence === "number"
        ? rawConfidence
        : typeof rawConfidence === "string"
          ? Number(rawConfidence)
          : NaN;
    if (!Number.isFinite(confidence) || confidence < minConfidence) continue;

    const summary = readScalar(candidate.summary);
    const candidateTitle = readScalar(candidate.title) ?? summary?.split(/[.;\n]/)[0]?.slice(0, 80);
    if (!candidateTitle || summary === null) continue;
    if (!isUsefulValue(candidateTitle) || !isUsefulValue(summary)) continue;

    const memoryType = normalizeMemoryType(candidate.memory_type);
    const includesSubject = candidateTitle.toLowerCase().includes(entryTitleLower);
    const title = (includesSubject ? candidateTitle : `${entryTitle} — ${candidateTitle}`).slice(
      0,
      200,
    );
    const slug = slugifyForKey(title);
    if (!slug) continue;

    const key = `${memoryType}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    facts.push({
      memory_key: key,
      memory_type: memoryType,
      title,
      summary: summary.slice(0, 1000),
      source_entry_ids: [entry.id],
    });

    if (facts.length >= 8) break;
  }

  return facts;
}
