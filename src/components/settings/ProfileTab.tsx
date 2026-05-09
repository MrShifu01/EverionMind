// ─────────────────────────────────────────────────────────────────────────────
// ProfileTab — "About you"
//
// Two stacked panels:
//
//   1. Core (singular fields stored in user_personas)
//      preferred name, full name, pronouns, free-form context, master toggle.
//      Saved via PUT /api/profile.
//
//   2. Living memory (persona-typed entries)
//      Active facts grouped by bucket (identity / family / habit / preference
//      / event), with badges for source and pinned state. Each row has
//      pin / edit / retire actions. A collapsed "Fading" section shows
//      decayed facts the user can rescue. A second collapsed "History"
//      section shows retired facts as a timeline.
//
// All persona facts go through /api/capture and /api/entries — the same
// pipelines that handle every other entry. No new endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import SettingsRow, { SettingsToggle } from "./SettingsRow";
import { authFetch } from "../../lib/authFetch";
import { useBrain } from "../../context/BrainContext";
import { useBackgroundOps } from "../../hooks/useBackgroundOps";
import { useAdminDevMode } from "../../hooks/useAdminDevMode";
import { useAdminPrefs } from "../../lib/adminPrefs";
import { useCachedQuery, invalidateCachedQuery } from "../../lib/useCachedQuery";
import {
  IconBtn,
  Badge,
  SectionTitle,
  Field,
  Label,
  Hint,
  SubHint,
  Loading,
} from "./ProfileTab.bits";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { PersonaPromptDebug } from "./ProfileTab.PersonaPromptDebug";

interface ProfileFields {
  full_name: string;
  preferred_name: string;
  pronouns: string;
  context: string;
  enabled: boolean;
}

interface PersonaFact {
  id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  metadata: {
    bucket?: string;
    status?: "active" | "fading" | "archived" | "rejected";
    source?: string;
    confidence?: number;
    pinned?: boolean;
    last_referenced_at?: string;
    retired_at?: string;
    retired_reason?: string;
    rejected_at?: string;
    rejected_reason?: string;
    derived_from?: string[];
    skip_persona?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

const REJECT_REASON_CHIPS = [
  "Just a task I did",
  "About someone else",
  "Work activity, not who I am",
  "One-off event",
  "Not who I am",
];

const EMPTY_CORE: ProfileFields = {
  full_name: "",
  preferred_name: "",
  pronouns: "",
  context: "",
  enabled: true,
};

const CONTEXT_MAX = 4000;

const BUCKET_ORDER = ["identity", "family", "habit", "preference", "event"] as const;
const BUCKET_RENDER_ORDER = [...BUCKET_ORDER, "context"] as const;
const BUCKET_LABELS: Record<string, string> = {
  identity: "Identity",
  family: "Family & people",
  habit: "Habits & routines",
  preference: "Preferences",
  event: "Notable events",
  context: "Other context",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "you",
  chat: "chat",
  capture: "captured",
  import: "imported",
  inference: "inferred",
};

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line-soft)",
    borderRadius: 8,
    padding: "10px 12px",
    fontFamily: "var(--f-sans)",
    fontSize: 14,
    outline: "none",
    transition: "border-color 180ms",
  };
}

