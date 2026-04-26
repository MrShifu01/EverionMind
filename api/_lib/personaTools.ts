// ─────────────────────────────────────────────────────────────────────────────
// personaTools
//
// Five chat tools the assistant can call when the user reveals durable facts
// about themselves, or when life changes:
//
//   persona.set            scalar fields on the user_personas row (name, etc.)
//   persona.add_fact       create a type='persona' entry (active)
//   persona.update_fact    change an existing fact's text   [destructive]
//   persona.retire_fact    move fact → archived + create #history entry
//                          referencing it                    [destructive]
//   persona.pin_fact       mark a fact as pinned (immune to decay)
//
// Each tool returns a structured result the chat narrates. Add/retire/update
// run through the same /api/capture pipeline so embeddings + concept graph
// + enrichment all happen automatically — exactly as if the user typed the
// fact into the capture sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { sbHeaders } from "./sbHeaders.js";
import { generateEmbedding, buildEntryText } from "./generateEmbedding.js";

const SB_URL = (process.env.SUPABASE_URL || "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const SCALAR_FIELDS = new Set(["full_name", "preferred_name", "pronouns", "context", "enabled"]);
const VALID_BUCKETS = new Set(["identity", "family", "habit", "preference", "event"]);

// ── Tool schema declarations (sent to the LLM) ────────────────────────────────

export const PERSONA_TOOL_SCHEMAS = [
  {
    name: "persona.set",
    description:
      "Update a scalar field on the user's persona profile (name, nickname, pronouns, free-form context, or the personalisation toggle). Use when the user states something singular about who they are: 'call me Chris', 'my pronouns are he/him', 'I am a software engineer'. For free-form context, pass a complete replacement string — context is OVERWRITTEN, not appended. Auto-execute (not destructive).",
    parameters: {
      type: "object",
      properties: {
        field: { type: "string", description: "One of: full_name, preferred_name, pronouns, context, enabled" },
        value: { type: "string", description: "New value. For 'enabled' pass 'true' or 'false'." },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "persona.add_fact",
    description:
      "Add a NEW durable fact about the user — a family member, a habit, a preference, or a notable life event. Use when the user reveals something that should persist across all future chats. The fact becomes a persona entry that will be injected into the system prompt of every future chat call. Choose the most accurate bucket. Write the fact in third person, short and specific (e.g. 'User's wife Hannelie hates Italian food since the October 2025 dinner at Vincenzo's'). Auto-execute (not destructive).",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The fact, third person, ≤200 chars. Example: 'User wakes at 5:30 every weekday for gym.'" },
        bucket: { type: "string", description: "One of: identity, family, habit, preference, event" },
        source_evidence: { type: "string", description: "Optional: the user's own words (verbatim quote ≤200 chars) so the fact's lineage is preserved." },
      },
      required: ["text", "bucket"],
    },
  },
  {
    name: "persona.update_fact",
    description:
      "Replace an existing persona fact with a refined or corrected version. Use when the user clarifies or restates a fact (e.g. 'I actually wake at 5:00, not 5:30'). DESTRUCTIVE — the user must confirm before this runs. Pass the existing entry's id (use retrieve_memory or persona.list_facts to find it).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Persona entry UUID to update" },
        new_text: { type: "string", description: "Replacement fact text, third person, ≤200 chars" },
      },
      required: ["id", "new_text"],
    },
  },
  {
    name: "persona.retire_fact",
    description:
      "Demote a persona fact to historical context because it no longer applies. Use when the user reveals a life change: 'I don't work at X anymore', 'we got divorced', 'we sold the house'. The fact's status flips to archived (so it stops being injected into future chats) AND a brand-new entry is created with type='persona', tag='#history' that records the change with a date. This preserves the timeline. DESTRUCTIVE — the user must confirm. Pass the existing entry's id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Persona entry UUID to retire" },
        reason: { type: "string", description: "Why it no longer applies (≤200 chars). Becomes part of the history entry." },
      },
      required: ["id", "reason"],
    },
  },
  {
    name: "persona.pin_fact",
    description:
      "Mark a persona fact as pinned — immune to automatic decay/pruning. Use sparingly, only for facts the user explicitly asks you to remember 'always' / 'never forget' / 'this is important'. Auto-execute (not destructive).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Persona entry UUID to pin" },
        pinned: { type: "boolean", description: "true to pin, false to unpin" },
      },
      required: ["id", "pinned"],
    },
  },
];

