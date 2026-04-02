import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { authFetch } from "./lib/authFetch";
import { supabase } from "./lib/supabase";
import { SUGGESTIONS } from "./data/suggestions";

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */
const INITIAL_ENTRIES = [
  { id: "7afc6042", title: "Renew Driving Licence", content: "Driving licence expires 23 November 2026. Start the DLTC renewal process early due to SA backlog — ideally by July/August 2026.", type: "reminder", metadata: { status: "pending", deadline: "2026-11-23", due_date: "2026-08-01" }, pinned: true, importance: 2, tags: ["reminder", "driving licence", "urgent", "admin"], created_at: "2026-04-02T13:05:41Z" },
  { id: "b38c3cde", title: "South African Driving Licence", content: "Chris's SA driving licence. Code B, no restrictions. Expires November 2026.", type: "document", metadata: { licence_number: "303400001AHL", licence_code: "B", valid_to: "2026-11-23", valid_from: "2021-11-24", first_issue_date: "2006-07-03" }, pinned: true, importance: 2, tags: ["renewal due", "driving licence", "important documents"], created_at: "2026-04-02T13:05:11Z" },
  { id: "aa364b85", title: "South African ID Card", content: "RSA National Identity Card. Issued by Department of Home Affairs.", type: "document", metadata: { id_number: "8708115034084", date_of_birth: "1987-08-11", date_of_issue: "2016-03-22", home_affairs_enquiry: "0800 60 11 90" }, pinned: true, importance: 2, tags: ["id", "identity document", "home affairs", "important documents"], created_at: "2026-04-02T13:03:40Z" },
  { id: "afba29b2", title: "Momentum Health - Medical Aid", content: "Momentum Health, Custom option. Member since September 2016.", type: "contact", metadata: { provider: "Momentum Health", option: "Custom", member_number: "912268348", call_centre: "0860117859", emergency_evacuation: "082911" }, pinned: true, importance: 2, tags: ["medical aid", "health", "insurance", "important numbers"], created_at: "2026-04-02T13:02:11Z" },
  { id: "80453a6d", title: "Smash Burger Bar", content: "Chris's restaurant at Preller Square, Dan Pienaar, Bloemfontein.", type: "place", metadata: { address: "Preller Square, Dan Pienaar, Bloemfontein", business_type: "restaurant", owner: "Chris Stander" }, pinned: true, importance: 2, tags: ["business", "restaurant", "bloemfontein", "smash burger bar"], created_at: "2026-04-02T12:57:00Z" },
  { id: "5988739e", title: "Work Laptop - ASUS Vivobook 15", content: "ASUS Vivobook 15, model X1504V. Manufactured June 2025. 12 months warranty.", type: "document", metadata: { serial_number: "T6N0CV18N814261", model: "X1504V", manufactured: "2025-06", warranty: "12 months" }, pinned: false, importance: 1, tags: ["laptop", "asus", "hardware", "warranty"], created_at: "2026-04-02T13:43:15Z" },
  { id: "5033882a", title: "Woolworths - Buns & Zesty Spice", content: "Woolworths supplies burger buns and Zesty Spice — base for the smash burger spice blend.", type: "contact", metadata: { category: "supplier" }, pinned: false, importance: 1, tags: ["smash burger bar", "supplier", "key ingredient"], created_at: "2026-04-02T13:39:46Z" },
  { id: "c49dbece", title: "Ehrlichpark Butchery - Mince Balls", content: "Supplies mince balls for smash burgers. Key ingredient.", type: "contact", metadata: { category: "supplier", location: "Bloemfontein" }, pinned: false, importance: 1, tags: ["smash burger bar", "supplier", "butchery", "key ingredient"], created_at: "2026-04-02T13:39:40Z" },
  { id: "507dc46f", title: "Bidfoods - Food Delivery", content: "Food delivery supplier for Smash Burger Bar.", type: "contact", metadata: { category: "supplier" }, pinned: false, importance: 0, tags: ["smash burger bar", "supplier"], created_at: "2026-04-02T13:39:34Z" },
  { id: "d1c32f5a", title: "Delta Gas - Keg Gas", content: "Supplier for keg gas. Used for draught beer system.", type: "contact", metadata: { category: "supplier" }, pinned: false, importance: 0, tags: ["smash burger bar", "supplier"], created_at: "2026-04-02T13:39:28Z" },
  { id: "c25b32f7", title: "Delta Distribution - Alcohol & Drinks", content: "Supplier for alcohol and drinks.", type: "contact", metadata: { category: "supplier" }, pinned: false, importance: 0, tags: ["smash burger bar", "supplier", "alcohol"], created_at: "2026-04-02T13:39:22Z" },
  { id: "27e3eca1", title: "Makro - General Supplies", content: "Bulk supplier for Smash Burger Bar.", type: "contact", metadata: { category: "supplier" }, pinned: false, importance: 0, tags: ["smash burger bar", "supplier"], created_at: "2026-04-02T13:39:12Z" },
  { id: "63b24d12", title: "Econofoods - General Supplies", content: "General food supplier based in Bloemfontein.", type: "contact", metadata: { category: "supplier", location: "Bloemfontein" }, pinned: false, importance: 0, tags: ["smash burger bar", "supplier", "bloemfontein"], created_at: "2026-04-02T13:39:05Z" },
  { id: "8e8295d5", title: "Asian Corner - Dan Pienaar", content: "Spicy rice is good — spicy enough and flavourful. Prices reasonable. Food takes very long.", type: "place", metadata: { cuisine: "Asian", recommended_dish: "spicy rice", speed_rating: "slow" }, pinned: false, importance: 0, tags: ["restaurant", "asian food", "bloemfontein"], created_at: "2026-04-02T13:20:10Z" },
  { id: "72e305b7", title: "Reagan - Electrician", content: "Electrician. Worked on Smash Burger Bar.", type: "person", metadata: { role: "electrician", phone: "0733573667" }, pinned: false, importance: 0, tags: ["contractor", "smash burger bar"], created_at: "2026-04-02T13:16:27Z" },
  { id: "54db5972", title: "JC Kraal - Builder", content: "Did the building work for Smash Burger Bar.", type: "person", metadata: { role: "builder", phone: "0825117581" }, pinned: false, importance: 0, tags: ["contractor", "smash burger bar"], created_at: "2026-04-02T13:16:22Z" },
  { id: "c82a2d3c", title: "Ruan - Shopfitter", content: "Did the shopfitting for Smash Burger Bar.", type: "person", metadata: { role: "shopfitter", phone: "0834186071" }, pinned: false, importance: 0, tags: ["contractor", "smash burger bar"], created_at: "2026-04-02T13:16:32Z" },
  { id: "5664bb8d", title: "Uriah (Uria Foodserve) - Kitchen Equipment", content: "Kitchen equipment for Smash Burger Bar.", type: "person", metadata: { role: "kitchen equipment", phone: "0724042218", company: "Uria Foodserve" }, pinned: false, importance: 0, tags: ["contractor", "smash burger bar"], created_at: "2026-04-02T13:16:37Z" },
  { id: "a723d2a1", title: "Add Single Burgers to Menu", content: "Affordable single burger option. Cost of living pressure squeezing customers.", type: "idea", metadata: { status: "concept" }, pinned: false, importance: 0, tags: ["smash burger bar", "menu", "pricing"], created_at: "2026-04-02T13:10:04Z" },
  { id: "e8b12737", title: "Tuesday Quiz Night", content: "Quiz night on Tuesdays. Drive midweek foot traffic.", type: "idea", metadata: { day: "Tuesday", status: "concept" }, pinned: false, importance: 0, tags: ["smash burger bar", "events"], created_at: "2026-04-02T13:09:56Z" },
  { id: "cfff1d67", title: "Saturday Cocktail Night", content: "Cocktail night on Saturdays. 8 cocktails. Boost weekend spend.", type: "idea", metadata: { day: "Saturday", status: "concept" }, pinned: false, importance: 0, tags: ["smash burger bar", "cocktails", "events"], created_at: "2026-04-02T13:09:49Z" },
  { id: "35af7614", title: "Nourish Grey - Smash Burger Bar Paint", content: "Nourish Grey from Impa Paints, Bloemfontein.", type: "color", metadata: { color_name: "Nourish Grey", brand: "Impa Paints" }, pinned: false, importance: 0, tags: ["paint", "smash burger bar"], created_at: "2026-04-02T12:56:47Z" },
  { id: "b0f6b2d4", title: "OpenBrain Architecture Decision", content: "Using Claude app as primary capture. Supabase via MCP.", type: "decision", metadata: { status: "confirmed" }, pinned: false, importance: 0, tags: ["openbrain", "architecture"], created_at: "2026-04-02T12:54:31Z" },
];

