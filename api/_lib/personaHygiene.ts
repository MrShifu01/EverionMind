// ─────────────────────────────────────────────────────────────────────────────
// personaHygiene
//
// Runs nightly inside the daily cron. Two passes:
//
//   runPersonaDecayPass()
//     Walk every active persona entry. For each:
//       - skip if pinned
//       - if last_referenced_at is older than DECAY_GRACE_DAYS, decrement
//         confidence by DAILY_DECAY (per skipped day, capped)
//       - if confidence drops below FADE_THRESHOLD → status='fading'
//         (stops being injected into preamble; still searchable)
//       - if confidence drops below ARCHIVE_THRESHOLD → status='archived'
//         (drops from active list entirely; stays as life history)
//
//   runPersonaWeeklyPass() — only on Sundays
//     - Dedup proposals: pairwise cosine ≥ DEDUP_COSINE between active facts
//       in the same brain → write a notification with both ids so the user
//       can merge in About You.
//     - Weekly digest: count facts learned/reinforced/contradicted/retired
//       over the past 7 days, write a single "persona_digest" notification
//       per user with non-zero activity.
//
// All work is idempotent and capped per cron run so a runaway can't blow up
// quotas. Failures are non-fatal — the cron returns 200 either way.
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL = (process.env.SUPABASE_URL || "").trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SB_HDR: Record<string, string> = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

const DAILY_DECAY = 0.012;          // ~12% drop in 10 days of zero use
const DECAY_GRACE_DAYS = 14;        // first 14 days no decay
const FADE_THRESHOLD = 0.45;
const ARCHIVE_THRESHOLD = 0.20;
const DEDUP_COSINE = 0.88;
const PER_RUN_CAP = 5_000;          // hard cap on entries scanned per pass

interface PersonaEntry {
  id: string;
  user_id: string;
  brain_id: string;
  metadata: Record<string, any> | null;
  embedding: number[] | string | null;
}

// ── Decay pass (every day) ────────────────────────────────────────────────────

export async function runPersonaDecayPass(): Promise<{
  scanned: number;
  decayed: number;
  faded: number;
  archived: number;
}> {
  const stats = { scanned: 0, decayed: 0, faded: 0, archived: 0 };
  const now = Date.now();

  // Pull only what we need to compute: id, user_id, metadata.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?type=eq.persona&deleted_at=is.null&metadata->>status=eq.active&select=id,user_id,brain_id,metadata&limit=${PER_RUN_CAP}`,
    { headers: SB_HDR },
  );
  if (!r.ok) return stats;
  const rows: PersonaEntry[] = await r.json();
  stats.scanned = rows.length;

  for (const row of rows) {
    const meta = row.metadata ?? {};
    if (meta.pinned === true) continue; // pinned facts never decay

    const lastRefStr = meta.last_referenced_at as string | undefined;
    const lastRef = lastRefStr ? new Date(lastRefStr).getTime() : 0;
    const daysSinceRef = lastRef ? (now - lastRef) / 86_400_000 : DECAY_GRACE_DAYS + 30;
    if (daysSinceRef <= DECAY_GRACE_DAYS) continue;

    const conf = typeof meta.confidence === "number" ? meta.confidence : 0.7;
    const daysOver = daysSinceRef - DECAY_GRACE_DAYS;
    const newConf = Math.max(0, conf - DAILY_DECAY * Math.min(daysOver, 30));
    if (newConf >= conf) continue;

    let newStatus = meta.status as string;
    if (newConf < ARCHIVE_THRESHOLD) newStatus = "archived";
    else if (newConf < FADE_THRESHOLD) newStatus = "fading";

    const patch = {
      metadata: {
        ...meta,
        confidence: Number(newConf.toFixed(3)),
        status: newStatus,
        last_decayed_at: new Date().toISOString(),
      },
    };
    const ok = await patchEntry(row.id, patch);
    if (!ok) continue;

    stats.decayed += 1;
    if (newStatus === "fading" && meta.status !== "fading") stats.faded += 1;
    if (newStatus === "archived" && meta.status !== "archived") stats.archived += 1;
  }

  return stats;
}

// ── Weekly pass (Sundays only) ────────────────────────────────────────────────

