// ─────────────────────────────────────────────────────────────────────────────
// ProfileTab — "About you"
//
// Lets the user write the personal-context block that gets injected into every
// chat call. Distinct from AccountTab's profile (display_name/phone/address) —
// this one is about who you are, not how to bill or contact you.
//
// Sensitive identifiers (ID, passport, driver's licence, banking, medical aid)
// are NOT stored here. They live in the encrypted Vault. The form copy makes
// this explicit.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import SettingsRow, { SettingsToggle } from "./SettingsRow";
import { authFetch } from "../../lib/authFetch";

interface FamilyMember {
  relation: string | null;
  name: string | null;
  notes: string | null;
}

interface ProfileFields {
  full_name: string;
  preferred_name: string;
  pronouns: string;
  family: FamilyMember[];
  habits: string[];
  context: string;
  enabled: boolean;
}

const EMPTY: ProfileFields = {
  full_name: "",
  preferred_name: "",
  pronouns: "",
  family: [],
  habits: [],
  context: "",
  enabled: true,
};

const CONTEXT_MAX = 4000;
const HABITS_MAX = 12;
const FAMILY_MAX = 10;

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

function chipStyle(active = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "0 10px",
    fontFamily: "var(--f-sans)",
    fontSize: 12,
    fontWeight: 500,
    color: active ? "var(--ember)" : "var(--ink)",
    background: active ? "var(--ember-wash)" : "var(--surface)",
    border: `1px solid ${active ? "color-mix(in oklch, var(--ember) 30%, transparent)" : "var(--line-soft)"}`,
    borderRadius: 999,
    cursor: "default",
  };
}

function buildPreview(p: ProfileFields): string {
  if (!p.enabled) return "Personalisation is off — chat will not see this profile.";
  const lines: string[] = [];
  const preferred = p.preferred_name.trim();
  const full = p.full_name.trim();
  if (preferred && full && preferred.toLowerCase() !== full.toLowerCase()) {
    lines.push(`Name: ${preferred} (full name: ${full})`);
  } else if (preferred || full) {
    lines.push(`Name: ${preferred || full}`);
  }
  if (p.pronouns.trim()) lines.push(`Pronouns: ${p.pronouns.trim()}`);
  const fam = p.family
    .map((f) => {
      const rel = (f.relation || "").trim();
      const name = (f.name || "").trim();
      const notes = (f.notes || "").trim();
      if (!rel && !name) return "";
      const head = rel && name ? `${rel}: ${name}` : rel || name;
      return notes ? `${head} (${notes})` : head;
    })
    .filter(Boolean);
  if (fam.length) lines.push(`Family: ${fam.join("; ")}`);
  if (p.habits.length) lines.push(`Habits: ${p.habits.join("; ")}`);
  if (p.context.trim()) lines.push(`Context: ${p.context.trim()}`);
  return lines.length
    ? `--- ABOUT THE USER ---\n${lines.join("\n")}\n--- END ---`
    : "Empty — chat will not see anything yet.";
}

