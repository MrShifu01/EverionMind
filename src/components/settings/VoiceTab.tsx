import { useEffect, useRef, useState } from "react";
import SettingsRow, { SettingsToggle } from "./SettingsRow";
import {
  useVoiceMode,
  useGeminiLive,
  useGeminiVoice,
  GEMINI_VOICES,
  type GeminiVoice,
} from "../../hooks/useVoiceMode";

export default function VoiceTab() {
  const [mode, setMode] = useVoiceMode();
  const [liveOn, setLiveOn] = useGeminiLive();
  const [voice, setVoice] = useGeminiVoice();
  const isAuto = mode === "auto";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SettingsRow
        label="Auto-save voice captures"
        hint="When on, holding the home orb records, transcribes, and saves straight to your brain — no review modal. When off, voice opens the capture sheet for review first."
      >
        <SettingsToggle
          value={isAuto}
          onChange={(v) => setMode(v ? "auto" : "preview")}
          ariaLabel="Auto-save voice captures"
        />
      </SettingsRow>

      <SettingsRow
        label="Gemini Live voice"
        hint={
          <>
            Use Gemini 3.1 Flash Live for ultra-low-latency spoken replies. Requires{" "}
            <code
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                background: "var(--surface-low)",
                padding: "1px 6px",
                borderRadius: 4,
                color: "var(--ember)",
              }}
            >
              GEMINI_LIVE_MODEL
            </code>{" "}
            env var on the server (e.g. <em>gemini-3.1-flash-live-preview</em>).
          </>
        }
        last={!liveOn}
      >
        <SettingsToggle value={liveOn} onChange={setLiveOn} ariaLabel="Enable Gemini Live voice" />
      </SettingsRow>

      {liveOn && (
        <SettingsRow
          label="Voice"
          hint="Pick the Gemini voice for spoken replies. Each voice has a distinct timbre."
          last
        >
          <VoicePicker value={voice} onChange={setVoice} />
        </SettingsRow>
      )}
    </div>
  );
}

function VoicePicker({
  value,
  onChange,
}: {
  value: GeminiVoice;
  onChange: (v: GeminiVoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const current = GEMINI_VOICES.find((v) => v.id === value) ?? GEMINI_VOICES[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Voice: ${current.id}`}
        onClick={() => setOpen((v) => !v)}
        className="press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 32,
          padding: "0 12px",
          borderRadius: 999,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          color: "var(--ink)",
          fontFamily: "var(--f-sans)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <span style={{ color: "var(--ember)", fontWeight: 600 }}>{current.id}</span>
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          style={{ opacity: 0.55 }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            boxShadow: "var(--lift-2)",
            zIndex: 60,
            padding: "4px 0",
          }}
        >
          {GEMINI_VOICES.map((v) => {
            const selected = v.id === value;
            return (
              <button
                key={v.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
                className="press"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  width: "100%",
                  padding: "8px 14px",
                  background: selected ? "var(--ember-wash)" : "transparent",
                  border: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "var(--f-sans)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? 600 : 500,
                      color: selected ? "var(--ember)" : "var(--ink)",
                    }}
                  >
                    {v.id}
                  </span>
                  <span
                    className="f-serif"
                    style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "var(--ink-faint)",
                      marginTop: 1,
                    }}
                  >
                    {v.tag}
                  </span>
                </span>
                {selected && (
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="var(--ember)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
