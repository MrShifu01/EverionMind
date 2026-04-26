import { IconArrowLeft } from "./captureIcons";

export interface SecretForm {
  title: string;
  content: string;
}

interface Props {
  form: SecretForm;
  onFormChange: (next: SecretForm) => void;
  saving: boolean;
  error: string;
  onBack: () => void;
  onSave: () => void;
}

export default function CaptureSecretPanel({
  form,
  onFormChange,
  saving,
  error,
  onBack,
  onSave,
}: Props) {
  return (
    <div
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflowY: "auto",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="f-serif"
            style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", margin: 0 }}
          >
            secret
          </h2>
          <p
            className="f-serif"
            style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ember)",
              margin: "4px 0 0",
            }}
          >
            encrypted on your device. AI never reads this.
          </p>
        </div>
        <button
          className="design-btn-ghost press"
          onClick={onBack}
          style={{ width: 32, height: 32, minHeight: 32, padding: 0 }}
          aria-label="Back to entry"
        >
          {IconArrowLeft}
        </button>
      </div>

      <div>
        <div className="micro" style={{ marginBottom: 6 }}>
          Label
        </div>
        <input
          value={form.title}
          onChange={(e) => onFormChange({ ...form, title: e.target.value })}
          placeholder="e.g. netflix password, visa card, ssh key"
          className="design-input f-serif"
          style={{ fontStyle: form.title ? "normal" : "italic", fontSize: 16 }}
        />
      </div>
      <div>
        <div className="micro" style={{ marginBottom: 6 }}>
          Secret
        </div>
        <textarea
          value={form.content}
          onChange={(e) => onFormChange({ ...form, content: e.target.value })}
          placeholder="paste or type your password, pin, key, card details…"
          rows={5}
          className="design-input f-serif"
          style={{
            resize: "none",
            padding: "12px 14px",
            height: "auto",
            fontSize: 16,
            lineHeight: 1.5,
          }}
        />
      </div>
      {error && (
        <p
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 12,
            color: "var(--blood)",
            wordBreak: "break-all",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          gap: 10,
          paddingTop: 12,
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <button
          onClick={onBack}
          className="design-btn-secondary press"
          style={{ flex: 1 }}
        >
          Back
        </button>
        <button
          disabled={!form.title.trim() || !form.content.trim() || saving}
          onClick={onSave}
          className="design-btn-primary press"
          style={{ flex: 2 }}
        >
          {saving ? "Saving…" : "Save to vault"}
        </button>
      </div>
    </div>
  );
}