export async function runPersonaWeeklyPass(): Promise<{
  dedups_proposed: number;
  digests_written: number;
}> {
  const stats = { dedups_proposed: 0, digests_written: 0 };

  // Pull all active persona entries with embeddings, group by brain.
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?type=eq.persona&deleted_at=is.null&metadata->>status=eq.active&select=id,user_id,brain_id,metadata,embedding&limit=${PER_RUN_CAP}`,
    { headers: SB_HDR },
  );
  if (!r.ok) return stats;
  const rows: PersonaEntry[] = await r.json();

  // Group per brain (dedup is brain-scoped, not user-scoped).
  const byBrain = new Map<string, PersonaEntry[]>();
  for (const row of rows) {
    if (!row.brain_id || !row.embedding) continue;
    if (!byBrain.has(row.brain_id)) byBrain.set(row.brain_id, []);
    byBrain.get(row.brain_id)!.push(row);
  }

  // Dedup proposals.
  const seenPairs = new Set<string>();
  for (const [, brainRows] of byBrain) {
    if (brainRows.length < 2) continue;
    const vecs = brainRows.map((r) => ({ id: r.id, user_id: r.user_id, vec: parseEmbedding(r.embedding) }))
      .filter((x) => x.vec.length > 0);
    for (let i = 0; i < vecs.length; i++) {
      for (let j = i + 1; j < vecs.length; j++) {
        const cos = cosine(vecs[i]!.vec, vecs[j]!.vec);
        if (cos < DEDUP_COSINE) continue;
        const pairKey = [vecs[i]!.id, vecs[j]!.id].sort().join(":");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const ok = await writeNotification({
          user_id: vecs[i]!.user_id,
          type: "persona_dedup",
          title: "Two persona facts look alike",
          body: `These two facts in your About You overlap heavily. Merge them?`,
          data: { entry_ids: [vecs[i]!.id, vecs[j]!.id], cosine: Number(cos.toFixed(3)) },
        });
        if (ok) stats.dedups_proposed += 1;
        if (stats.dedups_proposed >= 200) break;
      }
      if (stats.dedups_proposed >= 200) break;
    }
    if (stats.dedups_proposed >= 200) break;
  }

  // Weekly digest per user.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const userIds = new Set(rows.map((r) => r.user_id));
  for (const userId of userIds) {
    try {
      // Count facts touched in last 7 days for this user.
      const r = await fetch(
        `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&type=eq.persona&deleted_at=is.null&updated_at=gte.${sevenDaysAgo}&select=id,metadata,updated_at,created_at&limit=500`,
        { headers: SB_HDR },
      );
      if (!r.ok) continue;
      const recent: PersonaEntry[] = await r.json();
      const learned = recent.filter((e: any) => e.created_at && e.created_at >= sevenDaysAgo).length;
      const archived = recent.filter((e) => e.metadata?.status === "archived").length;
      const fading = recent.filter((e) => e.metadata?.status === "fading").length;
      const total = recent.length;
      if (total === 0) continue;
      const ok = await writeNotification({
        user_id: userId,
        type: "persona_digest",
        title: "Your About You evolved this week",
        body:
          `${learned} new ${learned === 1 ? "fact" : "facts"} learned · ` +
          `${archived} retired · ${fading} fading. Open About You to review.`,
        data: { learned, archived, fading, total },
      });
      if (ok) stats.digests_written += 1;
    } catch { /* non-fatal */ }
  }

  return stats;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEmbedding(raw: number[] | string | null): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // PostgREST returns vector columns as e.g. "[0.1,0.2,…]"
  if (typeof raw === "string" && raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function patchEntry(id: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function writeNotification(n: {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<boolean> {
  try {
    // Dedup — don't write the same dedup pair twice if a previous run already
    // queued it and the user hasn't dismissed it.
    if (n.type === "persona_dedup") {
      const ids = (n.data?.entry_ids as string[] | undefined) ?? [];
      if (ids.length === 2) {
        const probe = await fetch(
          `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(n.user_id)}&type=eq.persona_dedup&dismissed=eq.false&select=id,data&limit=50`,
          { headers: SB_HDR },
        );
        if (probe.ok) {
          const existing: Array<{ id: string; data: any }> = await probe.json();
          const dup = existing.some((row) => {
            const eIds = (row.data?.entry_ids as string[] | undefined) ?? [];
            return eIds.length === 2 && eIds.every((x) => ids.includes(x));
          });
          if (dup) return false;
        }
      }
    }
    if (n.type === "persona_digest") {
      // One digest per user per 5 days max — avoid spam if cron runs duplicate.
      const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
      const probe = await fetch(
        `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(n.user_id)}&type=eq.persona_digest&created_at=gte.${fiveDaysAgo}&select=id&limit=1`,
        { headers: SB_HDR },
      );
      if (probe.ok) {
        const recent: any[] = await probe.json();
        if (recent.length > 0) return false;
      }
    }
    const r = await fetch(`${SB_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { ...SB_HDR, Prefer: "return=minimal" },
      body: JSON.stringify({ ...n, read: false, dismissed: false, created_at: new Date().toISOString() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
