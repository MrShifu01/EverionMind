// ============================================================
// Merge / duplicate detection.
// ============================================================
//
// Runs after enrichInline, so by the time this is called the source
// entry has its full fingerprint: embedding, concepts, tags, parsed
// metadata, ai_insight. The scorer combines every available signal:
//
//   STRONG (each can carry a candidate to the threshold on its own)
//     - email match            55   exact, case-insensitive
//     - phone match            50   normalised digits
//     - gmail thread match     45   from + subject
//     - embedding cosine       up to 60   semantic equivalence
//     - exact title (norm)     20   bonus on top of word overlap
//
//   SUPPORTING (cumulative — many small signals reinforce each other)
//     - title word overlap     up to 25
//     - concept label overlap  up to 25   Jaccard on metadata.concepts[].label
//     - content word overlap   up to 20   first 1000 chars, normalised
//     - tag overlap            up to 10   Jaccard
//     - same type              10
//
//   THRESHOLDS (tuned across both strong and supporting paths)
//     ≥ 95      auto-merge silently, notify "added to existing"
//     50 – 94   notification: "Possible duplicate — merge?"
//     < 50     no signal, do nothing
//
// Embedding cosine is the most reliable signal — it catches duplicates
// whose titles diverge ("Smash Menu" vs "Burger Bar Menu Apr 2026")
// and vice-versa. Title alone is the cheap fallback when one entry
// hasn't been embedded yet.

import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;

// ── helpers ────────────────────────────────────────────────────────────────

function normalizePhone(p: string): string {
  return p.replace(/[\s().+-]/g, "");
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter((w) => w.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function wordOverlap(a: string, b: string): number {
  // Jaccard-like overlap normalised by max — preserves prior behaviour for
  // title matching where "100% of words shared" should mean 1.0 even when
  // the larger set has more tokens than the smaller (we want short titles
  // matching long ones to score high).
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / Math.max(setA.size, setB.size);
}

// pgvector serialises as the string "[0.1, 0.2, ...]". Parse to number[].
function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parts = trimmed.slice(1, -1).split(",");
  const out: number[] = new Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function conceptLabels(meta: Record<string, any> | undefined): Set<string> {
  const concepts = meta?.concepts;
  if (!Array.isArray(concepts)) return new Set();
  const out = new Set<string>();
  for (const c of concepts) {
    const label = typeof c?.label === "string" ? normalizeName(c.label) : null;
    if (label) out.add(label);
  }
  return out;
}

// ── candidate scoring ──────────────────────────────────────────────────────

interface Candidate {
  id: string;
  title: string;
  content?: string | null;
  type: string;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
  embedding?: number[] | string | null;
}

function scoreCandidate(source: Candidate, target: Candidate): number {
  let score = 0;

  const sm = source.metadata ?? {};
  const tm = target.metadata ?? {};

  // ── STRONG fingerprint signals ─────────────────────────────────────────

  const se = (sm.email || sm.contact_email || "").toLowerCase();
  const te = (tm.email || tm.contact_email || "").toLowerCase();
  if (se && te && se === te) score += 55;

  const sp = normalizePhone(sm.phone || sm.contact_phone || "");
  const tp = normalizePhone(tm.phone || tm.contact_phone || "");
  if (sp.length >= 7 && tp.length >= 7 && sp === tp) score += 50;

  const sgf = (sm.gmail_from || "").toLowerCase();
  const tgf = (tm.gmail_from || "").toLowerCase();
  const sgs = (sm.gmail_subject || "").toLowerCase().trim();
  const tgs = (tm.gmail_subject || "").toLowerCase().trim();
  if (sgf && sgf === tgf && sgs && sgs === tgs) score += 45;

  // Embedding cosine — the strongest semantic signal. Buckets are picked so
  // 0.95+ alone is enough for auto-merge consideration; 0.85 alone enters
  // the suggestion band; below 0.75 contributes nothing.
  const sEmb = parseEmbedding(source.embedding ?? null);
  const tEmb = parseEmbedding(target.embedding ?? null);
  if (sEmb && tEmb && sEmb.length === tEmb.length) {
    const sim = cosineSim(sEmb, tEmb);
    if (sim >= 0.95) score += 60;
    else if (sim >= 0.90) score += 40;
    else if (sim >= 0.85) score += 25;
    else if (sim >= 0.75) score += 10;
  }

  // ── Title ─────────────────────────────────────────────────────────────

  const titleOverlap = wordOverlap(source.title, target.title);
  score += Math.round(titleOverlap * 25);

  const sn = normalizeName(source.title);
  const tn = normalizeName(target.title);
  if (sn && tn && sn === tn) score += 20;

  // ── Concept overlap ───────────────────────────────────────────────────

  const sc = conceptLabels(sm);
  const tc = conceptLabels(tm);
  if (sc.size && tc.size) {
    const j = jaccard(sc, tc);
    if (j >= 0.8) score += 25;
    else if (j >= 0.5) score += 15;
    else if (j >= 0.3) score += 5;
  }

  // ── Content word overlap ──────────────────────────────────────────────

  const sContent = (source.content ?? "").slice(0, 1000);
  const tContent = (target.content ?? "").slice(0, 1000);
  if (sContent && tContent) {
    const co = wordOverlap(sContent, tContent);
    if (co >= 0.7) score += 20;
    else if (co >= 0.5) score += 10;
    else if (co >= 0.3) score += 5;
  }

  // ── Tags ──────────────────────────────────────────────────────────────

  const sTags = new Set((source.tags ?? []).map((t) => t.toLowerCase()));
  const tTags = new Set((target.tags ?? []).map((t) => t.toLowerCase()));
  if (sTags.size && tTags.size) {
    const j = jaccard(sTags, tTags);
    if (j >= 0.6) score += 10;
    else if (j >= 0.3) score += 5;
  }

  // ── Type ──────────────────────────────────────────────────────────────

  if (source.type === target.type) score += 10;

  return Math.min(score, 100);
}

// ── auto-merge: enrich target with non-null fields from source ─────────────

async function autoMerge(source: Candidate, target: Candidate): Promise<void> {
  const mergedMeta: Record<string, any> = { ...(target.metadata ?? {}) };
  for (const [k, v] of Object.entries(source.metadata ?? {})) {
    if (mergedMeta[k] == null && v != null) mergedMeta[k] = v;
  }
  const mergedTags = [...new Set([...(target.tags ?? []), ...(source.tags ?? [])])];

  await Promise.all([
    fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(target.id)}`, {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ metadata: mergedMeta, tags: mergedTags }),
    }),
    fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(source.id)}`, {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    }),
  ]);
}

