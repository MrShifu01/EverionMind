/**
 * Gmail pattern scoring (Alt 1 — decoupled accept/reject scores).
 *
 * On every accept/reject we embed the email (subject + from + snippet) at
 * 768 dims via gemini-embedding-001, find the nearest pattern in
 * gmail_pattern_rules at cosine ≥ 0.82, and bump either accept_score or
 * reject_score (capped at 10). New clusters start at score 1. When
 * accept_score crosses 8 for the first time we set
 * auto_accept_eligible_at = now() + 7 days (probation start).
 *
 * Decision matrix consumed by gmailScan:
 *   accept_score ≥ 8 AND reject_score ≤ 2 → auto-accept (skip staging)
 *   reject_score ≥ 8 AND accept_score ≤ 2 → hard-block (skip LLM call)
 *   both > 3                              → contested → always staging
 *   otherwise                             → normal classifier
 */
import { generateEmbedding } from "./generateEmbedding.js";
import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HEADERS = sbHeaders();

const MATCH_THRESHOLD = 0.82;
const PROBATION_DAYS = 7;
const AUTO_ACCEPT_SCORE = 8;

export interface PatternMatch {
  id: string;
  summary: string;
  example_subject: string | null;
  example_from: string | null;
  accept_score: number;
  reject_score: number;
  accept_hits: number;
  reject_hits: number;
  auto_accept_eligible_at: string | null;
  similarity: number;
}

export function buildPatternText(parts: {
  subject?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  snippet?: string | null;
}): string {
  return [
    parts.subject ?? "",
    parts.from_name ? `from ${parts.from_name}` : parts.from_email ? `from ${parts.from_email}` : "",
    parts.snippet ?? "",
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 2000);
}