const LINKS = [
  { from: "35af7614", to: "80453a6d", rel: "used at" },{ from: "7afc6042", to: "b38c3cde", rel: "renewal for" },{ from: "cfff1d67", to: "80453a6d", rel: "idea for" },{ from: "e8b12737", to: "80453a6d", rel: "idea for" },{ from: "a723d2a1", to: "80453a6d", rel: "idea for" },{ from: "54db5972", to: "80453a6d", rel: "built" },{ from: "72e305b7", to: "80453a6d", rel: "electrical work" },{ from: "c82a2d3c", to: "80453a6d", rel: "shopfitting" },{ from: "5664bb8d", to: "80453a6d", rel: "kitchen equipment" },{ from: "63b24d12", to: "80453a6d", rel: "supplies" },{ from: "27e3eca1", to: "80453a6d", rel: "supplies" },{ from: "c25b32f7", to: "80453a6d", rel: "supplies" },{ from: "d1c32f5a", to: "80453a6d", rel: "supplies" },{ from: "507dc46f", to: "80453a6d", rel: "supplies" },{ from: "c49dbece", to: "80453a6d", rel: "supplies" },{ from: "5033882a", to: "80453a6d", rel: "supplies" },
];

/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */
const TC = {
  reminder: { i: "⏰", c: "#FF6B35" }, document: { i: "📄", c: "#4ECDC4" }, contact: { i: "📇", c: "#45B7D1" },
  place: { i: "📍", c: "#96CEB4" }, person: { i: "👤", c: "#DDA0DD" }, idea: { i: "💡", c: "#FFEAA7" },
  color: { i: "🎨", c: "#E17055" }, decision: { i: "⚖️", c: "#74B9FF" }, note: { i: "📝", c: "#A29BFE" },
};
const PC = { high: { bg: "#FF6B3520", c: "#FF6B35", l: "High" }, medium: { bg: "#FFEAA720", c: "#FFEAA7", l: "Med" }, low: { bg: "#4ECDC420", c: "#4ECDC4", l: "Low" } };
const fmtD = d => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

const SB_URL = "https://wfvoqpdfzkqnenzjxhui.supabase.co";
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const MODEL = import.meta.env.VITE_ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

/* ═══════════════════════════════════════════════════════════════
   QUICK CAPTURE BAR
   ═══════════════════════════════════════════════════════════════ */
