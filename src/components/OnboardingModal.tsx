/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";

interface OnboardingModalProps {
  onComplete: (
    selected?: string[],
    answered?: never[],
    skipped?: { q: string; cat: string; p: string }[],
  ) => void;
  brainId?: string;
}

type Step = "welcome" | "capture" | "processing" | "query" | "response" | "celebration";

export default function OnboardingModal({ onComplete, brainId }: OnboardingModalProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [thoughts, setThoughts] = useState("");
  const [query, setQuery] = useState("What patterns do you see?");
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "capture" && textareaRef.current) textareaRef.current.focus();
  }, [step]);

  function skip() {
    localStorage.setItem("openbrain_onboarded", "1");
    onComplete([], [], []);
  }

  async function handleBulkCapture() {
    const lines = thoughts
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setStep("processing");
    setLoading(true);

    for (const line of lines) {
      try {
        await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
          body: JSON.stringify({
            p_title: line.slice(0, 80),
            p_content: line,
            p_type: "note",
            p_metadata: {},
            p_tags: [],
            p_brain_id: brainId,
          }),
        });
      } catch (err) {
        console.error("[onboarding] capture failed", err);
      }
    }

    setLoading(false);
    setStep("query");
  }

  async function handleQuery() {
    setStep("response");
    setLoading(true);

    try {
      const r = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
        body: JSON.stringify({
          message: query,
          brain_id: brainId,
          history: [],
          provider: "google",
        }),
      });
      const data = await r.json();
      setAiResponse(data.content || data.text || "Your brain is still learning. Add more thoughts and try again!");
    } catch (err) {
      console.error("[onboarding] query failed", err);
      setAiResponse("Something went wrong. You can try asking your brain later from the Ask tab.");
    }

    setLoading(false);
  }

  function finish() {
    localStorage.setItem("openbrain_onboarded", "1");
    onComplete([], [], []);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--color-scrim)" }}>
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-outline-variant)" }}
      >
        {/* Skip button */}
        <button
          onClick={skip}
          className="text-on-surface-variant hover:text-on-surface absolute top-4 right-4 text-xs font-medium"
        >
          Skip
        </button>

        {/* Step indicator */}
        <div className="mb-5 flex justify-center gap-1.5">
          {(["welcome", "capture", "processing", "query", "response", "celebration"] as Step[]).map((s) => (
            <div
              key={s}
              className="h-1 w-6 rounded-full"
              style={{
                background: s === step
                  ? "var(--color-primary)"
                  : "var(--color-surface-container-highest)",
              }}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="text-center">
            <div className="mb-4 text-5xl">🧠</div>
            <h2 className="text-on-surface mb-2 text-xl font-bold" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              Welcome to Everion
            </h2>
            <p className="text-on-surface-variant mb-6 text-sm">Let's teach your brain.</p>
            <button
              onClick={() => setStep("capture")}
              className="press-scale text-on-primary w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: "var(--color-primary)" }}
            >
              Let's go
            </button>
          </div>
        )}

        {step === "capture" && (
          <div>
            <h3 className="text-on-surface mb-1 text-lg font-bold">What's on your mind?</h3>
            <p className="text-on-surface-variant mb-3 text-xs">Type 5-10 things — one thought per line.</p>
            <textarea
              ref={textareaRef}
              value={thoughts}
              onChange={(e) => setThoughts(e.target.value)}
              rows={6}
              placeholder={"Call supplier about delivery\nIdea: loyalty card system\nReminder: renew liquor licence\nNew burger recipe with truffle mayo\nStaff meeting Thursday 3pm"}
              className="text-on-surface placeholder:text-on-surface-variant/30 w-full resize-none rounded-xl border p-3 text-sm outline-none"
              style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
            />
            <button
              onClick={handleBulkCapture}
              disabled={!thoughts.trim()}
              className="press-scale text-on-primary mt-3 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
              style={{ background: "var(--color-primary)" }}
            >
              Teach my brain
            </button>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
            <p className="text-on-surface text-sm font-semibold">Teaching your brain...</p>
            <p className="text-on-surface-variant text-xs">Processing {thoughts.split("\n").filter(Boolean).length} thoughts</p>
          </div>
        )}

        {step === "query" && (
          <div>
            <h3 className="text-on-surface mb-1 text-lg font-bold">Now ask your brain something hard.</h3>
            <p className="text-on-surface-variant mb-3 text-xs">See what your brain can do with what you just taught it.</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
              className="text-on-surface w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
            />
            <button
              onClick={handleQuery}
              disabled={!query.trim()}
              className="press-scale text-on-primary mt-3 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
              style={{ background: "var(--color-primary)" }}
            >
              Ask my brain
            </button>
          </div>
        )}

        {step === "response" && (
          <div>
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
                <p className="text-on-surface text-sm font-semibold">Your brain is thinking...</p>
              </div>
            ) : (
              <div>
                <div
                  className="mb-4 rounded-2xl border p-4"
                  style={{
                    background: "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
                    borderColor: "color-mix(in oklch, var(--color-primary) 18%, transparent)",
                  }}
                >
                  <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
                </div>
                <button
                  onClick={() => setStep("celebration")}
                  className="press-scale text-on-primary w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: "var(--color-primary)" }}
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        )}

        {step === "celebration" && (
          <div className="text-center">
            <div className="mb-4 animate-bounce text-5xl">✨</div>
            <h2 className="text-on-surface mb-2 text-xl font-bold" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              That's your brain working.
            </h2>
            <p className="text-on-surface-variant mb-6 text-sm">
              Imagine what it can do with 6 months of data.
            </p>
            <button
              onClick={finish}
              className="press-scale text-on-primary w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: "var(--color-primary)" }}
            >
              Start exploring
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
