# EverionMind Launch MVP Sprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the app to its focused core, build the daily-return habit loop (Feed + onboarding + streaks), polish, and ship.

**Architecture:** Phase-by-phase execution with commits after each phase passes exit criteria. Feature flags hide multi-brain (no code deletion). New Feed view + API become home screen. Onboarding rewritten as guided value demo. Global capture shortcut + streak system drive retention.

**Tech Stack:** React 19, Vite 8, TypeScript, TailwindCSS 4, Supabase (Postgres + Auth), Vercel serverless functions, Gemini 2.5 Flash Lite (default LLM).

---

## Phase 1: Simplify

---

### Task 1: Create feature flags module

**Files:**
- Create: `src/lib/featureFlags.ts`

- [ ] **Step 1: Create `src/lib/featureFlags.ts`**

```ts
export function isMultiBrainEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_MULTI_BRAIN === "true";
}
```

- [ ] **Step 2: Add env var to `.env.example`**

After the `VITE_ANTHROPIC_MODEL` line in `.env.example`, add:

```
# ── Feature Flags ─────────────────────────────────────────────────────
VITE_ENABLE_MULTI_BRAIN=false
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/featureFlags.ts .env.example
git commit -m "feat: add feature flags module with ENABLE_MULTI_BRAIN"
```

---

### Task 2: Feature-flag multi-brain components

**Files:**
- Modify: `src/components/BrainSwitcher.tsx:15-21`
- Modify: `src/components/CreateBrainModal.tsx:30-33`
- Modify: `src/views/SettingsView.tsx:117-124`
- Modify: `src/components/DesktopSidebar.tsx:121-258`
- Modify: `src/components/MobileHeader.tsx:14-22`
- Modify: `src/OpenBrain.tsx:92-97,396-458,1007-1033`

- [ ] **Step 1: Gate BrainSwitcher**

In `src/components/BrainSwitcher.tsx`, add import and early return:

```tsx
// Add at top of file, after existing imports:
import { isMultiBrainEnabled } from "../lib/featureFlags";

// Replace the start of the component function (line 15-21):
export default function BrainSwitcher({
  brains,
  activeBrain,
  onSwitch,
  onBrainCreated,
  onBrainTip,
}: BrainSwitcherProps): JSX.Element | null {
  if (!isMultiBrainEnabled()) return null;
```

- [ ] **Step 2: Gate CreateBrainModal**

In `src/components/CreateBrainModal.tsx`, add import and early return:

```tsx
// Add at top of file, after existing imports:
import { isMultiBrainEnabled } from "../lib/featureFlags";

// Replace line 30-33:
export default function CreateBrainModal({
  onClose,
  onCreate,
}: CreateBrainModalProps): JSX.Element | null {
  if (!isMultiBrainEnabled()) return null;
```

- [ ] **Step 3: Hide Brain tab from Settings**

In `src/views/SettingsView.tsx`, add import and filter:

```tsx
// Add at top, after existing imports:
import { isMultiBrainEnabled } from "../lib/featureFlags";
```

Change line 139 from:
```tsx
  const tabs = TAB_DEFS;
```
to:
```tsx
  const tabs = isMultiBrainEnabled() ? TAB_DEFS : TAB_DEFS.filter((t) => t.id !== "brain");
```

- [ ] **Step 4: Hide "New brain" button in DesktopSidebar**

In `src/components/DesktopSidebar.tsx`, add import:

```tsx
// Add at top, after existing imports:
import { isMultiBrainEnabled } from "../lib/featureFlags";
```

Wrap the "New brain" button (lines 236-251) with the flag. Replace:
```tsx
            {/* New brain */}
            <button
              onClick={onShowCreateBrain}
              aria-label="Create new brain"
              className="text-on-surface-variant hover:text-primary hover:bg-surface-container press-scale flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all"
            >
```
with:
```tsx
            {/* New brain */}
            {isMultiBrainEnabled() && (
            <button
              onClick={onShowCreateBrain}
              aria-label="Create new brain"
              className="text-on-surface-variant hover:text-primary hover:bg-surface-container press-scale flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all"
            >
```

And close the conditional after the button's closing `</button>` (after line 251):
```tsx
            </button>
            )}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (0 errors)

- [ ] **Step 6: Commit**

```bash
git add src/components/BrainSwitcher.tsx src/components/CreateBrainModal.tsx src/views/SettingsView.tsx src/components/DesktopSidebar.tsx
git commit -m "feat: feature-flag multi-brain behind VITE_ENABLE_MULTI_BRAIN"
```

---

### Task 3: Disable Vault auto-prompting

**Files:**
- Modify: `src/components/CaptureSheet.tsx:4,10,34,39`
- Modify: `src/components/BottomNav.tsx` (vault removal handled in Task 4)

- [ ] **Step 1: Remove VaultIntroModal auto-trigger from CaptureSheet**

In `src/components/CaptureSheet.tsx`:

Remove the VaultIntroModal import (line 4):
```tsx
// DELETE this line:
import { VaultIntroModal } from "./VaultIntroModal";
```

Remove the VAULT_INTRO_KEY constant (line 10):
```tsx
// DELETE this line:
const VAULT_INTRO_KEY = "ob_vault_intro_seen";
```

Remove the `showVaultIntro` state (line 39):
```tsx
// DELETE this line:
const [showVaultIntro, setShowVaultIntro] = useState(false);
```

Hide the "secret" tab entirely — find the tab switcher that toggles between "entry" and "secret" and wrap the secret tab button with a condition. Search for `setActiveTab("secret")` and either remove that UI element or wrap it:

```tsx
// If there's a tab bar with entry/secret, hide the secret option:
// Only show secret tab if vault exists (passed as prop)
```

Also remove any rendering of `<VaultIntroModal>` in the component's JSX — search for `showVaultIntro` and remove the conditional render block.

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/CaptureSheet.tsx
git commit -m "feat: disable vault auto-prompting in capture sheet"
```