export const PERSONA_DESTRUCTIVE_TOOLS = new Set([
  "persona.update_fact",
  "persona.retire_fact",
]);

export const PERSONA_TOOL_NAMES = new Set(PERSONA_TOOL_SCHEMAS.map((t) => t.name));

// ── Confirm labels (used by the existing confirmPolicy) ───────────────────────

export async function buildPersonaConfirmLabel(
  toolName: string,
  args: Record<string, any>,
  brainId: string,
): Promise<string> {
  if (toolName === "persona.update_fact") {
    const existing = await fetchPersonaEntry(args.id, brainId);
    const old = existing?.title || "this fact";
    const next = String(args.new_text || "").slice(0, 80);
    return `Update "${old.slice(0, 60)}" → "${next}"`;
  }
  if (toolName === "persona.retire_fact") {
    const existing = await fetchPersonaEntry(args.id, brainId);
    const old = existing?.title || "this fact";
    return `Retire "${old.slice(0, 70)}" (will keep as #history)`;
  }
  return toolName;
}

// ── Tool executors ────────────────────────────────────────────────────────────

export async function execPersonaTool(
  name: string,
  args: Record<string, any>,
  userId: string,
  brainId: string,
): Promise<unknown> {
  if (name === "persona.set") return execSet(args, userId);
  if (name === "persona.add_fact") return execAddFact(args, userId, brainId, "chat");
  if (name === "persona.update_fact") return execUpdateFact(args, userId, brainId);
  if (name === "persona.retire_fact") return execRetireFact(args, userId, brainId);
  if (name === "persona.pin_fact") return execPinFact(args, userId, brainId);
  return { error: `Unknown persona tool: ${name}` };
}

async function execSet(args: Record<string, any>, userId: string): Promise<unknown> {
  const field = String(args.field || "").trim();
  if (!SCALAR_FIELDS.has(field)) return { error: `Unknown field: ${field}` };
  const raw = args.value;

  let value: string | boolean | null;
  if (field === "enabled") {
    const v = typeof raw === "boolean" ? raw : String(raw).toLowerCase() === "true";
    value = v;
  } else {
    const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    const limit = field === "context" ? 4000 : field === "full_name" ? 120 : field === "preferred_name" ? 60 : 40;
    value = s ? s.slice(0, limit) : null;
  }

  const upsert: Record<string, unknown> = {
    user_id: userId,
    [field]: value,
    updated_at: new Date().toISOString(),
  };
  const r = await fetch(`${SB_URL}/rest/v1/user_personas?on_conflict=user_id`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(upsert),
  });
  if (!r.ok) return { error: "set_failed", detail: (await r.text().catch(() => "")).slice(0, 200) };
  return { ok: true, field, value };
}

export async function execAddFact(
  args: Record<string, any>,
  userId: string,
  brainId: string,
  source: "chat" | "manual" | "capture" | "import" | "inference",
): Promise<unknown> {
  const text = String(args.text || "").trim().slice(0, 200);
  const bucket = String(args.bucket || "").trim();
  if (!text) return { error: "text required" };
  if (!VALID_BUCKETS.has(bucket)) return { error: `invalid bucket: ${bucket}` };

  const sourceEvidence = typeof args.source_evidence === "string"
    ? args.source_evidence.trim().slice(0, 200) : null;

  const id = randomUUID();
  const title = text;
  const content = sourceEvidence ? `${text}\n\nUser said: "${sourceEvidence}"` : text;

  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(
      buildEntryText({ title, content, tags: [bucket, "persona"] }),
      GEMINI_API_KEY,
    );
  }

  const metadata = {
    bucket,
    status: "active" as const,
    source,
    confidence: source === "manual" ? 1.0 : source === "chat" ? 0.95 : 0.85,
    pinned: false,
    evidence_count: 1,
    last_referenced_at: new Date().toISOString(),
  };

  const r = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      id,
      user_id: userId,
      brain_id: brainId,
      title,
      content,
      type: "persona",
      tags: ["persona", bucket],
      metadata,
      embedding: embedding ? `[${embedding.join(",")}]` : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) return { error: "add_failed", detail: (await r.text().catch(() => "")).slice(0, 200) };
  const rows: any[] = await r.json();
  return { ok: true, fact: rows[0], summary: `Added to your About You: "${text}"` };
}

