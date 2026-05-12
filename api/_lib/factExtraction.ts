/**
 * Deterministic canonical-fact extraction.
 *
 * Walks an entry's structured metadata (phone, id_number, address, etc.)
 * and produces atomic facts that go into `important_memories` for Tier-1
 * fast-path retrieval. No LLM call — fully deterministic, idempotent,
 * cheap.
 *
 * The point: when a user asks "what is Landon's phone?", retrievalCore's
 * Tier 1 ILIKE over important_memories.title + summary should land
 * "Landon Harris Klopper — Phone" / "Phone: 0820525038" in <50ms with
 * source_entry_ids citing the source. The vector path stays available
 * as fallback for queries the metadata-walker can't anticipate.
 *
 * What this catches:
 *   - phone / cellphone / landline / mobile  (kind: phone)
 *   - email
 *   - id_number / national_id   (kind: id)
 *   - tax_number
 *   - vat_number
 *   - bank_number / account_number
 *   - address
 *   - url   (kind: link)
 *   - due_date / deadline / expiry_date / renewal_date   (memory_type: obligation)
 *
 * What this skips:
 *   - secret / persona / list entries (different shapes)
 *   - entries with no title
 *   - missing / empty / "null" / "undefined" / "0" field values
 *   - fields whose value is an object without a `value` key
 *
 * Future enhancement: an LLM-driven pass to pull facts from prose
 * (e.g., "Sarah's birthday is July 4" written in the content body
 * with no birthday metadata field). For now: structured fields only,
 * because they hit ~90% of the user's directly-lookup-able facts.
 */

export interface ExtractableEntry {
  id: string;
  title: string;
  type: string | null;
  metadata: Record<string, any> | null;
}

export interface ExtractedFact {
  memory_key: string;
  memory_type: "fact" | "obligation";
  title: string;
  summary: string;
  source_entry_ids: string[];
}

interface FieldExtractor {
  label: string;
  /** Stable key fragment so the same field on the same entry always produces the same memory_key. */
  kind: string;
  memoryType?: "fact" | "obligation";
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

/** Mirrors src/lib/importantMemory.ts:generateMemoryKey — kept in sync. */
function slugifyForKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[‘’']/g, "") // strip smart quotes + apostrophes
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/** Read a scalar value from an entry metadata field — strings, numbers, or
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

/** Reject placeholder-ish strings that aren't real values. */
function isUsefulValue(v: string): boolean {
  if (!v) return false;
  const lower = v.toLowerCase();
  return lower !== "null" && lower !== "undefined" && lower !== "n/a" && lower !== "0";
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