---

### Task 4: Simplify navigation to Feed | Capture | Ask | Memory | Settings

**Files:**
- Modify: `src/components/BottomNav.tsx:5-11,13`
- Modify: `src/components/DesktopSidebar.tsx:57,135`
- Modify: `src/components/MobileMoreMenu.tsx` (remove entirely from rendering)
- Modify: `src/OpenBrain.tsx:92-97,179,1007-1019,1020-1033`
- Modify: `src/components/icons/NavIcons.tsx` (add feed icon)
- Create: `src/views/FeedView.tsx`

- [ ] **Step 1: Add feed icon to NavIcons**

In `src/components/icons/NavIcons.tsx`, add a feed icon to the NavIcon object (before the closing `} as const;`):

```tsx
  feed: (
    <Icon>
      <path
        {...P}
        d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
      />
    </Icon>
  ),
```

- [ ] **Step 2: Rewrite BottomNav with new nav items**

Replace the `NAV_ITEMS` array and `MORE_IDS` in `src/components/BottomNav.tsx`:

```tsx
const NAV_ITEMS = [
  { id: "feed", label: "Feed", icon: NavIcon.feed },
  { id: "_capture_fab", label: "Capture", isFAB: true, icon: NavIcon.add },
  { id: "chat", label: "Ask", icon: NavIcon.chat },
  { id: "grid", label: "Memory", icon: NavIcon.grid },
  { id: "settings", label: "Settings", icon: NavIcon.settings },
];
```

Remove `const MORE_IDS` line entirely.

In `BottomNavInner`, remove the `isMoreActive` line:
```tsx
// DELETE:
const isMoreActive = MORE_IDS.has(activeView);
```

Update the isActive check inside the map (replace the ternary):
```tsx
const isActive = activeView === item.id;
```

Remove the `refineBadge` prop from the interface and component — delete the `refineBadge` lines from `BottomNavProps` interface and the badge rendering JSX block.

- [ ] **Step 3: Update DesktopSidebar nav**

In `src/components/DesktopSidebar.tsx`:

Change `CAPTURE_NAV` (line 57):
```tsx
const CAPTURE_NAV: NavView = { id: "feed", l: "Feed", ic: "📰" };
```

Add feed to `NAV_ICONS` (after the existing entries):
```tsx
  feed: NavIcon.feed,
```

Also add the NavIcon import for feed — it's already imported via `NavIcon`.

- [ ] **Step 4: Create placeholder FeedView**

Create `src/views/FeedView.tsx`:

```tsx
interface FeedViewProps {
  onCapture: () => void;
}

export default function FeedView({ onCapture }: FeedViewProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="text-5xl">🧠</div>
      <h2
        className="text-on-surface text-xl font-bold"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Your Feed is coming soon
      </h2>
      <p className="text-on-surface-variant max-w-sm text-sm">
        This will be your daily brain digest — resurfaced memories, insights, and suggestions.
      </p>
      <button
        onClick={onCapture}
        className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold transition-all"
        style={{ background: "var(--color-primary)" }}
      >
        Capture a thought
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Update OpenBrain.tsx — nav views, default view, add feed rendering**

In `src/OpenBrain.tsx`:

Add FeedView import after the other view imports (around line 53):
```tsx
import FeedView from "./views/FeedView";
```

Change NAV_VIEWS (lines 92-97):
```tsx
const NAV_VIEWS = [
  { id: "grid", l: "Memory", ic: "▦" },
  { id: "chat", l: "Ask", ic: "◈" },
];
```

Change default view state (line 179):
```tsx
const [view, setView] = useState("feed");
```

Add feed view rendering in the view switch area (after `{view === "settings" && <SettingsView onNavigate={setView} />}`, around line 649):
```tsx
                {view === "feed" && (
                  <FeedView onCapture={() => setShowCapture(true)} />
                )}
```

Remove MobileMoreMenu from rendering — find the `<MobileMoreMenu` JSX block (lines 1007-1019) and remove it entirely. Also remove the `navOpen` state usage and the `MobileMoreMenu` import.

In the BottomNav `onNavigate` handler (lines 1022-1030), remove the "more" handling:
```tsx
                onNavigate={(id) => {
                  setSelected(null);
                  setShowCapture(false);
                  setView(id);
                }}
```

Also update the `onComplete` in OnboardingModal (line 989) to navigate to feed instead of capture:
```tsx
                    setView("feed");
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Test in browser**

