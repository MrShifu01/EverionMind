import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;

// ── helpers ────────────────────────────────────────────────────────────────

function normalizePhone(p: string): string {
  return p.replace(/[\s().+-]/g, "");
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function wordOverlap(a: string, b: string): number {
  const setA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / Math.max(setA.size, setB.size);
}

// ── candidate scoring ──────────────────────────────────────────────────────

interface Candidate {
  id: string;
  title: string;
  content?: string;
  type: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

function scoreCandidate(source: Candidate, target: Candidate): number {
  let score = 0;

  const sm = source.metadata ?? {};
  const tm = target.metadata ?? {};

  // Exact email match — very strong signal
  const se = (sm.email || sm.contact_email || "").toLowerCase();
  const te = (tm.email || tm.contact_email || "").toLowerCase();
  if (se && te && se === te) score += 55;

  // Exact phone match
  const sp = normalizePhone(sm.phone || sm.contact_phone || "");
  const tp = normalizePhone(tm.phone || tm.contact_phone || "");
  if (sp.length >= 7 && tp.length >= 7 && sp === tp) score += 50;

  // Same gmail_subject + same gmail_from
  const sgf = (sm.gmail_from || "").toLowerCase();
  const tgf = (tm.gmail_from || "").toLowerCase();
  const sgs = (sm.gmail_subject || "").toLowerCase().trim();
  const tgs = (tm.gmail_subject || "").toLowerCase().trim();
  if (sgf && sgf === tgf && sgs && sgs === tgs) score += 45;

  // Title similarity
  const titleOverlap = wordOverlap(source.title, target.title);
  score += Math.round(titleOverlap * 35);

  // Same type bonus
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

export async function detectAndStoreMerge(
  entryId: string,
  userId: string,
): Promise<void> {
  // Fetch the new entry
  const er = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&limit=1`,
    { headers: sbHeaders() },
  );
  if (!er.ok) return;
  const [source]: Candidate[] = await er.json();
  if (!source) return;

  // Build a targeted candidate query: same type, not the same entry, not deleted
  const sm = source.metadata ?? {};
  const email = (sm.email || sm.contact_email || "").toLowerCase();
  const phone = normalizePhone(sm.phone || sm.contact_phone || "");

  // Fetch candidates: same type, created in the past, not this entry
  const candidateRes = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&type=eq.${encodeURIComponent(source.type)}&id=neq.${encodeURIComponent(entryId)}&deleted_at=is.null&limit=200&select=id,title,type,tags,metadata`,
    { headers: sbHeaders() },
  );
  if (!candidateRes.ok) return;
  const candidates: Candidate[] = await candidateRes.json();
  if (!candidates.length) return;

  // Score every candidate
  const scored = candidates
    .map((c) => ({ candidate: c, score: scoreCandidate(source, c) }))
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!scored.length) return;

  const best = scored[0];

  // ≥ 90: auto-merge silently, notify with "added to" message
  if (best.score >= 90) {
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

  // 50–89: suggest merge, let user decide
  // Build a preview of what would be added
  const wouldAdd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sm)) {
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
