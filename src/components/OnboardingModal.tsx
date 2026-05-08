import { useState, useRef, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { trackCaptureMethod, trackFirstCapture } from "../lib/events";
import { supabase } from "../lib/supabase";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface OnboardingModalProps {
  onComplete: (opts?: { nextAction?: "vault" | "import" }) => void;
  brainId?: string;
}

const EXAMPLES = [
  {
    label: "a customer call insight",
    text: "the customer kept saying 'we just need it to not break during month-end' — that's the real pitch",
  },
  {
    label: "a recipe to remember",
    text: "Mom's chocolate cake — 200g dark chocolate, 175g butter, 4 eggs · bake 25 min at 180°C",
  },
  {
    label: "a renewal date",
    text: "driver's licence expires 14 March next year — testing centre at Sea Point",
  },
  {
    label: "a half-formed idea",
    text: "what if onboarding asks one question instead of seven — measure activation week over week",
  },
];

// localStorage is the fast path; DB is the cross-device source of truth.
// Old code wrote `openbrain_onboarded`; clean it up on first new write.
function markOnboarded() {
  try {
    localStorage.setItem("everion_onboarded", "1");
    localStorage.removeItem("openbrain_onboarded");
  } catch {
    /* SSR / private mode */
  }
  void supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    void supabase
      .from("user_profiles")
      .upsert({ id: user.id, onboarded_at: new Date().toISOString() }, { onConflict: "id" });
  });
}

export default function OnboardingModal({ onComplete, brainId }: OnboardingModalProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-grow textarea so a long capture isn't squashed.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  function skip() {
    markOnboarded();
    onComplete();
  }

  async function handleSave() {
    const content = input.trim();
    if (!content || !brainId || saving) return;
    const title = content.split("\n")[0].slice(0, 80);
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          p_title: title,
          p_content: content,
          p_type: "note",
          p_metadata: {},
          p_tags: [],
          p_brain_id: brainId,
        }),
      });
      if (!res.ok) {
        let message = "Unknown error";
        try {
          const body = await res.json();
          if (body && typeof body === "object") {
            message = (body as any).message || (body as any).error || JSON.stringify(body);
          }
        } catch {
          const text = await res.text().catch(() => "<unreadable response>");
          message = text || message;
        }
        throw new Error(`Capture failed (${res.status}): ${message}`);
      }
      trackCaptureMethod({ method: "text" });
      trackFirstCapture({ method: "text" });
      markOnboarded();
      onComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[onboarding] capture failed", message);
      setError(`Could not save that first memory: ${message}`);
      setSaving(false);
    }
  }

  // Live preview values (derived, no state — recompute on every keystroke).
  const previewTitle = input.split("\n")[0].slice(0, 80) || "your first thing…";
  const previewBody = input.split("\n").slice(1).join("\n").trim() || (input ? "" : "");

  const titleSerif: React.CSSProperties = {
    fontFamily: "var(--f-serif)",
    fontSize: 30,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
    color: "var(--ink)",
    margin: 0,
  };
  const subtitleSerif: React.CSSProperties = {
    fontFamily: "var(--f-serif)",
    fontSize: 15,
    lineHeight: 1.5,
    color: "var(--ink-soft)",
    fontStyle: "italic",
    margin: "10px 0 24px",
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-label="Onboarding"
        className="anim-scale-in-design max-h-[calc(100vh-32px)] !max-w-[min(560px,calc(100vw-32px))] overflow-y-auto !rounded-[18px]"
        style={{
          padding: "36px 32px 24px",
          background: "var(--surface-high)",
          borderColor: "var(--line-soft)",
          boxShadow: "var(--lift-3)",
        }}
      >
        <VisuallyHidden>
          <DialogTitle>Onboarding</DialogTitle>
        </VisuallyHidden>

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          <span
            className="f-serif"
            style={{
              fontSize: 18,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Everion
          </span>
          <span
            aria-hidden="true"
            style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ember)" }}
          />
        </div>

        <h2 style={titleSerif}>give your brain its first thing to remember.</h2>
        <p style={subtitleSerif}>
          anything — a note, a fact, a half-formed idea. type it; it&apos;s yours.
        </p>

        {/* Examples */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setInput(ex.text);
                inputRef.current?.focus();
              }}
              className="design-chip f-sans press"
              style={{ fontSize: 12, cursor: "pointer" }}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Capture textarea */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSave();
            }
          }}
          rows={2}
          placeholder="type the first thing…"
          className="f-serif"
          style={{
            width: "100%",
            fontSize: 17,
            lineHeight: 1.55,
            resize: "none",
            padding: "8px 0",
            color: "var(--ink)",
            background: "transparent",
            border: 0,
            borderBottom: "1px solid var(--line)",
            borderRadius: 0,
            outline: "none",
            fontStyle: input ? "normal" : "italic",
          }}
        />

        {/* Live preview — shows how this will look in their brain */}
        <div
          style={{
            marginTop: 18,
            padding: "12px 14px",
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 12,
            opacity: input ? 1 : 0.55,
            transition: "opacity 200ms",
          }}
          aria-hidden="true"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ember)" }}
            />
            <span
              className="micro"
              style={{ color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: 1 }}
            >
              just now · note
            </span>
          </div>
          <div
            className="f-serif"
            style={{
              fontSize: 15,
              fontWeight: 450,
              color: "var(--ink)",
              marginBottom: previewBody ? 4 : 0,
              wordBreak: "break-word",
            }}
          >
            {previewTitle}
          </div>
          {previewBody && (
            <div
              className="f-serif"
              style={{
                fontSize: 13,
                color: "var(--ink-soft)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {previewBody}
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="f-sans"
            style={{
              margin: "14px 0 0",
              color: "var(--danger)",
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        )}

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 26,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Button
            variant="link"
            size="sm"
            onClick={skip}
            disabled={saving}
            style={{ color: "var(--ink-faint)" }}
          >
            or just take me there →
          </Button>
          <Button onClick={handleSave} disabled={!input.trim() || saving}>
            {saving ? "saving…" : "save & enter your brain"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