// ── store a notification ──────────────────────────────────────────────────

export async function storeNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/notifications`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ user_id: userId, type, title, body, data }),
  }).catch((err) => console.error("[notifications] store failed:", err));
}

// ── public entry point ─────────────────────────────────────────────────────

const CANDIDATE_FIELDS = "id,title,content,type,tags,metadata,embedding";

export async function detectAndStoreMerge(
  entryId: string,
  userId: string,
): Promise<void> {
  // Fetch the new entry with the full fingerprint (including embedding).
  const er = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&limit=1&select=${encodeURIComponent(CANDIDATE_FIELDS)}`,
    { headers: sbHeaders() },
  );
  if (!er.ok) return;
  const [source]: Candidate[] = await er.json();
  if (!source) return;

  // Candidate set: same type to start (most duplicates share type), but if
  // we have an embedding we also widen to cross-type hits because semantic
  // duplicates can be classified differently (e.g. "menu" vs "company"
  // for the same restaurant).
  const sourceHasEmbedding = !!parseEmbedding(source.embedding ?? null);

  const url = sourceHasEmbedding
    ? `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&id=neq.${encodeURIComponent(entryId)}&deleted_at=is.null&limit=80&select=${encodeURIComponent(CANDIDATE_FIELDS)}`
    : `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&type=eq.${encodeURIComponent(source.type)}&id=neq.${encodeURIComponent(entryId)}&deleted_at=is.null&limit=50&select=${encodeURIComponent(CANDIDATE_FIELDS)}`;
  const candidateRes = await fetch(url, { headers: sbHeaders() });
  if (!candidateRes.ok) return;
  const candidates: Candidate[] = await candidateRes.json();
  if (!candidates.length) return;

  const scored = candidates
    .map((c) => ({ candidate: c, score: scoreCandidate(source, c) }))
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!scored.length) return;

  const best = scored[0];

  // ≥ 95: auto-merge silently, notify with "added to" message. The bar is
  // intentionally high — auto-merge deletes the source, so a false positive
  // costs the user data. Embedding cosine ≥0.95 + same title generally lands
  // well over 95.
  if (best.score >= 95) {
    await autoMerge(source, best.candidate);
    await storeNotification(
      userId,
      "auto_merged",
      `${source.title} merged into existing entry`,
      `Fields from the new entry were added to "${best.candidate.title}" automatically.`,
      { merged_into_id: best.candidate.id, confidence: best.score },
    );
    return;
  }

  // 50–94: suggest merge, let user decide.
  const wouldAdd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source.metadata ?? {})) {
    if (best.candidate.metadata?.[k] == null && v != null) wouldAdd[k] = v;
  }

  await storeNotification(
    userId,
    "merge_suggestion",
    `Possible duplicate: ${source.title}`,
    `Looks like "${best.candidate.title}" may already exist. Merge them?`,
    {
      source_entry_id: entryId,
      target_entry_id: best.candidate.id,
      source_title: source.title,
      target_title: best.candidate.title,
      confidence: best.score,
      would_add: wouldAdd,
    },
  );
}
