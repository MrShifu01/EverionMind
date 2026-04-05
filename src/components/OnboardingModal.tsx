import { useState } from "react";
import PropTypes from "prop-types";
import { useTheme } from "../ThemeContext";

/* ─── 30 essential starter questions ─── */
export const ONBOARDING_QUESTIONS = [
  { q: "What is your full legal name, ID/SSN number, date of birth, and document issue date?", cat: "👤 Identity", p: "high" },
  { q: "What is your passport number, country of issue, issue date, and expiry date?", cat: "👤 Identity", p: "high" },
  { q: "What is your driver's licence number, category/class, issue date, and expiry date?", cat: "👤 Identity", p: "high" },
  { q: "What is your blood type?", cat: "🏥 Health", p: "high" },
  { q: "Do you have any allergies — medications, foods, insect stings, latex, or environmental?", cat: "🏥 Health", p: "high" },
  { q: "Who are your emergency contacts? List 2–3 people with name, relationship, and phone number.", cat: "🚨 Emergency", p: "high" },
  { q: "Who is your health insurance provider? Include your policy/member number and emergency contact number.", cat: "📋 Medical Aid", p: "high" },
  { q: "Who is your GP or primary care physician? Name, practice, and phone number.", cat: "🏥 Health", p: "high" },
  { q: "Do you take any chronic medication? List each medication, dosage, frequency, and what it's for.", cat: "🏥 Health", p: "high" },
  { q: "Who is your legal next of kin? Full name, relationship, phone number, and address.", cat: "🚨 Emergency", p: "high" },
  { q: "What is your full residential address including postal/zip code?", cat: "👤 Identity", p: "high" },
  { q: "What vehicle do you drive? Make, model, year, colour, registration plate, and VIN.", cat: "🚗 Vehicle", p: "high" },
  { q: "Who is your vehicle insurance provider? Policy number and claims contact number.", cat: "🚗 Vehicle", p: "high" },
  { q: "Do you have roadside assistance? Provider, membership number, and emergency call-out number.", cat: "🚗 Vehicle", p: "medium" },
  { q: "What bank holds your primary account? Include branch/routing code and the bank's fraud line.", cat: "💰 Finance", p: "high" },
  { q: "What is your tax identification number? Include the relevant tax authority and your filing frequency.", cat: "💰 Finance", p: "high" },
  { q: "Who handles your taxes? Name, firm, phone number, and email.", cat: "💰 Finance", p: "medium" },
  { q: "Do you have a lawyer? Name, firm, speciality, phone number, and email.", cat: "⚖️ Legal", p: "medium" },
  { q: "Do you have a will? Where is the original stored, who is the executor, and when was it last updated?", cat: "⚖️ Legal", p: "medium" },
  { q: "Do you have home or renters insurance? Provider, policy number, and what's covered?", cat: "🏠 Home", p: "high" },
  { q: "What phone and laptop do you use? For each: brand, model, serial number, purchase date, and warranty expiry.", cat: "💻 Devices", p: "high" },
  { q: "Who is your internet service provider? Account number and monthly cost. Same for electricity, water, and gas.", cat: "🏠 Home", p: "medium" },
  { q: "Do you have a home alarm? Provider, account number, armed response number, and a hint for your alarm code.", cat: "🏠 Home", p: "medium" },
  { q: "Where do you keep your critical physical documents — birth certificate, property deeds, certificates, policies?", cat: "📄 Documents", p: "high" },
  { q: "What are your employer or business details? Company name, employee/registration number, and address.", cat: "💼 Work", p: "medium" },
  { q: "Do you have children or dependants? Names, dates of birth, ID numbers, schools, and medical details.", cat: "👨‍👩‍👧 Family", p: "medium" },
  { q: "Do you have pets? Name, breed, microchip number, vet name and number, and vaccination schedule.", cat: "🐾 Pets", p: "low" },
  { q: "List the key birthdays and anniversaries you must never forget — partner, parents, children, close friends.", cat: "📅 Dates", p: "medium" },
  { q: "Where are your spare keys stored — house, car, office? Does anyone else hold a copy?", cat: "🏠 Home", p: "medium" },
  { q: "List your active subscriptions and monthly costs: streaming, gym, cloud storage, insurance premiums, software.", cat: "💰 Finance", p: "low" },
];

const ALL_STEPS = [
  { id: "purpose", title: "What will you use OpenBrain for?", subtitle: "We'll set up the right brain for you." },
  { id: "setup",   title: "Here's what we've set up",         subtitle: "Your brain is ready. You can add more later." },
  { id: "start",   title: "You're ready to go",               subtitle: "Start by capturing your first memory or answering guided questions in Fill Brain." },
];

function needsIOSStep() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream &&
    (!("Notification" in window) || !window.navigator.standalone);
}

const USE_CASES = [
  { id: "personal", emoji: "🧠", label: "Personal",  desc: "Identity, health, finances, contacts, documents" },
  { id: "family",   emoji: "🏠", label: "Family",    desc: "Household, kids, shared finances, emergencies" },
  { id: "business", emoji: "🏪", label: "Business",  desc: "Staff, suppliers, SOPs, licences, costs" },
];