export default function ProfileTab() {
  const brainCtx = useBrain();
  const brainId = brainCtx?.activeBrain?.id;
  const { isAdmin } = useAdminDevMode();
  const adminPrefs = useAdminPrefs();

  const [core, setCore] = useState<ProfileFields>(EMPTY_CORE);
  const [coreLoaded, setCoreLoaded] = useState(false);
  const [coreSaving, setCoreSaving] = useState(false);
  const [coreSaved, setCoreSaved] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [facts, setFacts] = useState<PersonaFact[]>([]);
  const [factsLoaded, setFactsLoaded] = useState(false);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [showFading, setShowFading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  // Buckets default to collapsed once facts load. Users with 30+ identity
  // facts shouldn't see a wall of cards on tab open — they should see the
  // shape (which buckets exist, how many facts in each) and drill in only
  // when they want detail.
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set());
  const [collapseInitialized, setCollapseInitialized] = useState(false);
  const [rejectingFact, setRejectingFact] = useState<PersonaFact | null>(null);

  // Replaces window.confirm() with an in-app branded modal. Same shape as
  // RejectDialog (portal, body-lock, escape, scrim click) — keeps every
  // confirmation in the app feeling like one piece of software, not a
  // surprise drop-back to the browser chrome.
  type ConfirmRequest = {
    title: string;
    body: string | string[];
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  };
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  function toggleBucket(bucket: string) {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }

  const [newFactText, setNewFactText] = useState("");
  const [newFactBucket, setNewFactBucket] = useState<(typeof BUCKET_ORDER)[number]>("preference");
  const [adding, setAdding] = useState(false);

  // Long-running operations now live in the global background-ops system —
  // tab-survivable, app-close-survivable, with a global toast. Local state
  // here just mirrors "is my kind currently running?" for button disable.
  const ops = useBackgroundOps();
  const scanning = brainId ? ops.isRunning("persona-scan", brainId) : false;
  const wiping = brainId ? ops.isRunning("persona-wipe", brainId) : false;
  const resetting = brainId ? ops.isRunning("persona-reset", brainId) : false;
  const auditing = brainId ? ops.isRunning("persona-audit", brainId) : false;

  // ── Load core ─────────────────────────────────────────────────────────────
  // Cached so re-mounts (lazy-loaded settings tab) don't re-hit /api/profile.
  // Mutations call invalidateCachedQuery("profile:core") to drop the cache.
  interface CoreProfilePayload {
    profile?: {
      full_name?: string;
      preferred_name?: string;
      pronouns?: string;
      context?: string;
      enabled?: boolean;
    } | null;
  }
  const { data: coreData, isLoading: coreLoading } = useCachedQuery<CoreProfilePayload>(
    "profile:core",
    async () => {
      const r = await authFetch("/api/profile");
      if (!r?.ok) throw new Error("fetch_failed");
      return (await r.json()) as CoreProfilePayload;
    },
  );
  useEffect(() => {
    if (coreLoading) return;
    setCoreLoaded(true);
    const p = coreData?.profile;
    if (p) {
      setCore({
        full_name: p.full_name || "",
        preferred_name: p.preferred_name || "",
        pronouns: p.pronouns || "",
        context: p.context || "",
        enabled: p.enabled !== false,
      });
    }
  }, [coreData, coreLoading]);

  // ── Load persona facts ────────────────────────────────────────────────────
  async function reloadFacts() {
    if (!brainId) return;
    try {
      // Cache-bust — the entries GET handler sets Cache-Control: max-age=300
      // for performance on the timeline view, but the persona-facts list
      // needs to reflect a just-persisted PATCH (reject / retire / pin)
      // immediately. The unique `_t` defeats the browser cache without
      // changing the server-side policy that other views rely on.
      const r = await authFetch(
        `/api/entries?brain_id=${encodeURIComponent(brainId)}&type=persona&_t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!r?.ok) throw new Error("fetch_failed");
      const data = await r.json();
      const rows: PersonaFact[] = Array.isArray(data) ? data : (data.entries ?? []);
      // Defensive client-side filter — refuses to render anything that isn't
      // explicitly a persona entry. Protects About You from any future
      // regression in the entries endpoint that might leak other types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- defensive filter against future endpoint regression that might leak non-persona types; PersonaFact doesn't carry the discriminator field.
      const personaOnly = rows.filter((r: any) => r?.type === "persona");
      setFacts(personaOnly);
      setFactsError(null);
    } catch (e) {
      setFactsError(e instanceof Error ? e.message : "Could not load facts");
    } finally {
      setFactsLoaded(true);
    }
  }
  useEffect(() => {
    reloadFacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadFacts closes over fresh state every render; the brain-switch is the actual trigger we want, and reloadFacts always reads the latest brainId via the closure.
  }, [brainId]);

  // First time facts arrive, collapse every populated bucket — opt-in
  // disclosure feels less overwhelming than a 30-card identity dump.
  // Subsequent reloads (after wipes/audits) leave the user's open/closed
  // choices intact via collapseInitialized.
  useEffect(() => {
    if (!factsLoaded || collapseInitialized) return;
    const allBuckets = new Set<string>();
    for (const f of facts) {
      const b = f.metadata?.bucket;
      if (b && f.metadata?.status !== "rejected" && f.metadata?.status !== "archived") {
        allBuckets.add(String(b));
      }
    }
    setCollapsedBuckets(allBuckets);
    setCollapseInitialized(true);
  }, [factsLoaded, collapseInitialized, facts]);

  // When any of the long-running persona ops transition from running → idle,
  // reload immediately. Without this the UI only reflects the wipe/scan/reset
  // result on a manual refresh — the previous setTimeout(reloadFacts, 1500)
  // approach raced ops that took longer than 1.5s and ran twice for ones
  // that finished sooner.
  const opsActive = scanning || wiping || resetting || auditing;
  useEffect(() => {
    if (!opsActive) {
      reloadFacts();
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [opsActive]);

  // ── Detect first-iteration backfill damage ────────────────────────────────
  // Wrongly-promoted entries have NO derived_from and source not in
  // (manual, chat). If any exist, surface the Reset button.
  const needsReset = useMemo(
    () =>
      facts.some((f) => {
        const m = f.metadata ?? {};
        if (m.derived_from && m.derived_from.length) return false;
        if (m.skip_persona === true) return false;
        const src = String(m.source || "");
        return src !== "manual" && src !== "chat";
      }),
    [facts],
  );

  // ── Detect any auto-extracted facts (have derived_from) ───────────────────
  // Used to gate the Wipe button — no point showing it on a clean brain.
  const hasExtractedFacts = useMemo(
    () =>
      facts.some((f) => {
        const m = f.metadata ?? {};
        if (!m.derived_from || !m.derived_from.length) return false;
        const src = String(m.source || "");
        return src !== "manual" && src !== "chat";
      }),
    [facts],
  );

  // ── Bucket grouping ───────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const out: {
      active: Record<string, PersonaFact[]>;
      fading: PersonaFact[];
      history: PersonaFact[];
      rejected: PersonaFact[];
    } = {
      active: {},
      fading: [],
      history: [],
      rejected: [],
    };
    for (const f of facts) {
      const status = f.metadata?.status || "active";
      if (status === "rejected") {
        out.rejected.push(f);
        continue;
      }
      if (status === "archived") {
        out.history.push(f);
        continue;
      }
      if (status === "fading") {
        out.fading.push(f);
        continue;
      }
      // Only group into a known bucket. Anything missing a bucket goes into
      // a generic "context" group rather than silently inflating preferences.
      const rawBucket = f.metadata?.bucket;
      const bucket = (BUCKET_ORDER as readonly string[]).includes(rawBucket || "")
        ? rawBucket!
        : "context";
      (out.active[bucket] ??= []).push(f);
    }
    // Sort each active bucket: pinned first, then by confidence desc, then by recency.
    for (const bucket of Object.keys(out.active)) {
      out.active[bucket]!.sort((a, b) => {
        const ap = a.metadata?.pinned ? 1 : 0;
        const bp = b.metadata?.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const ac = a.metadata?.confidence ?? 0.5;
        const bc = b.metadata?.confidence ?? 0.5;
        if (ac !== bc) return bc - ac;
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      });
    }
    out.history.sort((a, b) =>
      (b.metadata?.retired_at || b.updated_at).localeCompare(
        a.metadata?.retired_at || a.updated_at,
      ),
    );
    out.rejected.sort((a, b) =>
      (b.metadata?.rejected_at || b.updated_at).localeCompare(
        a.metadata?.rejected_at || a.updated_at,
      ),
    );
    return out;
  }, [facts]);

  // ── Core save ─────────────────────────────────────────────────────────────
  function patchCore(p: Partial<ProfileFields>) {
    setCore((prev) => ({ ...prev, ...p }));
    setCoreSaved(false);
  }

  async function saveCore() {
    setCoreSaving(true);
    setCoreError(null);
    try {
      const r = await authFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(core),
      });
      if (!r?.ok) throw new Error("save_failed");
      // Drop the cached profile so the next mount reads the fresh server
      // copy. Invalidate is enough — we're not re-rendering anything that
      // reads coreData right now.
      invalidateCachedQuery("profile:core");
      setCoreSaved(true);
      setTimeout(() => setCoreSaved(false), 1800);
    } catch (e) {
      setCoreError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setCoreSaving(false);
    }
  }

  // ── Fact actions (all go through /api/capture or /api/entries) ────────────
  async function addFact() {
    const text = newFactText.trim();
    if (!text || !brainId) return;
    setAdding(true);
    try {
      const r = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_title: text.slice(0, 200),
          p_content: text,
          p_type: "persona",
          p_brain_id: brainId,
          p_tags: ["persona", newFactBucket],
          p_metadata: {
            bucket: newFactBucket,
            status: "active",
            source: "manual",
            confidence: 1.0,
            pinned: false,
            evidence_count: 1,
            last_referenced_at: new Date().toISOString(),
            // Tell the enrichment classifier to skip — we already know it's persona.
            skip_persona: true,
          },
        }),
      });
      if (!r?.ok) throw new Error("add_failed");
      setNewFactText("");
      await reloadFacts();
    } catch (e) {
      setFactsError(e instanceof Error ? e.message : "Could not add fact");
    } finally {
      setAdding(false);
    }
  }

  function runBackfill() {
    if (!brainId || scanning) return;
    ops.startTask({
      kind: "persona-scan",
      label: "Scanning entries for persona facts",
      resumeKey: brainId,
    });
    // Poll every few seconds to show in-flight extractions as they land.
    // Final reload on completion is handled by the opsActive effect above.
    const poll = setInterval(() => {
      reloadFacts();
    }, 3000);
    setTimeout(() => clearInterval(poll), 5 * 60_000);
  }

  function runReset() {
    if (!brainId || resetting) return;
    setConfirmRequest({
      title: "Undo the previous scan?",
      body: [
        "This restores entries that were wrongly converted into persona cards back to their best-guessed original type — todos return to schedule, events to calendar, and so on.",
        "Manually-added facts and chat-tool facts are not touched.",
      ],
      confirmLabel: "Undo scan",
      onConfirm: () => {
        ops.startTask({
          kind: "persona-reset",
          label: "Reverting previous persona scan",
          resumeKey: brainId,
        });
      },
    });
  }

  function runAudit() {
    if (!brainId || auditing) return;
    setConfirmRequest({
      title: "Audit your living memory?",
      body: [
        "Walks every active fact and bulk-rejects ones that duplicate another fact, match something you already marked as Not me, or are already covered by your About You.",
        "Pinned facts and ones you added manually are never touched. Anything rejected stays in the Not me section so you can restore it if the audit got it wrong.",
      ],
      confirmLabel: "Run audit",
      onConfirm: () => {
        ops.startTask({
          kind: "persona-audit",
          label: "Auditing living memory",
          resumeKey: brainId,
        });
      },
    });
  }

  function runWipe() {
    if (!brainId || wiping) return;
    setConfirmRequest({
      title: "Wipe every auto-extracted fact?",
      body: [
        "Deletes all the facts the scanner produced. Manually-added facts and facts you added via chat are kept.",
        "After wiping, click Run scan again to re-extract with the latest prompt.",
      ],
      confirmLabel: "Wipe facts",
      danger: true,
      onConfirm: () => {
        // Optimistic clear — wipe deletes any active fact whose source is the
        // scanner. Drop those locally NOW so the UI reflects the action; the
        // useEffect above will reconcile against server truth when the op ends.
        setFacts((prev) =>
          prev.filter((f) => {
            const m = f.metadata ?? {};
            const src = String(m.source || "");
            if (src === "manual" || src === "chat") return true;
            if (m.skip_persona === true) return true;
            return false;
          }),
        );
        ops.startTask({
          kind: "persona-wipe",
          label: "Wiping auto-extracted persona facts",
          resumeKey: brainId,
        });
      },
    });
  }

  async function patchFact(id: string, metaPatch: Record<string, unknown>) {
    if (!brainId) return;
    const prevSnapshot = facts;
    setFacts((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        const newMeta = { ...(x.metadata ?? {}), ...metaPatch };
        return { ...x, metadata: newMeta };
      }),
    );
    // Fire-and-forget PATCH against the latest server state. We deliberately
    // do NOT reloadFacts here — the GET handler caches for 5 min, and a
    // rapid pin/unpin sequence used to race against stale cache responses
    // (the pin would flip back). Optimistic state is the source of truth
    // for status-neutral patches; the next bigger reload (wipe / scan /
    // audit / restore) reconciles against server truth — but on hard
    // failure we roll the optimistic flip back so the UI doesn't drift.
    const target = facts.find((x) => x.id === id);
    const newMeta = { ...((target?.metadata as Record<string, unknown>) ?? {}), ...metaPatch };
    authFetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, metadata: newMeta }),
    })
      .then((r) => {
        if (!r.ok) {
          console.error("[ProfileTab.patchFact] server rejected", id, r.status);
          setFacts(prevSnapshot);
        }
      })
      .catch((err) => {
        console.error("[ProfileTab.patchFact] network error", id, err);
        setFacts(prevSnapshot);
      });
  }

  async function retireFact(id: string) {
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    if (!brainId) return;

    setConfirmRequest({
      title: "Retire to history?",
      body: [
        `"${f.title}"`,
        'Moves this fact into History — archived but still searchable when chat asks specific questions like "where did I live" or "what was my ex\'s name". Just no longer in your active living memory.',
      ],
      confirmLabel: "Retire",
      onConfirm: async () => {
        try {
          const tags = Array.isArray(f.tags) ? f.tags : [];
          const newTags = tags.includes("history") ? tags : [...tags, "history"];
          const newMeta = {
            ...(f.metadata ?? {}),
            status: "archived" as const,
            retired_at: new Date().toISOString(),
          };
          // Optimistic — flip to archived locally so the row leaves Active
          // immediately. reloadFacts reconciles after server returns.
          setFacts((prev) =>
            prev.map((x) => (x.id === id ? { ...x, tags: newTags, metadata: newMeta } : x)),
          );
          await authFetch("/api/entries", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, tags: newTags, metadata: newMeta }),
          });
          // Open the History section so the user sees where the fact went.
          setShowHistory(true);
          await reloadFacts();
        } catch (e) {
          setFactsError(e instanceof Error ? e.message : "Could not retire");
        }
      },
    });
  }

  async function rejectFact(id: string, reason: string | null) {
    if (!brainId) return;
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    const tags = Array.isArray(f.tags) ? f.tags : [];
    const newTags = tags.includes("rejected") ? tags : [...tags, "rejected"];
    const newMeta = {
      ...(f.metadata ?? {}),
      status: "rejected" as const,
      rejected_at: new Date().toISOString(),
      rejected_reason: reason || undefined,
    };
    // Close dialog + flip the fact to rejected locally NOW. The active list
    // re-groups instantly so the user sees the fact disappear; reload below
    // reconciles against server truth.
    setRejectingFact(null);
    setFacts((prev) =>
      prev.map((x) => (x.id === id ? { ...x, tags: newTags, metadata: newMeta } : x)),
    );
    try {
      await authFetch("/api/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tags: newTags, metadata: newMeta }),
      });
      await reloadFacts();
      // Auto-distill the rejected pool every 20 rejections so the prompt's
      // skip rules stay current without the user having to remember to hit
      // "Distill now". Fire-and-forget — failures show up next weekly run.
      const rejectedCount = facts.filter(
        (x) => x.metadata?.status === "rejected" || x.id === id,
      ).length;
      if (rejectedCount > 0 && rejectedCount % 20 === 0) {
        authFetch("/api/entries?action=distill-rejected", { method: "POST" }).catch(() => {});
      }
    } catch (e) {
      setFactsError(e instanceof Error ? e.message : "Could not mark as not-me");
    }
  }

  async function unrejectFact(id: string) {
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    const tags = (Array.isArray(f.tags) ? f.tags : []).filter((t) => t !== "rejected");
    // Strip rejection fields entirely instead of setting them to undefined
    // (PostgREST keeps undefined keys as nulls inside jsonb, and the prior
    // metadata still contained rejected_at / rejected_reason — that broke
    // the restore because the server merge re-introduced rejected status
    // on the next read). Build a fresh metadata object.
    const oldMeta = f.metadata ?? {};
    const {
      rejected_at: _ra,
      rejected_reason: _rr,
      rejected_by: _rb,
      ...rest
    } = oldMeta as Record<string, unknown>;
    const newMeta = { ...rest, status: "active" as const };

    // Optimistic — flip the row out of "rejected" immediately so it returns
    // to its original active bucket. The server PATCH then persists.
    setFacts((prev) => prev.map((x) => (x.id === id ? { ...x, tags, metadata: newMeta } : x)));

    try {
      await authFetch("/api/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tags, metadata: newMeta }),
      });
      // Trigger a re-distill so the rejected_summary doesn't keep teaching
      // the model to skip something the user just said WAS them after all.
      authFetch("/api/entries?action=distill-rejected", { method: "POST" }).catch(() => {});
    } catch (e) {
      setFactsError(e instanceof Error ? e.message : "Could not restore");
    }
  }

  async function deleteFactCompletely(id: string) {
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    setConfirmRequest({
      title: "Permanently delete?",
      body: [`"${f.title}"`, "This removes it from history too — it can't be restored."],
      confirmLabel: "Delete forever",
      danger: true,
      onConfirm: async () => {
        try {
          await authFetch("/api/delete-entry", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          await reloadFacts();
        } catch {
          /* ignore */
        }
      },
    });
  }

  function handleAddKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addFact();
    }
  }

  if (!coreLoaded) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Master toggle */}
      <SettingsRow
        label="Personalise chat with this profile"
        hint="When on, the assistant sees a short ‘about you’ summary on every chat call. Turn off if you want the assistant to forget who you are."
      >
        <SettingsToggle
          value={core.enabled}
          onChange={(v) => {
            patchCore({ enabled: v });
          }}
          ariaLabel="Personalisation toggle"
        />
      </SettingsRow>

      {/* Sensitive-data warning */}
      <div
        style={{
          margin: "10px 0 18px",
          padding: "12px 14px",
          background: "color-mix(in oklch, var(--ember-wash) 70%, var(--surface))",
          border: "1px solid color-mix(in oklch, var(--ember) 24%, var(--line-soft))",
          borderRadius: 10,
        }}
      >
        <p
          className="f-serif"
          style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}
        >
          <strong style={{ fontWeight: 600 }}>
            Never put ID numbers, passport, driver's licence, banking or medical details here.
          </strong>{" "}
          Those go in your encrypted{" "}
          <span style={{ color: "var(--ember)", fontWeight: 600 }}>Vault</span>. This profile is
          plaintext and is sent to the AI on every chat call.
        </p>
      </div>

      {/* Core scalars */}
      <SectionTitle>Core</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Field label="Preferred name / nickname">
          <input
            type="text"
            value={core.preferred_name}
            maxLength={60}
            placeholder="e.g. Chris"
            onChange={(e) => patchCore({ preferred_name: e.target.value })}
            style={inputStyle()}
          />
        </Field>
        <Field label="Full name">
          <input
            type="text"
            value={core.full_name}
            maxLength={120}
            placeholder="e.g. Christian Stander"
            onChange={(e) => patchCore({ full_name: e.target.value })}
            style={inputStyle()}
          />
        </Field>
      </div>

      <Field label="Pronouns">
        <input
          type="text"
          value={core.pronouns}
          maxLength={40}
          placeholder="e.g. he/him"
          onChange={(e) => patchCore({ pronouns: e.target.value })}
          style={{ ...inputStyle(), maxWidth: 240 }}
        />
      </Field>

      <div style={{ marginTop: 14 }}>
        <Label>About you (free-form)</Label>
        <Hint>
          Anything else you want the assistant to keep in mind — your work, projects, where you
          live, things you care about.
        </Hint>
        <textarea
          value={core.context}
          maxLength={CONTEXT_MAX}
          rows={5}
          placeholder="e.g. I run Smash Burger Bar in Pretoria. I'm building EverionMind as a personal second-brain. I prefer concise, direct answers."
          onChange={(e) => patchCore({ context: e.target.value })}
          style={{
            ...inputStyle(),
            resize: "vertical",
            fontFamily: "var(--f-serif)",
            lineHeight: 1.5,
            marginTop: 8,
          }}
        />
        <SubHint>
          {core.context.length} / {CONTEXT_MAX}
        </SubHint>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <Button type="button" onClick={saveCore} disabled={coreSaving} size="sm">
          {coreSaving ? "Saving…" : "Save core"}
        </Button>
        {coreSaved && (
          <span
            className="f-serif"
            style={{ fontSize: 13, fontStyle: "italic", color: "var(--moss)" }}
          >
            saved.
          </span>
        )}
        {coreError && (
          <span
            className="f-serif"
            style={{ fontSize: 13, fontStyle: "italic", color: "var(--blood)" }}
          >
            {coreError}
          </span>
        )}
      </div>

      {/* ── Living memory ─────────────────────────────────────────────────── */}
      <SectionTitle style={{ marginTop: 32 }}>Living memory</SectionTitle>
      <Hint>
        Facts your second brain has learned about you — from chat, captures, and imports. Each one
        is a real entry; pinned facts never decay.
      </Hint>

      {/* Reset — only shown when the first-iteration backfill left junk behind */}
      {needsReset && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "color-mix(in oklch, var(--blood) 8%, var(--surface-low))",
            border: "1px solid color-mix(in oklch, var(--blood) 30%, var(--line-soft))",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <p
              className="f-sans"
              style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
            >
              Undo previous scan
            </p>
            <p
              className="f-serif"
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ink-faint)",
                lineHeight: 1.45,
              }}
            >
              An earlier version of the scan converted whole entries into persona cards by mistake.
              Reset to put them back into Schedule, Calendar, etc., then run the new scan below.
            </p>
          </div>
          <Button
            type="button"
            onClick={runReset}
            disabled={resetting || !brainId}
            variant="outline"
            size="sm"
            style={{
              color: "var(--blood)",
              borderColor: "color-mix(in oklch, var(--blood) 50%, var(--line-soft))",
            }}
          >
            {resetting ? "Reverting…" : "Reset previous scan"}
          </Button>
        </div>
      )}

      {/* Audit — re-evaluates active facts against the current prompt rules,
          bulk-rejects ones that duplicate, match a Not-me pattern, or are
          already covered by About-You. Always-visible companion to Wipe. */}
      {hasExtractedFacts && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <p
              className="f-sans"
              style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
            >
              Audit living memory
            </p>
            <p
              className="f-serif"
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ink-faint)",
                lineHeight: 1.45,
              }}
            >
              Removes duplicates, facts matching things you marked as Not me, and ones already
              covered by your About You. Pinned and manually-added facts are never touched.
            </p>
          </div>
          <Button
            type="button"
            onClick={runAudit}
            disabled={auditing || !brainId}
            variant="outline"
            size="sm"
            style={{
              color: "var(--ember)",
              borderColor: "color-mix(in oklch, var(--ember) 40%, var(--line-soft))",
            }}
          >
            {auditing ? "Auditing…" : "Run audit"}
          </Button>
        </div>
      )}

      {/* Wipe — clears auto-extracted facts so you can re-scan with the new prompt */}
      {hasExtractedFacts && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "color-mix(in oklch, var(--ink-faint) 6%, var(--surface-low))",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <p
              className="f-sans"
              style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
            >
              Wipe extracted facts
            </p>
            <p
              className="f-serif"
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ink-faint)",
                lineHeight: 1.45,
              }}
            >
              Removes everything the scanner has produced so far. Your manually-added facts and
              chat-added facts stay. Use this before re-running the scan after a prompt update.
            </p>
          </div>
          <Button
            type="button"
            onClick={runWipe}
            disabled={wiping || !brainId}
            variant="outline"
            size="sm"
            style={{ color: "var(--ink-faint)" }}
          >
            {wiping ? "Wiping…" : "Wipe extracted facts"}
          </Button>
        </div>
      )}

      {/* Backfill — scan existing entries and extract short persona facts */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "var(--surface-low)",
          border: "1px dashed var(--line-soft)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <p
            className="f-sans"
            style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
          >
            Scan existing entries
          </p>
          <p
            className="f-serif"
            style={{
              margin: "2px 0 0",
              fontSize: 12,
              fontStyle: "italic",
              color: "var(--ink-faint)",
              lineHeight: 1.45,
            }}
          >
            Look through every note in this brain and extract <em>short facts</em> about you. Each
            fact becomes its own small entry; your originals are never changed. Progress shows in
            the toast — safe to switch tabs or close the app.
          </p>
        </div>
        <Button
          type="button"
          onClick={runBackfill}
          disabled={scanning || !brainId}
          variant="outline"
          size="sm"
          style={{
            color: "var(--ember)",
            borderColor: "color-mix(in oklch, var(--ember) 40%, var(--line-soft))",
          }}
        >
          {scanning ? "Scanning…" : "Run scan"}
        </Button>
      </div>

      {/* Manual add */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 10,
          display: "flex",
          gap: 8,
        }}
      >
        <Select
          value={newFactBucket}
          onValueChange={(v) => setNewFactBucket(v as (typeof BUCKET_ORDER)[number])}
        >
          <SelectTrigger style={{ ...inputStyle(), width: 130 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUCKET_ORDER.map((b) => (
              <SelectItem key={b} value={b}>
                {BUCKET_LABELS[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="text"
          value={newFactText}
          onChange={(e) => setNewFactText(e.target.value)}
          onKeyDown={handleAddKey}
          placeholder="A short fact about yourself, third person — e.g. 'Wakes at 5:30 every weekday'"
          maxLength={200}
          style={{ ...inputStyle(), flex: 1 }}
        />
        <Button
          type="button"
          onClick={addFact}
          disabled={adding || !newFactText.trim() || !brainId}
        >
          {adding ? "…" : "Add"}
        </Button>
      </div>

      {factsError && (
        <p
          className="f-serif"
          style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginTop: 8 }}
        >
          {factsError}
        </p>
      )}

      {/* Active facts grouped by bucket — every section uses CollapsibleSection
          so the look + click target stays consistent. */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {!factsLoaded && <Loading />}

        {factsLoaded &&
          BUCKET_RENDER_ORDER.map((bucket) => {
            const items = grouped.active[bucket] || [];
            if (!items.length) return null;
            const collapsed = collapsedBuckets.has(bucket);
            return (
              <CollapsibleSection
                key={bucket}
                label={BUCKET_LABELS[bucket]}
                count={items.length}
                collapsed={collapsed}
                onToggle={() => toggleBucket(bucket)}
              >
                {items.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    onPin={() => patchFact(f.id, { pinned: !f.metadata?.pinned })}
                    onRetire={() => retireFact(f.id)}
                    onReject={() => setRejectingFact(f)}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))}
              </CollapsibleSection>
            );
          })}

        {factsLoaded &&
          Object.keys(grouped.active).length === 0 &&
          grouped.fading.length === 0 &&
          grouped.history.length === 0 &&
          grouped.rejected.length === 0 && (
            <p
              className="f-serif"
              style={{
                fontStyle: "italic",
                color: "var(--ink-faint)",
                fontSize: 14,
                padding: "16px 0",
              }}
            >
              No facts yet. Add one above, or just have a chat — the assistant will start learning
              who you are.
            </p>
          )}

        {/* Secondary sections — Fading / History / Not me. These always
            render once facts have loaded so users know where rejected
            facts went; empty states say so explicitly. */}
        {factsLoaded && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {grouped.fading.length > 0 && (
              <CollapsibleSection
                label="Fading"
                count={grouped.fading.length}
                hint="not in chat preamble until reinforced"
                collapsed={!showFading}
                onToggle={() => setShowFading((v) => !v)}
                emphasis="muted"
              >
                {grouped.fading.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    onPin={() =>
                      patchFact(f.id, { pinned: true, status: "active", confidence: 1.0 })
                    }
                    onRetire={() => retireFact(f.id)}
                    onReject={() => setRejectingFact(f)}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))}
              </CollapsibleSection>
            )}

            {/* History — always-visible, mirrors Not me. Empty state tells
                users where retired facts go. */}
            <CollapsibleSection
              label="History"
              count={grouped.history.length}
              hint="life events archived"
              collapsed={!showHistory}
              onToggle={() => setShowHistory((v) => !v)}
              emphasis="muted"
            >
              {grouped.history.length === 0 ? (
                <p
                  className="f-serif"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ink-faint)",
                    padding: "4px 0",
                  }}
                >
                  Nothing archived yet. When you retire a fact (or it ages out as a one-time event),
                  it lands here — visible but no longer in your active living memory.
                </p>
              ) : (
                grouped.history.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    historyMode
                    onPin={() => {}}
                    onRetire={() => {}}
                    onReject={() => {}}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))
              )}
            </CollapsibleSection>

            {/* Not me — always visible once facts are loaded so users
                know this section exists, even when empty. */}
            <CollapsibleSection
              label="Not me"
              count={grouped.rejected.length}
              hint="won't be re-extracted"
              collapsed={!showRejected}
              onToggle={() => setShowRejected((v) => !v)}
              emphasis="muted"
            >
              {grouped.rejected.length === 0 ? (
                <p
                  className="f-serif"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ink-faint)",
                    padding: "4px 0",
                  }}
                >
                  Nothing rejected yet. When you mark a fact as Not me, it lands here so future
                  scans skip it — and you can restore it anytime.
                </p>
              ) : (
                grouped.rejected.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    rejectedMode
                    onPin={() => {}}
                    onRetire={() => {}}
                    onReject={() => {}}
                    onUnreject={() => unrejectFact(f.id)}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))
              )}
            </CollapsibleSection>
          </div>
        )}
      </div>

      {/* Admin-only: live persona-extractor prompt + learnings, gated behind
          a separate adminPref so it stays out of the way unless explicitly
          turned on in the Admin tab. Pinned to the very bottom of Personal
          so it never gets in the way of the actual settings UI. */}
      {isAdmin && adminPrefs.showPersonaPromptDebug && brainId && (
        <PersonaPromptDebug
          brainId={brainId}
          /* refreshKey changes whenever a fact's status or pinned-ness
             changes, not just when length changes — so reject/retire/pin
             trigger the debug panel to auto-refresh. */
          refreshKey={facts
            .map((f) => `${f.id}:${f.metadata?.status || "active"}:${f.metadata?.pinned ? 1 : 0}`)
            .join("|")}
        />
      )}

      {rejectingFact && (
        <RejectDialog
          fact={rejectingFact}
          onCancel={() => setRejectingFact(null)}
          onConfirm={(reason) => rejectFact(rejectingFact.id, reason)}
        />
      )}

      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          body={confirmRequest.body}
          confirmLabel={confirmRequest.confirmLabel}
          danger={confirmRequest.danger}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            const req = confirmRequest;
            setConfirmRequest(null);
            req.onConfirm();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FactRow({
  fact,
  historyMode,
  rejectedMode,
  onPin,
  onRetire,
  onReject,
  onUnreject,
  onDelete,
}: {
  fact: PersonaFact;
  historyMode?: boolean;
  rejectedMode?: boolean;
  onPin: () => void;
  onRetire: () => void;
  onReject: () => void;
  onUnreject?: () => void;
  onDelete: () => void;
}) {
  const meta = fact.metadata ?? {};
  const pinned = meta.pinned === true;
  const source = (meta.source as string) || "chat";
  const confidence = typeof meta.confidence === "number" ? meta.confidence : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 12px",
        background: pinned
          ? "color-mix(in oklch, var(--ember-wash) 60%, var(--surface))"
          : rejectedMode
            ? "color-mix(in oklch, var(--ink-faint) 4%, var(--surface))"
            : "var(--surface)",
        border: pinned
          ? "1px solid color-mix(in oklch, var(--ember) 25%, var(--line-soft))"
          : "1px solid var(--line-soft)",
        borderRadius: 8,
        opacity: rejectedMode ? 0.7 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="f-sans"
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--ink)",
            lineHeight: 1.5,
            wordBreak: "break-word",
            textDecoration: rejectedMode ? "line-through" : undefined,
          }}
        >
          {pinned && (
            <span title="Pinned" style={{ marginRight: 6 }}>
              📌
            </span>
          )}
          {fact.title}
        </p>
        <div
          style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}
        >
          <Badge>{SOURCE_LABELS[source] || source}</Badge>
          {confidence !== null && !historyMode && !rejectedMode && (
            <Badge muted>{Math.round(confidence * 100)}%</Badge>
          )}
          {historyMode && meta.retired_at && (
            <Badge muted>retired {new Date(meta.retired_at).toLocaleDateString("en-ZA")}</Badge>
          )}
          {historyMode && meta.retired_reason && (
            <span
              className="f-serif"
              style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
            >
              — {meta.retired_reason}
            </span>
          )}
          {rejectedMode && meta.rejected_at && (
            <Badge muted>not me · {new Date(meta.rejected_at).toLocaleDateString("en-ZA")}</Badge>
          )}
          {rejectedMode && meta.rejected_reason && (
            <span
              className="f-serif"
              style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
            >
              — {meta.rejected_reason}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {!historyMode && !rejectedMode && (
          <>
            <IconBtn label={pinned ? "Unpin" : "Pin"} onClick={onPin}>
              {pinned ? "📍" : "📌"}
            </IconBtn>
            <IconBtn label="Retire to history (no longer true)" onClick={onRetire}>
              ↩
            </IconBtn>
            <IconBtn label="Not me — won't be re-extracted" onClick={onReject}>
              ⊘
            </IconBtn>
          </>
        )}
        {rejectedMode && onUnreject && (
          <IconBtn label="Restore — count this as defining" onClick={onUnreject}>
            ↻
          </IconBtn>
        )}
        {/* Delete is a hard-purge — only useful in history/rejected where the
            fact is already off the chat preamble. On active/fading the user
            should pick Retire (no longer true) or Not me (not who I am);
            neither path needs raw delete. */}
        {(historyMode || rejectedMode) && (
          <IconBtn label="Delete completely" onClick={onDelete} danger>
            ×
          </IconBtn>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RejectDialog — quick chips for the common reasons + freeform fallback. The
// reason is what teaches the extractor; chips just speed up the most common
// cases. The dialog is intentionally lightweight (no portal, no FocusTrap) —
// it's nested inside the settings page which already has its own focus
// management, and Escape exits via the cancel button.
// ─────────────────────────────────────────────────────────────────────────────

function RejectDialog({
  fact,
  onCancel,
  onConfirm,
}: {
  fact: PersonaFact;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function pickChip(chip: string) {
    setReason(chip);
  }

  async function confirm() {
    setSubmitting(true);
    try {
      await onConfirm(reason.trim() || null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className="sm:max-w-md"
        style={{
          background: "var(--surface-high)",
          borderColor: "var(--line)",
          boxShadow: "var(--lift-3)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="f-serif"
            style={{ fontSize: 17, fontWeight: 500, color: "var(--ink)" }}
          >
            Not me?
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              <p
                className="f-serif"
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--ink-faint)",
                  lineHeight: 1.5,
                }}
              >
                "{fact.title}"
              </p>
              <p
                className="f-sans"
                style={{
                  margin: "10px 0 0",
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                }}
              >
                Pick a reason. Future scans will skip this fact <em>and others like it</em>. The
                reason teaches the extractor your personal definition of "persona-worthy".
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {REJECT_REASON_CHIPS.map((chip) => {
            const active = reason === chip;
            return (
              <Button
                key={chip}
                type="button"
                onClick={() => pickChip(chip)}
                variant="outline"
                size="xs"
                className="rounded-full"
                style={{
                  background: active ? "var(--ember-wash)" : "transparent",
                  color: active ? "var(--ember)" : "var(--ink-soft)",
                  borderColor: active
                    ? "color-mix(in oklch, var(--ember) 40%, var(--line-soft))"
                    : "var(--line-soft)",
                }}
              >
                {chip}
              </Button>
            );
          })}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Or write your own reason…"
          className="f-serif"
          style={{
            width: "100%",
            background: "var(--surface)",
            color: "var(--ink)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
            lineHeight: 1.5,
            outline: "none",
            resize: "vertical",
          }}
        />

        <DialogFooter>
          <Button type="button" onClick={onCancel} variant="outline" size="sm">
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={submitting} size="sm">
            {submitting ? "Saving…" : "Mark as not me"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CollapsibleSection — single primitive used by every group in Living memory
// (Identity / Family / Habits / Preferences / Notable events / Fading /
// History / Not me). One look, one feel, one click target.
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleSection({
  label,
  count,
  hint,
  collapsed,
  onToggle,
  children,
  emphasis = "normal",
}: {
  label: string;
  count: number;
  hint?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  emphasis?: "normal" | "muted";
}) {
  const muted = emphasis === "muted";
  // shadcn-style controlled single-collapsible. The parent owns the `collapsed`
  // boolean (one open at a time, or all closed) — we translate to Radix's
  // string-valued model: "open" when expanded, "" when collapsed. onToggle()
  // fires for both directions.
  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      value={collapsed ? "" : "open"}
      onValueChange={() => onToggle()}
    >
      <AccordionPrimitive.Item value="open">
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger
            className="press group/cs"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 4px",
              background: "transparent",
              border: 0,
              borderBottom: "1px solid transparent",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 140ms ease, border-color 140ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-low)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                height: 14,
                color: "var(--ink-faint)",
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 200ms cubic-bezier(.16,1,.3,1)",
                flexShrink: 0,
              }}
            >
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path
                  d="M1 1L5 5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span
              className="f-serif"
              style={{
                fontSize: muted ? 13 : 15,
                fontWeight: 500,
                color: muted ? "var(--ink-soft)" : "var(--ink)",
                fontStyle: muted ? "italic" : "normal",
              }}
            >
              {label}
            </span>
            <span
              className="f-sans"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--ink-faint)",
                background: "var(--surface-low)",
                border: "1px solid var(--line-soft)",
                borderRadius: 999,
                padding: "1px 8px",
                minWidth: 22,
                textAlign: "center",
              }}
            >
              {count}
            </span>
            {hint && !collapsed && (
              <span
                className="f-sans"
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "var(--ink-faint)",
                  fontStyle: "italic",
                }}
              >
                {hint}
              </span>
            )}
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content className="data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingLeft: 24,
              marginTop: 8,
            }}
          >
            {children}
          </div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
}

// PersonaPromptDebug + DebugBlock/List helpers extracted to
// ProfileTab.PersonaPromptDebug.tsx (audit task 1319). Admin-only.
