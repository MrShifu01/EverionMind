/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from "react";

interface OnboardingModalProps {
  onComplete: (selected: string[], answered: never[], skipped: { q: string; cat: string; p: string }[]) => void;
}

/* ─── 30 essential starter questions ─── */
export const ONBOARDING_QUESTIONS = [
  {
    q: "What is your full legal name, ID/SSN number, date of birth, and document issue date?",
    cat: "👤 Identity",
    p: "high",
  },
  {
    q: "What is your passport number, country of issue, issue date, and expiry date?",
    cat: "👤 Identity",
    p: "high",
  },
  {
    q: "What is your driver's licence number, category/class, issue date, and expiry date?",
    cat: "👤 Identity",
    p: "high",
  },
  { q: "What is your blood type?", cat: "🏥 Health", p: "high" },
  {
    q: "Do you have any allergies — medications, foods, insect stings, latex, or environmental?",
    cat: "🏥 Health",
    p: "high",
  },
  {
    q: "Who are your emergency contacts? List 2–3 people with name, relationship, and phone number.",
    cat: "🚨 Emergency",
    p: "high",
  },
  {
    q: "Who is your health insurance provider? Include your policy/member number and emergency contact number.",
    cat: "📋 Medical Aid",
    p: "high",
  },
  {
    q: "Who is your GP or primary care physician? Name, practice, and phone number.",
    cat: "🏥 Health",
    p: "high",
  },
  {
    q: "Do you take any chronic medication? List each medication, dosage, frequency, and what it's for.",
    cat: "🏥 Health",
    p: "high",
  },
  {
    q: "Who is your legal next of kin? Full name, relationship, phone number, and address.",
    cat: "🚨 Emergency",
    p: "high",
  },
  {
    q: "What is your full residential address including postal/zip code?",
    cat: "👤 Identity",
    p: "high",
  },
  {
    q: "What vehicle do you drive? Make, model, year, colour, registration plate, and VIN.",
    cat: "🚗 Vehicle",
    p: "high",
  },
  {
    q: "Who is your vehicle insurance provider? Policy number and claims contact number.",
    cat: "🚗 Vehicle",
    p: "high",
  },
  {
    q: "Do you have roadside assistance? Provider, membership number, and emergency call-out number.",
    cat: "🚗 Vehicle",
    p: "medium",
  },
  {
    q: "What bank holds your primary account? Include branch/routing code and the bank's fraud line.",
    cat: "💰 Finance",
    p: "high",
  },
  {
    q: "What is your tax identification number? Include the relevant tax authority and your filing frequency.",
    cat: "💰 Finance",
    p: "high",
  },
  {
    q: "Who handles your taxes? Name, firm, phone number, and email.",
    cat: "💰 Finance",
    p: "medium",
  },
  {
    q: "Do you have a lawyer? Name, firm, speciality, phone number, and email.",
    cat: "⚖️ Legal",
    p: "medium",
  },
  {
    q: "Do you have a will? Where is the original stored, who is the executor, and when was it last updated?",
    cat: "⚖️ Legal",
    p: "medium",
  },
  {
    q: "Do you have home or renters insurance? Provider, policy number, and what's covered?",
    cat: "🏠 Home",
    p: "high",
  },
  {
    q: "What phone and laptop do you use? For each: brand, model, serial number, purchase date, and warranty expiry.",
    cat: "💻 Devices",
    p: "high",
  },
  {
    q: "Who is your internet service provider? Account number and monthly cost. Same for electricity, water, and gas.",
    cat: "🏠 Home",
    p: "medium",
  },
  {
    q: "Do you have a home alarm? Provider, account number, armed response number, and a hint for your alarm code.",
    cat: "🏠 Home",
    p: "medium",
  },
  {
    q: "Where do you keep your critical physical documents — birth certificate, property deeds, certificates, policies?",
    cat: "📄 Documents",
    p: "high",
  },
  {
    q: "What are your employer or business details? Company name, employee/registration number, and address.",
    cat: "💼 Work",
    p: "medium",
  },
  {
    q: "Do you have children or dependants? Names, dates of birth, ID numbers, schools, and medical details.",
    cat: "👨‍👩‍👧 Family",
    p: "medium",
  },
  {
    q: "Do you have pets? Name, breed, microchip number, vet name and number, and vaccination schedule.",
    cat: "🐾 Pets",
    p: "low",
  },
  {
    q: "List the key birthdays and anniversaries you must never forget — partner, parents, children, close friends.",
    cat: "📅 Dates",
    p: "medium",
  },
  {
    q: "Where are your spare keys stored — house, car, office? Does anyone else hold a copy?",
    cat: "🏠 Home",
    p: "medium",
  },
  {
    q: "List your active subscriptions and monthly costs: streaming, gym, cloud storage, insurance premiums, software.",
    cat: "💰 Finance",
    p: "low",
  },
];

