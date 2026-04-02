import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { authFetch } from "./lib/authFetch";

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

const SUGGESTIONS = [
  { q: "What days does Bidfoods deliver?", cat: "🍔 Restaurant", p: "high" },
  { q: "Mince ball price per unit from Ehrlichpark?", cat: "🍔 Restaurant", p: "high" },
  { q: "Passport number and expiry date?", cat: "📄 Documents", p: "high" },
  { q: "Car insurance details and policy number?", cat: "📋 Insurance", p: "high" },
  { q: "Do you have a will? Where is it kept?", cat: "📋 Legal", p: "high" },
  { q: "Blood type?", cat: "🏥 Health", p: "medium" },
  { q: "Any allergies — food, medication, environmental?", cat: "🏥 Health", p: "high" },
  { q: "Who is your GP? Name and number?", cat: "🏥 Health", p: "high" },
  { q: "Vehicle make, model, year, registration?", cat: "🚗 Vehicle", p: "high" },
  { q: "Bank details — which bank, branch code, account type?", cat: "💰 Finance", p: "high" },
  { q: "SARS tax number?", cat: "💰 Finance", p: "high" },
  { q: "Who is your accountant?", cat: "💰 Finance", p: "high" },
  { q: "Restaurant trading hours? Different on weekends?", cat: "🍔 Restaurant", p: "high" },
  { q: "Monthly rent at Preller Square? Due date?", cat: "🍔 Restaurant", p: "high" },
  { q: "Landlord or property manager contact?", cat: "🍔 Restaurant", p: "high" },
  { q: "Staff names and roles?", cat: "👥 Staff", p: "high" },
  { q: "Liquor licence number and renewal date?", cat: "📋 Compliance", p: "high" },
  { q: "CIPC registration number?", cat: "📋 Compliance", p: "high" },
  { q: "VAT registration number?", cat: "💰 Finance", p: "high" },
  { q: "UIF employer reference number?", cat: "📋 Compliance", p: "high" },
  { q: "Food cost target %? What are you actually hitting?", cat: "📊 Metrics", p: "high" },
  { q: "Public liability insurance?", cat: "📋 Insurance", p: "high" },
  { q: "Alarm company and code for the restaurant?", cat: "🔑 Security", p: "high" },
  { q: "Where are important physical documents stored?", cat: "📄 Documents", p: "high" },
  { q: "Emergency contacts — who gets called first?", cat: "🚨 Emergency", p: "high" },
  { q: "Any chronic medication or dosages?", cat: "🏥 Health", p: "high" },
  { q: "Revenue target for this year?", cat: "🎯 Goals", p: "high" },
  { q: "Your dental, optometry or gap cover details?", cat: "🏥 Health", p: "medium" },
  { q: "Saturday Cocktail Night — decided on the 8 cocktails?", cat: "🍔 Restaurant", p: "medium" },
  { q: "Quiz Night host — any contacts?", cat: "🍔 Restaurant", p: "medium" },
  { q: "Single burger price point? Target food cost?", cat: "🍔 Restaurant", p: "medium" },
  { q: "Car mechanic name and number?", cat: "🚗 Vehicle", p: "medium" },
  { q: "Recurring subscriptions and monthly costs?", cat: "💰 Finance", p: "medium" },
  { q: "What supplements are you taking?", cat: "🏥 Health", p: "medium" },
  { q: "Best-selling menu items? Top 3?", cat: "📊 Metrics", p: "medium" },
  { q: "Average spend per head?", cat: "📊 Metrics", p: "medium" },
  { q: "Google Business rating and reviews?", cat: "📣 Marketing", p: "medium" },
  { q: "Social media handles?", cat: "📣 Marketing", p: "medium" },
  { q: "Pest control — who and how often?", cat: "🍔 Restaurant", p: "medium" },
  { q: "SAMRO/CAPASSO music licensing?", cat: "📋 Compliance", p: "medium" },
  { q: "Fire extinguisher last service date?", cat: "📋 Compliance", p: "medium" },
  { q: "Parents' birthdays?", cat: "👨‍👩‍👧 Family", p: "medium" },
  { q: "Partner's birthday and anniversary?", cat: "👨‍👩‍👧 Family", p: "medium" },
  { q: "SmashPOS — current phase?", cat: "💻 Tech", p: "medium" },
  { q: "GitHub repo URLs?", cat: "💻 Tech", p: "medium" },
  { q: "Domain names owned or planned?", cat: "💻 Tech", p: "medium" },
  { q: "Who manages restaurant when you're in JHB?", cat: "🍔 Restaurant", p: "high" },
  { q: "What POS system are you currently using?", cat: "💻 Tech", p: "medium" },
  { q: "Laptop purchase receipt stored? Where from?", cat: "💻 Tech", p: "medium" },
  { q: "Home address in JHB with postal code?", cat: "🏠 Home", p: "medium" },
  { q: "Lease or own in JHB? Expiry?", cat: "🏠 Home", p: "medium" },
  { q: "ISP details — speed, cost, account number?", cat: "🏠 Home", p: "low" },
  { q: "Beer lineup on tap?", cat: "🍔 Restaurant", p: "low" },
  { q: "Contractors — who would you use again vs avoid?", cat: "👷 Contractors", p: "low" },
  { q: "Home Wi-Fi password?", cat: "🏠 Home", p: "low" },
  { q: "Dentist name and last checkup?", cat: "🏥 Health", p: "medium" },
  { q: "Favourite JHB restaurants?", cat: "🍽️ Food", p: "low" },
  { q: "Shoe size, clothing sizes?", cat: "🛒 Personal", p: "low" },
  { q: "Spare key locations — house, car, restaurant?", cat: "🔑 Security", p: "medium" },
  { q: "Car licence disc renewal date?", cat: "🚗 Vehicle", p: "medium" },
  { q: "Plumber contact?", cat: "🏠 Home", p: "low" },
  { q: "Locksmith number?", cat: "🏠 Home", p: "low" },
  { q: "Nearest hospital to home? And to restaurant?", cat: "🚨 Emergency", p: "medium" },
  { q: "1-year goal for Smash Burger Bar?", cat: "🎯 Goals", p: "medium" },
  { q: "5-year vision — franchise? More locations?", cat: "🎯 Goals", p: "medium" },
  { q: "SmashPOS launch target date?", cat: "🎯 Goals", p: "medium" },
  { q: "Travel bucket list?", cat: "✈️ Travel", p: "low" },
  { q: "Books read or want to read?", cat: "📚 Growth", p: "low" },
  { q: "Podcasts you listen to?", cat: "📚 Growth", p: "low" },
  { q: "Second location — where would it be?", cat: "🎯 Goals", p: "low" },
  { q: "What would you do differently building the restaurant?", cat: "💡 Reflection", p: "low" },
  { q: "Paint colors for your home?", cat: "🏠 Home", p: "low" },
  { q: "Cleaning supplies — what and where?", cat: "🍔 Restaurant", p: "low" },
  { q: "Email addresses — personal, business, dev?", cat: "💻 Tech", p: "medium" },
  { q: "Gym membership? Where and cost?", cat: "🏋️ Fitness", p: "low" },
  { q: "Regular customers or VIPs to remember?", cat: "👥 Customers", p: "low" },
  { q: "Social media content — in-house or outsourced?", cat: "📣 Marketing", p: "low" },
  { q: "Worst-selling menu items to remove?", cat: "🍔 Restaurant", p: "medium" },
  { q: "Full menu with current prices?", cat: "🍔 Restaurant", p: "high" },
  { q: "Busiest day and time from POS data?", cat: "📊 Metrics", p: "medium" },
  { q: "Electricity account number?", cat: "🏠 Home", p: "low" },
  { q: "Home contents insurance?", cat: "📋 Insurance", p: "medium" },
  { q: "Business ideas outside restaurants?", cat: "💡 Ideas", p: "low" },
  { q: "Skills or courses to learn this year?", cat: "🎯 Goals", p: "low" },
  { q: "Phone model for warranty?", cat: "💻 Tech", p: "low" },
  { q: "Health & safety COC certificate?", cat: "📋 Compliance", p: "high" },
].sort((a, b) => {
  const w = { high: 3, medium: 2, low: 1 };
  return (w[b.p] || 0) - (w[a.p] || 0) + (Math.random() - 0.5) * 0.5;
});

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
            system: `You parse raw input into a structured OpenBrain entry. Return ONLY valid JSON, no markdown.\nFormat: {"title":"...","content":"...","type":"note|person|place|idea|contact|document|reminder|color|decision","metadata":{},"tags":[]}\nTypes: person (people), place (locations/restaurants), idea (concepts), contact (services/suppliers), document (official docs), reminder (deadlines), color (paint/design), decision (choices made), note (everything else).\nBe smart: extract phone numbers into metadata, dates into metadata, infer tags from context. Keep title concise, content descriptive.`,
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
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && capture()} disabled={loading}
          placeholder={loading ? "Processing..." : "Quick capture — just type anything..."}
          style={{ flex: 1, padding: "12px 16px", background: "#1a1a2e", border: "1px solid #4ECDC440", borderRadius: 12, color: "#ddd", fontSize: 14, outline: "none", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }} />
        <button onClick={capture} disabled={loading || !text.trim()} style={{ padding: "12px 18px", background: text.trim() && !loading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : "#1a1a2e", border: "none", borderRadius: 12, color: text.trim() && !loading ? "#0f0f23" : "#555", fontWeight: 700, cursor: text.trim() && !loading ? "pointer" : "default", fontSize: 16 }}>+</button>
      </div>
      {status && <p style={{ fontSize: 11, color: status.includes("error") ? "#FF6B35" : "#4ECDC4", margin: "6px 0 0 4px", transition: "opacity 0.3s" }}>{statusMsg[status]}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════════════════════ */
function SettingsView({ apiKey, setApiKey, sbKey, setSbKey }) {
  const [showApi, setShowApi] = useState(false);
  const [showSb, setShowSb] = useState(false);
  const [testStatus, setTestStatus] = useState(null);

  const testConnection = async () => {
    if (!sbKey) return;
    setTestStatus("testing");
    try {
      const res = await authFetch("/api/health");
      setTestStatus(res.ok ? "success" : "fail");
    } catch { setTestStatus("fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };

  const testAI = async () => {
    if (!apiKey) return;
    setTestStatus("testing-ai");
    try {
      const res = await authFetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 50, messages: [{ role: "user", content: "Say 'connected' in one word" }] })
      });
      setTestStatus(res.ok ? "ai-success" : "ai-fail");
    } catch { setTestStatus("ai-fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px 16px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#ddd", fontSize: 14, outline: "none", fontFamily: "monospace" };
  const btnStyle = { padding: "10px 20px", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#EAEAEA" }}>Settings</h2>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 24px" }}>Configure API keys for AI parsing and direct database writes.</p>

      <div style={{ background: "#1a1a2e", borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ddd" }}>Anthropic API Key (Haiku)</p><p style={{ margin: "2px 0 0", fontSize: 11, color: "#666" }}>Powers AI parsing of quick captures and chat</p></div>
          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: apiKey ? "#4ECDC420" : "#FF6B3520", color: apiKey ? "#4ECDC4" : "#FF6B35", fontWeight: 600 }}>{apiKey ? "Set" : "Not set"}</span>
        </div>
        <div style={{ position: "relative" }}>
          <input type={showApi ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..." style={inputStyle} />
          <button onClick={() => setShowApi(!showApi)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12 }}>{showApi ? "Hide" : "Show"}</button>
        </div>
        {apiKey && <button onClick={testAI} style={{ ...btnStyle, marginTop: 10, background: "#4ECDC420", color: "#4ECDC4" }}>
          {testStatus === "testing-ai" ? "Testing..." : testStatus === "ai-success" ? "✅ Connected!" : testStatus === "ai-fail" ? "❌ Failed" : "Test AI Connection"}
        </button>}
      </div>

      <div style={{ background: "#1a1a2e", borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ddd" }}>Supabase Service Key</p><p style={{ margin: "2px 0 0", fontSize: 11, color: "#666" }}>Enables direct database writes from the app</p></div>
          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: sbKey ? "#4ECDC420" : "#FF6B3520", color: sbKey ? "#4ECDC4" : "#FF6B35", fontWeight: 600 }}>{sbKey ? "Set" : "Not set"}</span>
        </div>
        <div style={{ position: "relative" }}>
          <input type={showSb ? "text" : "password"} value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="eyJ..." style={inputStyle} />
          <button onClick={() => setShowSb(!showSb)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12 }}>{showSb ? "Hide" : "Show"}</button>
        </div>
        {sbKey && <button onClick={testConnection} style={{ ...btnStyle, marginTop: 10, background: "#4ECDC420", color: "#4ECDC4" }}>
          {testStatus === "testing" ? "Testing..." : testStatus === "success" ? "✅ Connected!" : testStatus === "fail" ? "❌ Failed" : "Test DB Connection"}
        </button>}
      </div>

      <div style={{ background: "#1a1a2e", borderRadius: 14, padding: "20px 24px", border: "1px solid #2a2a4a" }}>
        <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#ddd" }}>Connection Info</p>
        <p style={{ margin: 0, fontSize: 12, color: "#888", lineHeight: 1.6 }}>
          Project: OpenBrain<br />URL: {SB_URL}<br />Owner: {OWNER_ID}<br />Region: eu-west-1
        </p>
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

  const cats = useMemo(() => { const c = {}; SUGGESTIONS.forEach(s => { c[s.cat] = (c[s.cat] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); }, []);
  const view = useMemo(() => filterCat === "all" ? SUGGESTIONS : SUGGESTIONS.filter(s => s.cat === filterCat), [filterCat]);
  const current = view[idx % view.length];
  const total = view.length;

  const next = useCallback((dir) => { setAnim(dir); setTimeout(() => { setAnswer(""); setShowInput(false); setAnim(""); setIdx(p => (p + 1) % total); }, 200); }, [total]);

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

      {current && <div style={{ background: "linear-gradient(135deg, #1a1a2e, #16162a)", border: "1px solid #2a2a4a", borderRadius: 16, padding: "28px 24px", marginBottom: 16, position: "relative", overflow: "hidden", transform: anim === "skip" ? "translateX(-30px)" : anim === "save" ? "scale(0.95)" : "none", opacity: anim ? 0.4 : 1, transition: "all 0.2s" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${pc.c}, transparent)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, background: pc.bg, color: pc.c, padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{pc.l}</span>
          <span style={{ fontSize: 11, color: "#666" }}>{current.cat}</span>
          <span style={{ fontSize: 10, color: "#444", marginLeft: "auto" }}>#{(idx % total) + 1}/{total}</span>
        </div>
        <p style={{ fontSize: 18, color: "#EAEAEA", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{current.q}</p>
      </div>}

      {!showInput ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} style={{ flex: 1, padding: 14, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 12, color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Skip →</button>
          <button onClick={() => setShowInput(true)} style={{ flex: 2, padding: 14, background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", border: "none", borderRadius: 12, color: "#0f0f23", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Answer this</button>
        </div>
      ) : (
        <div>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer..." autoFocus
            style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "14px 16px", background: "#1a1a2e", border: "1px solid #4ECDC440", borderRadius: 12, color: "#ddd", fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={() => { setShowInput(false); setAnswer(""); }} style={{ flex: 1, padding: 12, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} style={{ flex: 1, padding: 12, background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 10, color: "#FF6B35", fontSize: 13, cursor: "pointer" }}>Skip</button>
            <button onClick={handleSave} disabled={!answer.trim() || saving} style={{ flex: 2, padding: 12, background: answer.trim() ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : "#1a1a2e", border: "none", borderRadius: 10, color: answer.trim() ? "#0f0f23" : "#444", fontSize: 13, fontWeight: 700, cursor: answer.trim() ? "pointer" : "default" }}>
              {saving ? "Saving..." : apiKey && sbKey ? "Save to DB" : "Save Answer"}
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
   DETAIL MODAL
   ═══════════════════════════════════════════════════════════════ */
function DetailModal({ entry, onClose }) {
  if (!entry) return null;
  const cfg = TC[entry.type] || TC.note;
  const related = LINKS.filter(l => l.from === entry.id || l.to === entry.id).map(l => ({ ...l, other: INITIAL_ENTRIES.find(e => e.id === (l.from === entry.id ? l.to : l.from)), dir: l.from === entry.id ? "→" : "←" }));
  const skip = new Set(["category", "status"]);
  const meta = Object.entries(entry.metadata || {}).filter(([k]) => !skip.has(k));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000CC", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#16162a", borderRadius: 16, maxWidth: 600, width: "100%", maxHeight: "85vh", overflow: "auto", border: `1px solid ${cfg.c}40` }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "24px 28px", borderBottom: "1px solid #2a2a4a", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ fontSize: 24 }}>{cfg.i}</span><span style={{ fontSize: 11, color: cfg.c, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>{entry.type}</span></div>
            <h2 style={{ margin: 0, fontSize: 22, color: "#EAEAEA", fontWeight: 700 }}>{entry.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "20px 28px" }}>
          <p style={{ color: "#bbb", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{entry.content}</p>
          {meta.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 12 }}>
            {meta.map(([k, v]) => <div key={k} style={{ fontSize: 12 }}><span style={{ color: "#888", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}: </span><span style={{ color: "#ccc" }}>{Array.isArray(v) ? v.join(", ") : String(v)}</span></div>)}
          </div>}
          {entry.tags?.length > 0 && <div style={{ marginTop: 16 }}><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{entry.tags.map(t => <span key={t} style={{ fontSize: 11, color: cfg.c, background: cfg.c + "15", padding: "4px 12px", borderRadius: 20 }}>{t}</span>)}</div></div>}
          {related.length > 0 && <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #2a2a4a" }}>
            <p style={{ fontSize: 11, color: "#666", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>Connections</p>
            {related.map((r, i) => r.other && <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#ffffff05", borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
              <span>{TC[r.other.type]?.i}</span><span style={{ color: "#999" }}>{r.dir}</span><span style={{ color: "#ccc", flex: 1 }}>{r.other.title}</span><span style={{ color: "#666", fontSize: 11, fontStyle: "italic" }}>{r.rel}</span>
            </div>)}
          </div>}
        </div>
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
      <div style={{ display: "flex", gap: 0, padding: "0 24px", borderBottom: "1px solid #1a1a2e" }}>
        {views.map(v => <button key={v.id} onClick={() => setView(v.id)} style={{
          flex: 1, padding: "10px 0", border: "none", borderBottom: view === v.id ? "2px solid #4ECDC4" : "2px solid transparent",
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

        {view === "settings" && <SettingsView apiKey={apiKey} setApiKey={setApiKey} sbKey={sbKey} setSbKey={setSbKey} />}
      </div>

      <DetailModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