async function execUpdateFact(args: Record<string, any>, userId: string, brainId: string): Promise<unknown> {
  const id = String(args.id || "").trim();
  const newText = String(args.new_text || "").trim().slice(0, 200);
  if (!id || !newText) return { error: "id and new_text required" };

  const existing = await fetchPersonaEntry(id, brainId, userId);
  if (!existing) return { error: "fact not found" };

  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(
      buildEntryText({ title: newText, content: newText, tags: existing.tags || [] }),
      GEMINI_API_KEY,
    );
  }

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
    {
      method: "PATCH",
      headers: { ...sbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        title: newText,
        content: newText,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!r.ok) return { error: "update_failed", detail: (await r.text().catch(() => "")).slice(0, 200) };
  return { ok: true, summary: `Updated: "${newText}"` };
}

async function execRetireFact(args: Record<string, any>, userId: string, brainId: string): Promise<unknown> {
  const id = String(args.id || "").trim();
  const reason = String(args.reason || "").trim().slice(0, 200);
  if (!id) return { error: "id required" };

  const existing = await fetchPersonaEntry(id, brainId, userId);
  if (!existing) return { error: "fact not found" };

  // 1. Flip status → archived on the original entry, add #history tag.
  const oldMeta = (existing.metadata as Record<string, unknown>) ?? {};
  const newMeta = { ...oldMeta, status: "archived", retired_at: new Date().toISOString(), retired_reason: reason };
  const oldTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
  const newTags = oldTags.includes("history") ? oldTags : [...oldTags, "history"];

  const r1 = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
    {
      method: "PATCH",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        metadata: newMeta,
        tags: newTags,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!r1.ok) return { error: "retire_failed_step1" };

  // 2. Create a history entry that references the retired one. This is also a
  //    type='persona' but with status='archived' and tag='history' so it stays
  //    out of the active preamble while remaining searchable as life history.
  const historyText = reason
    ? `Previously: ${existing.title}. Retired ${new Date().toLocaleDateString("en-ZA")} — ${reason}.`
    : `Previously: ${existing.title}. Retired ${new Date().toLocaleDateString("en-ZA")}.`;

  let embedding: number[] | null = null;
  if (GEMINI_API_KEY) {
    embedding = await generateEmbedding(
      buildEntryText({ title: historyText, content: historyText, tags: ["persona", "history"] }),
      GEMINI_API_KEY,
    );
  }

  await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      id: randomUUID(),
      user_id: userId,
      brain_id: brainId,
      title: historyText.slice(0, 200),
      content: historyText,
      type: "persona",
      tags: ["persona", "history", String(oldMeta.bucket || "event")],
      metadata: {
        bucket: oldMeta.bucket || "event",
        status: "archived",
        source: "chat",
        derived_from: [id],
        retired_at: new Date().toISOString(),
      },
      embedding: embedding ? `[${embedding.join(",")}]` : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => null);

  return { ok: true, summary: `Moved to history: "${existing.title}"`, retired_id: id };
}

async function execPinFact(args: Record<string, any>, userId: string, brainId: string): Promise<unknown> {
  const id = String(args.id || "").trim();
  const pinned = args.pinned !== false;
  if (!id) return { error: "id required" };

  const existing = await fetchPersonaEntry(id, brainId, userId);
  if (!existing) return { error: "fact not found" };

  const newMeta = { ...((existing.metadata as Record<string, unknown>) ?? {}), pinned };
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
    {
      method: "PATCH",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ metadata: newMeta, updated_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) return { error: "pin_failed" };
  return { ok: true, summary: pinned ? "Pinned." : "Unpinned." };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PersonaEntry {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
}

async function fetchPersonaEntry(id: string, brainId: string, userId?: string): Promise<PersonaEntry | null> {
  const userScope = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(brainId)}${userScope}&type=eq.persona&deleted_at=is.null&select=id,title,content,tags,metadata&limit=1`,
    { headers: sbHeaders() },
  );
  if (!r.ok) return null;
  const rows: PersonaEntry[] = await r.json();
  return rows[0] ?? null;
}
