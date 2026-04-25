import { useRef } from "react";
import {
  IconMic,
  IconAttach,
  IconVault,
  IconSend,
  IconX,
  IconCamera,
  VoiceWaveform,
} from "./captureIcons";

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

export interface UploadedFile {
  name: string;
}

export interface EntryStatusInfo {
  status: string | null;
  errorDetail: string | null;
  fileParseError: string | null;
  statusLabel: Record<string, string>;
}

export interface EntryActionHandlers {
  onSave: () => void;
  onStartVoice: () => void;
  onToggleVault: () => void;
  onRemoveFile: (name: string) => void;
  onAttachFiles: (files: File[]) => void;
  onImageFile: (file: File) => void;
  onRetryFile: () => void;
  onManualFill: () => void;
}

interface Props {
  text: string;
  onTextChange: (v: string) => void;
  uploadedFiles: UploadedFile[];
  listening: boolean;
  loading: boolean;
  showSavedWhisper: boolean;
  canSave: boolean;
  cryptoKey: CryptoKey | null | undefined;
  activeTab: "entry" | "secret";
  statusInfo: EntryStatusInfo;
  handlers: EntryActionHandlers;
}

export default function CaptureEntryBody({
  text,
  onTextChange,
  uploadedFiles,
  listening,
  loading,
  showSavedWhisper,
  canSave,
  cryptoKey,
  activeTab,
  statusInfo,
  handlers,
}: Props) {
  const imgRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const { status, errorDetail, fileParseError, statusLabel } = statusInfo;

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={imgRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          handlers.onImageFile(f);
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          handlers.onImageFile(f);
        }}
      />
      <input
        ref={docRef}
        type="file"
        accept="image/*,.pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.json"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          handlers.onAttachFiles(files);
        }}
      />

      {/* Textarea area */}
      <div
        style={{
          padding: "22px 24px 10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 160,
          position: "relative",
        }}
      >
        <textarea
          // Auto-focus on mount so desktop users can type the moment the
          // capture sheet opens, no extra click required. Mobile keyboards
          // also pop up automatically — same UX both places.
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSave && !loading) handlers.onSave();
          }}
          disabled={loading}
          placeholder={
            listening
              ? "listening… tap stop when done"
              : uploadedFiles.length > 0
                ? "optional: describe what this is…"
                : "remember something…"
          }
          rows={5}
          className="f-serif"
          style={{
            width: "100%",
            minHeight: 120,
            flex: 1,
            resize: "none",
            fontSize: 19,
            lineHeight: 1.55,
            color: "var(--ink)",
            fontStyle: text ? "normal" : "italic",
            background: "transparent",
            border: 0,
            outline: 0,
            padding: 0,
          }}
        />

        {uploadedFiles.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {uploadedFiles.map((f) => (
              <span key={f.name} className="design-chip">
                <span
                  style={{
                    maxWidth: 140,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {f.name}
                </span>
                <button
                  onClick={() => handlers.onRemoveFile(f.name)}
                  aria-label={`Remove ${f.name}`}
                  style={{
                    marginLeft: 2,
                    padding: 0,
                    minHeight: 16,
                    background: "transparent",
                    color: "var(--ink-faint)",
                    border: 0,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {IconX}
                </button>
              </span>
            ))}
          </div>
        )}

        {listening && <VoiceWaveform />}

        {showSavedWhisper && (
          <div
            className="anim-fade-in-design"
            style={{
              position: "absolute",
              bottom: 12,
              left: 24,
              pointerEvents: "none",
            }}
          >
            <span
              className="f-serif"
              style={{
                fontStyle: "italic",
                fontSize: 15,
                color: "var(--ink-faint)",
              }}
            >
              saved.
            </span>
          </div>
        )}
      </div>

      {/* Status line */}
      {(status || errorDetail) && (
        <div style={{ padding: "0 24px 10px" }}>
          {status && status !== "error" && (
            <p
              className="f-serif"
              style={{
                margin: 0,
                fontSize: 13,
                fontStyle: "italic",
                color: status === "saved" ? "var(--ember)" : "var(--ink-faint)",
              }}
            >
              {statusLabel[status] ?? status}
            </p>
          )}
          {fileParseError ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--blood-wash, #fef2f2)",
                border: "1px solid var(--blood, #e53e3e)",
              }}
            >
              <p
                className="f-sans"
                style={{
                  margin: "0 0 4px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--blood)",
                }}
              >
                Couldn't read "{fileParseError}"
              </p>
              <p
                className="f-sans"
                style={{ margin: "0 0 10px", fontSize: 12, color: "var(--blood)" }}
              >
                {errorDetail ?? "The file is empty or in an unrecognised format."}
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handlers.onRetryFile}
                  className="press f-sans"
                  style={{
                    flex: 1,
                    height: 30,
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--blood)",
                    background: "transparent",
                    color: "var(--blood)",
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
                <button
                  onClick={handlers.onManualFill}
                  className="press f-sans"
                  style={{
                    flex: 1,
                    height: 30,
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 500,
                    border: "1px solid var(--line)",
                    background: "transparent",
                    color: "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  Fill in manually
                </button>
              </div>
            </div>
          ) : errorDetail ? (
            <p
              style={{
                margin: 0,
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                color: "var(--blood)",
                wordBreak: "break-all",
              }}
            >
              {errorDetail}
            </p>
          ) : null}
        </div>
      )}

      {/* Bottom action bar */}
      <div
        style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--line-soft)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            onClick={handlers.onStartVoice}
            disabled={loading && !listening}
            aria-label={listening ? "Stop recording" : "Voice note"}
            className="design-btn-ghost press"
            style={{
              width: 40,
              height: 40,
              minHeight: 40,
              padding: 0,
              color: listening ? "var(--ember)" : "var(--ink-faint)",
            }}
          >
            <IconMic on={listening} />
          </button>
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={loading}
            aria-label="Take photo"
            className="design-btn-ghost press lg:hidden"
            style={{
              width: 40,
              height: 40,
              minHeight: 40,
              padding: 0,
              color: "var(--ink-faint)",
            }}
          >
            {IconCamera}
          </button>
          <button
            onClick={() => docRef.current?.click()}
            disabled={loading}
            aria-label="Attach files"
            className="design-btn-ghost press"
            style={{
              width: 40,
              height: 40,
              minHeight: 40,
              padding: 0,
              color: "var(--ink-faint)",
            }}
          >
            {IconAttach}
          </button>
          <button
            onClick={handlers.onToggleVault}
            className="design-btn-ghost press"
            aria-label="Save to vault"
            aria-pressed={(activeTab as string) === "secret"}
            style={{
              width: 40,
              height: 40,
              minHeight: 40,
              padding: 0,
              color:
                (activeTab as string) === "secret"
                  ? "var(--ember)"
                  : cryptoKey
                    ? "var(--ink-faint)"
                    : "var(--ink-ghost)",
            }}
            title={cryptoKey ? "Save to vault" : "Unlock vault first"}
          >
            {IconVault}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className="f-sans hidden lg:inline"
            style={{
              fontSize: 11,
              color: "var(--ink-ghost)",
            }}
          >
            {MOD}⏎ to save
          </span>
          <button
            onClick={handlers.onSave}
            disabled={!canSave || loading}
            className="design-btn-primary press"
            style={{ height: 40, minHeight: 40, borderRadius: 8 }}
          >
            {IconSend}
            {loading ? "Saving…" : "Capture"}
          </button>
        </div>
      </div>
    </>
  );
}
