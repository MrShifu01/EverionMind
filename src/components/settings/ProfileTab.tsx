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
    status?: "active" | "fading" | "archived";
    source?: string;
    confidence?: number;
    pinned?: boolean;
    last_referenced_at?: string;
    retired_at?: string;
    retired_reason?: string;
    derived_from?: string[];
    skip_persona?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

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

  const [newFactText, setNewFactText] = useState("");
  const [newFactBucket, setNewFactBucket] = useState<typeof BUCKET_ORDER[number]>("preference");
  const [adding, setAdding] = useState(false);

  // Long-running operations now live in the global background-ops system —
  // tab-survivable, app-close-survivable, with a global toast. Local state
  // here just mirrors "is my kind currently running?" for button disable.
  const ops = useBackgroundOps();
  const scanning = brainId ? ops.isRunning("persona-scan", brainId) : false;
  const wiping = brainId ? ops.isRunning("persona-wipe", brainId) : false;
  const resetting = brainId ? ops.isRunning("persona-reset", brainId) : false;

  // ── Load core ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch("/api/profile");
        if (!r?.ok) throw new Error("fetch_failed");
        const data = await r.json();
        if (cancelled) return;
        const p = data.profile;
        if (p) {
          setCore({
            full_name: p.full_name || "",
            preferred_name: p.preferred_name || "",
            pronouns: p.pronouns || "",
            context: p.context || "",
            enabled: p.enabled !== false,
          });
        }
      } catch {
        /* empty profile is fine */
      } finally {
        if (!cancelled) setCoreLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load persona facts ────────────────────────────────────────────────────
  async function reloadFacts() {
    if (!brainId) return;
    try {
      const r = await authFetch(
        `/api/entries?brain_id=${encodeURIComponent(brainId)}&type=persona`,
      );
      if (!r?.ok) throw new Error("fetch_failed");
      const data = await r.json();
      const rows: PersonaFact[] = Array.isArray(data) ? data : (data.entries ?? []);
      // Defensive client-side filter — refuses to render anything that isn't
      // explicitly a persona entry. Protects About You from any future
      // regression in the entries endpoint that might leak other types.
      const personaOnly = rows.filter((r: any) => r?.type === "persona");
      setFacts(personaOnly);
      setFactsError(null);
    } catch (e: any) {
      setFactsError(e?.message || "Could not load facts");
    } finally {
      setFactsLoaded(true);
    }
  }
  useEffect(() => { reloadFacts(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [brainId]);

  // ── Detect first-iteration backfill damage ────────────────────────────────
  // Wrongly-promoted entries have NO derived_from and source not in
  // (manual, chat). If any exist, surface the Reset button.
  const needsReset = useMemo(
    () => facts.some((f) => {
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
    () => facts.some((f) => {
      const m = f.metadata ?? {};
      if (!m.derived_from || !m.derived_from.length) return false;
      const src = String(m.source || "");
      return src !== "manual" && src !== "chat";
    }),
    [facts],
  );

  // ── Bucket grouping ───────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const out: { active: Record<string, PersonaFact[]>; fading: PersonaFact[]; history: PersonaFact[] } = {
      active: {},
      fading: [],
      history: [],
    };
    for (const f of facts) {
      const status = f.metadata?.status || "active";
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
    out.history.sort((a, b) => (b.metadata?.retired_at || b.updated_at).localeCompare(a.metadata?.retired_at || a.updated_at));
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
      setCoreSaved(true);
      setTimeout(() => setCoreSaved(false), 1800);
    } catch (e: any) {
      setCoreError(e?.message || "Could not save");
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
    } catch (e: any) {
      setFactsError(e?.message || "Could not add fact");
    } finally {
      setAdding(false);
    }
  }

  function runBackfill() {
    if (!brainId || scanning) return;
    ops.startTask({ kind: "persona-scan", label: "Scanning entries for persona facts", resumeKey: brainId });
    // Poll every few seconds to refresh the visible facts as the scan runs.
    const poll = setInterval(() => { reloadFacts(); }, 3000);
    setTimeout(() => clearInterval(poll), 5 * 60_000);
  }

  function runReset() {
    if (!brainId || resetting) return;
    if (!window.confirm(
      "Undo the previous scan?\n\n" +
      "This restores entries that were wrongly converted into persona cards back to their best-guessed original type (todos return to schedule, events to calendar, etc.).\n\n" +
      "Manually-added facts and chat-tool facts are NOT touched.",
    )) return;
    ops.startTask({ kind: "persona-reset", label: "Reverting previous persona scan", resumeKey: brainId });
    // Quick reload after the one-shot completes (server-side is fast).
    setTimeout(() => { reloadFacts(); }, 1500);
  }

  function runWipe() {
    if (!brainId || wiping) return;
    if (!window.confirm(
      "Wipe every auto-extracted fact?\n\n" +
      "This deletes all the facts the scanner produced. Manually-added facts and facts you added via chat are kept.\n\n" +
      "After wiping, click Run scan again to re-extract with the latest prompt.",
    )) return;
    ops.startTask({ kind: "persona-wipe", label: "Wiping auto-extracted persona facts", resumeKey: brainId });
    setTimeout(() => { reloadFacts(); }, 1500);
  }

  async function patchFact(id: string, metaPatch: Record<string, unknown>) {
    if (!brainId) return;
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    const newMeta = { ...(f.metadata ?? {}), ...metaPatch };
    try {
      await authFetch("/api/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, changes: { metadata: newMeta } }),
      });
      await reloadFacts();
    } catch {
      /* swallow; reload will reflect server truth */
    }
  }

  async function retireFact(id: string) {
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    const reason = window.prompt(
      `Retire "${f.title}"?\n\nWhy doesn't this apply anymore? (becomes part of your history)`,
      "",
    );
    if (reason === null) return; // cancelled
    if (!brainId) return;
    try {
      // Server-side retire-with-history is in personaTools — call it via a
      // tiny wrapper that hits /api/entries with the retire intent. For the
      // settings UI we just patch metadata directly and the daily cron does
      // the right thing; the chat tool path is the magic version.
      const tags = Array.isArray(f.tags) ? f.tags : [];
      const newTags = tags.includes("history") ? tags : [...tags, "history"];
      await authFetch("/api/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          changes: {
            tags: newTags,
            metadata: {
              ...(f.metadata ?? {}),
              status: "archived",
              retired_at: new Date().toISOString(),
              retired_reason: reason || null,
            },
          },
        }),
      });
      await reloadFacts();
    } catch (e: any) {
      setFactsError(e?.message || "Could not retire");
    }
  }

  async function deleteFactCompletely(id: string) {
    const f = facts.find((x) => x.id === id);
    if (!f) return;
    if (!window.confirm(`Permanently delete "${f.title}"?\n\nThis removes it from history too.`)) return;
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
          onChange={(v) => { patchCore({ enabled: v }); }}
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
          <strong style={{ fontWeight: 600 }}>Never put ID numbers, passport, driver's licence, banking or medical details here.</strong>{" "}
          Those go in your encrypted{" "}
          <span style={{ color: "var(--ember)", fontWeight: 600 }}>Vault</span>. This profile is plaintext and is sent to the AI on every chat call.
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
          Anything else you want the assistant to keep in mind — your work, projects, where you live, things you care about.
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
        <SubHint>{core.context.length} / {CONTEXT_MAX}</SubHint>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={saveCore}
          disabled={coreSaving}
          className="press f-sans"
          style={{
            height: 36,
            padding: "0 18px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            background: "var(--ember)",
            color: "var(--ember-ink)",
            border: 0,
            cursor: coreSaving ? "not-allowed" : "pointer",
            opacity: coreSaving ? 0.6 : 1,
          }}
        >
          {coreSaving ? "Saving…" : "Save core"}
        </button>
        {coreSaved && <span className="f-serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--moss)" }}>saved.</span>}
        {coreError && <span className="f-serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--blood)" }}>{coreError}</span>}
      </div>

      {/* ── Living memory ─────────────────────────────────────────────────── */}
      <SectionTitle style={{ marginTop: 32 }}>Living memory</SectionTitle>
      <Hint>
        Facts your second brain has learned about you — from chat, captures, and imports. Each one is a real entry; pinned facts never decay.
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
            <p className="f-sans" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
              Undo previous scan
            </p>
            <p className="f-serif" style={{ margin: "2px 0 0", fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)", lineHeight: 1.45 }}>
              An earlier version of the scan converted whole entries into persona cards by mistake. Reset to put them back into Schedule, Calendar, etc., then run the new scan below.
            </p>
          </div>
          <button
            type="button"
            onClick={runReset}
            disabled={resetting || !brainId}
            className="press f-sans"
            style={{
              height: 34,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              background: "transparent",
              color: "var(--blood)",
              border: "1px solid color-mix(in oklch, var(--blood) 50%, var(--line-soft))",
              cursor: resetting ? "wait" : "pointer",
              opacity: resetting ? 0.6 : 1,
            }}
          >
            {resetting ? "Reverting…" : "Reset previous scan"}
          </button>
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
            <p className="f-sans" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
              Wipe extracted facts
            </p>
            <p className="f-serif" style={{ margin: "2px 0 0", fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)", lineHeight: 1.45 }}>
              Removes everything the scanner has produced so far. Your manually-added facts and chat-added facts stay. Use this before re-running the scan after a prompt update.
            </p>
          </div>
          <button
            type="button"
            onClick={runWipe}
            disabled={wiping || !brainId}
            className="press f-sans"
            style={{
              height: 34,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              background: "transparent",
              color: "var(--ink-faint)",
              border: "1px solid var(--line-soft)",
              cursor: wiping ? "wait" : "pointer",
              opacity: wiping ? 0.6 : 1,
            }}
          >
            {wiping ? "Wiping…" : "Wipe extracted facts"}
          </button>
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
          <p className="f-sans" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Scan existing entries
          </p>
          <p className="f-serif" style={{ margin: "2px 0 0", fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)", lineHeight: 1.45 }}>
            Look through every note in this brain and extract <em>short facts</em> about you. Each fact becomes its own small entry; your originals are never changed. Progress shows in the toast — safe to switch tabs or close the app.
          </p>
        </div>
        <button
          type="button"
          onClick={runBackfill}
          disabled={scanning || !brainId}
          className="press f-sans"
          style={{
            height: 34,
            padding: "0 14px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            background: "transparent",
            color: "var(--ember)",
            border: "1px solid color-mix(in oklch, var(--ember) 40%, var(--line-soft))",
            cursor: scanning ? "wait" : "pointer",
            opacity: scanning ? 0.6 : 1,
          }}
        >
          {scanning ? "Scanning…" : "Run scan"}
        </button>
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
        <select
          value={newFactBucket}
          onChange={(e) => setNewFactBucket(e.target.value as typeof BUCKET_ORDER[number])}
          style={{
            ...inputStyle(),
            width: 130,
            padding: "8px 10px",
          }}
        >
          {BUCKET_ORDER.map((b) => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}
        </select>
        <input
          type="text"
          value={newFactText}
          onChange={(e) => setNewFactText(e.target.value)}
          onKeyDown={handleAddKey}
          placeholder="A short fact about yourself, third person — e.g. 'Wakes at 5:30 every weekday'"
          maxLength={200}
          style={{ ...inputStyle(), flex: 1 }}
        />
        <button
          type="button"
          onClick={addFact}
          disabled={adding || !newFactText.trim() || !brainId}
          className="press f-sans"
          style={{
            height: 38,
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            background: "var(--ember)",
            color: "var(--ember-ink)",
            border: 0,
            cursor: adding ? "not-allowed" : "pointer",
            opacity: adding || !newFactText.trim() ? 0.5 : 1,
          }}
        >
          {adding ? "…" : "Add"}
        </button>
      </div>

      {factsError && (
        <p className="f-serif" style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginTop: 8 }}>
          {factsError}
        </p>
      )}

      {/* Active facts grouped by bucket */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
        {!factsLoaded && <Loading />}

        {factsLoaded && BUCKET_RENDER_ORDER.map((bucket) => {
          const items = grouped.active[bucket] || [];
          if (!items.length) return null;
          return (
            <div key={bucket}>
              <BucketHeader label={BUCKET_LABELS[bucket]} count={items.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {items.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    onPin={() => patchFact(f.id, { pinned: !f.metadata?.pinned })}
                    onRetire={() => retireFact(f.id)}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {factsLoaded && Object.keys(grouped.active).length === 0 && grouped.fading.length === 0 && grouped.history.length === 0 && (
          <p className="f-serif" style={{ fontStyle: "italic", color: "var(--ink-faint)", fontSize: 14, padding: "16px 0" }}>
            No facts yet. Add one above, or just have a chat — the assistant will start learning who you are.
          </p>
        )}

        {/* Fading */}
        {grouped.fading.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowFading((v) => !v)}
              className="f-sans"
              style={{
                background: "transparent", border: 0, padding: 0, cursor: "pointer",
                fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                color: "var(--ink-faint)",
              }}
            >
              {showFading ? "▾" : "▸"} Fading ({grouped.fading.length}) — not in chat preamble until reinforced
            </button>
            {showFading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {grouped.fading.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    onPin={() => patchFact(f.id, { pinned: true, status: "active", confidence: 1.0 })}
                    onRetire={() => retireFact(f.id)}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* History */}
        {grouped.history.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="f-sans"
              style={{
                background: "transparent", border: 0, padding: 0, cursor: "pointer",
                fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                color: "var(--ink-faint)",
              }}
            >
              {showHistory ? "▾" : "▸"} History ({grouped.history.length}) — life events archived
            </button>
            {showHistory && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {grouped.history.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    historyMode
                    onPin={() => {}}
                    onRetire={() => {}}
                    onDelete={() => deleteFactCompletely(f.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FactRow({
  fact,
  historyMode,
  onPin,
  onRetire,
  onDelete,
}: {
  fact: PersonaFact;
  historyMode?: boolean;
  onPin: () => void;
  onRetire: () => void;
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
          : "var(--surface)",
        border: pinned
          ? "1px solid color-mix(in oklch, var(--ember) 25%, var(--line-soft))"
          : "1px solid var(--line-soft)",
        borderRadius: 8,
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
          }}
        >
          {pinned && <span title="Pinned" style={{ marginRight: 6 }}>📌</span>}
          {fact.title}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <Badge>{SOURCE_LABELS[source] || source}</Badge>
          {confidence !== null && !historyMode && (
            <Badge muted>{Math.round(confidence * 100)}%</Badge>
          )}
          {historyMode && meta.retired_at && (
            <Badge muted>retired {new Date(meta.retired_at).toLocaleDateString("en-ZA")}</Badge>
          )}
          {historyMode && meta.retired_reason && (
            <span className="f-serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}>
              — {meta.retired_reason}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {!historyMode && (
          <>
            <IconBtn label={pinned ? "Unpin" : "Pin"} onClick={onPin}>
              {pinned ? "📍" : "📌"}
            </IconBtn>
            <IconBtn label="Retire to history" onClick={onRetire}>↩</IconBtn>
          </>
        )}
        <IconBtn label="Delete completely" onClick={onDelete} danger>×</IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        border: "1px solid var(--line-soft)",
        borderRadius: 6,
        background: "transparent",
        color: danger ? "var(--blood)" : "var(--ink-faint)",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className="f-sans"
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 999,
        background: muted ? "var(--surface-low)" : "var(--ember-wash)",
        color: muted ? "var(--ink-faint)" : "var(--ember)",
        border: muted ? "1px solid var(--line-soft)" : "1px solid color-mix(in oklch, var(--ember) 24%, transparent)",
      }}
    >
      {children}
    </span>
  );
}

function BucketHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <h3
        className="f-serif"
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 500,
          color: "var(--ink)",
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </h3>
      <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
        {count}
      </span>
    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2
      className="f-serif"
      style={{
        margin: 0,
        marginBottom: 6,
        fontSize: 18,
        fontWeight: 500,
        color: "var(--ink)",
        letterSpacing: "-0.005em",
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="f-sans"
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
      }}
    >
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="f-serif"
      style={{
        margin: "4px 0 0",
        fontSize: 13,
        fontStyle: "italic",
        color: "var(--ink-faint)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

function SubHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="f-sans" style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-ghost)", textAlign: "right" }}>
      {children}
    </p>
  );
}

function Loading() {
  return (
    <p className="f-serif" style={{ fontStyle: "italic", color: "var(--ink-faint)", padding: "16px 0", margin: 0 }}>
      Loading…
    </p>
  );
}
