/**
 * CaptureArticleBody — article-capture panel rendered inside the capture
 * sheet when the user picks "article" from the Capture-as pill. Two fields:
 * source URL (optional but recommended) + the article body (paste).
 *
 * No server-side fetch / Readability extraction in v0 — the user pastes the
 * body themselves. URL is stored alongside as `metadata.url` so DetailModal
 * can show a "source" link in the reading view. Title falls back to the
 * first non-empty line of the body, then to the hostname.
 *
 * Layout mirrors CaptureListBody so the modal footer + Capture button stay
 * at the same screen position across modes.
 */
import { useMemo, useRef, type ReactNode } from "react";
import { Button } from "./ui/button";
import { IconSend } from "./captureIcons";

interface CaptureArticleBodyProps {
  url: string;
  onUrlChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  loading: boolean;
  canSave: boolean;
  brainPill?: ReactNode;
  typePill?: ReactNode;
  onSave: () => void;
}

function deriveTitle(url: string, body: string): string {
  const firstLine =
    body
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim() ?? "";
  if (firstLine) return firstLine.slice(0, 200);
  try {
    if (url.trim()) return new URL(url.trim()).hostname.replace(/^www\./, "");
  } catch {
    // invalid URL — fall through
  }
  return "Untitled article";
}

export default function CaptureArticleBody({
  url,
  onUrlChange,
  body,
  onBodyChange,
  loading,
  canSave,
  brainPill,
  typePill,
  onSave,
}: CaptureArticleBodyProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const previewTitle = useMemo(() => deriveTitle(url, body), [url, body]);
  const wordCount = useMemo(() => body.trim().split(/\s+/).filter(Boolean).length, [body]);

  return (
    <>
      {(brainPill || typePill) && (
        <div
          style={{
            padding: "16px 24px 0",
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

      <div
        style={{
          padding: "16px 24px 10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 200,
          gap: 16,
        }}
      >
        <div>
          <label
            className="f-sans"
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-faint)",
              marginBottom: 6,
            }}
          >
            source url (optional)
          </label>
          <input
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={loading}
            placeholder="https://example.com/article"
            className="f-sans"
            style={{
              width: "100%",
              fontSize: 14,
              padding: "8px 0",
              color: "var(--ink)",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--line)",
              outline: "none",
              fontFamily: "var(--f-mono, ui-monospace, monospace)",
            }}
          />
        </div>

        <div>
          <label
            className="f-sans"
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-faint)",
              marginBottom: 6,
            }}
          >
            title (auto)
          </label>
          <div
            className="f-serif"
            style={{
              fontSize: 17,
              padding: "8px 0",
              color: "var(--ink)",
              borderBottom: "1px solid var(--line)",
              wordBreak: "break-word",
              minHeight: 28,
              fontStyle: previewTitle === "Untitled article" ? "italic" : "normal",
              opacity: previewTitle === "Untitled article" ? 0.6 : 1,
            }}
          >
            {previewTitle}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <label
            className="f-sans"
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-faint)",
              marginBottom: 6,
            }}
          >
            paste article body
          </label>
          <textarea
            ref={bodyRef}
            autoFocus
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSave && !loading) {
                e.preventDefault();
                onSave();
              }
            }}
            disabled={loading}
            placeholder="Paste the article text here — first non-empty line becomes the title."
            rows={10}
            className="f-sans"
            style={{
              flex: 1,
              minHeight: 200,
              fontSize: 14,
              lineHeight: 1.55,
              resize: "none",
              padding: "10px 12px",
              color: "var(--ink)",
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 8,
              outline: "none",
            }}
          />
          <div
            className="f-sans"
            style={{
              fontSize: 12,
              color: wordCount > 0 ? "var(--ink-soft)" : "var(--ink-faint)",
              marginTop: 8,
              fontStyle: "italic",
            }}
          >
            {wordCount === 0
              ? "paste the article body — URL alone is not enough yet"
              : `${wordCount} word${wordCount === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "10px 16px 16px",
          borderTop: "1px solid var(--line-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 12,
        }}
      >
        <Button onClick={onSave} disabled={!canSave || loading}>
          {IconSend}
          {loading ? "Saving…" : "Capture article"}
        </Button>
      </div>
    </>
  );
}
