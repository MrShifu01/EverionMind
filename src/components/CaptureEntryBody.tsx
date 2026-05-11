import { useRef, type ReactNode } from "react";
import { IconAttach, IconSend, IconX, IconCamera, VoiceWaveform } from "./captureIcons";
import { Button } from "./ui/button";

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

interface UploadedFile {
  name: string;
}

interface EntryStatusInfo {
  status: string | null;
  errorDetail: string | null;
  fileParseError: string | null;
  statusLabel: Record<string, string>;
}

interface EntryActionHandlers {
  onSave: () => void;
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
  /** Background file extraction in progress. Doesn't block textarea so the
   *  user can keep typing instructions while a PDF/image processes. Does
   *  block Save (we don't want to save before all files are read). */
  extracting?: boolean;
  showSavedWhisper: boolean;
  canSave: boolean;
  reminderActive?: boolean;
  statusInfo: EntryStatusInfo;
  handlers: EntryActionHandlers;
  /** Inline "Capturing to {Brain} ⌄" chip rendered above the textarea. */
  brainPill?: ReactNode;
  /** Inline "Capture as {type} ⌄" chip rendered next to the brain pill. */
  typePill?: ReactNode;
}

export default function CaptureEntryBody({
  text,
  onTextChange,
  uploadedFiles,
  listening,
  loading,
  extracting = false,
  showSavedWhisper,
  canSave,
  reminderActive = false,
  statusInfo,
  handlers,
  brainPill,
  typePill,
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
          padding: "16px 24px 10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 160,
          position: "relative",
        }}
      >
        {(brainPill || typePill) && (
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            {brainPill}
            {typePill}
          </div>
        )}
        <textarea
          // Auto-focus on mount so desktop users can type the moment the
          // capture sheet opens, no extra click required. Mobile keyboards
          // also pop up automatically — same UX both places.
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSave && !loading && !extracting)
              handlers.onSave();
          }}
          disabled={loading}
          placeholder={
            listening
              ? "listening… tap stop when done"
              : reminderActive
                ? "remind me about…"
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
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handlers.onRemoveFile(f.name)}
                  aria-label={`Remove ${f.name}`}
                  className="ml-0.5"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {IconX}
                </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handlers.onRetryFile}
                  style={{ color: "var(--blood)", borderColor: "var(--blood)" }}
                >
                  Retry
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handlers.onManualFill}
                  style={{ color: "var(--ink-soft)" }}
                >
                  Fill in manually
                </Button>
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
          padding: "14px 20px calc(14px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--line-soft)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cameraRef.current?.click()}
            disabled={loading || extracting}
            aria-label="Take photo"
            className="lg:hidden"
            style={{ color: "var(--ink-faint)" }}
          >
            {IconCamera}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => docRef.current?.click()}
            disabled={loading || extracting}
            aria-label="Attach files"
            style={{ color: "var(--ink-faint)" }}
          >
            {IconAttach}
          </Button>
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
          <Button onClick={handlers.onSave} disabled={!canSave || loading || extracting}>
            {IconSend}
            {loading
              ? "Saving…"
              : extracting
                ? "Reading file…"
                : reminderActive
                  ? "Save Reminder"
                  : "Capture"}
          </Button>
        </div>
      </div>
    </>
  );
}
