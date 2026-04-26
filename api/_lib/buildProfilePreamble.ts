// ─────────────────────────────────────────────────────────────────────────────
// buildProfilePreamble
//
// Reads the user's persona — the singular core (user_personas row) plus the
// active persona-typed entries — and renders it into a compact "ABOUT THE
// USER" block prepended to the chat system prompt on every call. Capped so
// prompt caching makes repeated calls effectively free.
//
// Returns "" when:
//   - the persona row exists but enabled = false (master kill switch)
//   - core + facts both end up empty
//
// Architecture: persona facts are first-class entries with type='persona' and
// metadata.status in ('active' | 'fading' | 'archived'). Only 'active' facts
// land in the preamble. Confidence-weighted recency caps the list at 30.
// ─────────────────────────────────────────────────────────────────────────────

import { sbHeaders } from "./sbHeaders.js";

const SB_URL = (process.env.SUPABASE_URL || "").trim();

// Character budget — bumped from 2200 to 4500 because we now guarantee
// inclusion of all user-confirmed facts (manual / chat / pinned). Still
// trivial in token cost: ~1100 tokens, fully cached after the first call
// in a 5-minute window.
const MAX_PREAMBLE_CHARS = 4500;

// Hard sanity cap on confirmed facts in case a user types hundreds. The
// realistic upper bound for an active user is ~30, so 80 is plenty.
const MAX_CONFIRMED_FACTS = 80;

// Auto-extracted facts compete for these slots. Capped low because they're
// less trusted (model inferred, not user confirmed) and we'd rather lean on
// RAG retrieval to surface the long tail when a question makes them relevant.
const MAX_AUTO_FACTS = 12;

// Confidence floor for AUTO-extracted facts only. Confirmed facts ignore
// this — you typed/said them, you confirmed them.
const AUTO_MIN_CONFIDENCE = 0.85;

interface FamilyMember {
  relation?: string;
  name?: string;
  notes?: string;
}

interface PersonaCoreRow {
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  family: FamilyMember[] | null;
  habits: string[] | null;
  context: string | null;
  enabled: boolean;
}

interface PersonaFactRow {
  id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  metadata: Record<string, any> | null;
  updated_at: string | null;
}

