# Next Steps — 2026-04-03

## Immediate (do first) — Complete AI-models.md Phase 2 + 3

### Phase 2: Add task: params to all callAI() sites

**OpenBrain.jsx** — grep for `callAI({` and add task param:
- `findConnections` function (near top, link discovery) → `task: "refine"`
- Nudge useEffect (~line 287) → `task: "chat"`
- `handleChat` (~line 451) → `task: "chat"`
- Onboarding batch parse (~line 740) → `task: "capture"`
- Also check QuickCapture callAI if present → `task: "capture"`

**SuggestionsView.jsx** — 3 changes:
1. ~line 168: image upload is `authFetch("/api/anthropic", {...})` → replace with `callAI({ messages: [{role:"user", content:[{type:"image",...},{type:"text",...}]}], max_tokens: 600, task: "vision" })`
2. FILL_BRAIN callAI() → add `task: "questions"`
3. QA_PARSE callAI() → add `task: "capture"`

**RefineView.jsx** — 2 changes:
1. ENTRY_AUDIT callAI() → add `task: "refine"`
2. LINK_DISCOVERY callAI() → add `task: "refine"`

### Phase 3: Settings UI in OpenBrain.jsx SettingsView

Add before `function SettingsView`:
```js
function priceTier(pricing) {
  if (pricing?.prompt === undefined || pricing?.prompt === null) return null;
  const p = parseFloat(pricing.prompt);
  if (isNaN(p)) return null;
  if (p === 0)       return { label: "Free",      color: "#22c55e" };
  if (p < 0.000001) return { label: "Cheap",     color: "#4ECDC4" };
  if (p < 0.000010) return { label: "Normal",    color: "#888" };
  return              { label: "Expensive",  color: "#FF6B35" };
}
const TASK_DEFINITIONS = [
  { key: "capture",   label: "Entry capture",       desc: "Parsing text into structured entries",    visionOnly: false },
  { key: "questions", label: "Fill Brain questions", desc: "Generating personalised questions",       visionOnly: false },
  { key: "vision",    label: "Image reading",        desc: "Extracting text from photos",            visionOnly: true  },
  { key: "refine",    label: "Refine collection",    desc: "Auditing entries + discovering links",   visionOnly: false },
  { key: "chat",      label: "Brain chat",           desc: "Answering questions from memory",        visionOnly: false },
];
const OR_VISION_SHORTLIST = ["openai/gpt-4o","openai/gpt-4o-mini","google/gemini-2.0-flash-exp:free","anthropic/claude-3.5-haiku","anthropic/claude-sonnet-4-5"];
```

Inside SettingsView, add state:
```js
const [taskModels, setTaskModels] = useState(() => { const uid = getUserId(); if (!uid) return {}; return Object.fromEntries(TASK_DEFINITIONS.map(t => [t.key, localStorage.getItem(`openbrain_${uid}_task_${t.key}`) || ""])); });
const [taskSectionOpen, setTaskSectionOpen] = useState(false);
```

Add useEffect (after members useEffect):
```js
useEffect(() => {
  const uid = getUserId();
  if (!uid) return;
  supabase.from("user_ai_settings").select("model_capture,model_questions,model_vision,model_refine,model_chat").eq("user_id", uid).single()
    .then(({ data }) => { if (!data) return; loadTaskModels(uid, data); setTaskModels(Object.fromEntries(TASK_DEFINITIONS.map(t => [t.key, localStorage.getItem(`openbrain_${uid}_task_${t.key}`) || ""]))); });
}, []);
```

Add handler after `saveOrModel`:
```js
const saveTaskModel = (task, model) => { setModelForTask(task, model || null); setTaskModels(prev => ({ ...prev, [task]: model })); };
```

Update `fetchOrModels` model mapping — add `modality: m.architecture?.modality ?? "text->text"` to each model object.

Update global OR model picker option labels to use `priceTier()` instead of raw $/1M.

Add per-task section after the global model picker, inside the OpenRouter branch of the AI Provider card.

Import `setModelForTask`, `loadTaskModels` in OpenBrain.jsx aiFetch import line (already imports `getModelForTask` — add the other two).

## Soon
- Fix QuickCapture offline path — missing `p_brain_id` in `enqueue()` body in `src/OpenBrain.jsx`
- Delete SupplierPanel dead code from `src/OpenBrain.jsx`
- Apply migration 006 if not yet applied (check Supabase dashboard first)

## Deferred
- AI-models.md Phase 4 (Voice/Whisper) — separate transcription API, needs design
- Wire GraphView + CalendarView to live entries (currently use INITIAL_ENTRIES)
- TodoView DB sync (currently localStorage-only)

## Warnings
- ⚠️ SuggestionsView.jsx image upload is hardcoded `authFetch("/api/anthropic")` — this is the most important fix; it bypasses the entire model routing system
- ⚠️ After adding task: params, verify OpenBrain.jsx still imports `setModelForTask` and `loadTaskModels` from `./lib/aiFetch` (add to import line 5 if missing)
- ⚠️ `src/config/prompts.js` EXISTS — use `PROMPTS.*` constants when adding task params, do not revert to inline strings