function QuickCapture({ apiKey, sbKey, entries, setEntries }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const imgRef = useRef(null);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoading(true);
    setStatus("thinking");
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
            { type: "text", text: "Extract all text from this image. Output just the extracted content, clean and readable. If it’s a business card, document, label, or receipt — preserve structure. No commentary." }
          ]}]
        })
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setText(extracted);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setStatus(null);
  };

  const capture = async () => {
    if (!text.trim()) return;
    const input = text.trim();
    setText("");
    setLoading(true);
    setStatus("thinking");

    try {
      if (apiKey) {
        const res = await authFetch("/api/anthropic", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 800,
            system: `You classify and structure a raw text capture into an OpenBrain entry. Return ONLY valid JSON — no markdown, no explanation.
Format: {"title":"...","content":"...","type":"...","metadata":{},"tags":[]}

TYPE RULES (pick the BEST match — do NOT default to note):
- person → any individual: name + role/number (e.g. John the plumber, 0821234567)
- contact → business, supplier, service, company, organisation
- place → restaurant, shop, location, address, venue
- document → ID, licence, certificate, policy, serial number, registration, account number
- reminder → deadline, renewal, expiry, appointment, must do, date-based task
- idea → concept, plan, proposal, something to try or consider
- decision → something already decided or chosen
- color → paint colour, hex code, design colour
- note → ONLY use this if absolutely none of the above apply

EXTRACTION RULES:
- Put phone numbers, dates, ID/serial numbers into metadata
- Infer relevant tags from context
- Title: concise, max 60 chars
- Content: clear 1-2 sentence description`,
            messages: [{ role: "user", content: input }]
          })
        });
        const data = await res.json();
        const raw = data.content?.[0]?.text || "{}";
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

        if (sbKey && parsed.title) {
          setStatus("saving");
          const rpcRes = await authFetch("/api/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              p_title: parsed.title, p_content: parsed.content || input, p_type: parsed.type || "note",
              p_metadata: parsed.metadata || {}, p_tags: parsed.tags || []
            })
          });
          if (rpcRes.ok) {
            const result = await rpcRes.json();
            const newEntry = { id: result?.id || Date.now().toString(), title: parsed.title, content: parsed.content || input, type: parsed.type || "note", metadata: parsed.metadata || {}, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            setEntries(prev => [newEntry, ...prev]);
            setStatus("saved-db");
          } else {
            const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            setEntries(prev => [newEntry, ...prev]);
            setStatus("saved-local");
          }
        } else {
          const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
          setEntries(prev => [newEntry, ...prev]);
          setStatus("saved-local");
        }
      } else {
        const newEntry = { id: Date.now().toString(), title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
        setEntries(prev => [newEntry, ...prev]);
        setStatus("saved-raw");
      }
    } catch (e) {
      console.error(e);
      const newEntry = { id: Date.now().toString(), title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      setEntries(prev => [newEntry, ...prev]);
      setStatus("error");
    }
    setLoading(false);
    setTimeout(() => setStatus(null), 3000);
  };

  const statusMsg = { "thinking": "🤖 Parsing...", "saving": "💾 Saving to DB...", "saved-db": "✅ Saved to OpenBrain!", "saved-local": "✅ Saved locally", "saved-raw": "📝 Saved (no AI)", "error": "⚠️ Saved locally (DB error)" };

  return (
    <div style={{ padding: "0 24px 16px" }}>
      <div style={{ display: "flex", gap: 8, position: "relative" }}>
        <input type="file" accept="image/*" ref={imgRef} onChange={handleImageUpload} style={{ display: "none" }} />
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && capture()} disabled={loading}
          placeholder={loading ? "Processing..." : "Quick capture — just type anything..."}
          style={{ flex: 1, padding: "12px 16px", background: "#1a1a2e", border: "1px solid #4ECDC440", borderRadius: 12, color: "#ddd", fontSize: 14, outline: "none", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }} />
        <button onClick={() => imgRef.current?.click()} disabled={loading} title="Upload photo" style={{ padding: "12px 14px", background: "#1a1a2e", border: "1px solid #4ECDC440", borderRadius: 12, color: loading ? "#444" : "#4ECDC4", cursor: loading ? "default" : "pointer", fontSize: 16 }}>📷</button>
        <button onClick={capture} disabled={loading || !text.trim()} style={{ padding: "12px 18px", background: text.trim() && !loading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : "#1a1a2e", border: "none", borderRadius: 12, color: text.trim() && !loading ? "#0f0f23" : "#555", fontWeight: 700, cursor: text.trim() && !loading ? "pointer" : "default", fontSize: 16 }}>+</button>
      </div>
      {status && <p style={{ fontSize: 11, color: status.includes("error") ? "#FF6B35" : "#4ECDC4", margin: "6px 0 0 4px", transition: "opacity 0.3s" }}>{statusMsg[status]}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════════════════════ */
function SettingsView() {
  const [testStatus, setTestStatus] = useState(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || ""));
  }, []);

  const testAI = async () => {
    setTestStatus("testing-ai");
    try {
      const res = await authFetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] })
      });
      setTestStatus(res.ok ? "ai-success" : "ai-fail");
    } catch { setTestStatus("ai-fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };

  const testDB = async () => {
    setTestStatus("testing");
    try {
      const res = await authFetch("/api/health");
      setTestStatus(res.ok ? "success" : "fail");
    } catch { setTestStatus("fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };

  const btnStyle = { padding: "10px 20px", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#EAEAEA" }}>Settings</h2>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 24px" }}>All API keys are managed server-side.</p>

      <div style={{ background: "#1a1a2e", borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ddd" }}>Signed in as</p><p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>{email}</p></div>
          <button onClick={() => supabase.auth.signOut()} style={{ ...btnStyle, background: "#FF6B3520", color: "#FF6B35" }}>Sign out</button>
        </div>
      </div>

      <div style={{ background: "#1a1a2e", borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ddd" }}>Claude AI (Haiku)</p><p style={{ margin: "4px 0 0", fontSize: 11, color: "#666" }}>AI parsing and chat</p></div>
          <button onClick={testAI} style={{ ...btnStyle, background: "#4ECDC420", color: "#4ECDC4" }}>
            {testStatus === "testing-ai" ? "Testing…" : testStatus === "ai-success" ? "✓ Connected" : testStatus === "ai-fail" ? "✗ Failed" : "Test"}
          </button>
        </div>
      </div>

      <div style={{ background: "#1a1a2e", borderRadius: 14, padding: "20px 24px", border: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ddd" }}>Supabase Database</p><p style={{ margin: "4px 0 0", fontSize: 11, color: "#666" }}>Memory storage</p></div>
          <button onClick={testDB} style={{ ...btnStyle, background: "#4ECDC420", color: "#4ECDC4" }}>
            {testStatus === "testing" ? "Testing…" : testStatus === "success" ? "✓ Connected" : testStatus === "fail" ? "✗ Failed" : "Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUGGESTIONS (Fill Brain)
   ═══════════════════════════════════════════════════════════════ */
function SuggestionsView({ apiKey, sbKey, entries, setEntries }) {
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [saved, setSaved] = useState([]);
  const [filterCat, setFilterCat] = useState("all");
  const [anim, setAnim] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [answeredQs, setAnsweredQs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("openbrain_answered_qs") || "[]")); }
    catch { return new Set(); }
  });
  const imgRef = useRef(null);

  const position = answered + skipped;
  const cats = useMemo(() => { const c = {}; SUGGESTIONS.forEach(s => { c[s.cat] = (c[s.cat] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); }, []);
  const view = useMemo(() => {
    const base = filterCat === "all" ? SUGGESTIONS : SUGGESTIONS.filter(s => s.cat === filterCat);
    return base.filter(s => !answeredQs.has(s.q));
  }, [filterCat, answeredQs]);
  const total = view.length;
  const poolEmpty = total === 0;
  const isAiSlot = !!apiKey && (poolEmpty || position % 5 === 4);
  const current = isAiSlot ? (aiLoading ? null : aiQuestion) : view[idx % total];

  useEffect(() => {
    if (!isAiSlot || aiQuestion || aiLoading || !apiKey) return;
    setAiLoading(true);
    const ctx = entries.slice(0, 30).map(e => `- ${e.title}: ${(e.content || "").slice(0, 100)}`).join("\n");
    authFetch("/api/anthropic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 200,
        system: `You are helping someone build their personal knowledge base called OpenBrain. Your job is to identify important information they should capture but probably haven't yet.\n\nStudy what they have stored, then reason about the GAPS — important facts, records, contacts, plans, or details that a person in their situation almost certainly needs but hasn't captured. Think broadly: personal identity, health, finance, legal, business operations, insurance, contracts, relationships, assets, digital accounts, emergency info, goals, and daily routines.\n\nGenerate ONE specific, actionable question that would capture a high-value missing piece. Make it personal and relevant to their specific situation — not generic.\n\nReturn ONLY valid JSON: {"q":"...","cat":"...","p":"high"|"medium"|"low"}`,
        messages: [{ role: "user", content: `What they have captured so far:\n${ctx}\n\nWhat important gap should they fill next?` }]
      })
    })
      .then(r => r.json())
      .then(data => {
        const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        setAiQuestion(parsed.q ? { ...parsed, ai: true } : { q: "What's one important thing you haven't captured yet?", cat: "✨ AI", p: "medium", ai: true });
      })
      .catch(() => setAiQuestion({ q: "What's one important thing you haven't captured yet?", cat: "✨ AI", p: "medium", ai: true }))
      .finally(() => setAiLoading(false));
  }, [isAiSlot, aiQuestion, aiLoading, apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
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
            { type: "text", text: "Extract all text from this image relevant to the question. Output just the extracted content, clean and readable. If it’s a document, card, or label — preserve structure. No commentary." }
          ]}]
        })
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setAnswer(extracted);
    } catch (err) {
      console.error(err);
    }
    setImgLoading(false);
  };

  const next = useCallback((dir) => {
    setAnim(dir);
    setTimeout(() => {
      setAnswer("");
      setShowInput(false);
      setAnim("");
      if (isAiSlot) {
        setAiQuestion(null);
      } else if (total > 0) {
        setIdx(p => (p + 1) % total);
      }
    }, 200);
  }, [isAiSlot, total]);

  const handleSave = async () => {
    if (!answer.trim()) return;
    const a = answer.trim();
    setSaving(true);

    // Try to save directly to DB via AI parsing
    if (apiKey && sbKey) {
      try {
        const res = await authFetch("/api/anthropic", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 800,
            system: `Parse this Q&A into a structured entry. Return ONLY valid JSON:\n{"title":"...","content":"...","type":"note|person|place|idea|contact|document|reminder|color|decision","metadata":{},"tags":[]}`,
            messages: [{ role: "user", content: `Question: ${current.q}\nAnswer: ${a}` }]
          })
        });
        const data = await res.json();
        const parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
        if (parsed.title) {
          const rpcRes = await authFetch("/api/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || a, p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] })
          });
          const savedToDB = rpcRes.ok;
          const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
          setEntries(prev => [newEntry, ...prev]);
          setSaved(prev => [{ q: current.q, a, cat: current.cat, db: savedToDB }, ...prev]);
        }
      } catch {
        setSaved(prev => [{ q: current.q, a, cat: current.cat, db: false }, ...prev]);
      }
    } else {
      setSaved(prev => [{ q: current.q, a, cat: current.cat, db: false }, ...prev]);
    }

    // Mark static question as permanently answered
    if (!isAiSlot && current?.q) {
      setAnsweredQs(prev => {
        const updated = new Set(prev);
        updated.add(current.q);
        try { localStorage.setItem("openbrain_answered_qs", JSON.stringify([...updated])); } catch {}
        return updated;
      });
    }

    setSaving(false);
    setAnswered(n => n + 1);
    next("save");
  };

  const copyAll = () => {
    const text = saved.map(s => `**${s.cat}**\nQ: ${s.q}\nA: ${s.a}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const pc = current ? PC[current.p] : PC.medium;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[{ l: "Answered", v: answered, c: "#4ECDC4" }, { l: "Skipped", v: skipped, c: "#FF6B35" }, { l: "Remaining", v: Math.max(0, total - (idx % total)), c: "#A29BFE" }].map(s =>
          <div key={s.l} style={{ flex: 1, background: "#1a1a2e", borderRadius: 10, padding: 12, textAlign: "center", border: "1px solid #2a2a4a" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 2 }}>{s.l}</div>
          </div>
        )}
      </div>

      <div style={{ height: 3, background: "#1a1a2e", borderRadius: 4, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(((answered + skipped) / total) * 100, 100)}%`, background: "linear-gradient(90deg, #4ECDC4, #45B7D1)", transition: "width 0.4s", borderRadius: 4 }} />
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 20, paddingBottom: 4, scrollbarWidth: "none" }}>
        <button onClick={() => { setFilterCat("all"); setIdx(0); }} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: filterCat === "all" ? "#4ECDC4" : "#1a1a2e", color: filterCat === "all" ? "#0f0f23" : "#777" }}>All</button>
        {cats.map(([c, n]) => <button key={c} onClick={() => { setFilterCat(c); setIdx(0); }} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", background: filterCat === c ? "#4ECDC4" : "#1a1a2e", color: filterCat === c ? "#0f0f23" : "#777" }}>{c} ({n})</button>)}
      </div>

      {poolEmpty && (
        <div style={{ background: "#A29BFE15", border: "1px solid #A29BFE40", borderRadius: 12, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#A29BFE", fontWeight: 600 }}>✨ All {answeredQs.size} static questions answered — AI is now driving</span>
        </div>
      )}
      {isAiSlot && aiLoading && (
        <div style={{ background: "linear-gradient(135deg, #1a1a2e, #16162a)", border: "1px solid #A29BFE40", borderRadius: 16, padding: "28px 24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✨</div>
          <p style={{ color: "#A29BFE", fontSize: 14, margin: 0 }}>AI is generating a personalised question…</p>
        </div>
      )}
      {current && !aiLoading && <div style={{ background: isAiSlot ? "linear-gradient(135deg, #1a1a2e, #1a1a35)" : "linear-gradient(135deg, #1a1a2e, #16162a)", border: isAiSlot ? "1px solid #A29BFE40" : "1px solid #2a2a4a", borderRadius: 16, padding: "28px 24px", marginBottom: 16, position: "relative", overflow: "hidden", transform: anim === "skip" ? "translateX(-30px)" : anim === "save" ? "scale(0.95)" : "none", opacity: anim ? 0.4 : 1, transition: "all 0.2s" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${pc.c}, transparent)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, background: pc.bg, color: pc.c, padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{pc.l}</span>
          <span style={{ fontSize: 11, color: "#666" }}>{current.cat}</span>
          {isAiSlot && <span style={{ fontSize: 9, background: "#A29BFE20", color: "#A29BFE", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>✨ AI</span>}
          <span style={{ fontSize: 10, color: "#444", marginLeft: "auto" }}>#{idx + 1}/{total}</span>
        </div>
        <p style={{ fontSize: 18, color: "#EAEAEA", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{current.q}</p>
      </div>}

      {!showInput ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} disabled={aiLoading} style={{ flex: 1, padding: 14, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 12, color: aiLoading ? "#444" : "#888", fontSize: 14, fontWeight: 600, cursor: aiLoading ? "default" : "pointer" }}>Skip →</button>
          <button onClick={() => setShowInput(true)} disabled={!current || aiLoading} style={{ flex: 2, padding: 14, background: current && !aiLoading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : "#1a1a2e", border: "none", borderRadius: 12, color: current && !aiLoading ? "#0f0f23" : "#444", fontSize: 14, fontWeight: 700, cursor: current && !aiLoading ? "pointer" : "default" }}>Answer this</button>
        </div>
      ) : (
        <div>
          <input type="file" accept="image/*" ref={imgRef} onChange={handleImageUpload} style={{ display: "none" }} />
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer..." autoFocus
            style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "14px 16px", background: "#1a1a2e", border: "1px solid #4ECDC440", borderRadius: 12, color: "#ddd", fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit", opacity: imgLoading ? 0.5 : 1 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={() => { setShowInput(false); setAnswer(""); }} style={{ flex: 1, padding: 12, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} style={{ flex: 1, padding: 12, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#FF6B35", fontSize: 13, cursor: "pointer" }}>Skip</button>
            <button onClick={() => imgRef.current?.click()} disabled={imgLoading || saving} title="Upload photo" style={{ padding: 12, background: "#1a1a2e", border: "1px solid #4ECDC440", borderRadius: 10, color: imgLoading ? "#444" : "#4ECDC4", cursor: imgLoading || saving ? "default" : "pointer", fontSize: 14 }}>📷</button>
            <button onClick={handleSave} disabled={!answer.trim() || saving || imgLoading} style={{ flex: 2, padding: 12, background: answer.trim() && !imgLoading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : "#1a1a2e", border: "none", borderRadius: 10, color: answer.trim() && !imgLoading ? "#0f0f23" : "#444", fontSize: 13, fontWeight: 700, cursor: answer.trim() && !imgLoading ? "pointer" : "default" }}>
              {saving ? "Saving..." : imgLoading ? "Reading photo..." : apiKey && sbKey ? "Save to DB" : "Save Answer"}
            </button>
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, margin: 0 }}>This session ({saved.length})</p>
            <button onClick={copyAll} style={{ padding: "6px 14px", background: "#4ECDC420", border: "none", borderRadius: 20, color: "#4ECDC4", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📋 Copy All for Claude</button>
          </div>
          {saved.map((s, i) => (
            <div key={i} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#666" }}>{s.cat}</span>
                {s.db && <span style={{ fontSize: 9, background: "#4ECDC420", color: "#4ECDC4", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Saved to DB</span>}
                {!s.db && <span style={{ fontSize: 9, background: "#FFEAA720", color: "#FFEAA7", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Local only</span>}
              </div>
              <p style={{ fontSize: 12, color: "#999", margin: "0 0 4px", fontStyle: "italic" }}>{s.q}</p>
              <p style={{ fontSize: 13, color: "#ccc", margin: 0, lineHeight: 1.5 }}>{s.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CALENDAR VIEW
   ═══════════════════════════════════════════════════════════════ */
function CalendarView({ entries }) {
  const [month, setMonth] = useState(() => new Date());
  const [selDay, setSelDay] = useState(null);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const today = new Date().toISOString().slice(0, 10);

  const dateMap = useMemo(() => {
    const map = {};
    const addTo = (key, entry) => { if (!map[key]) map[key] = []; if (!map[key].find(e => e.id === entry.id)) map[key].push(entry); };
    entries.forEach(e => {
      [e.metadata?.deadline, e.metadata?.due_date, e.metadata?.valid_to, e.metadata?.valid_from].filter(Boolean).forEach(d => addTo(d.slice(0, 10), e));
    });
    return map;
  }, [entries]);

  const firstDow = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = month.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

  const dayKey = (d) => `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selKey = selDay ? dayKey(selDay) : null;
  const selEntries = selKey ? (dateMap[selKey] || []) : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={() => setMonth(new Date(year, mon - 1, 1))} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, color: "#888", padding: "8px 16px", cursor: "pointer", fontSize: 16 }}>←</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#EAEAEA" }}>{monthLabel}</span>
        <button onClick={() => setMonth(new Date(year, mon + 1, 1))} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, color: "#888", padding: "8px 16px", cursor: "pointer", fontSize: 16 }}>→</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#555", fontWeight: 700, letterSpacing: 1, padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const key = dayKey(day);
          const dots = dateMap[key] || [];
          const isToday = key === today;
          const isSel = day === selDay;
          return (
            <div key={key} onClick={() => setSelDay(day === selDay ? null : day)}
              style={{ aspectRatio: "1/1", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer",
                background: isSel ? "#4ECDC4" : isToday ? "#4ECDC420" : dots.length ? "#1a1a2e" : "transparent",
                border: isToday && !isSel ? "1px solid #4ECDC440" : dots.length && !isSel ? "1px solid #2a2a4a" : "1px solid transparent" }}>
              <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 400, color: isSel ? "#0f0f23" : isToday ? "#4ECDC4" : "#ccc" }}>{day}</span>
              {dots.length > 0 && !isSel && (
                <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                  {dots.slice(0, 3).map((e, ei) => <div key={ei} style={{ width: 4, height: 4, borderRadius: "50%", background: (TC[e.type] || TC.note).c }} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selDay && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>
            {selEntries.length ? `${selEntries.length} item${selEntries.length > 1 ? "s" : ""} — ${selKey}` : `Nothing on ${selKey}`}
          </p>
          {selEntries.map(e => {
            const cfg = TC[e.type] || TC.note;
            return (
              <div key={e.id} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{cfg.i}</span>
                  <span style={{ fontSize: 11, color: cfg.c, fontWeight: 700, textTransform: "uppercase" }}>{e.type}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "#ddd", fontWeight: 500 }}>{e.title}</p>
                {e.content && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999", lineHeight: 1.5 }}>{e.content.slice(0, 120)}</p>}
              </div>
            );
          })}
          {selEntries.length === 0 && <p style={{ color: "#555", fontSize: 13 }}>No entries with this date in their metadata.</p>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TODO VIEW
   ═══════════════════════════════════════════════════════════════ */
function TodoView() {
  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("openbrain_todos") || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState("medium");

  const persist = (updated) => { setTodos(updated); try { localStorage.setItem("openbrain_todos", JSON.stringify(updated)); } catch {} };
  const add = () => { if (!input.trim()) return; persist([{ id: Date.now().toString(), text: input.trim(), done: false, priority, created_at: new Date().toISOString() }, ...todos]); setInput(""); };
  const toggle = (id) => persist(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id) => persist(todos.filter(t => t.id !== id));

  const w = { high: 3, medium: 2, low: 1 };
  const pending = todos.filter(t => !t.done).sort((a, b) => (w[b.priority] || 0) - (w[a.priority] || 0));
  const done = todos.filter(t => t.done);

  return (
    <div>
      <div style={{ background: "#A29BFE15", border: "1px solid #A29BFE30", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>🔌</span>
        <span style={{ fontSize: 11, color: "#A29BFE", lineHeight: 1.5 }}>Future: auto-populated from POS, Gmail, Calendar &amp; more — see <code style={{ color: "#4ECDC4", fontSize: 10 }}>.planning/roadmap/integrations.md</code></span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add a task..." style={{ flex: 1, padding: "12px 16px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#ddd", fontSize: 14, outline: "none" }} />
        <select value={priority} onChange={e => setPriority(e.target.value)}
          style={{ padding: "0 10px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: PC[priority].c, fontSize: 12, outline: "none", cursor: "pointer" }}>
          <option value="high">High</option>
          <option value="medium">Med</option>
          <option value="low">Low</option>
        </select>
        <button onClick={add} style={{ padding: "12px 20px", background: "#4ECDC4", border: "none", borderRadius: 10, color: "#0f0f23", fontWeight: 700, cursor: "pointer", fontSize: 18 }}>+</button>
      </div>

      {pending.length === 0 && done.length === 0 && (
        <p style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No tasks yet.</p>
      )}

      {pending.map(t => {
        const pc = PC[t.priority] || PC.medium;
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
            <button onClick={() => toggle(t.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${pc.c}`, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 14, color: "#ddd", flex: 1, lineHeight: 1.4 }}>{t.text}</p>
            <span style={{ fontSize: 9, background: pc.bg, color: pc.c, padding: "2px 8px", borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>{pc.l}</span>
            <button onClick={() => remove(t.id)} style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        );
      })}

      {done.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>Done ({done.length})</p>
          {done.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #1a1a2e", borderRadius: 10, padding: "10px 16px", marginBottom: 6, opacity: 0.45 }}>
              <button onClick={() => toggle(t.id)} style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid #444", background: "#4ECDC4", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#0f0f23" }}>✓</button>
              <p style={{ margin: 0, fontSize: 13, color: "#666", textDecoration: "line-through", flex: 1 }}>{t.text}</p>
              <button onClick={() => remove(t.id)} style={{ background: "transparent", border: "none", color: "#333", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DETAIL MODAL
   ═══════════════════════════════════════════════════════════════ */
function DetailModal({ entry, onClose, onDelete, onUpdate }) {
  if (!entry) return null;
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editContent, setEditContent] = useState(entry.content);
  const [editType, setEditType] = useState(entry.type);
  const [editTags, setEditTags] = useState((entry.tags || []).join(', '));
  const cfg = TC[editType] || TC.note;
  const related = LINKS.filter(l => l.from === entry.id || l.to === entry.id).map(l => ({ ...l, other: INITIAL_ENTRIES.find(e => e.id === (l.from === entry.id ? l.to : l.from)), dir: l.from === entry.id ? '→' : '←' }));
  const skip = new Set(['category', 'status']);
  const meta = Object.entries(entry.metadata || {}).filter(([k]) => !skip.has(k));
  const inp = { padding: '10px 14px', background: '#0f0f23', border: '1px solid #4ECDC440', borderRadius: 10, color: '#ddd', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
  const handleSave = async () => {
    setSaving(true);
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    await onUpdate(entry.id, { title: editTitle, content: editContent, type: editType, tags });
    setSaving(false);
    setEditing(false);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000CC', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={editing ? undefined : onClose}>
      <div style={{ background: '#16162a', borderRadius: 16, maxWidth: 600, width: '100%', maxHeight: '85vh', overflow: 'auto', border: `1px solid ${cfg.c}40` }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 24 }}>{cfg.i}</span><span style={{ fontSize: 11, color: cfg.c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>{editType}</span></div>
            {!editing && <h2 style={{ margin: 0, fontSize: 22, color: '#EAEAEA', fontWeight: 700 }}>{editTitle}</h2>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {!editing && onDelete && <button onClick={async () => { setDeleting(true); await onDelete(entry.id); }} disabled={deleting} style={{ padding: '6px 14px', background: deleting ? '#1a1a2e' : '#FF6B3520', border: '1px solid #FF6B3540', borderRadius: 8, color: deleting ? '#555' : '#FF6B35', fontSize: 12, fontWeight: 600, cursor: deleting ? 'default' : 'pointer' }}>{deleting ? 'Deleting...' : 'Delete'}</button>}
            {!editing && onUpdate && <button onClick={() => setEditing(true)} style={{ padding: '6px 14px', background: '#4ECDC420', border: '1px solid #4ECDC440', borderRadius: 8, color: '#4ECDC4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>}
            <button onClick={editing ? () => setEditing(false) : onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        {editing ? (
          <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Title</label><input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Type</label>
              <select value={editType} onChange={e => setEditType(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {['note','person','place','idea','contact','document','reminder','color','decision'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Content</label><textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} /></div>
            <div><label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Tags <span style={{ color: '#555', fontWeight: 400, textTransform: 'none' }}>(comma separated)</span></label><input value={editTags} onChange={e => setEditTags(e.target.value)} style={inp} placeholder="tag1, tag2, tag3" /></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 12, background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 10, color: '#888', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !editTitle.trim()} style={{ flex: 2, padding: 12, background: editTitle.trim() ? 'linear-gradient(135deg, #4ECDC4, #45B7D1)' : '#1a1a2e', border: 'none', borderRadius: 10, color: editTitle.trim() ? '#0f0f23' : '#444', fontSize: 13, fontWeight: 700, cursor: editTitle.trim() ? 'pointer' : 'default' }}>{saving ? 'Saving...' : 'Save changes'}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 28px' }}>
            <p style={{ color: '#bbb', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{editContent}</p>
            {meta.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginTop: 12 }}>
              {meta.map(([k, v]) => <div key={k} style={{ fontSize: 12 }}><span style={{ color: '#888', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}: </span><span style={{ color: '#ccc' }}>{Array.isArray(v) ? v.join(', ') : String(v)}</span></div>)}
            </div>}
            {editTags.split(',').map(t => t.trim()).filter(Boolean).length > 0 && <div style={{ marginTop: 16 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{editTags.split(',').map(t => t.trim()).filter(Boolean).map(t => <span key={t} style={{ fontSize: 11, color: cfg.c, background: cfg.c + '15', padding: '4px 12px', borderRadius: 20 }}>{t}</span>)}</div></div>}
            {related.length > 0 && <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #2a2a4a' }}>
              <p style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase' }}>Connections</p>
              {related.map((r, i) => r.other && <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#ffffff05', borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
                <span>{TC[r.other.type]?.i}</span><span style={{ color: '#999' }}>{r.dir}</span><span style={{ color: '#ccc', flex: 1 }}>{r.other.title}</span><span style={{ color: '#666', fontSize: 11, fontStyle: 'italic' }}>{r.rel}</span>
              </div>)}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GRAPH
   ═══════════════════════════════════════════════════════════════ */
function GraphView({ onSelect }) {
  const ref = useRef(null);
  const nodesRef = useRef([]);
  const frameRef = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    const W = c.width = c.offsetWidth * 2, H = c.height = c.offsetHeight * 2;
    ctx.scale(2, 2); const w = W/2, h = H/2;
    const ids = new Set(); LINKS.forEach(l => { ids.add(l.from); ids.add(l.to); });
    const nodes = INITIAL_ENTRIES.filter(e => ids.has(e.id)).map((e, i, a) => {
      const ang = (i/a.length)*Math.PI*2, r = Math.min(w,h)*0.35;
      return { ...e, x: w/2+Math.cos(ang)*r+(Math.random()-0.5)*40, y: h/2+Math.sin(ang)*r+(Math.random()-0.5)*40, vx:0, vy:0 };
    });
    nodesRef.current = nodes;
    const sim = () => {
      for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){let dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,d=Math.sqrt(dx*dx+dy*dy)||1,f=800/(d*d);nodes[i].vx-=(dx/d)*f;nodes[i].vy-=(dy/d)*f;nodes[j].vx+=(dx/d)*f;nodes[j].vy+=(dy/d)*f;}
      LINKS.forEach(l=>{const a=nodes.find(n=>n.id===l.from),b=nodes.find(n=>n.id===l.to);if(!a||!b)return;let dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1,f=(d-120)*0.02;a.vx+=(dx/d)*f;a.vy+=(dy/d)*f;b.vx-=(dx/d)*f;b.vy-=(dy/d)*f;});
      nodes.forEach(n=>{n.vx*=0.85;n.vy*=0.85;n.x+=n.vx;n.y+=n.vy;n.x=Math.max(30,Math.min(w-30,n.x));n.y=Math.max(30,Math.min(h-30,n.y));});
      ctx.clearRect(0,0,w,h);
      LINKS.forEach(l=>{const a=nodes.find(n=>n.id===l.from),b=nodes.find(n=>n.id===l.to);if(!a||!b)return;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle="#ffffff15";ctx.lineWidth=1;ctx.stroke();});
      nodes.forEach(n=>{const cfg=TC[n.type]||TC.note,r=n.id==="80453a6d"?22:n.pinned?16:12;ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.fillStyle=cfg.c+"30";ctx.fill();ctx.strokeStyle=cfg.c+"80";ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle="#ddd";ctx.font=`${r>14?12:10}px system-ui`;ctx.textAlign="center";ctx.fillText(cfg.i,n.x,n.y+4);if(r>14){ctx.fillStyle="#aaa";ctx.font="9px system-ui";ctx.fillText(n.title.length>18?n.title.slice(0,18)+"…":n.title,n.x,n.y+r+14);}});
      frameRef.current=requestAnimationFrame(sim);
    };
    sim();return()=>cancelAnimationFrame(frameRef.current);
  },[]);
  return <canvas ref={ref} onClick={e=>{const r=ref.current.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const n=nodesRef.current.find(n=>Math.hypot(n.x-x,n.y-y)<20);if(n)onSelect(INITIAL_ENTRIES.find(en=>en.id===n.id));}} style={{width:"100%",height:400,borderRadius:12,background:"#0d0d1a",cursor:"pointer"}} />;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
export default function OpenBrain() {
  const [entries, setEntries] = useState(INITIAL_ENTRIES);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [apiKey, setApiKey] = useState("configured");
  const [sbKey, setSbKey] = useState("configured");
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([{ role: "assistant", content: "Hey Chris. Ask me about your memories — \"What's my ID number?\", \"Who are my suppliers?\", etc." }]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  useEffect(() => {
    authFetch("/api/entries")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setEntries(data);
        }
        setEntriesLoaded(true);
      })
      .catch(() => setEntriesLoaded(true));
  }, []);

  const types = useMemo(() => { const t = {}; entries.forEach(e => { t[e.type] = (t[e.type]||0)+1; }); return t; }, [entries]);
  const filtered = useMemo(() => {
    let r = entries;
    if (typeFilter !== "all") r = r.filter(e => e.type === typeFilter);
    if (search) { const q = search.toLowerCase(); r = r.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) || e.tags?.some(t => t.includes(q)) || JSON.stringify(e.metadata).toLowerCase().includes(q)); }
    return r;
  }, [search, typeFilter, entries]);

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim(); setChatInput(""); setChatMsgs(p => [...p, { role: "user", content: msg }]); setChatLoading(true);
    try {
      const res = await authFetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: `You are OpenBrain, Chris's memory assistant. Be concise.\n\nMEMORIES:\n${JSON.stringify(entries)}\n\nLINKS:\n${JSON.stringify(LINKS)}`, messages: [{ role: "user", content: msg }] })
      });
      const data = await res.json(); setChatMsgs(p => [...p, { role: "assistant", content: data.content?.map(c => c.text||"").join("") || "Couldn't process." }]);
    } catch { setChatMsgs(p => [...p, { role: "assistant", content: "Connection error. Check your API key in Settings." }]); }
    setChatLoading(false);
  };

  const views = [
    { id: "grid", l: "Grid", ic: "▦" }, { id: "suggest", l: "Fill Brain", ic: "✦" },
    { id: "calendar", l: "Calendar", ic: "📅" }, { id: "todos", l: "Todos", ic: "✓" },
    { id: "timeline", l: "Timeline", ic: "◔" }, { id: "graph", l: "Graph", ic: "◉" },
    { id: "chat", l: "Ask", ic: "◈" }, { id: "settings", l: "Settings", ic: "⚙" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f23", color: "#EAEAEA", fontFamily: "'Söhne', system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
          <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>OpenBrain</h1><p style={{ margin: 0, fontSize: 11, color: "#666" }}>Your eternal memory</p></div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <span style={{ fontSize: 11, color: "#555" }}>{entries.length} memories</span>
            {apiKey && <span style={{ display: "block", fontSize: 9, color: "#4ECDC4" }}>AI active</span>}
          </div>
        </div>
      </div>

      {/* Quick Capture - always visible */}
      <QuickCapture apiKey={apiKey} sbKey={sbKey} entries={entries} setEntries={setEntries} />

      {/* Nav tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1a1a2e", overflowX: "auto", scrollbarWidth: "none" }}>
        {views.map(v => <button key={v.id} onClick={() => setView(v.id)} style={{
          flexShrink: 0, minWidth: 72, padding: "10px 8px", border: "none", borderBottom: view === v.id ? "2px solid #4ECDC4" : "2px solid transparent",
          background: "none", color: view === v.id ? "#4ECDC4" : "#555", fontSize: 10, fontWeight: 600, cursor: "pointer", position: "relative"
        }}>
          {v.ic} {v.l}
          {v.id === "suggest" && <span style={{ position: "absolute", top: 2, right: "calc(50% - 24px)", width: 5, height: 5, borderRadius: "50%", background: "#FF6B35" }} />}
        </button>)}
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        {view === "grid" && <>
          {/* Search + filters */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#555" }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px 12px 38px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#ddd", fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, scrollbarWidth: "none" }}>
            <button onClick={() => setTypeFilter("all")} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: typeFilter === "all" ? "#4ECDC4" : "#1a1a2e", color: typeFilter === "all" ? "#0f0f23" : "#888" }}>All ({entries.length})</button>
            {Object.entries(types).map(([t, n]) => { const c = TC[t]||TC.note; return <button key={t} onClick={() => setTypeFilter(t)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: typeFilter===t?c.c:"#1a1a2e", color: typeFilter===t?"#0f0f23":"#888" }}>{c.i} {t} ({n})</button>; })}
          </div>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[{l:"Memories",v:entries.length,c:"#4ECDC4"},{l:"Pinned",v:entries.filter(e=>e.pinned).length,c:"#FFD700"},{l:"Types",v:Object.keys(types).length,c:"#A29BFE"},{l:"Links",v:LINKS.length,c:"#FF6B35"}].map(s=>
              <div key={s.l} style={{background:"#1a1a2e",borderRadius:12,padding:"14px 12px",textAlign:"center",border:"1px solid #2a2a4a"}}><div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div><div style={{fontSize:9,color:"#666",textTransform:"uppercase",letterSpacing:1,marginTop:2}}>{s.l}</div></div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filtered.map(e => {
              const cfg = TC[e.type]||TC.note;
              const imp = {1:"Important",2:"Critical"}[e.importance];
              return <div key={e.id} onClick={() => setSelected(e)} style={{ background: "#1a1a2e", border: `1px solid ${e.pinned?cfg.c+"80":"#2a2a4a"}`, borderRadius: 12, padding: "16px 20px", cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden" }}
                onMouseEnter={ev => { ev.currentTarget.style.borderColor=cfg.c; ev.currentTarget.style.transform="translateY(-2px)"; }}
                onMouseLeave={ev => { ev.currentTarget.style.borderColor=e.pinned?cfg.c+"80":"#2a2a4a"; ev.currentTarget.style.transform="none"; }}>
                {e.pinned && <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${cfg.c},transparent)` }} />}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:20}}>{cfg.i}</span>
                  <span style={{fontSize:10,color:cfg.c,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5}}>{e.type}</span>
                  {e.pinned && <span style={{fontSize:10}}>📌</span>}
                  {imp && <span style={{fontSize:9,background:e.importance===2?"#FF6B3530":"#FFEAA720",color:e.importance===2?"#FF6B35":"#FFEAA7",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{imp}</span>}
                </div>
                <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"#EAEAEA",lineHeight:1.3}}>{e.title}</h3>
                <p style={{margin:"8px 0 0",fontSize:13,color:"#999",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{e.content}</p>
                {e.tags?.length > 0 && <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:10}}>
                  {e.tags.slice(0,4).map(t => <span key={t} style={{fontSize:10,color:"#777",background:"#ffffff08",padding:"2px 8px",borderRadius:20}}>{t}</span>)}
                  {e.tags.length > 4 && <span style={{fontSize:10,color:"#555"}}>+{e.tags.length-4}</span>}
                </div>}
              </div>;
            })}
          </div>
          {!filtered.length && <p style={{textAlign:"center",color:"#555",marginTop:40}}>No memories match.</p>}
        </>}

        {view === "suggest" && <SuggestionsView apiKey={apiKey} sbKey={sbKey} entries={entries} setEntries={setEntries} />}

        {view === "calendar" && <CalendarView entries={entries} />}

        {view === "todos" && <TodoView />}

        {view === "timeline" && (() => {
          const sorted = [...filtered].sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
          return <div style={{position:"relative",paddingLeft:24}}>
            <div style={{position:"absolute",left:10,top:0,bottom:0,width:2,background:"linear-gradient(180deg,#4ECDC4,#FF6B35,#A29BFE)"}} />
            {sorted.map(e => { const cfg=TC[e.type]||TC.note; return <div key={e.id} style={{marginBottom:16,paddingLeft:20,position:"relative",cursor:"pointer"}} onClick={()=>setSelected(e)}>
              <div style={{position:"absolute",left:-3,top:6,width:12,height:12,borderRadius:"50%",background:cfg.c,border:"2px solid #0f0f23"}} />
              <p style={{fontSize:10,color:"#666",margin:"0 0 2px"}}>{fmtD(e.created_at)}</p>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>{cfg.i}</span><span style={{fontSize:14,color:"#ddd",fontWeight:500}}>{e.title}</span></div>
            </div>; })}
          </div>;
        })()}

        {view === "graph" && <><p style={{fontSize:12,color:"#666",marginBottom:12}}>Knowledge graph — click nodes to view</p><GraphView onSelect={setSelected} /></>}

        {view === "chat" && (
          <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 240px)"}}>
            {!apiKey && <div style={{background:"#FF6B3520",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#FF6B35"}}>Add your Anthropic API key in Settings to enable chat.</div>}
            <div style={{flex:1,overflow:"auto",marginBottom:12}}>
              {chatMsgs.map((m,i) => <div key={i} style={{marginBottom:12,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",padding:"12px 16px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?"#4ECDC4":"#1a1a2e",color:m.role==="user"?"#0f0f23":"#ccc",fontSize:14,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.content}</div>
              </div>)}
              {chatLoading && <div style={{display:"flex"}}><div style={{padding:"12px 16px",borderRadius:"16px 16px 16px 4px",background:"#1a1a2e",color:"#666"}}>Thinking...</div></div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{display:"flex",gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleChat()} placeholder="Ask about your memories..." style={{flex:1,padding:"12px 16px",background:"#1a1a2e",border:"1px solid #2a2a4a",borderRadius:12,color:"#ddd",fontSize:14,outline:"none"}} />
              <button onClick={handleChat} disabled={chatLoading||!apiKey} style={{padding:"12px 20px",background:apiKey?"#4ECDC4":"#1a1a2e",border:"none",borderRadius:12,color:apiKey?"#0f0f23":"#555",fontWeight:700,cursor:apiKey?"pointer":"default",opacity:chatLoading?0.5:1}}>→</button>
            </div>
          </div>
        )}

        {view === "settings" && <SettingsView />}
      </div>

      <DetailModal entry={selected} onClose={() => setSelected(null)}
        onDelete={async (id) => {
          try { await authFetch('/api/delete-entry', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); } catch {}
          setEntries(prev => prev.filter(e => e.id !== id));
          setSelected(null);
        }}
        onUpdate={async (id, changes) => {
          try { await authFetch('/api/update-entry', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...changes }) }); } catch {}
          setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
          setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
        }}
      />
    </div>
  );
}
