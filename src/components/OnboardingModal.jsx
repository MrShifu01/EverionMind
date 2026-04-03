import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { useTheme } from "../ThemeContext";
import { authFetch } from "../lib/authFetch";
import { MODEL } from "../data/constants";

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
  { id: "starter", title: "30 things to capture on day one",  subtitle: "The details you'll desperately need someday." },
  { id: "ios",     title: "Get notified on iPhone",           subtitle: "One quick step before notifications work." },
  { id: "start",   title: "You're ready to go",               subtitle: "Start by answering a few questions or capturing your first memory." },
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

  const STEPS = ALL_STEPS.filter(s => s.id !== "ios" || needsIOSStep());
  const START_STEP = STEPS.length - 1;
  const IOS_STEP   = STEPS.findIndex(s => s.id === "ios");

  // Starter questions state
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(null);
  const [answeredItems, setAnsweredItems] = useState([]); // [{q, a, cat}]
  const [skippedQs, setSkippedQs] = useState([]);         // [{q, cat, p}]
  const imgRef = useRef(null);

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

  /* ── Starter questions helpers ── */
  const currentQ = ONBOARDING_QUESTIONS[qIdx];
  const totalQs   = ONBOARDING_QUESTIONS.length;
  const qProgress = qIdx / totalQs;

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 4 * 1024 * 1024) { setImgError("Photo too large — try a smaller image"); setTimeout(() => setImgError(null), 3000); return; }
    setImgLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const apiRes = await authFetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 600,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
            { type: "text", text: "Extract all relevant information from this image for the question. Output the extracted content, clean and readable. Preserve structure if it's a document or card. No commentary." },
          ]}]
        })
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setAnswer(extracted);
    } catch {}
    setImgLoading(false);
  }

  function handleSaveAnswer() {
    if (!answer.trim()) return;
    const item = { q: currentQ.q, a: answer.trim(), cat: currentQ.cat };
    setAnsweredItems(prev => [...prev, item]);
    advanceQ();
  }

  function handleSkip() {
    setSkippedQs(prev => [...prev, { q: currentQ.q, cat: currentQ.cat, p: currentQ.p }]);
    advanceQ();
  }

  function handleSkipAll() {
    const remaining = ONBOARDING_QUESTIONS.slice(qIdx);
    setSkippedQs(prev => [...prev, ...remaining]);
    setStep(START_STEP); // jump to ready
    resetQInput();
  }

  function advanceQ() {
    resetQInput();
    if (qIdx + 1 >= totalQs) {
      setStep(START_STEP); // all done → ready
    } else {
      setQIdx(n => n + 1);
    }
  }

  function resetQInput() {
    setAnswer("");
    setShowInput(false);
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
            {step === 2 ? "📋" : "🧠"}
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

        {/* Step 2 — Starter questions */}
        {step === 2 && (
          <div style={{ marginBottom: 24 }}>
            {/* Progress bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 4, background: t.surface, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${qProgress * 100}%`, background: "linear-gradient(90deg, #4ECDC4, #45B7D1)", transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 11, color: t.textDim, flexShrink: 0 }}>{qIdx + 1} / {totalQs}</span>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { l: "Answered", v: answeredItems.length, c: "#4ECDC4" },
                { l: "Skipped",  v: skippedQs.length,    c: "#FF6B35" },
              ].map(s => (
                <div key={s.l} style={{ flex: 1, background: t.surface, borderRadius: 8, padding: "8px 10px", textAlign: "center", border: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: 1 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Question card */}
            <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: "20px 18px", marginBottom: 14, position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #FF6B35, transparent)", borderRadius: "14px 14px 0 0" }} />
              <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                {currentQ.cat}
              </div>
              <p style={{ margin: 0, fontSize: 15, color: t.text, lineHeight: 1.6, fontWeight: 500 }}>
                {currentQ.q}
              </p>
            </div>

            {/* Upload hint */}
            <div style={{ padding: "10px 14px", background: "#4ECDC408", border: "1px solid #4ECDC420", borderRadius: 10, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: t.textDim, lineHeight: 1.5 }}>
                📷 <strong style={{ color: "#4ECDC4" }}>Have a photo?</strong> Upload a pic of the document — OpenBrain will read it and autofill your answer.
                &nbsp;<span style={{ color: t.textFaint }}>Or come back to any skipped question in Fill Brain later.</span>
              </p>
            </div>

            {!showInput ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSkip} style={{ ...btn(false), flex: 1, padding: "11px 10px", fontSize: 13 }}>
                  Skip →
                </button>
                <button onClick={() => setShowInput(true)} style={{ ...btn(true), flex: 2, padding: "11px 10px", fontSize: 13 }}>
                  Answer this
                </button>
              </div>
            ) : (
              <div>
                <input type="file" accept="image/*" capture="environment" ref={imgRef} onChange={handleImageUpload} style={{ display: "none" }} />
                <textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder="Type your answer, or tap the camera to scan a document..."
                  autoFocus
                  style={{ width: "100%", boxSizing: "border-box", minHeight: 90, padding: "12px 14px", background: t.surface, border: "1px solid #4ECDC440", borderRadius: 10, color: t.textSoft, fontSize: 13, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit", opacity: imgLoading ? 0.5 : 1 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {imgError && <p style={{ fontSize: 12, color: "#FF6B35", margin: "0 0 4px", gridColumn: "1/-1" }}>{imgError}</p>}
                  <button onClick={resetQInput} style={{ ...btn(false), flex: 1, padding: "10px 8px", fontSize: 12 }}>Cancel</button>
                  <button onClick={() => imgRef.current?.click()} disabled={imgLoading} title="Take photo or upload" style={{ padding: "10px 14px", background: t.surface, border: "1px solid #4ECDC440", borderRadius: 10, color: imgLoading ? t.textDim : "#4ECDC4", cursor: imgLoading ? "default" : "pointer", fontSize: 16 }}>
                    {imgLoading ? "⏳" : "📷"}
                  </button>
                  <button onClick={handleSaveAnswer} disabled={!answer.trim() || imgLoading} style={{ ...btn(!answer.trim() || imgLoading ? false : true), flex: 2, padding: "10px 8px", fontSize: 12 }}>
                    {imgLoading ? "Reading photo…" : "Save answer →"}
                  </button>
                </div>
              </div>
            )}

            {/* Skip all */}
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button
                onClick={handleSkipAll}
                style={{ padding: "8px 18px", background: "transparent", border: "none", color: t.textFaint, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
              >
                Skip all — I'll fill these in later
              </button>
              <p style={{ margin: "4px 0 0", fontSize: 10, color: t.textFaint }}>
                Skipped questions will appear in Fill Brain so you can come back to them.
              </p>
            </div>
          </div>
        )}

        {/* iOS Home Screen step — only shown on iOS when not in standalone */}
        {IOS_STEP !== -1 && step === IOS_STEP && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ padding: "16px 18px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, marginBottom: 16 }}>
              <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: t.textMuted, lineHeight: 2.2 }}>
                <li>Tap the <strong style={{ color: t.text }}>Share button</strong> <span style={{ color: "#4ECDC4" }}>□↑</span> in Safari</li>
                <li>Tap <strong style={{ color: t.text }}>"Add to Home Screen"</strong></li>
                <li>Open OpenBrain from your Home Screen</li>
                <li>Come back to <strong style={{ color: t.text }}>Settings → Notifications</strong> to enable</li>
              </ol>
            </div>
            <div style={{ padding: "10px 14px", background: "#4ECDC408", border: "1px solid #4ECDC420", borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 11, color: t.textDim }}>
                iOS requires apps to be on the Home Screen before allowing push notifications.
              </p>
            </div>
          </div>
        )}

        {/* Start step — Ready */}
        {step === START_STEP && (
          <div style={{ marginBottom: 24 }}>
            {(answeredItems.length > 0 || skippedQs.length > 0) && (
              <div style={{ padding: "12px 16px", background: "#4ECDC415", border: "1px solid #4ECDC430", borderRadius: 10, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
                  {answeredItems.length > 0 && <><strong style={{ color: "#4ECDC4" }}>{answeredItems.length} answer{answeredItems.length > 1 ? "s" : ""}</strong> will be saved to your brain. </>}
                  {skippedQs.length > 0 && <><strong style={{ color: "#FF6B35" }}>{skippedQs.length} question{skippedQs.length > 1 ? "s" : ""}</strong> added to your Fill Brain queue.</>}
                </p>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { ic: "✦", label: "Fill Brain",    desc: "Answer guided questions to build your memory" },
                { ic: "+", label: "Quick Capture",  desc: "Type anything — AI will structure it" },
                { ic: "◇", label: "Refine",         desc: "AI audits entries and finds missing connections" },
                { ic: "◈", label: "Ask",            desc: "Chat with AI about everything you've stored" },
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
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10, justifyContent: step === 0 ? "flex-end" : "space-between" }}>
          {step > 0 && step !== 2 && (
            <button onClick={() => setStep(s => s - 1)} style={btn(false)}>← Back</button>
          )}
          {step === 0 && (
            <button onClick={() => setStep(1)} style={btn(true)}>Set up my brain →</button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(2)} style={btn(true)}>Answer starter questions →</button>
          )}
          {IOS_STEP !== -1 && step === IOS_STEP && (
            <button onClick={() => setStep(START_STEP)} style={btn(true)}>Got it →</button>
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