const ALL_STEPS = [
  {
    id: "trust",
    title: "Your second brain, privately.",
    subtitle: "Everything you store is encrypted. Only you can read it.",
  },
  {
    id: "purpose",
    title: "What will you use Everion for?",
    subtitle: "We'll set up the right brain for you.",
  },
  {
    id: "setup",
    title: "Here's what we've set up",
    subtitle: "Your brain is ready. You can add more later.",
  },
  {
    id: "start",
    title: "You're ready to go",
    subtitle: "Start by capturing your first memory or answering guided questions in Fill Brain.",
  },
];

function needsIOSStep() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream &&
    (!("Notification" in window) || !(navigator as any).standalone)
  );
}

const USE_CASES = [
  {
    id: "personal",
    emoji: "🧠",
    label: "Personal",
    desc: "Identity, health, finances, contacts, documents",
  },
  {
    id: "family",
    emoji: "🏠",
    label: "Family",
    desc: "Household, kids, shared finances, emergencies",
  },
  {
    id: "business",
    emoji: "🏪",
    label: "Business",
    desc: "Staff, suppliers, SOPs, licences, costs",
  },
];

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(["personal"]);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus to first interactive element whenever the step changes
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, [step]);

  // Focus trap: keep focus inside the dialog — recomputes focusable elements on each Tab
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        el!.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => !node.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  const STEPS = ALL_STEPS;
  const START_STEP = STEPS.length - 1;

  // Starter questions state — kept for backward compat with onComplete signature
  const [answeredItems] = useState([]); // [{q, a, cat}]
  const [skippedQs] = useState(() =>
    ONBOARDING_QUESTIONS.map((q) => ({ q: q.q, cat: q.cat, p: q.p })),
  );

  function toggleUseCase(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    );
  }

  function handleComplete() {
    try {
      localStorage.setItem("openbrain_onboarded", "1");
    } catch {}
    onComplete(selected, answeredItems, skippedQs);
  }

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
        {/* Progress dots */}
        <div
          className="mb-6 flex items-center justify-center gap-2"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemax={STEPS.length}
          aria-label="Onboarding progress"
        >
          {STEPS.map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "2rem" : "0.5rem",
                background: i <= step ? "var(--color-primary)" : "var(--color-outline-variant)",
              }}
            />
          ))}
        </div>

        <div className="mb-6 text-center">
          <h2
            id="onboarding-title"
            className="mb-1 text-xl font-semibold text-on-surface"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            {STEPS[step].title}
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            {STEPS[step].subtitle}
          </p>
        </div>

        {/* Step 0 — Trust intro */}
        {step === 0 && (
          <div className="mb-6 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  ),
                  label: "End-to-end encrypted",
                  desc: "Your vault key never leaves your device.",
                },
                {
                  icon: (
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                  ),
                  label: "Works offline",
                  desc: "Your data is cached locally first, synced when ready.",
                },
                {
                  icon: (
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  label: "Your data, always",
                  desc: "Export or delete everything at any time, no questions asked.",
                },
              ].map(({ icon, label, desc }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "var(--color-surface-container-low)" }}
                >
                  <span style={{ color: "var(--color-primary)", marginTop: "1px" }}>{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Use case selection */}
        {step === 1 && (
          <div className="mb-6 flex flex-col gap-3">
            {USE_CASES.map((uc) => {
              const active = selected.includes(uc.id);
              const descId = `uc-desc-${uc.id}`;
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
                  aria-describedby={descId}
                >
                  <span className="text-2xl">{uc.emoji}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-on-surface">{uc.label}</div>
                    <div id={descId} className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{uc.desc}</div>
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
            <p className="mt-1 text-center text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              Select all that apply
            </p>
          </div>
        )}

        {/* Step 2 — Setup summary */}
        {step === 2 && (
          <div className="mb-6 flex flex-col gap-3">
            {selected.map((id) => {
              const uc = USE_CASES.find((u) => u.id === id);
              if (!uc) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-xl border px-4 py-3"
                  style={{
                    background: "var(--color-primary-container)",
                    borderColor: "var(--color-outline-variant)",
                  }}
                >
                  <span className="text-2xl">{uc.emoji}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-on-surface">{uc.label} brain</div>
                    <div className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                      {id === "personal" &&
                        "Fill Brain will show personal questions (identity, health, finance…)"}
                      {id === "family" && "Your family brain is ready for household & family data"}
                      {id === "business" &&
                        "Your business brain will show supplier, staff & SOP questions"}
                    </div>
                  </div>
                  <span className="text-sm font-bold" style={{ color: "var(--color-primary)" }}>✓</span>
                </div>
              );
            })}
            <div
              className="mt-2 rounded-xl border px-4 py-3"
              style={{
                background: "var(--color-secondary-container)",
                borderColor: "var(--color-secondary-container)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                💡 <strong className="text-on-surface">Tip:</strong> Use the brain switcher
                (top-right) to switch between brains at any time. You can always create more brains
                later.
              </p>
            </div>
          </div>
        )}

        {/* Step 3 — Ready to go */}
        {step === START_STEP && (
          <div className="mb-6">
            <div
              className="mb-4 rounded-xl border px-4 py-3"
              style={{
                background: "var(--color-primary-container)",
                borderColor: "var(--color-primary-container)",
              }}
            >
              <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                <strong className="text-on-surface">{skippedQs.length} guided questions</strong> are
                waiting in Fill Brain to help you build your memory.
              </p>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
              <li><strong className="text-on-surface" style={{ fontFamily: "'Lora', Georgia, serif" }}>Fill Brain</strong> — answer guided questions to build your memory</li>
              <li><strong className="text-on-surface" style={{ fontFamily: "'Lora', Georgia, serif" }}>Quick Capture</strong> — type anything; AI structures it for you</li>
              <li><strong className="text-on-surface" style={{ fontFamily: "'Lora', Georgia, serif" }}>Refine</strong> — AI audits entries and surfaces missing connections</li>
              <li><strong className="text-on-surface" style={{ fontFamily: "'Lora', Georgia, serif" }}>Ask</strong> — chat with AI about everything you've stored</li>
            </ul>
            {needsIOSStep() && (
              <div
                className="mt-4 rounded-xl border px-4 py-3"
                style={{
                  background: "var(--color-secondary-container)",
                  borderColor: "var(--color-secondary-container)",
                }}
              >
                <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                  📱 <strong className="text-on-surface">iPhone tip:</strong> Tap Share → "Add to
                  Home Screen" to enable push notifications.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-200"
              style={{
                borderColor: "var(--color-outline-variant)",
                color: "var(--color-on-surface-variant)",
                background: "transparent",
              }}
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>
          )}
          {step === 0 && (
            <button
              className="ml-auto rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity duration-200 hover:opacity-90"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
              }}
              onClick={() => setStep(1)}
            >
              Get started
            </button>
          )}
          {step === 1 && (
            <button
              className="ml-auto rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity duration-200 hover:opacity-90"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
              }}
              onClick={() => setStep(2)}
            >
              Set up my brain →
            </button>
          )}
          {step === 2 && (
            <button
              className="ml-auto rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity duration-200 hover:opacity-90"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
              }}
              onClick={() => setStep(START_STEP)}
            >
              Let's go →
            </button>
          )}
          {step === START_STEP && (
            <button
              className="ml-auto rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity duration-200 hover:opacity-90"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
              }}
              onClick={handleComplete}
            >
              Start capturing →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