export default function OnboardingModal({ onComplete }) {
  const { t } = useTheme();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(["personal"]);

  const STEPS = ALL_STEPS;
  const START_STEP = STEPS.length - 1;

  // Starter questions state — kept for backward compat with onComplete signature
  const [answeredItems] = useState([]); // [{q, a, cat}]
  const [skippedQs] = useState(() =>
    ONBOARDING_QUESTIONS.map(q => ({ q: q.q, cat: q.cat, p: q.p }))
  );

  function toggleUseCase(id) {
    setSelected(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(x => x !== id) : prev
        : [...prev, id]
    );
  }

  function handleComplete() {
    try { localStorage.setItem("openbrain_onboarded", "1"); } catch {}
    onComplete(selected, answeredItems, skippedQs);
  }

  /* ── Styles ── */
  const overlay = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 3000 /* z-index scale: PinGate=9999, Onboarding=3000, DetailModal=1000 */, padding: 20,
    overflowY: "auto",
  };

  const card = {
    background: t.surface2 || "#1a1a2e",
    border: `1px solid ${t.border}`,
    borderRadius: 18,
    padding: "24px 16px",
    maxWidth: 440,
    width: "100%",
    boxSizing: "border-box",
    boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
    margin: "auto",
  };

  const btn = (primary, danger) => ({
    padding: "12px 28px",
    background: primary
      ? "linear-gradient(135deg, #4ECDC4, #45B7D1)"
      : danger
      ? "rgba(255,107,53,0.12)"
      : t.surface,
    border: primary ? "none" : danger ? "1px solid #FF6B3540" : `1px solid ${t.border}`,
    borderRadius: 12,
    color: primary ? "#0f0f23" : danger ? "#FF6B35" : t.textMuted,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  });

  return (
    <div style={overlay}>
      <div style={card}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }} role="tablist" aria-label="Onboarding progress">
          {STEPS.map((_, i) => (
            <div key={i} aria-label={`Step ${i + 1} of ${STEPS.length}`} role="tab" aria-selected={i === step} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, background: i === step ? "#4ECDC4" : i < step ? "#4ECDC480" : t.surface, transition: "all 0.3s" }} />
          ))}
        </div>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>
            {step === START_STEP ? "🚀" : "🧠"}
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text }}>{STEPS[step].title}</h2>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: t.textDim }}>{STEPS[step].subtitle}</p>
        </div>

        {/* Step 0 — Use case selection */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {USE_CASES.map(uc => {
              const active = selected.includes(uc.id);
              return (
                <button
                  key={uc.id}
                  onClick={() => toggleUseCase(uc.id)}
                  role="checkbox"
                  aria-checked={active}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 16px",
                    background: active ? "#4ECDC415" : t.surface,
                    border: active ? "1px solid #4ECDC460" : `1px solid ${t.border}`,
                    borderRadius: 12, cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{uc.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? "#4ECDC4" : t.text }}>{uc.label}</div>
                    <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{uc.desc}</div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: active ? "none" : `2px solid ${t.border}`, background: active ? "#4ECDC4" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#0f0f23", flexShrink: 0 }}>
                    {active && "✓"}
                  </div>
                </button>
              );
            })}
            <p style={{ fontSize: 11, color: t.textFaint, textAlign: "center", margin: "4px 0 0" }}>Select all that apply</p>
          </div>
        )}

        {/* Step 1 — Setup summary */}
        {step === 1 && (
          <div style={{ marginBottom: 24 }}>
            {selected.map(id => {
              const uc = USE_CASES.find(u => u.id === id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#4ECDC415", border: "1px solid #4ECDC430", borderRadius: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{uc.emoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{uc.label} brain</div>
                    <div style={{ fontSize: 11, color: t.textDim }}>
                      {id === "personal" && "Fill Brain will show personal questions (identity, health, finance…)"}
                      {id === "family" && "Your family brain is ready for household & family data"}
                      {id === "business" && "Your business brain will show supplier, staff & SOP questions"}
                    </div>
                  </div>
                  <span style={{ marginLeft: "auto", color: "#4ECDC4", fontSize: 16 }}>✓</span>
                </div>
              );
            })}
            <div style={{ marginTop: 14, padding: "12px 16px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
                💡 <strong style={{ color: t.textMuted }}>Tip:</strong> Use the brain switcher (top-right) to switch between brains at any time. You can always create more brains later.
              </p>
            </div>
          </div>
        )}

        {/* Step 2 — Ready to go */}
        {step === START_STEP && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ padding: "12px 16px", background: "#4ECDC415", border: "1px solid #4ECDC430", borderRadius: 10, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
                <strong style={{ color: "#4ECDC4" }}>{skippedQs.length} guided questions</strong> are waiting in Fill Brain to help you build your memory.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { ic: "\u2726", label: "Fill Brain",    desc: "Answer guided questions to build your memory" },
                { ic: "+", label: "Quick Capture",  desc: "Type anything — AI will structure it" },
                { ic: "\u25C7", label: "Refine",         desc: "AI audits entries and finds missing connections" },
                { ic: "\u25C8", label: "Ask",            desc: "Chat with AI about everything you've stored" },
              ].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10 }}>
                  <span style={{ fontSize: 16, color: "#4ECDC4", width: 24, textAlign: "center", flexShrink: 0 }}>{f.ic}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: t.textDim }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            {needsIOSStep() && (
              <div style={{ marginTop: 14, padding: "12px 16px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
                  📱 <strong style={{ color: t.textMuted }}>iPhone tip:</strong> Tap Share → "Add to Home Screen" to enable push notifications.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10, justifyContent: step === 0 ? "flex-end" : "space-between" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={btn(false)}>← Back</button>
          )}
          {step === 0 && (
            <button onClick={() => setStep(1)} style={btn(true)}>Set up my brain →</button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(START_STEP)} style={btn(true)}>Let's go →</button>
          )}
          {step === START_STEP && (
            <button onClick={handleComplete} style={btn(true)}>Start capturing →</button>
          )}
        </div>
      </div>
    </div>
  );
}

OnboardingModal.propTypes = {
  onComplete: PropTypes.func.isRequired,
};
