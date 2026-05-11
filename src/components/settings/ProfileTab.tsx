// ─────────────────────────────────────────────────────────────────────────────
// ProfileTab — slimmed 2026-05-11.
//
// The Settings/Persona panel now keeps only the core "About you" fields:
//   - master toggle (personalise chat)
//   - preferred name, full name, pronouns
//   - free-form context
//   - save button
//
// The previous facts-management UI (Reset / Audit / Wipe / Manual-add /
// grouped active facts / Fading / History / Not-me) lived inside Settings
// and made the panel one of the worst-feeling surfaces in the app per the
// Settings audit. Persona facts are real entries (type='persona') — users
// manage them in the Memory view where every other entry type lives.
// Settings/Persona shows the count + a "Manage in Memory" link, and that's
// it. Bulk re-scan / wipe / audit are operator-tier actions that belong on
// the Admin surface.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import SettingsRow, { SettingsButton, SettingsToggle } from "./SettingsRow";
import { Field, Label, Hint, SubHint, Loading } from "./ProfileTab.bits";
import { Button } from "../ui/button";
import { authFetch } from "../../lib/authFetch";
import { useBrain } from "../../context/BrainContext";
import { useCachedQuery, invalidateCachedQuery } from "../../lib/useCachedQuery";

interface ProfileFields {
  full_name: string;
  preferred_name: string;
  pronouns: string;
  context: string;
  enabled: boolean;
}

const EMPTY_CORE: ProfileFields = {
  full_name: "",
  preferred_name: "",
  pronouns: "",
  context: "",
  enabled: true,
};

const CONTEXT_MAX = 4000;

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

interface ProfileTabProps {
  onNavigate?: (id: string) => void;
}

export default function ProfileTab({ onNavigate }: ProfileTabProps = {}) {
  const brainCtx = useBrain();
  const brainId = brainCtx?.activeBrain?.id;

  const [core, setCore] = useState<ProfileFields>(EMPTY_CORE);
  const [coreLoaded, setCoreLoaded] = useState(false);
  const [coreSaving, setCoreSaving] = useState(false);
  const [coreSaved, setCoreSaved] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [factCount, setFactCount] = useState<number | null>(null);

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

  // Persona fact count — read-only display for the "Manage in Memory" row.
  // Cheap: a single fetch on tab visit, no cache-bust. Stale-by-design;
  // Memory itself shows the canonical list.
  useEffect(() => {
    if (!brainId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch(
          `/api/entries?brain_id=${encodeURIComponent(brainId)}&type=persona`,
        );
        if (!r?.ok) return;
        const data = await r.json();
        const rows = Array.isArray(data) ? data : (data.entries ?? []);
        if (!cancelled) {
          const active = rows.filter((f: { metadata?: { status?: string } | null }) => {
            const status = f.metadata?.status;
            return !status || status === "active" || status === "fading";
          });
          setFactCount(active.length);
        }
      } catch {
        // ignore — count is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brainId]);

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
      invalidateCachedQuery("profile:core");
      setCoreSaved(true);
      setTimeout(() => setCoreSaved(false), 1800);
    } catch (e) {
      setCoreError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setCoreSaving(false);
    }
  }

  if (!coreLoaded) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SettingsRow
        label="Personalise chat with this profile"
        hint="When on, the assistant sees a short ‘about you’ summary on every chat call. Turn off if you want the assistant to forget who you are."
      >
        <SettingsToggle
          value={core.enabled}
          onChange={(v) => patchCore({ enabled: v })}
          ariaLabel="Personalisation toggle"
        />
      </SettingsRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
        <Field label="Preferred name">
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
          placeholder="e.g. I run Smash Burger Bar in Pretoria. I'm building Everion Mind as a personal second-brain. I prefer concise, direct answers."
          onChange={(e) => patchCore({ context: e.target.value })}
          style={{
            ...inputStyle(),
            resize: "vertical",
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
          {coreSaving ? "Saving…" : "Save"}
        </Button>
        {coreSaved && (
          <span className="f-sans" style={{ fontSize: 13, color: "var(--moss)" }}>
            saved.
          </span>
        )}
        {coreError && (
          <span className="f-sans" style={{ fontSize: 13, color: "var(--blood)" }}>
            {coreError}
          </span>
        )}
      </div>

      {/* Persona memory link — replaces the previous in-Settings facts UI.
          Facts are entries (type='persona'); users manage them in Memory
          where every other entry type already lives. */}
      <div style={{ marginTop: 24 }}>
        <SettingsRow
          label="Persona memory"
          hint={
            factCount === null
              ? "facts the assistant has learned about you. Open Memory to review them."
              : factCount === 0
                ? "no facts yet — capture or chat will start filling this in."
                : `${factCount} ${factCount === 1 ? "fact" : "facts"} the assistant has learned about you. Open Memory to review them.`
          }
          last
        >
          {onNavigate && (
            <SettingsButton onClick={() => onNavigate("memory")}>Open Memory</SettingsButton>
          )}
        </SettingsRow>
      </div>
    </div>
  );
}