export async function findNearestPattern(
  userId: string,
  embedding: number[],
): Promise<PatternMatch | null> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/match_gmail_pattern`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({
      p_user_id: userId,
      query_embedding: `[${embedding.join(",")}]`,
      match_threshold: MATCH_THRESHOLD,
      match_limit: 1,
    }),
  });
  if (!res.ok) return null;
  const rows: PatternMatch[] = await res.json();
  return rows[0] ?? null;
}

/**
 * Apply a decision to the pattern store: either bump an existing pattern's
 * score or create a new pattern row at score=1. Caller can fire-and-forget;
 * failures log only. The user-facing decision flow is unaffected by errors
 * here.
 */
export async function recordPatternDecision(params: {
  userId: string;
  decision: "accept" | "reject";
  subject?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  snippet?: string | null;
  reason?: string | null;
}): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;
  const text = buildPatternText(params);
  if (!text.trim()) return;

  let embedding: number[];
  try {
    embedding = await generateEmbedding(text, apiKey);
  } catch (e) {
    console.error("[gmail-pattern] embed failed:", (e as Error).message);
    return;
  }

  const match = await findNearestPattern(params.userId, embedding);
  const now = new Date().toISOString();

  if (match) {
    const isAccept = params.decision === "accept";
    const newAccept = isAccept ? Math.min(10, match.accept_score + 1) : match.accept_score;
    const newReject = !isAccept ? Math.min(10, match.reject_score + 1) : match.reject_score;
    const newAcceptHits = isAccept ? match.accept_hits + 1 : match.accept_hits;
    const newRejectHits = !isAccept ? match.reject_hits + 1 : match.reject_hits;
    const crossedAcceptThreshold =
      isAccept &&
      match.accept_score < AUTO_ACCEPT_SCORE &&
      newAccept >= AUTO_ACCEPT_SCORE &&
      !match.auto_accept_eligible_at;

    const patch: Record<string, unknown> = {
      accept_score: newAccept,
      reject_score: newReject,
      accept_hits: newAcceptHits,
      reject_hits: newRejectHits,
    };
    if (isAccept) patch.last_accept_at = now;
    else patch.last_reject_at = now;
    if (crossedAcceptThreshold) {
      patch.auto_accept_eligible_at = new Date(
        Date.now() + PROBATION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    // Read-modify-write is racy under high concurrency, but personal-scale
    // accept/reject taps don't collide. In the worst case two simultaneous
    // taps land at score=N+1 instead of N+2 — no data loss, just a slightly
    // slower climb to 10.
    await fetch(
      `${SB_URL}/rest/v1/gmail_pattern_rules?id=eq.${encodeURIComponent(match.id)}`,
      {
        method: "PATCH",
        headers: { ...SB_HEADERS, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      },
    ).catch((e) => console.error("[gmail-pattern] update failed:", e));
    return;
  }

  // No nearby pattern → create a new cluster anchored on this email.
  const summary =
    (params.reason ?? "").trim().slice(0, 200) ||
    (params.subject ?? "").trim().slice(0, 200) ||
    `${params.decision === "accept" ? "Accept" : "Reject"} similar emails`;
  const row: Record<string, unknown> = {
    user_id: params.userId,
    embedding: `[${embedding.join(",")}]`,
    summary,
    example_subject: params.subject ?? null,
    example_from: params.from_email ?? null,
    accept_score: params.decision === "accept" ? 1 : 0,
    reject_score: params.decision === "reject" ? 1 : 0,
    accept_hits: params.decision === "accept" ? 1 : 0,
    reject_hits: params.decision === "reject" ? 1 : 0,
    last_accept_at: params.decision === "accept" ? now : null,
    last_reject_at: params.decision === "reject" ? now : null,
    auto_accept_eligible_at: null,
  };
  await fetch(`${SB_URL}/rest/v1/gmail_pattern_rules`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(row),
  }).catch((e) => console.error("[gmail-pattern] insert failed:", e));
}

// ── Scan-time pattern enforcement ───────────────────────────────────────────
//
// Apply Alt 1 matrix to a batch of inbound thread blocks. For each block we
// embed (subject + from + body slice), find the nearest pattern, and emit a
// verdict the scanner uses to drop / auto-accept / route normally.

export type PatternVerdict =
  | { kind: "hard-block"; pattern: PatternMatch }
  | { kind: "auto-accept"; pattern: PatternMatch }
  | { kind: "auto-accept-probation"; pattern: PatternMatch }
  | { kind: "normal" };

const HARD_BLOCK_REJECT = 8;
const HARD_BLOCK_ACCEPT_CEIL = 2;
const AUTO_ACCEPT_THRESHOLD = 8;
const AUTO_ACCEPT_REJECT_CEIL = 2;
const CONTESTED_FLOOR = 3; // both > 3 → contested → always staging

function classifyVerdict(p: PatternMatch): PatternVerdict {
  const accept = p.accept_score;
  const reject = p.reject_score;
  // Contested → never auto-anything
  if (accept > CONTESTED_FLOOR && reject > CONTESTED_FLOOR) return { kind: "normal" };
  if (reject >= HARD_BLOCK_REJECT && accept <= HARD_BLOCK_ACCEPT_CEIL) {
    return { kind: "hard-block", pattern: p };
  }
  if (accept >= AUTO_ACCEPT_THRESHOLD && reject <= AUTO_ACCEPT_REJECT_CEIL) {
    const eligibleAt = p.auto_accept_eligible_at ? new Date(p.auto_accept_eligible_at) : null;
    if (eligibleAt && eligibleAt.getTime() > Date.now()) {
      return { kind: "auto-accept-probation", pattern: p };
    }
    return { kind: "auto-accept", pattern: p };
  }
  return { kind: "normal" };
}

export interface BlockEmbedInput {
  subject?: string | null;
  from?: string | null;
  body?: string | null;
}

export async function evaluatePatternsForBlocks(
  userId: string,
  inputs: BlockEmbedInput[],
): Promise<PatternVerdict[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || inputs.length === 0) return inputs.map(() => ({ kind: "normal" }));

  // Embed in parallel — one Gemini call per block, but the Gemini embed
  // endpoint is fast (~150ms p50) and parallel-safe. Personal volumes
  // (≤100 threads/scan) keep this well under any rate limits.
  const verdicts: PatternVerdict[] = await Promise.all(
    inputs.map(async (b): Promise<PatternVerdict> => {
      const text = [b.subject ?? "", b.from ? `from ${b.from}` : "", (b.body ?? "").slice(0, 800)]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 2000);
      if (!text.trim()) return { kind: "normal" };
      try {
        const emb = await generateEmbedding(text, apiKey);
        const match = await findNearestPattern(userId, emb);
        if (!match) return { kind: "normal" };
        return classifyVerdict(match);
      } catch (e) {
        console.error("[gmail-pattern] evaluate failed:", (e as Error).message);
        return { kind: "normal" };
      }
    }),
  );
  return verdicts;
}

// ── Prompt-time scored rules ────────────────────────────────────────────────
//
// Patterns with scores in 4..9 are below the auto-fire thresholds (≥8 with
// the contested guard) but strong enough to weigh on the classifier's
// judgment. We surface them in the prompt as labeled bullet lines so the
// model can negative- or positive-bias matching threads.

export interface ScoredRule {
  side: "accept" | "reject";
  score: number; // 4..9
  summary: string;
  example_subject: string | null;
  example_from: string | null;
}

export async function loadScoredRules(userId: string): Promise<ScoredRule[]> {
  // PostgREST: fetch patterns where the dominant score is 4..9. We pull
  // both columns and pick the side with the higher score; ties favour
  // reject (the user is more sensitive to noise leaking through).
  const res = await fetch(
    `${SB_URL}/rest/v1/gmail_pattern_rules?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=summary,example_subject,example_from,accept_score,reject_score` +
      `&or=(accept_score.gte.4,reject_score.gte.4)` +
      `&order=greatest(accept_score,reject_score).desc.nullslast` +
      `&limit=40`,
    { headers: SB_HEADERS },
  ).catch(() => null);
  if (!res || !res.ok) return [];
  const rows: Array<{
    summary: string;
    example_subject: string | null;
    example_from: string | null;
    accept_score: number;
    reject_score: number;
  }> = await res.json().catch(() => []);
  const out: ScoredRule[] = [];
  for (const r of rows) {
    const acc = r.accept_score;
    const rej = r.reject_score;
    // Skip patterns at score 10 — those are already enforced in code
    // (hard-block / auto-accept) and would just clutter the prompt.
    const dominant = Math.max(acc, rej);
    if (dominant < 4 || dominant > 9) continue;
    const side: "accept" | "reject" = rej >= acc ? "reject" : "accept";
    out.push({
      side,
      score: side === "accept" ? acc : rej,
      summary: r.summary,
      example_subject: r.example_subject,
      example_from: r.example_from,
    });
  }
  return out;
}

export function renderScoredRulesBlock(rules: ScoredRule[]): string {
  if (!rules.length) return "";
  const lines = rules.map((r) => {
    const tag = `[${r.side} ${r.score}/10]`;
    const example = r.example_subject ? ` — example: "${r.example_subject.slice(0, 80)}"` : "";
    return `  • ${tag} ${r.summary.slice(0, 200)}${example}`;
  });
  return (
    `\n\nSCORED RULES (curated from your accept/reject history; integer = strength 1-10).\n` +
    `Treat as strong signal: scores 7-9 should override unless the email is clearly important; ` +
    `scores 4-6 are nudges. Patterns at 10 are already handled and won't appear here.\n` +
    lines.join("\n")
  );
}

/**
 * Apply a verdict to an entry being persisted by gmailScan. Mutates `entry`
 * and `metadata` in place. Returns "drop" if the caller should skip the
 * insert (hard-block), "keep" otherwise.
 */
export function applyPatternVerdict(
  verdict: PatternVerdict | undefined,
  entry: Record<string, unknown>,
  metadata: Record<string, unknown>,
): "drop" | "keep" {
  if (!verdict || verdict.kind === "normal") return "keep";
  if (verdict.kind === "hard-block") return "drop";
  // Both auto-accept variants stamp the pattern id so the UI / analytics
  // can trace which rule fired. Probation also surfaces the eligibility
  // date so the staging row can render the badge.
  metadata.pattern_id = verdict.pattern.id;
  metadata.pattern_summary = verdict.pattern.summary;
  if (verdict.kind === "auto-accept") {
    entry.status = "active";
    metadata.auto_accept_via_pattern = true;
  } else {
    metadata.auto_accept_pending = true;
    metadata.auto_accept_eligible_at = verdict.pattern.auto_accept_eligible_at;
  }
  return "keep";
}