Run: `npm run dev`
Verify:
- App loads with Feed as home screen
- BottomNav shows: Feed | Capture(FAB) | Ask | Memory | Settings
- DesktopSidebar shows: Feed, Memory, Ask + Settings in footer
- No "More" menu, no Todos, no Refine, no Vault, no Timeline in nav
- BrainSwitcher is hidden (flag defaults to false)
- "New brain" button is hidden
- All 5 nav items work (Feed shows placeholder, others show existing views)

- [ ] **Step 8: Commit**

```bash
git add src/components/icons/NavIcons.tsx src/components/BottomNav.tsx src/components/DesktopSidebar.tsx src/views/FeedView.tsx src/OpenBrain.tsx
git commit -m "feat: simplify navigation to Feed | Capture | Ask | Memory | Settings"
```

---

### Task 5: Remove claude-haiku defaults, set Gemini as default

**Files:**
- Modify: `src/data/constants.ts:35`
- Modify: `src/config/models.ts:8`
- Modify: `api/chat.ts:36`
- Modify: `api/llm.ts:12-16,288`
- Modify: `.env.example:12-13`

- [ ] **Step 1: Update `src/data/constants.ts`**

Change line 35 from:
```ts
export const MODEL: string = import.meta.env.VITE_ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
```
to:
```ts
export const MODEL: string = import.meta.env.VITE_MODEL ?? "gemini-2.5-flash-lite";
```

- [ ] **Step 2: Update `src/config/models.ts`**

Change line 8 from:
```ts
  ANTHROPIC: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
```
to:
```ts
  ANTHROPIC: ["claude-sonnet-4-6", "claude-opus-4-6"],
```

- [ ] **Step 3: Update `api/chat.ts`**

Change line 36 from:
```ts
const ALLOWED_ANTHROPIC_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"];
```
to:
```ts
const ALLOWED_ANTHROPIC_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6"];
```

- [ ] **Step 4: Update `api/llm.ts`**

Change lines 12-16 from:
```ts
const ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];
```
to:
```ts
const ANTHROPIC_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];
```

Change line 288 — the fallback model in the file extraction anthropic call:
```ts
body: JSON.stringify({ model: model || "claude-haiku-4-5-20251001", max_tokens: 4096, ...
```
to:
```ts
body: JSON.stringify({ model: model || "claude-sonnet-4-6", max_tokens: 4096, ...
```

- [ ] **Step 5: Update `.env.example`**

Replace lines 10-13:
```
# ── Anthropic ─────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
# Optional: override default model
VITE_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```
with:
```
# ── Anthropic (optional, for BYO key users) ──────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Default model ────────────────────────────────────────────────────
# Default: gemini-2.5-flash-lite (hardcoded in .env, override with VITE_MODEL)
# VITE_MODEL=gemini-2.5-flash-lite
```

- [ ] **Step 6: Update test files**

In `tests/lib/usageTracker.test.ts`, replace all `"claude-haiku-4-5-20251001"` with `"gemini-2.5-flash-lite"`.

In `tests/api/chat-fallback.test.ts`, replace `"claude-haiku-4-5-20251001"` with `"gemini-2.5-flash-lite"`.

In `tests/api/chat-allbrains.test.ts`, replace all `"claude-haiku-4-5-20251001"` with `"gemini-2.5-flash-lite"`.

- [ ] **Step 7: Verify typecheck and tests pass**

Run: `npm run typecheck && npm test`
Expected: Both PASS

- [ ] **Step 8: Commit**

```bash
git add src/data/constants.ts src/config/models.ts api/chat.ts api/llm.ts .env.example tests/
git commit -m "feat: remove claude-haiku defaults, set Gemini 2.5 Flash Lite as default"
```

---

### Task 6: Phase 1 exit criteria verification

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run test suite**

Run: `npm test`
Expected: PASS (or document pre-existing failures)

- [ ] **Step 3: Manual verification in browser**

Run: `npm run dev`

Verify:
1. App loads with simplified nav (5 items: Feed, Capture FAB, Ask, Memory, Settings)
2. Feed is the default home view (shows placeholder)
3. No "brains" references visible (BrainSwitcher hidden, "New brain" hidden)
4. Vault not auto-prompting, not in nav
5. Settings shows all tabs EXCEPT Brain tab
6. Capture sheet opens, no secret tab visible
7. All existing views (grid, chat, settings) still work

- [ ] **Step 4: Verify flag toggle**

Temporarily set `VITE_ENABLE_MULTI_BRAIN=true` in `.env` and restart dev server.
Verify: BrainSwitcher appears, "New brain" button appears, Brain tab in Settings appears.
Then set it back to `false`.

- [ ] **Step 5: Phase 1 commit**

```bash
git add -A
git commit -m "milestone: Phase 1 complete — simplified navigation, feature-flagged multi-brain, disabled vault"
```

---

## Phase 2: Build the Core

---

### Task 7: Build `/api/feed` endpoint

**Files:**
- Create: `api/feed.ts`

- [ ] **Step 1: Create `api/feed.ts`**

