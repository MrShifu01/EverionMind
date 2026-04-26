import { useEffect, useRef, useState } from "react";
import { CANONICAL_TYPES } from "../types";
import { IconArrowLeft } from "./captureIcons";

export interface PreviewState {
  title: string;
  tags: string;
  type: string;
}

interface Props {
  preview: PreviewState;
  onPreviewChange: (next: PreviewState) => void;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
  errorDetail: string | null;
}

export default function CapturePreviewPanel({
  preview,
  onPreviewChange,
  onBack,
  onConfirm,
  loading,
  errorDetail,
}: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);
  const [typeOpen, setTypeOpen] = useState(false);

  // Focus title on mount
  useEffect(() => {
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, []);

  // Close type dropdown on outside click
  useEffect(() => {
    if (!typeOpen) return;
    function handleClick(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeOpen]);

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
        <h2
          className="f-serif"
          style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", margin: 0 }}
        >
          before saving
        </h2>
        <button
          className="design-btn-ghost press"
          onClick={onBack}
          aria-label="Back"
          style={{ width: 32, height: 32, minHeight: 32, padding: 0 }}
        >
          {IconArrowLeft}
        </button>
      </div>

      {errorDetail && (
        <p
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 12,
            color: "var(--blood)",
            wordBreak: "break-all",
            margin: 0,
          }}
        >
          {errorDetail}
        </p>
      )}

      <div>
        <div className="micro" style={{ marginBottom: 6 }}>
          Title
        </div>
        <input
          ref={titleInputRef}
          value={preview.title}
          onChange={(e) => onPreviewChange({ ...preview, title: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onConfirm();
          }}
          className="design-input f-serif"
          style={{ fontSize: 16 }}
        />
      </div>

      <div ref={typeRef} style={{ position: "relative" }}>
        <div className="micro" style={{ marginBottom: 6 }}>
          Type
        </div>
        <button
          type="button"
          onClick={() => setTypeOpen((p) => !p)}
          className="design-input f-sans"
          style={{
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <span>{preview.type.charAt(0).toUpperCase() + preview.type.slice(1)}</span>
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            style={{
              flexShrink: 0,
              transform: typeOpen ? "rotate(180deg)" : "none",
              transition: "transform 180ms",
            }}
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {typeOpen && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "100%",
              zIndex: 20,
              marginBottom: 4,
              background: "var(--surface-high)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              boxShadow: "var(--lift-2)",
              overflow: "hidden",
            }}
          >
            {CANONICAL_TYPES.filter((t) => t !== "secret").map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onPreviewChange({ ...preview, type: t });
                  setTypeOpen(false);
                }}
                className="f-sans press"
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  minHeight: 36,
                  fontSize: 14,
                  color: "var(--ink)",
                  background: preview.type === t ? "var(--ember-wash)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="micro" style={{ marginBottom: 6 }}>
          Tags
        </div>
        <input
          value={preview.tags}
          onChange={(e) => onPreviewChange({ ...preview, tags: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onConfirm();
          }}
          placeholder="tag1, tag2"
          className="design-input f-sans"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 4,
          paddingTop: 12,
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <button
          className="design-btn-secondary press"
          onClick={onBack}
          style={{ flex: 1 }}
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={!preview.title.trim() || loading}
          className="design-btn-primary press"
          style={{ flex: 2 }}
        >
          {loading ? "Saving…" : preview.type === "secret" ? "Save to vault" : "Save"}
        </button>
      </div>
    </div>
  );
}