export default function ProfileTab() {
  const [fields, setFields] = useState<ProfileFields>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [habitDraft, setHabitDraft] = useState("");

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
          setFields({
            full_name: p.full_name || "",
            preferred_name: p.preferred_name || "",
            pronouns: p.pronouns || "",
            family: Array.isArray(p.family) ? p.family : [],
            habits: Array.isArray(p.habits) ? p.habits : [],
            context: p.context || "",
            enabled: p.enabled !== false,
          });
        }
      } catch {
        // Empty profile is fine — keep defaults.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => buildPreview(fields), [fields]);

  function patch(p: Partial<ProfileFields>) {
    setFields((prev) => ({ ...prev, ...p }));
    setSavedFlash(false);
  }

  function addHabit(raw: string) {
    const v = raw.trim();
    if (!v) return;
    setFields((prev) => {
      if (prev.habits.includes(v) || prev.habits.length >= HABITS_MAX) return prev;
      return { ...prev, habits: [...prev.habits, v.slice(0, 120)] };
    });
    setHabitDraft("");
    setSavedFlash(false);
  }

  function removeHabit(idx: number) {
    setFields((prev) => ({ ...prev, habits: prev.habits.filter((_, i) => i !== idx) }));
    setSavedFlash(false);
  }

  function addFamily() {
    setFields((prev) =>
      prev.family.length >= FAMILY_MAX
        ? prev
        : { ...prev, family: [...prev.family, { relation: "", name: "", notes: "" }] },
    );
    setSavedFlash(false);
  }

  function patchFamily(i: number, patch: Partial<FamilyMember>) {
    setFields((prev) => ({
      ...prev,
      family: prev.family.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }));
    setSavedFlash(false);
  }

  function removeFamily(i: number) {
    setFields((prev) => ({ ...prev, family: prev.family.filter((_, idx) => idx !== i) }));
    setSavedFlash(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await authFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!r?.ok) {
        const data = await r?.json().catch(() => ({}));
        throw new Error(data?.error || "save_failed");
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e: any) {
      setError(e?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  function handleHabitKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addHabit(habitDraft);
    } else if (e.key === "Backspace" && !habitDraft && fields.habits.length) {
      removeHabit(fields.habits.length - 1);
    }
  }

  if (loading) {
    return (
      <p
        className="f-serif"
        style={{
          fontStyle: "italic",
          color: "var(--ink-faint)",
          padding: "32px 0",
          margin: 0,
        }}
      >
        Loading…
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Personalisation toggle */}
      <SettingsRow
        label="Personalise chat with this profile"
        hint="When on, the assistant sees a short ‘about you’ summary on every chat call. Turn off if you want the assistant to forget who you are."
      >
        <SettingsToggle
          value={fields.enabled}
          onChange={(v) => patch({ enabled: v })}
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
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--ink)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ fontWeight: 600 }}>Never put ID numbers, passport, driver's licence, banking or medical details here.</strong>{" "}
          Those go in your encrypted{" "}
          <span style={{ color: "var(--ember)", fontWeight: 600 }}>Vault</span>. This profile is plaintext and is sent to the AI on every chat call.
        </p>
      </div>

      {/* Names */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Field label="Preferred name / nickname">
          <input
            type="text"
            value={fields.preferred_name}
            maxLength={60}
            placeholder="e.g. Chris"
            onChange={(e) => patch({ preferred_name: e.target.value })}
            style={inputStyle()}
          />
        </Field>
        <Field label="Full name">
          <input
            type="text"
            value={fields.full_name}
            maxLength={120}
            placeholder="e.g. Christian Stander"
            onChange={(e) => patch({ full_name: e.target.value })}
            style={inputStyle()}
          />
        </Field>
      </div>

      <Field label="Pronouns">
        <input
          type="text"
          value={fields.pronouns}
          maxLength={40}
          placeholder="e.g. he/him"
          onChange={(e) => patch({ pronouns: e.target.value })}
          style={{ ...inputStyle(), maxWidth: 240 }}
        />
      </Field>

      {/* Habits */}
      <div style={{ marginTop: 22 }}>
        <Label>Habits & preferences</Label>
        <Hint>
          Short, factual notes the assistant should hold in mind — wake-up time, dietary rules, recurring routines, things to avoid mentioning.
        </Hint>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: 8,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            minHeight: 48,
          }}
        >
          {fields.habits.map((h, i) => (
            <span key={`${h}-${i}`} style={chipStyle(true)}>
              {h}
              <button
                type="button"
                onClick={() => removeHabit(i)}
                aria-label={`Remove ${h}`}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--ember)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                  marginLeft: 2,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={habitDraft}
            onChange={(e) => setHabitDraft(e.target.value)}
            onKeyDown={handleHabitKey}
            placeholder={fields.habits.length === 0 ? "Type a habit and press Enter" : "+ add"}
            disabled={fields.habits.length >= HABITS_MAX}
            style={{
              flex: 1,
              minWidth: 140,
              background: "transparent",
              border: 0,
              outline: "none",
              fontFamily: "var(--f-sans)",
              fontSize: 13,
              color: "var(--ink)",
            }}
          />
        </div>
        <SubHint>
          {fields.habits.length} / {HABITS_MAX}
        </SubHint>
      </div>

      {/* Family */}
      <div style={{ marginTop: 22 }}>
        <Label>Family & close people</Label>
        <Hint>
          Who matters most. The assistant will use names and relationships in conversation, never identifiers.
        </Hint>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {fields.family.map((f, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 1fr 32px",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={f.relation || ""}
                maxLength={40}
                placeholder="Relation"
                onChange={(e) => patchFamily(i, { relation: e.target.value })}
                style={inputStyle()}
              />
              <input
                type="text"
                value={f.name || ""}
                maxLength={80}
                placeholder="Name"
                onChange={(e) => patchFamily(i, { name: e.target.value })}
                style={inputStyle()}
              />
              <input
                type="text"
                value={f.notes || ""}
                maxLength={120}
                placeholder="Notes (optional)"
                onChange={(e) => patchFamily(i, { notes: e.target.value })}
                style={inputStyle()}
              />
              <button
                type="button"
                onClick={() => removeFamily(i)}
                aria-label="Remove person"
                style={{
                  width: 32,
                  height: 32,
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--ink-faint)",
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFamily}
            disabled={fields.family.length >= FAMILY_MAX}
            className="press f-sans"
            style={{
              alignSelf: "flex-start",
              height: 32,
              padding: "0 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              cursor: fields.family.length >= FAMILY_MAX ? "not-allowed" : "pointer",
              opacity: fields.family.length >= FAMILY_MAX ? 0.5 : 1,
            }}
          >
            + Add person
          </button>
        </div>
      </div>

      {/* Context */}
      <div style={{ marginTop: 22 }}>
        <Label>About you</Label>
        <Hint>
          Free-form prose. Anything you want the assistant to keep in mind — your work, projects, where you live, things you care about.
        </Hint>
        <textarea
          value={fields.context}
          maxLength={CONTEXT_MAX}
          rows={6}
          placeholder="e.g. I run Smash Burger Bar in Pretoria. Building EverionMind as a personal second-brain. I wake at 5:30 and prefer concise, direct answers."
          onChange={(e) => patch({ context: e.target.value })}
          style={{
            ...inputStyle(),
            resize: "vertical",
            fontFamily: "var(--f-serif)",
            lineHeight: 1.5,
            marginTop: 8,
          }}
        />
        <SubHint>
          {fields.context.length} / {CONTEXT_MAX}
        </SubHint>
      </div>

      {/* Live preview of injected block */}
      <div style={{ marginTop: 22 }}>
        <Label>Preview — what the assistant sees</Label>
        <Hint>
          This block is prepended to the system message on every chat call. Prompt caching makes it effectively free after the first call.
        </Hint>
        <pre
          className="f-sans"
          style={{
            marginTop: 8,
            padding: 14,
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--ink-soft)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {preview}
        </pre>
      </div>

      {/* Save bar */}
      <div
        style={{
          marginTop: 22,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving}
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
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {savedFlash && (
          <span
            className="f-serif"
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--moss)",
            }}
          >
            saved.
          </span>
        )}
        {error && (
          <span
            className="f-serif"
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--blood)",
            }}
          >
            {error}
          </span>
        )}
      </div>
    </div>
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
    <p
      className="f-sans"
      style={{
        margin: "6px 0 0",
        fontSize: 11,
        color: "var(--ink-ghost)",
        textAlign: "right",
      }}
    >
      {children}
    </p>
  );
}