```ts
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_HEADERS: Record<string, string> = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };

function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${time}, ${name}.` : `${time}.`;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brainId = (req.query.brain_id as string) || "";
  if (!brainId) return res.status(400).json({ error: "brain_id required" });

  try {
    // 1. Resurfaced entries: 1-2 random entries from 1-6 months ago
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
    const oneMonthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const resurfacedRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&created_at=gte.${sixMonthsAgo}&created_at=lte.${oneMonthAgo}&deleted=is.false&select=id,title,content,type,tags,created_at&order=random&limit=2`,
      { headers: SB_HEADERS },
    );
    const resurfaced = resurfacedRes.ok ? await resurfacedRes.json() : [];

    // 2. Stats: entry count
    const statsRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted=is.false&select=id`,
      { headers: { ...SB_HEADERS, Prefer: "count=exact" } },
    );
    const entryCount = parseInt(statsRes.headers.get("content-range")?.split("/")[1] || "0", 10);

    // 3. Streak data from user metadata
    const userRes = await fetch(
      `${SB_URL}/auth/v1/admin/users/${user.id}`,
      { headers: SB_HEADERS },
    );
    const userData = userRes.ok ? await userRes.json() : {};
    const meta = userData.user_metadata || {};
    const streak = {
      current: meta.current_streak || 0,
      longest: meta.longest_streak || 0,
    };

    // 4. Latest gap-analyst insight (if any)
    const insightRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&type=eq.insight&deleted=is.false&select=content&order=created_at.desc&limit=1`,
      { headers: SB_HEADERS },
    );
    const insights = insightRes.ok ? await insightRes.json() : [];
    const insight = insights[0]?.content || null;

    // 5. Action suggestion: entries with few tags
    const sparseRes = await fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted=is.false&tags=eq.{}&select=id&limit=5`,
      { headers: SB_HEADERS },
    );
    const sparseEntries = sparseRes.ok ? await sparseRes.json() : [];
    const action = sparseEntries.length > 0
      ? `${sparseEntries.length} entries are missing tags. Review them to help your brain make connections.`
      : null;

    const name = meta.full_name || meta.name || user.email?.split("@")[0] || "";

    return res.status(200).json({
      greeting: getGreeting(name),
      resurfaced,
      insight,
      action,
      streak,
      stats: { entries: entryCount, connections: 0, insights: insights.length > 0 ? 1 : 0 },
    });
  } catch (err: any) {
    console.error("[feed]", err);
    return res.status(500).json({ error: "Failed to load feed" });
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add api/feed.ts
git commit -m "feat: add /api/feed endpoint for brain feed data"
```

---

### Task 8: Build FeedView component (replace placeholder)

**Files:**
- Modify: `src/views/FeedView.tsx` (full rewrite)
- Modify: `src/OpenBrain.tsx` (pass additional props)

- [ ] **Step 1: Rewrite `src/views/FeedView.tsx`**

```tsx
import { useState, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { fmtD } from "../data/constants";

interface FeedEntry {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string[];
  created_at: string;
}

interface FeedData {
  greeting: string;
  resurfaced: FeedEntry[];
  insight: string | null;
  action: string | null;
  streak: { current: number; longest: number };
  stats: { entries: number; connections: number; insights: number };
}

interface FeedViewProps {
  brainId: string | undefined;
  onCapture: () => void;
  onSelectEntry?: (entry: any) => void;
}

export default function FeedView({ brainId, onCapture, onSelectEntry }: FeedViewProps) {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brainId) return;
    setLoading(true);
    authFetch(`/api/feed?brain_id=${encodeURIComponent(brainId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch((err) => console.error("[FeedView]", err))
      .finally(() => setLoading(false));
  }, [brainId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl"
            style={{ background: "var(--color-surface-container)" }}
          />
        ))}
      </div>
    );
  }

  // Empty state for new users
  if (!data || data.stats.entries === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="text-5xl">🧠</div>
        <h2
          className="text-on-surface text-xl font-bold"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Your brain is empty. Let's fix that.
        </h2>
        <p className="text-on-surface-variant max-w-sm text-sm">
          Capture your first thought and watch your brain grow.
        </p>
        <button
          onClick={onCapture}
          className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold"
          style={{ background: "var(--color-primary)" }}
        >
          Capture a thought
        </button>
      </div>
    );
  }

  const dayOfWeek = new Date().getDay();
  // Rotate card order by day
  const showInsightFirst = dayOfWeek % 2 === 0;

  return (
    <div className="space-y-4">
      {/* Greeting + stats */}
      <div
        className="rounded-3xl border px-5 py-4"
        style={{
          background: "color-mix(in oklch, var(--color-primary) 8%, var(--color-surface))",
          borderColor: "color-mix(in oklch, var(--color-primary) 18%, transparent)",
        }}
      >
        <p className="text-on-surface text-base font-bold" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {data.greeting} Here's what your brain surfaced today:
        </p>
        <div className="text-on-surface-variant mt-2 flex flex-wrap gap-4 text-xs">
          <span>{data.stats.entries} memories</span>
          {data.streak.current > 0 && (
            <span>🔥 {data.streak.current}-day streak</span>
          )}
        </div>
      </div>

      {/* Resurfaced memories */}
      {showInsightFirst && data.insight && (
        <InsightCard insight={data.insight} />
      )}

      {data.resurfaced.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            From your memory
          </p>
          {data.resurfaced.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelectEntry?.(entry)}
              className="press-scale w-full rounded-2xl border p-4 text-left transition-all"
              style={{
                background: "var(--color-surface-container-low)",
                borderColor: "var(--color-outline-variant)",
              }}
            >
              <p className="text-on-surface text-sm font-semibold">{entry.title}</p>
              <p className="text-on-surface-variant mt-1 line-clamp-2 text-xs">
                {entry.content?.slice(0, 120)}
              </p>
              <p className="text-on-surface-variant/50 mt-2 text-[10px]">
                {fmtD(entry.created_at)}
              </p>
            </button>
          ))}
        </div>
      )}

      {!showInsightFirst && data.insight && (
        <InsightCard insight={data.insight} />
      )}

      {/* Action suggestion */}
      {data.action && (
        <div
          className="flex items-start gap-3 rounded-2xl border p-4"
          style={{
            background: "color-mix(in oklch, var(--color-secondary) 8%, var(--color-surface))",
            borderColor: "color-mix(in oklch, var(--color-secondary) 18%, transparent)",
          }}
        >
          <span className="text-lg">💡</span>
          <div className="flex-1">
            <p className="text-on-surface text-sm font-semibold">Suggestion</p>
            <p className="text-on-surface-variant mt-0.5 text-xs">{data.action}</p>
          </div>
        </div>
      )}

      {/* Capture CTA */}
      <div className="pt-2 text-center">
        <button
          onClick={onCapture}
          className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold"
          style={{ background: "var(--color-primary)" }}
        >
          What's on your mind?
        </button>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: string }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: "color-mix(in oklch, var(--color-status-medium) 8%, var(--color-surface))",
        borderColor: "color-mix(in oklch, var(--color-status-medium) 18%, transparent)",
      }}
    >
      <p
        className="text-xs font-semibold tracking-widest uppercase"
        style={{ color: "var(--color-status-medium)" }}
      >
        Insight
      </p>
      <p className="text-on-surface mt-1 text-sm leading-relaxed">{insight}</p>
    </div>
  );
}
```

- [ ] **Step 2: Update FeedView usage in OpenBrain.tsx**

Change the FeedView rendering (the block added in Task 4) from:
```tsx
                {view === "feed" && (
                  <FeedView onCapture={() => setShowCapture(true)} />
                )}
```
to:
```tsx
                {view === "feed" && (
                  <FeedView
                    brainId={activeBrain?.id}
                    onCapture={() => setShowCapture(true)}
                    onSelectEntry={setSelected}
                  />
                )}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Test in browser**

Run: `npm run dev`
Verify:
- Feed loads with greeting + stats for existing users
- Empty state shows for users with 0 entries
- Resurfaced memory cards render and are tappable
- Insight card renders if gap-analyst has produced output
- "What's on your mind?" CTA opens capture sheet

- [ ] **Step 5: Commit**

```bash
git add src/views/FeedView.tsx src/OpenBrain.tsx
git commit -m "feat: build Brain Feed home screen with resurfaced memories and insights"
```

---

### Task 9: Rewrite onboarding as guided value demo

**Files:**
- Modify: `src/components/OnboardingModal.tsx` (full rewrite)
- Modify: `src/OpenBrain.tsx` (update onComplete handler)

- [ ] **Step 1: Rewrite `src/components/OnboardingModal.tsx`**

```tsx
import { useState, useRef, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";

interface OnboardingModalProps {
  onComplete: () => void;
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
    onComplete();
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
    onComplete();
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
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
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
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
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
```

- [ ] **Step 2: Update OnboardingModal usage in OpenBrain.tsx**

Find the `{showOnboarding && (` block (around line 913) and replace the entire OnboardingModal rendering:

```tsx
              {showOnboarding && (
                <OnboardingModal
                  onComplete={() => {
                    setShowOnboarding(false);
                    setView("feed");
                  }}
                  brainId={activeBrain?.id}
                />
              )}
```

Also update the effect that auto-dismisses onboarding when brains load (around line 211-215). Remove or adjust it since the new onboarding handles its own completion:
```tsx
  // Remove the auto-dismiss effect — new onboarding handles its own state
```

Replace lines 211-215:
```tsx
  useEffect(() => {
    if (showOnboarding && brains.length > 0) {
      localStorage.setItem("openbrain_onboarded", "1");
      setShowOnboarding(false); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [brains, showOnboarding]);
```
with nothing (delete the block). The new onboarding sets `openbrain_onboarded` on its own when the user completes or skips.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Test in browser**

Clear localStorage `openbrain_onboarded` key. Reload app.
Verify:
1. Welcome screen appears
2. "Let's go" → bulk capture textarea
3. Type a few thoughts, "Teach my brain" → processing spinner
4. Query step with pre-filled "What patterns do you see?"
5. AI response displays
6. Celebration screen → "Start exploring" → Feed
7. Skip button works on every step

- [ ] **Step 5: Commit**

```bash
git add src/components/OnboardingModal.tsx src/OpenBrain.tsx
git commit -m "feat: rewrite onboarding as guided value demo with bulk capture + first query"
```

---

### Task 10: Global capture shortcut (Cmd+K + floating FAB)

**Files:**
- Modify: `src/OpenBrain.tsx` (add keyboard listener)
- Create: `src/components/FloatingCaptureButton.tsx`

- [ ] **Step 1: Add keyboard shortcut in OpenBrain.tsx**

Add this effect after the existing effects block (around line 230):

```tsx
  // Global Cmd+K / Ctrl+K capture shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCapture(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
```

- [ ] **Step 2: Create FloatingCaptureButton**

Create `src/components/FloatingCaptureButton.tsx`:

```tsx
interface FloatingCaptureButtonProps {
  onClick: () => void;
}

export default function FloatingCaptureButton({ onClick }: FloatingCaptureButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Capture a thought"
      title="Capture (Ctrl+K)"
      className="press-scale fixed right-5 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full lg:bottom-8"
      style={{
        background: "var(--color-primary)",
        color: "var(--color-on-primary)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <svg
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: Add FloatingCaptureButton to OpenBrain.tsx**

Import it at the top:
```tsx
import FloatingCaptureButton from "./components/FloatingCaptureButton";
```

Add it just before the `</div>` that closes the main content area (before `</BrainContext.Provider>`), but only when NOT on the capture view (to avoid double FAB with BottomNav):

```tsx
              {view !== "capture" && !showCapture && (
                <FloatingCaptureButton onClick={() => setShowCapture(true)} />
              )}
```

Note: On mobile, BottomNav already has the FAB. The FloatingCaptureButton is primarily for desktop (hidden on mobile with `lg:bottom-8` positioning, though visible on both is fine since the BottomNav FAB is `lg:hidden`).

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Test in browser**

- Press Cmd+K (Mac) or Ctrl+K — capture sheet should open
- FloatingCaptureButton visible on Feed, Ask, Memory, Settings
- Auto-focus works in capture text input

- [ ] **Step 6: Commit**

```bash
git add src/OpenBrain.tsx src/components/FloatingCaptureButton.tsx
git commit -m "feat: add global capture shortcut (Cmd+K) and floating capture button"
```

---

### Task 11: Streak tracking on capture

**Files:**
- Modify: `api/capture.ts` (add streak update logic)

- [ ] **Step 1: Read the current capture handler to understand its structure**

Read `api/capture.ts` fully before modifying.

- [ ] **Step 2: Add streak update after successful capture**

At the end of the successful capture path (after the entry is created and response is about to be sent), add streak update logic:

```ts
// --- Streak tracking ---
try {
  const userRes = await fetch(
    `${SB_URL}/auth/v1/admin/users/${user.id}`,
    { headers: SB_HEADERS },
  );
  if (userRes.ok) {
    const userData = await userRes.json();
    const meta = userData.user_metadata || {};
    const today = new Date().toISOString().slice(0, 10);
    const lastCapture = meta.last_capture_date || "";
    let currentStreak = meta.current_streak || 0;
    let longestStreak = meta.longest_streak || 0;

    if (lastCapture === today) {
      // Same day, no change
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (lastCapture === yesterday) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      if (currentStreak > longestStreak) longestStreak = currentStreak;

      await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: { ...SB_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_metadata: { ...meta, current_streak: currentStreak, longest_streak: longestStreak, last_capture_date: today },
        }),
      });
    }
  }
} catch (err) {
  console.error("[capture] streak update failed", err);
  // Non-blocking — capture still succeeds
}
```

This uses the Supabase Admin API to update user metadata. `SB_URL` and `SB_HEADERS` should already be available in the file.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add api/capture.ts
git commit -m "feat: track capture streak in user metadata"
```

---

### Task 12: Phase 2 exit criteria verification

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Manual verification in browser**

1. Feed shows greeting + resurfaced entries + stats (for user with data)
2. Feed shows "Your brain is empty" empty state (for new user / clear data)
3. Onboarding: complete all 6 steps, verify AI responds to query
4. Onboarding: skip button works from every step
5. Cmd+K opens capture from any view
6. FloatingCaptureButton visible on Feed, Ask, Memory, Settings
7. Streak counter shows in Feed greeting area after captures

- [ ] **Step 4: Phase 2 commit**

```bash
git add -A
git commit -m "milestone: Phase 2 complete — Feed, onboarding, global capture, streaks"
```

---

## Phase 3: Polish

---

### Task 13: Simplify Settings to 2 tabs (Profile + Advanced)

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Restructure SettingsView tabs**

Rewrite `TAB_DEFS` and the tab content rendering in `src/views/SettingsView.tsx`:

Change the type and tab definitions:
```tsx
type TabId = "profile" | "advanced";

const TAB_DEFS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <IconUser /> },
  { id: "advanced", label: "Advanced", icon: <IconBrain /> },
];
```

Remove icons that are no longer used as standalone tab icons (IconTarget, IconArchive, IconWarning can stay in the file since they're small and may be reused within sections).

Change the default tab:
```tsx
const [activeTab, setActiveTab] = useState<TabId>("profile");
```

Replace the tab content rendering section:
```tsx
      <div className="space-y-4 px-4 py-4">
        {activeTab === "profile" && (
          <>
            <AccountTab email={email} />
            <NotificationsTab />
          </>
        )}
        {activeTab === "advanced" && (
          <>
            <ProvidersTab activeBrain={activeBrain ?? undefined} />
            {onNavigate && (
              <div
                className="flex items-center justify-between rounded-2xl border px-4 py-3"
                style={{
                  background: "var(--color-surface-container-low)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                <div>
                  <p className="text-on-surface text-sm font-semibold">Vault</p>
                  <p className="text-on-surface-variant text-xs">End-to-end encrypted secrets</p>
                </div>
                <button
                  onClick={() => onNavigate("vault")}
                  className="press-scale rounded-xl px-4 py-2 text-xs font-semibold transition-all"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  Open Vault
                </button>
              </div>
            )}
            <StorageTab activeBrain={activeBrain ?? undefined} />
            {isMultiBrainEnabled() && activeBrain && (
              <BrainTab
                activeBrain={activeBrain}
                canInvite={canInvite}
                canManageMembers={canManageMembers}
                onRefreshBrains={refresh}
              />
            )}
            {activeBrain && (
              <DangerTab
                activeBrain={activeBrain}
                deleteBrain={deleteBrain}
                isOwner={activeBrain.myRole === "owner"}
                deleteAccount={async () => {
                  const session = await supabase.auth.getSession();
                  const token = session.data.session?.access_token;
                  const r = await fetch("/api/user-data?resource=account", {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!r.ok) {
                    const data = await r.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to delete account");
                  }
                  await supabase.auth.signOut();
                }}
              />
            )}

            {/* Replay onboarding */}
            <div
              className="rounded-2xl border px-4 py-3"
              style={{
                background: "var(--color-surface-container-low)",
                borderColor: "var(--color-outline-variant)",
              }}
            >
              <p className="text-on-surface text-sm font-semibold">Help</p>
              <button
                onClick={() => window.dispatchEvent(new Event("openbrain:restart-onboarding"))}
                className="text-primary mt-1 text-xs font-medium"
              >
                Replay onboarding
              </button>
            </div>
          </>
        )}
      </div>
```

Remove the `isMultiBrainEnabled` import filter on `tabs` (the one from Task 2 step 3) since we restructured tabs entirely. Add the import if not already present:
```tsx
import { isMultiBrainEnabled } from "../lib/featureFlags";
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Test in browser**

- Settings shows 2 tabs: Profile, Advanced
- Profile: account info + notifications
- Advanced: AI provider, Vault link, Storage, Data/Danger zone, Replay onboarding
- Brain tab only visible when multi-brain flag is on

- [ ] **Step 4: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat: simplify settings to Profile and Advanced tabs"
```

---

### Task 14: Empty state copy and CTAs

**Files:**
- Modify: `src/OpenBrain.tsx` (grid empty state)
- Modify: `src/views/FeedView.tsx` (already done in Task 8)

- [ ] **Step 1: Update grid (Memory) empty state**

In `src/OpenBrain.tsx`, find the grid empty state (around line 599-603):
```tsx
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <div className="text-4xl opacity-40">🔍</div>
                        <p className="text-on-surface font-bold">No memories match</p>
                      </div>
```

Replace with:
```tsx
                    ) : entries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        <div className="text-4xl">📝</div>
                        <p className="text-on-surface font-bold">Nothing here yet</p>
                        <p className="text-on-surface-variant max-w-xs text-sm">Your memories will appear as you capture thoughts.</p>
                        <button
                          onClick={() => setShowCapture(true)}
                          className="press-scale text-on-primary mt-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
                          style={{ background: "var(--color-primary)" }}
                        >
                          Capture your first thought
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <div className="text-4xl opacity-40">🔍</div>
                        <p className="text-on-surface font-bold">No memories match</p>
                      </div>
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/OpenBrain.tsx
git commit -m "feat: add empty state copy with CTAs for Memory view"
```

---

### Task 15: Code cleanup — typecheck, knip, console.logs

- [ ] **Step 1: Run typecheck and fix errors**

Run: `npm run typecheck`
Fix any errors.

- [ ] **Step 2: Run Knip for dead exports**

Run: `npx knip`
Remove any dead exports/imports created by Phase 1 changes (e.g., MobileMoreMenu import if removed, refineBadge prop removal ripple effects).

- [ ] **Step 3: Check for console.logs in production paths**

Search for `console.log` in `src/` and `api/` directories. Remove any debug logs that aren't error handlers. Leave `console.error` calls.

- [ ] **Step 4: Run test suite**

Run: `npm test`
Fix any failures.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: code cleanup — fix typecheck, remove dead imports, clean console.logs"
```

---

### Task 16: Phase 3 exit criteria

- [ ] **Step 1: Verify**

1. Settings has 2 tabs (Profile, Advanced)
2. All empty states have copy + CTAs
3. No typecheck errors
4. Test suite green
5. No dead imports (Knip clean)

- [ ] **Step 2: Phase 3 commit**

```bash
git add -A
git commit -m "milestone: Phase 3 complete — settings simplified, copy polished, code cleaned"
```

**Human tasks (not code):** Test with 3 real non-developer users. Document findings. Fix top 3 friction points.

---

## Phase 4: Launch Prep

---

### Task 17: OG meta tags

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add meta tags to `index.html`**

In the `<head>` section, add:

```html
    <!-- Open Graph -->
    <meta property="og:title" content="Everion — Your Second Brain" />
    <meta property="og:description" content="Capture thoughts, ask your brain anything, discover patterns you'd never see alone." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://everionmind.com" />
    <meta property="og:image" content="https://everionmind.com/og-image.png" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Everion — Your Second Brain" />
    <meta name="twitter:description" content="Capture thoughts, ask your brain anything, discover patterns you'd never see alone." />
    <meta name="twitter:image" content="https://everionmind.com/og-image.png" />
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add OG and Twitter Card meta tags for social sharing"
```

---

### Task 18: Early access monetization banner

**Files:**
- Create: `src/components/EarlyAccessBanner.tsx`
- Modify: `src/views/FeedView.tsx`

- [ ] **Step 1: Create `src/components/EarlyAccessBanner.tsx`**

```tsx
import { useState } from "react";

const DISMISS_KEY = "ob_early_access_dismissed";

export function EarlyAccessBanner() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  if (dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-4 py-3"
      style={{
        background: "color-mix(in oklch, var(--color-secondary) 6%, var(--color-surface))",
        borderColor: "color-mix(in oklch, var(--color-secondary) 15%, transparent)",
      }}
    >
      <span className="text-base">🎉</span>
      <p className="text-on-surface-variant flex-1 text-xs">
        <span className="text-on-surface font-semibold">Free during early access.</span>{" "}
        Starter plan coming soon. Early users get 50% off.
      </p>
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }}
        aria-label="Dismiss"
        className="text-on-surface-variant/50 hover:text-on-surface flex-shrink-0"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add to FeedView**

In `src/views/FeedView.tsx`, import and render at the top of the feed content (after greeting, before cards):

```tsx
import { EarlyAccessBanner } from "../components/EarlyAccessBanner";
```

Add `<EarlyAccessBanner />` as the first element inside the main feed `<div className="space-y-4">`, just before the greeting card.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Test in browser**

- Banner appears at top of Feed
- Dismiss button hides it permanently (localStorage)

- [ ] **Step 5: Commit**

```bash
git add src/components/EarlyAccessBanner.tsx src/views/FeedView.tsx
git commit -m "feat: add early access monetization banner to Feed"
```

---

### Task 19: Phase 4 exit criteria

- [ ] **Step 1: Verify**

1. OG meta tags in index.html
2. Early access banner visible and dismissible
3. Typecheck passes
4. Test suite passes

- [ ] **Step 2: Phase 4 commit**

```bash
git add -A
git commit -m "milestone: Phase 4 complete — OG tags, early access banner, launch prep"
```

**Human tasks:** Record 60-second demo, set up landing page, write 3 Twitter threads, draft Product Hunt listing, identify communities.

---

## Phase 5: Ship

---

### Task 20: Final code checks and Phase 5 exit

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Verify env vars documentation**

Ensure `.env.example` documents all env vars used in the app, including the new `VITE_ENABLE_MULTI_BRAIN`.

- [ ] **Step 4: UAT path verification**

Test in browser the full user journey:
1. Fresh user: signup → onboarding (6 steps) → celebration → Feed
2. Feed: shows empty state → capture → Feed refreshes with content
3. Ask: chat works with Gemini
4. Memory: grid shows entries
5. Settings: Profile + Advanced tabs work
6. Cmd+K: opens capture from any view
7. Mobile: BottomNav works, responsive layout correct

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "milestone: Phase 5 complete — all code checks pass, ready to ship"
```

**Human tasks:** Deploy to production via Vercel, smoke test production URL, verify Sentry, post launch content, monitor for 48 hours.

---

## Summary of Commits

| # | Message | Phase |
|---|---------|-------|
| 1 | feat: add feature flags module with ENABLE_MULTI_BRAIN | P1 |
| 2 | feat: feature-flag multi-brain behind VITE_ENABLE_MULTI_BRAIN | P1 |
| 3 | feat: disable vault auto-prompting in capture sheet | P1 |
| 4 | feat: simplify navigation to Feed \| Capture \| Ask \| Memory \| Settings | P1 |
| 5 | feat: remove claude-haiku defaults, set Gemini 2.5 Flash Lite as default | P1 |
| 6 | milestone: Phase 1 complete | P1 |
| 7 | feat: add /api/feed endpoint for brain feed data | P2 |
| 8 | feat: build Brain Feed home screen with resurfaced memories and insights | P2 |
| 9 | feat: rewrite onboarding as guided value demo with bulk capture + first query | P2 |
| 10 | feat: add global capture shortcut (Cmd+K) and floating capture button | P2 |
| 11 | feat: track capture streak in user metadata | P2 |
| 12 | milestone: Phase 2 complete | P2 |
| 13 | feat: simplify settings to Profile and Advanced tabs | P3 |
| 14 | feat: add empty state copy with CTAs for Memory view | P3 |
| 15 | chore: code cleanup — fix typecheck, remove dead imports | P3 |
| 16 | milestone: Phase 3 complete | P3 |
| 17 | feat: add OG and Twitter Card meta tags | P4 |
| 18 | feat: add early access monetization banner | P4 |
| 19 | milestone: Phase 4 complete | P4 |
| 20 | milestone: Phase 5 complete — ready to ship | P5 |
