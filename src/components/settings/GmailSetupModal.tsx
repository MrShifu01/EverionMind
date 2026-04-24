import { useState } from "react";

interface GmailPreferences {
  categories: string[];
  custom: string;
  lookbackDays?: 1 | 7 | 30;
}

interface Category {
  id: string;
  label: string;
  hint: string;
  priority: "high" | "medium";
}

const CATEGORIES: Category[] = [
  {
    id: "invoices",
    label: "Invoices & bills",
    hint: "payment requests, amounts due, billing statements",
    priority: "high",
  },
  {
    id: "action-required",
    label: "Action-required emails",
    hint: "approve, sign, respond, submit by a deadline",
    priority: "high",
  },
  {
    id: "subscription-renewal",
    label: "Subscription renewals & trial endings",
    hint: "renewal notices, trial expiry, subscription changes",
    priority: "high",
  },
  {
    id: "appointment",
    label: "Booking & appointment confirmations",
    hint: "travel, medical, restaurant, events, services",
    priority: "high",
  },
  {
    id: "deadline",
    label: "Deadlines mentioned in emails",
    hint: "any cutoff date or time-sensitive request",
    priority: "high",
  },
  {
    id: "delivery",
    label: "Delivery & collection notices",
    hint: "package tracking, ready-for-collection alerts",
    priority: "medium",
  },
  {
    id: "signing-requests",
    label: "Contract & document signing",
    hint: "DocuSign, HelloSign, Adobe Sign, e-signature requests",
    priority: "medium",
  },
];

const DEFAULT_CATEGORIES = CATEGORIES.filter((c) => c.priority === "high").map((c) => c.id);

interface Props {
  mode: "connect" | "edit";
  initialPreferences?: GmailPreferences;
  onClose: () => void;
  onConnect?: (preferences: GmailPreferences) => void;
  onSave?: (preferences: GmailPreferences) => Promise<void>;
}

export default function GmailSetupModal({
  mode,
  initialPreferences,
  onClose,
  onConnect,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<string[]>(
    initialPreferences?.categories ?? DEFAULT_CATEGORIES,
  );
  const [custom, setCustom] = useState(initialPreferences?.custom ?? "");
  const [lookbackDays, setLookbackDays] = useState<1 | 7 | 30>(
    initialPreferences?.lookbackDays ?? 7,
  );
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    const prefs: GmailPreferences = { categories: selected, custom: custom.trim(), lookbackDays };
    if (mode === "connect") {
      onConnect?.(prefs);
    } else {
      setSaving(true);
      await onSave?.(prefs);
      setSaving(false);
      onClose();
    }
  }

  const highCats = CATEGORIES.filter((c) => c.priority === "high");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center"
      style={{ background: "rgba(0,0,0,0.45)", paddingTop: 16 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "connect" ? "Connect Gmail" : "Edit Gmail preferences"}
        style={{
          width: "calc(100% - 32px)",
          maxWidth: 480,
          height: "calc(100dvh - 128px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          border: "1px solid var(--line-soft)",
          borderRadius: 20,
          padding: "20px 20px 16px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <GmailIcon />
            <h3
              className="f-serif"
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 450,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              {mode === "connect" ? "Connect Gmail" : "Email preferences"}
            </h3>
          </div>
        </div>

        {/* Categories */}
        <div style={{ marginBottom: 8 }}>
          {highCats.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              checked={selected.includes(cat.id)}
              onToggle={toggle}
            />
          ))}
        </div>

        {/* Custom input */}
        <div style={{ marginBottom: 8 }}>
          <label
            htmlFor="gmail-custom"
            className="f-sans"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ink-soft)",
              marginBottom: 6,
            }}
          >
            Other — describe anything else to look for
          </label>
          <textarea
            id="gmail-custom"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. emails from my accountant mentioning VAT, warranty expiry notices…"
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--line-soft)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontFamily: "var(--f-sans)",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
              outline: "none",
            }}
          />
        </div>

        {/* Look-back period */}
        <div style={{ marginBottom: 8 }}>
          <div
            className="f-sans"
            style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 8 }}
          >
            Manual scan look-back window
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([1, 7, 30] as const).map((d) => {
              const label = d === 1 ? "1 day" : d === 7 ? "1 week" : "1 month";
              const active = lookbackDays === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setLookbackDays(d)}
                  className="press f-sans"
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: 8,
                    border: `1px solid ${active ? "var(--ember)" : "var(--line-soft)"}`,
                    background: active ? "var(--ember-wash)" : "var(--surface)",
                    color: active ? "var(--ember)" : "var(--ink-soft)",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    transition: "background 150ms, border-color 150ms, color 150ms",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            className="press f-sans"
            style={{
              flex: 1,
              height: 40,
              borderRadius: 10,
              border: "1px solid var(--line-soft)",
              background: "var(--surface)",
              color: "var(--ink-soft)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="press f-sans"
            style={{
              flex: 2,
              height: 40,
              borderRadius: 10,
              border: "none",
              background: "var(--ember)",
              color: "var(--ember-ink)",
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "background 180ms",
            }}
          >
            {saving ? "Saving…" : mode === "connect" ? "Connect Gmail" : "Save preferences"}
          </button>
        </div>

        {mode === "connect" && (
          <p
            className="f-sans"
            style={{
              margin: "14px 0 0",
              fontSize: 12,
              color: "var(--ink-faint)",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            You'll be redirected to Google to grant read-only inbox access. Everion never stores
            email content — only extracted summaries.
          </p>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  cat,
  checked,
  onToggle,
}: {
  cat: Category;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "6px 0",
        borderBottom: "1px solid var(--line-soft)",
        cursor: "pointer",
      }}
    >
      <div style={{ paddingTop: 2, flexShrink: 0, alignSelf: "flex-start", lineHeight: 0 }}>
        <Checkbox checked={checked} onChange={() => onToggle(cat.id)} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="f-serif"
          style={{ fontSize: 15, fontWeight: 450, color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          {cat.label}
        </div>
      </div>
    </label>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 20,
        height: 20,
        minWidth: 20,
        minHeight: 20,
        maxHeight: 20,
        borderRadius: "50%",
        border: `2px solid ${checked ? "var(--ember)" : "var(--line-soft)"}`,
        background: checked ? "var(--ember)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
        transition: "background 150ms, border-color 150ms",
        flexShrink: 0,
        padding: 0,
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        boxSizing: "content-box",
      }}
    >
      {checked && (
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path
            d="M1 4.5L4 7.5L10 1"
            stroke="var(--ember-ink)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function GmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6Z"
        fill="#EA4335"
        fillOpacity="0.15"
        stroke="#EA4335"
        strokeWidth="1.5"
      />
      <path d="M2 6L12 13L22 6" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