function clean(s: unknown, max = 200): string {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function rankFact(f: PersonaFactRow): number {
  const meta = f.metadata ?? {};
  const conf = typeof meta.confidence === "number" ? meta.confidence : 0.7;
  const pinned = meta.pinned === true ? 0.5 : 0;
  const updated = f.updated_at ? new Date(f.updated_at).getTime() : 0;
  const ageDays = updated ? (Date.now() - updated) / 86_400_000 : 90;
  // Newer + higher confidence + pinned bumps to the top.
  return conf + pinned - Math.min(ageDays / 365, 0.4);
}

export async function buildProfilePreamble(
  userId: string,
  brainId?: string | null,
): Promise<string> {
  if (!SB_URL || !userId) return "";

  // ── Core (singular fields) ────────────────────────────────────────────────
  let core: PersonaCoreRow | undefined;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(userId)}&select=full_name,preferred_name,pronouns,family,habits,context,enabled&limit=1`,
      { headers: sbHeaders() },
    );
    if (r.ok) {
      const rows = (await r.json()) as PersonaCoreRow[];
      core = rows[0];
    }
  } catch {
    /* fall through */
  }
  if (core && core.enabled === false) return ""; // master kill switch

  // ── Active persona-typed entries (the growing memory) ─────────────────────
  let facts: PersonaFactRow[] = [];
  if (brainId) {
    try {
      // PostgREST jsonb path: metadata->>status eq 'active'. Fetch a generous
      // 60 then re-rank locally so confidence + pinned + recency contribute.
      const r = await fetch(
        `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&brain_id=eq.${encodeURIComponent(brainId)}&type=eq.persona&deleted_at=is.null&metadata->>status=eq.active&select=id,title,content,tags,metadata,updated_at&order=updated_at.desc&limit=60`,
        { headers: sbHeaders() },
      );
      if (r.ok) {
        facts = await r.json();
      }
    } catch {
      /* fall through */
    }
  }

  // Two-pool selection. Confirmed facts (you typed them, said them in chat,
  // or pinned them) are guaranteed inclusion — they're the user's identity,
  // not memory. Auto-extracted facts compete for a smaller pool of slots
  // and have to clear a higher confidence bar; the rest live in the RAG
  // pool and surface only when retrieval pulls them in.
  const isConfirmed = (f: PersonaFactRow): boolean => {
    const m = f.metadata ?? {};
    if (m.pinned === true) return true;
    if (m.skip_persona === true) return true;
    const src = String(m.source || "");
    return src === "manual" || src === "chat";
  };

  const confirmed = facts
    .filter(isConfirmed)
    .sort((a, b) => rankFact(b) - rankFact(a))
    .slice(0, MAX_CONFIRMED_FACTS);

  const auto = facts
    .filter((f) => !isConfirmed(f))
    .filter((f) => {
      const conf = typeof f.metadata?.confidence === "number" ? f.metadata.confidence : 0;
      return conf >= AUTO_MIN_CONFIDENCE;
    })
    .sort((a, b) => rankFact(b) - rankFact(a))
    .slice(0, MAX_AUTO_FACTS);

  facts = [...confirmed, ...auto];

  // ── Render ────────────────────────────────────────────────────────────────
  const coreLines: string[] = [];

  if (core) {
    const preferred = clean(core.preferred_name);
    const full = clean(core.full_name);
    if (preferred && full && preferred.toLowerCase() !== full.toLowerCase()) {
      coreLines.push(`Name: ${preferred} (full: ${full})`);
    } else if (preferred || full) {
      coreLines.push(`Name: ${preferred || full}`);
    }

    const pronouns = clean(core.pronouns, 60);
    if (pronouns) coreLines.push(`Pronouns: ${pronouns}`);

    if (Array.isArray(core.family) && core.family.length) {
      const fam = core.family
        .slice(0, 10)
        .map((f) => {
          const rel = clean(f?.relation, 40);
          const name = clean(f?.name, 80);
          const notes = clean(f?.notes, 120);
          if (!rel && !name) return "";
          const head = rel && name ? `${rel}: ${name}` : rel || name;
          return notes ? `${head} (${notes})` : head;
        })
        .filter(Boolean);
      if (fam.length) coreLines.push(`Family (manually set): ${fam.join("; ")}`);
    }

    if (Array.isArray(core.habits) && core.habits.length) {
      const habits = core.habits.slice(0, 12).map((h) => clean(h, 120)).filter(Boolean);
      if (habits.length) coreLines.push(`Habits (manually set): ${habits.join("; ")}`);
    }

    const context = typeof core.context === "string" ? core.context.trim().slice(0, 1200) : "";
    if (context) coreLines.push(`About: ${context}`);
  }

  // Group facts by bucket so the model reads them as themed sections.
  const grouped: Record<string, string[]> = {};
  for (const f of facts) {
    const bucket = (f.metadata?.bucket as string) || "context";
    const text = clean(f.title, 200);
    if (!text) continue;
    (grouped[bucket] ??= []).push(text);
  }
  const BUCKET_LABELS: Record<string, string> = {
    identity: "Identity",
    family: "Family & people",
    habit: "Habits & routines",
    preference: "Preferences",
    event: "Notable life events",
    context: "Context",
  };
  const factLines: string[] = [];
  for (const bucket of ["identity", "family", "habit", "preference", "event", "context"]) {
    const items = grouped[bucket];
    if (!items || !items.length) continue;
    factLines.push(`${BUCKET_LABELS[bucket] || bucket}:`);
    for (const t of items) factLines.push(`  • ${t}`);
  }

  if (!coreLines.length && !factLines.length) return "";

  const body = [coreLines.join("\n"), factLines.join("\n")].filter(Boolean).join("\n\n").slice(0, MAX_PREAMBLE_CHARS);

  return [
    "",
    "",
    "--- ABOUT THE USER ---",
    "Treat the following as durable, first-party context about the person you are talking to.",
    "Refer to them by their preferred name. Use these facts unprompted when relevant — that's the whole point.",
    "Do NOT repeat this block back verbatim unless asked.",
    "Sensitive identifiers (ID number, passport, driver's licence, banking, medical) live in the user's encrypted Vault — never request, store, or display them in chat.",
    "If the user reveals a NEW durable fact: call persona.add_fact. If a fact has CHANGED: call persona.update_fact. If something NO LONGER APPLIES (job change, breakup, moved house): call persona.retire_fact with a reason — that retires the old fact and writes a #history entry so the timeline is preserved.",
    "",
    body,
    "--- END ABOUT THE USER ---",
  ].join("\n");
}
