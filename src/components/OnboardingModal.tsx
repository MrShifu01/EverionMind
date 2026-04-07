import { useState } from "react";

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
    id: "purpose",
    title: "What will you use OpenBrain for?",
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
    !window.MSStream &&
    (!("Notification" in window) || !window.navigator.standalone)
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

  const STEPS = ALL_STEPS;
  const START_STEP = STEPS.length - 1;

  // Starter questions state — kept for backward compat with onComplete signature
  const [answeredItems] = useState([]); // [{q, a, cat}]
  const [skippedQs] = useState(() =>
    ONBOARDING_QUESTIONS.map((q) => ({ q: q.q, cat: q.cat, p: q.p })),
  );

  function toggleUseCase(id) {
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
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-outline-variant)" }}
      >
        {/* Progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2" role="tablist" aria-label="Onboarding progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "2rem" : "0.5rem",
                background: i === step
                  ? "var(--color-primary)"
                  : i < step
                    ? "var(--color-primary)"
                    : "var(--color-outline-variant)",
              }}
              aria-label={`Step ${i + 1} of ${STEPS.length}`}
              role="tab"
              aria-selected={i === step}
            />
          ))}
        </div>

        <div className="mb-6 text-center">
          <div className="mb-3 text-4xl">{step === START_STEP ? "🚀" : "🧠"}</div>
          <h2
            className="mb-1 text-xl font-semibold text-white"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
          >
            {STEPS[step].title}
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            {STEPS[step].subtitle}
          </p>
        </div>

        {/* Step 0 — Use case selection */}
        {step === 0 && (
          <div className="mb-6 flex flex-col gap-3">
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
                  role="checkbox"
                  aria-checked={active}
                >
                  <span className="text-2xl">{uc.emoji}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{uc.label}</div>
                    <div className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{uc.desc}</div>
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

        {/* Step 1 — Setup summary */}
        {step === 1 && (
          <div className="mb-6 flex flex-col gap-3">
            {selected.map((id) => {
              const uc = USE_CASES.find((u) => u.id === id);
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
                    <div className="text-sm font-medium text-white">{uc.label} brain</div>
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
                💡 <strong className="text-white">Tip:</strong> Use the brain switcher
                (top-right) to switch between brains at any time. You can always create more brains
                later.
              </p>
            </div>
          </div>
        )}

        {/* Step 2 — Ready to go */}
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
                <strong className="text-white">{skippedQs.length} guided questions</strong> are
                waiting in Fill Brain to help you build your memory.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                {
                  ic: "\u2726",
                  label: "Fill Brain",
                  desc: "Answer guided questions to build your memory",
                },
                { ic: "+", label: "Quick Capture", desc: "Type anything — AI will structure it" },
                {
                  ic: "\u25C7",
                  label: "Refine",
                  desc: "AI audits entries and finds missing connections",
                },
                { ic: "\u25C8", label: "Ask", desc: "Chat with AI about everything you've stored" },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
                  >
                    {f.ic}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white">{f.label}</div>
                    <div className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            {needsIOSStep() && (
              <div
                className="mt-4 rounded-xl border px-4 py-3"
                style={{
                  background: "var(--color-secondary-container)",
                  borderColor: "var(--color-secondary-container)",
                }}
              >
                <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                  📱 <strong className="text-white">iPhone tip:</strong> Tap Share → "Add to
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
              Set up my brain →
            </button>
          )}
          {step === 1 && (
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
