/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from "react";
import { BrainTypeIcon } from "./icons/BrainTypeIcon";

interface OnboardingModalProps {
  onComplete: (
    selected: string[],
    answered: never[],
    skipped: { q: string; cat: string; p: string }[],
  ) => void;
}

// Kept for backward-compat — questions are opt-in in Fill Brain, not forced at signup
export const ONBOARDING_QUESTIONS: { q: string; cat: string; p: string }[] = [];

const USE_CASES = [
  {
    id: "personal",
    label: "Personal",
    desc: "Identity, health, finances, contacts, documents",
  },
  {
    id: "family",
    label: "Family",
    desc: "Household, kids, shared finances, emergencies",
  },
  {
    id: "business",
    label: "Business",
    desc: "Staff, suppliers, SOPs, licences, costs",
  },
];

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [selected, setSelected] = useState(["personal"]);
  const [name, setName] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus to name input on mount
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("input, button");
    first?.focus();
  }, []);

  // Focus trap
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        el!.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  function toggleUseCase(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    );
  }

  function handleComplete() {
    try {
      localStorage.setItem("openbrain_onboarded", "1");
      if (name.trim()) localStorage.setItem("openbrain_user_name", name.trim());
    } catch (err) {
      console.error("[OnboardingModal]", err);
    }
    onComplete(selected, [], []);
  }

  const canSubmit = selected.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--color-scrim)" }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-outline-variant)" }}
      >
        <div className="mb-6 text-center">
          <h2
            id="onboarding-title"
            className="text-on-surface mb-1 text-xl font-semibold"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Welcome to Everion
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Your second brain — private, powerful, always with you.
          </p>
        </div>

        {/* Name field */}
        <div className="mb-4">
          <label
            htmlFor="onboarding-name"
            className="mb-1.5 block text-xs font-medium"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            What should we call you? <span className="opacity-50">(optional)</span>
          </label>
          <input
            id="onboarding-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={60}
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors"
            style={{
              background: "var(--color-surface-container-low)",
              borderColor: "var(--color-outline-variant)",
              color: "var(--color-on-surface)",
            }}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && handleComplete()}
          />
        </div>

        {/* Use case selection */}
        <div className="mb-6">
          <p
            className="mb-2 text-xs font-medium"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            What will you use Everion for?
          </p>
          <div className="flex flex-col gap-2">
            {USE_CASES.map((uc) => {
              const active = selected.includes(uc.id);
              return (
                <button
                  key={uc.id}
                  className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-200"
                  style={{
                    background: active ? "var(--color-primary-container)" : "transparent",
                    borderColor: active ? "var(--color-primary)" : "var(--color-outline-variant)",
                  }}
                  onClick={() => toggleUseCase(uc.id)}
                  aria-pressed={active}
                >
                  <span className="text-on-surface-variant">
                    <BrainTypeIcon type={uc.id} className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <div className="text-on-surface text-sm font-medium">{uc.label}</div>
                    <div className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                      {uc.desc}
                    </div>
                  </div>
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                    style={{
                      borderColor: active ? "var(--color-primary)" : "var(--color-outline-variant)",
                      background: active ? "var(--color-primary)" : "transparent",
                      color: active ? "var(--color-on-primary)" : "transparent",
                    }}
                  >
                    {active && "✓"}
                  </div>
                </button>
              );
            })}
          </div>
          <p
            className="mt-1 text-center text-xs"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Select all that apply
          </p>
        </div>

        <button
          disabled={!canSubmit}
          className="w-full rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
          }}
          onClick={handleComplete}
        >
          Enter Everion →
        </button>
      </div>
    </div>
  );
}
