# Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe-backed Free / Starter ($4.99) / Pro ($9.99) subscription billing with server-side usage enforcement, a Billing settings tab, and upgrade prompts at 90% / 100% of monthly limits.

**Architecture:** Stripe Checkout (hosted) redirects the user to Stripe; a webhook syncs subscription state back into a new `user_profiles` table that is the canonical billing source of truth. All Stripe API calls are routed through the existing `api/user-data.ts` handler using `?resource=stripe-*` sub-routes to stay within the Vercel Hobby 12-function limit. A DB trigger keeps the legacy `user_ai_settings.plan` column in sync during the transition.

**Tech Stack:** Stripe Node.js SDK (`stripe`), Supabase PostgREST (service role for webhook writes), React hooks (`useSubscription`), Vitest for tests.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `supabase/migrations/031_stripe_billing.sql` | `user_profiles` table, auto-create trigger, backfill, sync trigger, `user_usage` table, `increment_usage` RPC |
| Create | `api/_lib/stripe.ts` | Singleton Stripe client |
| Create | `api/_lib/usage.ts` | `checkAndIncrement` — server-side tier enforcement |
| Create | `tests/api/usage.test.ts` | Unit tests for usage enforcement |
| Modify | `api/_lib/providers/select.ts` | Allow `starter` to use platform AI; add per-tier model selection |
| Modify | `api/llm.ts` | Add usage check before chat / transcription calls; update managed options |
| Modify | `api/capture.ts` | Add usage check before AI-assisted capture |
| Modify | `api/user-data.ts` | Add `bodyParser: false` config, body buffering, `stripe-checkout`, `stripe-webhook`, `stripe-portal` resource handlers |
| Create | `tests/api/stripe-webhook.test.ts` | Webhook signature verification + tier sync tests |
| Create | `src/lib/useSubscription.ts` | React hook — reads `user_profiles` + `user_usage`, exposes `{ tier, usage, limits, pct, renewalDate, isLoading }` |
| Create | `tests/hooks/useSubscription.test.ts` | Hook unit tests |
| Modify | `src/lib/tiers.ts` | Add `starter` and `starter_byok` tier definitions |
| Create | `src/components/settings/BillingTab.tsx` | Plan badge, usage meters, upgrade/portal buttons |
| Create | `src/components/UpgradeModal.tsx` | 100%-limit blocking modal with plan comparison table |
| Create | `src/components/UsageBanner.tsx` | 90%-limit amber non-blocking banner |
| Modify | `src/components/settings/AccountTab.tsx` | Replace `TierPreviewToggle` with live tier badge from `useSubscription` |
| Modify | `src/views/SettingsView.tsx` | Add `"billing"` section, handle `?tab=billing` query param |
| Modify | `vercel.json` | Add 3 Stripe rewrites |
| Modify | `.env.example` | Document new env vars |

---

## Task 1: Install Stripe SDK + create client singleton

**Files:**
- Modify: `package.json` (npm install)
- Create: `api/_lib/stripe.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install the Stripe SDK**

```bash
npm install stripe
```

Expected: `package.json` and `package-lock.json` updated, no errors.

- [ ] **Step 2: Create `api/_lib/stripe.ts`**

```ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});
```

- [ ] **Step 3: Add env vars to `.env.example`**

Open `.env.example` and append:

```
# ── Stripe ─────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_STARTER_ANNUAL_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
# Optional: override platform AI model per tier (defaults shown)
GEMINI_STARTER_MODEL=gemini-2.0-flash-lite
GEMINI_STARTER_CHAT_MODEL=gemini-2.5-flash
GEMINI_PRO_MODEL=gemini-2.5-flash
GEMINI_PRO_CHAT_MODEL=gemini-2.5-flash
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json api/_lib/stripe.ts .env.example
git commit -m "feat(billing): install stripe SDK and create client singleton"
```

---

## Task 2: Database migration

**Files:**
- Create: `supabase/migrations/031_stripe_billing.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/031_stripe_billing.sql` with the following content:

```sql
-- ─── 1. user_profiles: canonical 1:1 user table ─────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (tier IN ('free', 'starter', 'pro')),
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT,
  tier_expires_at        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "service role full access"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 2. Auto-create profile row on new signup ────────────────────────────

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();


-- ─── 3. Backfill existing users ──────────────────────────────────────────

INSERT INTO user_profiles (id, tier)
SELECT
  u.id,
  CASE
    WHEN s.plan IN ('starter', 'pro') THEN s.plan
    ELSE 'free'
  END
FROM auth.users u
LEFT JOIN user_ai_settings s ON s.user_id = u.id
ON CONFLICT (id) DO NOTHING;


-- ─── 4. Keep user_ai_settings.plan in sync (deprecated — remove in 032) ─

CREATE OR REPLACE FUNCTION sync_plan_to_ai_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE user_ai_settings
  SET plan = NEW.tier
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_tier_changed ON user_profiles;
CREATE TRIGGER on_profile_tier_changed
  AFTER UPDATE OF tier ON user_profiles
  FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier)
  EXECUTE FUNCTION sync_plan_to_ai_settings();


-- ─── 5. updated_at auto-maintenance ──────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_updated_at ON user_profiles;
CREATE TRIGGER set_profile_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ─── 6. user_usage: platform AI consumption per calendar month ───────────

CREATE TABLE IF NOT EXISTS user_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period    TEXT NOT NULL,
  captures  INT NOT NULL DEFAULT 0,
  chats     INT NOT NULL DEFAULT 0,
  voice     INT NOT NULL DEFAULT 0,
  improve   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own usage"
  ON user_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service role full access on usage"
  ON user_usage FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 7. increment_usage: atomic increment RPC ────────────────────────────

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_period  TEXT,
  p_action  TEXT
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO user_usage (user_id, period)
  VALUES (p_user_id, p_period)
  ON CONFLICT (user_id, period) DO NOTHING;

  IF p_action = 'captures' THEN
    UPDATE user_usage SET captures = captures + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING captures INTO v_count;
  ELSIF p_action = 'chats' THEN
    UPDATE user_usage SET chats = chats + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING chats INTO v_count;
  ELSIF p_action = 'voice' THEN
    UPDATE user_usage SET voice = voice + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING voice INTO v_count;
  ELSIF p_action = 'improve' THEN
    UPDATE user_usage SET improve = improve + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING improve INTO v_count;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  RETURN v_count;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Run this in the Supabase SQL editor or via CLI:

```bash
# If using Supabase CLI (linked project):
npx supabase db push

# Or paste the SQL directly into the Supabase dashboard SQL editor
```

- [ ] **Step 3: Verify tables exist**

In the Supabase dashboard, confirm:
- `user_profiles` table with columns: `id`, `tier`, `stripe_customer_id`, `stripe_subscription_id`, `tier_expires_at`, `created_at`, `updated_at`
- `user_usage` table with columns: `user_id`, `period`, `captures`, `chats`, `voice`, `improve`
- Existing users backfilled into `user_profiles`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/031_stripe_billing.sql
git commit -m "feat(billing): add user_profiles, user_usage tables and increment_usage RPC"
```

---

## Task 3: Usage enforcement helper + tests

**Files:**
- Create: `api/_lib/usage.ts`
- Create: `tests/api/usage.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/api/usage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../api/_lib/sbHeaders.js", () => ({
  sbHeaders: () => ({ "Content-Type": "application/json" }),
}));

// Must import after mocks
const { checkAndIncrement } = await import("../../api/_lib/usage.js");

function rpcOk(count: number) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => count });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.resetModules();
});

describe("checkAndIncrement", () => {
  it("BYOK users are always allowed regardless of tier", async () => {
    const result = await checkAndIncrement("uid", "chats", "free", true);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("free tier (no BYOK) is always blocked", async () => {
    const result = await checkAndIncrement("uid", "chats", "free", false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.pct).toBe(100);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("starter chat within limit is allowed", async () => {
    rpcOk(50); // 50 out of 200
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(150);
    expect(result.pct).toBe(25);
  });

  it("starter chat at limit is blocked", async () => {
    rpcOk(200); // exactly at limit
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.pct).toBe(100);
  });

  it("starter chat over limit is blocked", async () => {
    rpcOk(201);
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("pro improve is always allowed (unlimited)", async () => {
    rpcOk(9999);
    const result = await checkAndIncrement("uid", "improve", "pro", false);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(result.pct).toBe(0);
  });

  it("DB failure fails open and logs error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkAndIncrement("uid", "chats", "starter", false);
    expect(result.allowed).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[usage]"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("calls increment_usage RPC with correct params", async () => {
    rpcOk(1);
    const period = new Date().toISOString().slice(0, 7);
    await checkAndIncrement("user-123", "captures", "starter", false);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/rpc/increment_usage"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_user_id: "user-123", p_period: period, p_action: "captures" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- tests/api/usage.test.ts
```

Expected: module not found or all tests fail.

- [ ] **Step 3: Create `api/_lib/usage.ts`**

```ts
import { sbHeaders } from "./sbHeaders.js";

export type UsageAction = "captures" | "chats" | "voice" | "improve";

const LIMITS: Record<string, Record<UsageAction, number>> = {
  starter: { captures: 500,  chats: 200,  voice: 20,  improve: 20       },
  pro:     { captures: 2000, chats: 1000, voice: 100, improve: Infinity },
};

const SB_URL = process.env.SUPABASE_URL!;

export async function checkAndIncrement(
  userId: string,
  action: UsageAction,
  tier: string,
  hasByok: boolean,
): Promise<{ allowed: boolean; remaining: number; pct: number }> {
  if (hasByok) return { allowed: true, remaining: Infinity, pct: 0 };
  if (tier === "free") return { allowed: false, remaining: 0, pct: 100 };

  const tierLimits = LIMITS[tier];
  if (!tierLimits) return { allowed: false, remaining: 0, pct: 100 };

  const limit = tierLimits[action];
  const period = new Date().toISOString().slice(0, 7);

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/increment_usage`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({ p_user_id: userId, p_period: period, p_action: action }),
    });
    if (!r.ok) throw new Error(`RPC failed: ${r.status}`);
    const count = (await r.json()) as number;

    if (limit === Infinity) return { allowed: true, remaining: Infinity, pct: 0 };
    const remaining = Math.max(0, limit - count);
    const pct = Math.min(100, Math.round((count / limit) * 100));
    return { allowed: count <= limit, remaining, pct };
  } catch (err) {
    console.error("[usage] checkAndIncrement failed, failing open:", err);
    return { allowed: true, remaining: Infinity, pct: 0 };
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- tests/api/usage.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/usage.ts tests/api/usage.test.ts
git commit -m "feat(billing): add checkAndIncrement usage enforcement helper"
```

---

## Task 4: Update provider selection for starter tier + model differentiation

**Files:**
- Modify: `api/_lib/providers/select.ts`
- Modify: `api/llm.ts`

- [ ] **Step 1: Update `ManagedGeminiOptions` and `selectProvider` in `api/_lib/providers/select.ts`**

Replace the `ManagedGeminiOptions` interface and the `selectProvider` function body:

```ts
export interface ManagedGeminiOptions {
  key: string;
  starterModel: string;
  starterChatModel: string;
  proModel: string;
  proChatModel: string;
}
```

Replace the plan check at the bottom of `selectProvider` (the block that reads `const plan = settings.plan ?? "free"; if (plan === "pro" && opts.managed?.key) { ... }`) with:

```ts
  const plan = settings.plan ?? "free";
  if ((plan === "pro" || plan === "starter") && opts.managed?.key) {
    const isPro = plan === "pro";
    return {
      provider: "gemini-managed",
      key: opts.managed.key,
      model: opts.forChat
        ? (isPro ? opts.managed.proChatModel : opts.managed.starterChatModel)
        : (isPro ? opts.managed.proModel : opts.managed.starterModel),
    };
  }

  return null;
```

- [ ] **Step 2: Update the managed options passed in `api/llm.ts`**

Find the `resolveProvider` function's `managed:` object (around line 50-55). Replace it with:

```ts
    managed: GEMINI_API_KEY
      ? {
          key: GEMINI_API_KEY,
          starterModel:     (process.env.GEMINI_STARTER_MODEL      || "gemini-2.0-flash-lite").trim(),
          starterChatModel: (process.env.GEMINI_STARTER_CHAT_MODEL || "gemini-2.5-flash").trim(),
          proModel:         (process.env.GEMINI_PRO_MODEL          || "gemini-2.5-flash").trim(),
          proChatModel:     (process.env.GEMINI_PRO_CHAT_MODEL     || "gemini-2.5-flash").trim(),
        }
      : undefined,
```

Also remove the now-unused `GEMINI_MODEL` and `GEMINI_CHAT_MODEL` constants from `api/llm.ts` — they are no longer passed to the managed options object (replace their usage in sanitizeGeminiModel with the pro model default):

Find:
```ts
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
const GEMINI_CHAT_MODEL = (process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash").trim();
```

Replace with:
```ts
const GEMINI_DEFAULT_MODEL = (process.env.GEMINI_PRO_MODEL || "gemini-2.5-flash").trim();
```

Update `sanitizeGeminiModel` reference from `GEMINI_MODEL` to `GEMINI_DEFAULT_MODEL`.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors. If there are type errors in `select.ts` callers (e.g. `capture.ts` passing the old `ManagedGeminiOptions` shape), update those call sites to pass the new fields.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/providers/select.ts api/llm.ts
git commit -m "feat(billing): allow starter tier to use platform AI with per-tier model selection"
```

---

## Task 5: Add usage enforcement to llm.ts and capture.ts

**Files:**
- Modify: `api/llm.ts`
- Modify: `api/capture.ts`

- [ ] **Step 1: Add import to `api/llm.ts`**

At the top of `api/llm.ts`, add:

```ts
import { checkAndIncrement } from "./_lib/usage.js";
```

- [ ] **Step 2: Add usage check in `api/llm.ts` resolveProvider**

The `resolveProvider` function already fetches `user_ai_settings`. After `selectProvider` returns a config, add the usage check **only for platform AI (managed provider)**. Find where `resolveProvider` returns and add the check before calling the LLM.

In the chat handler (inside `withAuth` for the main POST), after calling `resolveProvider`, add:

```ts
    if (provider?.provider === "gemini-managed") {
      const action = req.query.action === "transcribe" ? "voice" : "chats";
      const hasByok = false; // managed path means no BYOK
      const settings = await resolveSettingsRaw(user.id); // see Step 3
      const check = await checkAndIncrement(user.id, action, settings.plan ?? "free", false);
      if (!check.allowed) {
        return void res.status(429).json({
          error: "monthly_limit_reached",
          action,
          remaining: 0,
          upgrade_url: "/settings?tab=billing",
        });
      }
    }
```

- [ ] **Step 3: Add `resolveSettingsRaw` helper in `api/llm.ts`**

Add a small helper that fetches just `plan` and key presence without constructing a full provider:

```ts
async function resolveSettingsRaw(userId: string): Promise<{ plan: string; hasKey: boolean }> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=plan,anthropic_key,openai_key,gemini_key&limit=1`,
    { headers: sbHeaders() },
  );
  if (!r.ok) return { plan: "free", hasKey: false };
  const [row] = await r.json();
  return {
    plan: row?.plan ?? "free",
    hasKey: !!(row?.anthropic_key || row?.openai_key || row?.gemini_key),
  };
}
```

Then update the usage check in Step 2 to use:

```ts
    if (provider?.provider === "gemini-managed") {
      const { plan, hasKey } = await resolveSettingsRaw(user.id);
      const action = (req.query.action as string) === "transcribe" ? "voice" : "chats";
      const check = await checkAndIncrement(user.id, action, plan, hasKey);
      if (!check.allowed) {
        return void res.status(429).json({
          error: "monthly_limit_reached",
          action,
          remaining: 0,
          upgrade_url: "/settings?tab=billing",
        });
      }
    }
```

- [ ] **Step 4: Add usage check in `api/capture.ts`**

Add import at top:

```ts
import { checkAndIncrement } from "./_lib/usage.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
```

In the capture handler (inside `withAuth`), before the AI enrichment step, add:

```ts
    // Usage gate: only applies to platform AI (managed provider)
    if (provider?.provider === "gemini-managed") {
      const r = await fetch(
        `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}&select=plan,anthropic_key,openai_key,gemini_key&limit=1`,
        { headers: sbHeaders() },
      );
      const [row] = r.ok ? await r.json() : [null];
      const plan: string = row?.plan ?? "free";
      const hasKey = !!(row?.anthropic_key || row?.openai_key || row?.gemini_key);
      const check = await checkAndIncrement(user.id, "captures", plan, hasKey);
      if (!check.allowed) {
        return void res.status(429).json({
          error: "monthly_limit_reached",
          action: "captures",
          remaining: 0,
          upgrade_url: "/settings?tab=billing",
        });
      }
    }
```

(Note: `SB_URL` is already declared at the top of `capture.ts`. If not, add `const SB_URL = process.env.SUPABASE_URL!;`.)

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/llm.ts api/capture.ts
git commit -m "feat(billing): enforce monthly usage limits before platform AI calls"
```

---

## Task 6: Stripe resource handlers in user-data.ts

**Files:**
- Modify: `api/user-data.ts`

- [ ] **Step 1: Add imports at the top of `api/user-data.ts`**

```ts
import type { IncomingMessage } from "http";
import { stripe } from "./_lib/stripe.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import type Stripe from "stripe";
```

(`sbHeaders` is already imported via the `hdrs` local shorthand — you can keep both or unify them. The existing `hdrs` uses `SB_KEY` directly; `sbHeaders()` from the shared helper is equivalent. Either works — just be consistent.)

- [ ] **Step 2: Add `bodyParser: false` config and body-buffering helper**

Below the imports, add:

```ts
export const config = { api: { bodyParser: false } };

function bufferBody(req: ApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = req as unknown as IncomingMessage;
    stream.on("data", (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
```

- [ ] **Step 3: Update the `handler` export to buffer the body**

At the top of `export default async function handler(...)`, BEFORE the existing `resource` check, add:

```ts
  const rawBody = await bufferBody(req);
  const resource = req.query.resource as string | undefined;

  // Stripe webhook uses raw body for signature verification
  if (resource === "stripe-webhook") return handleStripeWebhook(req, res, rawBody);

  // Parse body for all other handlers
  try {
    req.body = rawBody.length > 0 ? JSON.parse(rawBody.toString("utf-8")) : {};
  } catch {
    req.body = {};
  }
```

Then remove the old `const resource = req.query.resource as string | undefined;` line that was already there (now declared above).

- [ ] **Step 4: Add the three Stripe resource dispatches to the handler**

In the `if (resource === ...)` chain, add:

```ts
  if (resource === "stripe-checkout") return handleStripeCheckout(req, res);
  if (resource === "stripe-portal")   return handleStripePortal(req, res);
```

(webhook is already dispatched before the chain in Step 3)

- [ ] **Step 5: Add `handleStripeCheckout`**

Add this function anywhere below the handler:

```ts
const handleStripeCheckout = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const { plan, interval = "month" } = (req.body ?? {}) as {
      plan?: string;
      interval?: string;
    };

    if (plan !== "starter" && plan !== "pro") {
      return void res.status(400).json({ error: "Invalid plan" });
    }
    if (interval !== "month" && interval !== "year") {
      return void res.status(400).json({ error: "Invalid interval" });
    }

    const priceEnvKey =
      interval === "year"
        ? plan === "starter"
          ? "STRIPE_STARTER_ANNUAL_PRICE_ID"
          : "STRIPE_PRO_ANNUAL_PRICE_ID"
        : plan === "starter"
          ? "STRIPE_STARTER_PRICE_ID"
          : "STRIPE_PRO_PRICE_ID";

    const priceId = process.env[priceEnvKey];
    if (!priceId) return void res.status(500).json({ error: "Plan not configured" });

    // Get or create Stripe Customer
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
      { headers: sbHeaders() },
    );
    if (!profileRes.ok) {
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    const [profile] = await profileRes.json();
    let customerId: string = profile?.stripe_customer_id ?? "";

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email as string | undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await fetch(
        `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: sbHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ stripe_customer_id: customerId }),
        },
      );
    }

    const host = (req.headers["host"] as string) || "everion.app";
    const appUrl = `https://${host}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/settings?tab=billing&billing=success`,
      cancel_url: `${appUrl}/settings?tab=billing&billing=cancel`,
      metadata: { user_id: user.id },
    });

    res.status(200).json({ url: session.url });
  },
);
```

- [ ] **Step 6: Add `handleStripeWebhook`**

```ts
async function handleStripeWebhook(
  req: ApiRequest,
  res: ApiResponse,
  rawBody: Buffer,
): Promise<void> {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return void res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return void res.status(400).json({ error: "Invalid signature" });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const priceId = sub.items.data[0]?.price.id ?? "";

    const tier =
      priceId === process.env.STRIPE_PRO_PRICE_ID ||
      priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        ? "pro"
        : "starter";

    await fetch(
      `${SB_URL}/rest/v1/user_profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          tier,
          stripe_subscription_id: sub.id,
          tier_expires_at: null,
        }),
      },
    );
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

    await fetch(
      `${SB_URL}/rest/v1/user_profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          tier: "free",
          stripe_subscription_id: null,
          tier_expires_at: periodEnd,
        }),
      },
    );
  }

  res.status(200).json({ received: true });
}
```

- [ ] **Step 7: Add `handleStripePortal`**

```ts
const handleStripePortal = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
      { headers: sbHeaders() },
    );
    if (!profileRes.ok) {
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    const [profile] = await profileRes.json();

    if (!profile?.stripe_customer_id) {
      return void res.status(400).json({ error: "No active subscription found" });
    }

    const host = (req.headers["host"] as string) || "everion.app";
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `https://${host}/settings?tab=billing`,
    });

    res.status(200).json({ url: session.url });
  },
);
```

- [ ] **Step 8: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add api/user-data.ts
git commit -m "feat(billing): add stripe-checkout, stripe-webhook, stripe-portal handlers"
```

---

## Task 7: Webhook tests

**Files:**
- Create: `tests/api/stripe-webhook.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/api/stripe-webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();
const mockPatch = vi.fn();

vi.mock("../../api/_lib/stripe.js", () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
  },
}));

vi.mock("../../api/_lib/sbHeaders.js", () => ({
  sbHeaders: () => ({ "Content-Type": "application/json" }),
}));

// Buffer body is already consumed before handler is called in the real handler.
// We test handleStripeWebhook indirectly via the exported handler.
// Since bodyParser:false, we simulate by mocking bufferBody at module level.

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeReq(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    query: { resource: "stripe-webhook" },
    headers: { "stripe-signature": "sig_test" },
    body: {},
    socket: { remoteAddress: "127.0.0.1" },
    on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
      if (event === "data") cb(Buffer.from(JSON.stringify({ id: "evt_1" })));
      if (event === "end") (cb as any)();
    }),
    ...overrides,
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

beforeEach(() => {
  mockConstructEvent.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("stripe-webhook handler", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const handler = (await import("../../api/user-data.js")).default;
    const req = makeReq({ headers: {} });
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const handler = (await import("../../api/user-data.js")).default;
    const req = makeReq();
    const res = makeRes();
    await handler(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid signature" });
  });

  it("sets tier=pro on customer.subscription.created with pro price", async () => {
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_abc",
          current_period_end: 1800000000,
          items: { data: [{ price: { id: "price_pro_monthly" } }] },
        },
      },
    });
    const handler = (await import("../../api/user-data.js")).default;
    await handler(makeReq() as any, makeRes() as any);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("stripe_customer_id=eq.cus_abc"),
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"tier":"pro"'),
      }),
    );
  });

  it("sets tier=starter on customer.subscription.created with starter price", async () => {
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_456",
          customer: "cus_def",
          current_period_end: 1800000000,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    });
    const handler = (await import("../../api/user-data.js")).default;
    await handler(makeReq() as any, makeRes() as any);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("stripe_customer_id=eq.cus_def"),
      expect.objectContaining({
        body: expect.stringContaining('"tier":"starter"'),
      }),
    );
  });

  it("sets tier=free and tier_expires_at on customer.subscription.deleted", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_789",
          customer: "cus_ghi",
          current_period_end: 1800000000,
          items: { data: [{ price: { id: "price_pro_monthly" } }] },
        },
      },
    });
    const handler = (await import("../../api/user-data.js")).default;
    await handler(makeReq() as any, makeRes() as any);
    const patchCall = mockFetch.mock.calls.find((c: any[]) =>
      (c[0] as string).includes("stripe_customer_id=eq.cus_ghi"),
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1].body);
    expect(body.tier).toBe("free");
    expect(body.tier_expires_at).toBeDefined();
  });

  it("returns 200 { received: true } on success", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed", // unhandled type — should still return 200
      data: { object: {} },
    });
    const handler = (await import("../../api/user-data.js")).default;
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/api/stripe-webhook.test.ts
```

Expected: all 6 tests pass. If `bodyParser: false` causes issues with the test's `makeReq.on()` mock, adjust the mock to simulate an `IncomingMessage`-like stream.

- [ ] **Step 3: Commit**

```bash
git add tests/api/stripe-webhook.test.ts
git commit -m "test(billing): add stripe webhook handler tests"
```

---

## Task 8: Add Stripe rewrites to vercel.json

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add 3 rewrites to `vercel.json`**

In the `"rewrites"` array, add these three entries (insert before the SPA catch-all `"/((?!api/...).*)"` line):

```json
{ "source": "/api/stripe-checkout", "destination": "/api/user-data?resource=stripe-checkout" },
{ "source": "/api/stripe-webhook",  "destination": "/api/user-data?resource=stripe-webhook"  },
{ "source": "/api/stripe-portal",   "destination": "/api/user-data?resource=stripe-portal"   },
```

- [ ] **Step 2: Update the dispatch comment in `api/user-data.ts`**

Add to the comment block at the top:

```ts
//   /api/stripe-checkout → /api/user-data?resource=stripe-checkout
//   /api/stripe-webhook  → /api/user-data?resource=stripe-webhook
//   /api/stripe-portal   → /api/user-data?resource=stripe-portal
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json api/user-data.ts
git commit -m "feat(billing): add stripe API route rewrites to vercel.json"
```

---

## Task 9: useSubscription hook + tests

**Files:**
- Create: `src/lib/useSubscription.ts`
- Create: `tests/hooks/useSubscription.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/useSubscription.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

function makeQueryBuilder(data: any, error: any = null) {
  const builder: any = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data, error });
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("useSubscription", () => {
  it("returns isLoading=true initially", () => {
    mockFrom.mockReturnValue(makeQueryBuilder(null));
    const { result } = renderHook(() => require("../../src/lib/useSubscription").useSubscription());
    expect(result.current.isLoading).toBe(true);
  });

  it("returns free tier when user_profiles has tier=free", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "free", tier_expires_at: null, stripe_subscription_id: null });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => require("../../src/lib/useSubscription").useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("free");
  });

  it("returns starter tier and correct limits", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "starter", tier_expires_at: null });
      if (table === "user_usage")
        return makeQueryBuilder({ captures: 100, chats: 50, voice: 5, improve: 10 });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => require("../../src/lib/useSubscription").useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("starter");
    expect(result.current.limits.captures).toBe(500);
    expect(result.current.usage.captures).toBe(100);
    expect(result.current.pct.captures).toBe(20);
  });

  it("returns free when tier_expires_at is in the past", async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "pro", tier_expires_at: pastDate });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => require("../../src/lib/useSubscription").useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("free");
  });

  it("returns pro when tier_expires_at is in the future", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "pro", tier_expires_at: futureDate });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => require("../../src/lib/useSubscription").useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("pro");
  });

  it("pct.improve is undefined for pro (unlimited)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_profiles")
        return makeQueryBuilder({ tier: "pro", tier_expires_at: null });
      if (table === "user_usage")
        return makeQueryBuilder({ captures: 0, chats: 0, voice: 0, improve: 500 });
      return makeQueryBuilder(null);
    });
    const { result } = renderHook(() => require("../../src/lib/useSubscription").useSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pct.improve).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- tests/hooks/useSubscription.test.ts
```

Expected: module not found.

- [ ] **Step 3: Create `src/lib/useSubscription.ts`**

```ts
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export type Tier = "free" | "starter" | "pro";
export type UsageAction = "captures" | "chats" | "voice" | "improve";

interface UsageCounts {
  captures: number;
  chats: number;
  voice: number;
  improve: number;
}

const LIMITS: Record<Tier, UsageCounts> = {
  free:    { captures: 0,    chats: 0,    voice: 0,   improve: 0    },
  starter: { captures: 500,  chats: 200,  voice: 20,  improve: 20   },
  pro:     { captures: 2000, chats: 1000, voice: 100, improve: 9999 },
};

const ZERO_USAGE: UsageCounts = { captures: 0, chats: 0, voice: 0, improve: 0 };

export interface SubscriptionState {
  tier: Tier;
  usage: UsageCounts;
  limits: UsageCounts;
  pct: Partial<Record<UsageAction, number>>;
  renewalDate: string | null;
  isLoading: boolean;
}

export function useSubscription(): SubscriptionState {
  const [tier, setTier] = useState<Tier>("free");
  const [usage, setUsage] = useState<UsageCounts>(ZERO_USAGE);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const period = new Date().toISOString().slice(0, 7);

      const [profileRes, usageRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("tier,tier_expires_at,stripe_subscription_id")
          .eq("id", user.id)
          .single(),
        supabase
          .from("user_usage")
          .select("captures,chats,voice,improve")
          .eq("user_id", user.id)
          .eq("period", period)
          .single(),
      ]);

      if (cancelled) return;

      const rawTier = (profileRes.data?.tier ?? "free") as Tier;
      const expiresAt = profileRes.data?.tier_expires_at ?? null;
      const effectiveTier: Tier =
        expiresAt && new Date(expiresAt) < new Date() ? "free" : rawTier;

      setTier(effectiveTier);
      setRenewalDate(expiresAt);
      setUsage(usageRes.data ?? ZERO_USAGE);
      setIsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const limits = LIMITS[tier];

  const pct: Partial<Record<UsageAction, number>> = {};
  for (const action of ["captures", "chats", "voice", "improve"] as UsageAction[]) {
    const limit = limits[action];
    if (limit > 0 && limit < 9999) {
      pct[action] = Math.min(100, Math.round((usage[action] / limit) * 100));
    }
  }

  return { tier, usage, limits, pct, renewalDate, isLoading };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- tests/hooks/useSubscription.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useSubscription.ts tests/hooks/useSubscription.test.ts
git commit -m "feat(billing): add useSubscription hook with tier, usage, and pct state"
```

---

## Task 10: Update tiers.ts for starter tier

**Files:**
- Modify: `src/lib/tiers.ts`

- [ ] **Step 1: Add `starter` and `starter_byok` to `tiers.ts`**

Open `src/lib/tiers.ts`. Make these changes:

**a) Update `TierId`:**
```ts
export type TierId = "free" | "free_byok" | "starter" | "starter_byok" | "pro" | "pro_byok";
```

**b) Add two new tier definitions to the `TIERS` array after `free_byok`:**
```ts
  {
    id: "starter",
    label: "Starter",
    subtitle: "Starter plan · Platform AI included",
    included: [
      "500 AI-assisted captures / month",
      "200 AI chats / month",
      "20 voice notes / month",
      "20 improve scans / month",
      "AI parsing, classification & metadata extraction",
      "Vector embeddings & semantic search",
      "Gmail scanning & calendar integration",
    ],
    missing: [
      "Premium AI models (Sonnet / GPT-4o)",
      "All features unlocked",
    ],
  },
  {
    id: "starter_byok",
    label: "Starter + Keys",
    subtitle: "Starter plan · Your own API keys",
    included: [
      "All Starter features",
      "Full AI via your own keys (no quota)",
      "Custom model selection",
    ],
    missing: [
      "Premium AI models (Sonnet / GPT-4o)",
      "All features unlocked",
    ],
  },
```

**c) Update `TIER_LABELS`:**
```ts
export const TIER_LABELS: Record<TierId, string> = {
  free:         "Free",
  free_byok:    "Free + Keys",
  starter:      "Starter",
  starter_byok: "Starter + Keys",
  pro:          "Pro",
  pro_byok:     "Pro + Keys",
};
```

**d) Update `deriveTierId`:**
```ts
export function deriveTierId(plan: string, hasAnyKey: boolean): TierId {
  if (plan === "pro"     && hasAnyKey) return "pro_byok";
  if (plan === "pro")                  return "pro";
  if (plan === "starter" && hasAnyKey) return "starter_byok";
  if (plan === "starter")              return "starter";
  if (hasAnyKey)                       return "free_byok";
  return "free";
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tiers.ts
git commit -m "feat(billing): add starter tier to tiers.ts definition"
```

---

## Task 11: BillingTab component

**Files:**
- Create: `src/components/settings/BillingTab.tsx`

- [ ] **Step 1: Create `src/components/settings/BillingTab.tsx`**

```tsx
import { useEffect } from "react";
import { useSubscription } from "../../lib/useSubscription";
import { authFetch } from "../../lib/authFetch";
import SettingsRow, { SettingsButton } from "./SettingsRow";

function UsageMeter({
  label,
  used,
  limit,
  pct,
}: {
  label: string;
  used: number;
  limit: number;
  pct?: number;
}) {
  if (limit === 0 || limit >= 9999) return null;
  const p = pct ?? Math.min(100, Math.round((used / limit) * 100));
  const color = p >= 100 ? "var(--blood)" : p >= 90 ? "var(--amber, #f59e0b)" : "var(--moss)";
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 5,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{label}</span>
        <span style={{ color: p >= 90 ? color : "var(--ink-faint)" }}>
          {used} / {limit}
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "var(--line-soft)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${p}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

async function startCheckout(plan: "starter" | "pro", interval: "month" | "year" = "month") {
  const r = await authFetch("/api/stripe-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, interval }),
  });
  if (!r.ok) return;
  const { url } = await r.json();
  if (url) window.location.href = url;
}

async function openPortal() {
  const r = await authFetch("/api/stripe-portal", { method: "POST" });
  if (!r.ok) return;
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export default function BillingTab() {
  const { tier, usage, limits, pct, renewalDate, isLoading } = useSubscription();

  // Handle return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      params.delete("billing");
      const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const tierLabel = tier === "free" ? "Free" : tier === "starter" ? "Starter" : "Pro";
  const tierColor =
    tier === "pro" ? "var(--ember)" : tier === "starter" ? "var(--moss)" : "var(--ink-ghost)";

  if (isLoading) {
    return (
      <div className="f-sans" style={{ fontSize: 13, color: "var(--ink-faint)", padding: "24px 0" }}>
        Loading billing info…
      </div>
    );
  }

  return (
    <div>
      {/* Current plan */}
      <SettingsRow label="Current plan">
        <span
          className="f-sans"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: tierColor,
            background: `${tierColor}18`,
            padding: "3px 8px",
            borderRadius: 5,
          }}
        >
          {tierLabel}
        </span>
        {renewalDate && tier !== "free" && (
          <span className="f-sans" style={{ fontSize: 11, color: "var(--ink-ghost)", marginLeft: 8 }}>
            expires {new Date(renewalDate).toLocaleDateString()}
          </span>
        )}
      </SettingsRow>

      {/* Usage meters (only for paid tiers) */}
      {tier !== "free" && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 12,
            padding: "16px 18px",
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 14,
            }}
          >
            Usage this month
          </div>
          <UsageMeter label="Captures"     used={usage.captures} limit={limits.captures} pct={pct.captures} />
          <UsageMeter label="Chats"        used={usage.chats}    limit={limits.chats}    pct={pct.chats}    />
          <UsageMeter label="Voice notes"  used={usage.voice}    limit={limits.voice}    pct={pct.voice}    />
          <UsageMeter label="Improve scans" used={usage.improve} limit={limits.improve}  pct={pct.improve}  />
        </div>
      )}

      {/* Upgrade / manage buttons */}
      {tier === "free" && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <SettingsButton onClick={() => startCheckout("starter")}>
            Upgrade to Starter — $4.99 / mo
          </SettingsButton>
          <SettingsButton onClick={() => startCheckout("pro")}>
            Upgrade to Pro — $9.99 / mo
          </SettingsButton>
        </div>
      )}
      {tier === "starter" && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <SettingsButton onClick={() => startCheckout("pro")}>
            Upgrade to Pro — $9.99 / mo
          </SettingsButton>
          <SettingsButton onClick={openPortal}>
            Manage subscription
          </SettingsButton>
        </div>
      )}
      {tier === "pro" && (
        <div style={{ marginTop: 16 }}>
          <SettingsButton onClick={openPortal}>
            Manage subscription
          </SettingsButton>
        </div>
      )}

      {/* Plan comparison */}
      <div
        style={{
          marginTop: 28,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {(["", "Free", "Starter", "Pro"] as const).map((h) => (
                <th
                  key={h}
                  className="f-sans"
                  style={{
                    padding: "10px 14px",
                    textAlign: h === "" ? "left" : "center",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: h === tierLabel ? "var(--ember)" : "var(--ink-faint)",
                    borderBottom: "1px solid var(--line-soft)",
                    background: "var(--surface-high)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Price",           free: "$0",  starter: "$4.99/mo", pro: "$9.99/mo" },
              { label: "Raw capture",     free: "✓",   starter: "✓",         pro: "✓"       },
              { label: "BYOK AI",         free: "✓",   starter: "✓",         pro: "✓"       },
              { label: "Platform AI",     free: "—",   starter: "✓",         pro: "✓"       },
              { label: "Captures / mo",   free: "—",   starter: "500",        pro: "2 000"  },
              { label: "Chats / mo",      free: "—",   starter: "200",        pro: "1 000"  },
              { label: "AI models",       free: "—",   starter: "Flash",       pro: "Sonnet" },
              { label: "All features",    free: "—",   starter: "—",          pro: "✓"      },
            ].map((row, i) => (
              <tr key={row.label} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-high)" }}>
                <td className="f-sans" style={{ padding: "9px 14px", fontSize: 12, color: "var(--ink-soft)" }}>
                  {row.label}
                </td>
                {(["free", "starter", "pro"] as const).map((t) => (
                  <td
                    key={t}
                    className="f-sans"
                    style={{
                      padding: "9px 14px",
                      fontSize: 12,
                      textAlign: "center",
                      color: row[t] === "—" ? "var(--ink-ghost)" : row[t] === "✓" ? "var(--moss)" : "var(--ink)",
                      fontWeight: t === tier ? 600 : 400,
                    }}
                  >
                    {row[t]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/BillingTab.tsx
git commit -m "feat(billing): add BillingTab with usage meters, upgrade buttons, and plan comparison"
```

---

## Task 12: UpgradeModal + UsageBanner

**Files:**
- Create: `src/components/UpgradeModal.tsx`
- Create: `src/components/UsageBanner.tsx`

- [ ] **Step 1: Create `src/components/UpgradeModal.tsx`**

```tsx
import { authFetch } from "../lib/authFetch";
import { useSubscription } from "../lib/useSubscription";

interface Props {
  action: "captures" | "chats" | "voice" | "improve";
  onClose: () => void;
}

const ACTION_LABEL: Record<Props["action"], string> = {
  captures: "AI-assisted captures",
  chats:    "AI chats",
  voice:    "voice notes",
  improve:  "improve scans",
};

async function startCheckout(plan: "starter" | "pro") {
  const r = await authFetch("/api/stripe-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, interval: "month" }),
  });
  if (!r.ok) return;
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export default function UpgradeModal({ action, onClose }: Props) {
  const { tier } = useSubscription();
  const label = ACTION_LABEL[action];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--surface-high)",
          border: "1px solid var(--line-soft)",
          borderRadius: 18,
          boxShadow: "var(--lift-3)",
          padding: "28px 28px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="f-serif" style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", marginBottom: 6 }}>
          Monthly limit reached
        </div>
        <div className="f-sans" style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 22 }}>
          You've used all your {label} for this month. Upgrade to continue.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {tier !== "pro" && (
            <button
              className="press f-sans"
              onClick={() => startCheckout("pro")}
              style={{
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: "var(--ember)",
                color: "var(--ember-ink)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Upgrade to Pro — $9.99 / mo
            </button>
          )}
          {tier === "free" && (
            <button
              className="press f-sans"
              onClick={() => startCheckout("starter")}
              style={{
                padding: "11px 0",
                borderRadius: 10,
                border: "1px solid var(--line-soft)",
                background: "transparent",
                color: "var(--ink)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Upgrade to Starter — $4.99 / mo
            </button>
          )}
        </div>

        <div className="f-sans" style={{ fontSize: 11, color: "var(--ink-ghost)", textAlign: "center" }}>
          Or{" "}
          <a
            href="/settings?tab=ai"
            style={{ color: "var(--ink-faint)", textDecoration: "underline" }}
            onClick={onClose}
          >
            use your own API key
          </a>{" "}
          to bypass limits for free.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/UsageBanner.tsx`**

```tsx
import { useSubscription, type UsageAction } from "../lib/useSubscription";

interface Props {
  action: UsageAction;
  onUpgradeClick?: () => void;
}

export default function UsageBanner({ action, onUpgradeClick }: Props) {
  const { pct, tier } = useSubscription();
  const p = pct[action];

  if (tier === "free" || p === undefined || p < 90) return null;

  const isAtLimit = p >= 100;
  const actionLabel = { captures: "captures", chats: "chats", voice: "voice notes", improve: "improve scans" }[action];

  return (
    <div
      className="f-sans"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 14px",
        borderRadius: 8,
        background: isAtLimit ? "var(--blood-soft, #fee2e2)" : "var(--amber-soft, #fef3c7)",
        border: `1px solid ${isAtLimit ? "var(--blood, #ef4444)" : "var(--amber, #f59e0b)"}`,
        fontSize: 12,
        color: isAtLimit ? "var(--blood, #ef4444)" : "var(--amber-dark, #92400e)",
        marginBottom: 12,
      }}
    >
      <span>
        {isAtLimit
          ? `Monthly ${actionLabel} limit reached.`
          : `You've used ${p}% of your monthly ${actionLabel}.`}
      </span>
      {onUpgradeClick && (
        <button
          className="press"
          onClick={onUpgradeClick}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: "inherit",
            textDecoration: "underline",
            padding: 0,
            flexShrink: 0,
          }}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/UpgradeModal.tsx src/components/UsageBanner.tsx
git commit -m "feat(billing): add UpgradeModal and UsageBanner components"
```

---

## Task 13: Wire billing into AccountTab + SettingsView

**Files:**
- Modify: `src/components/settings/AccountTab.tsx`
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Update `AccountTab.tsx` to use live tier from useSubscription**

At the top of `AccountTab.tsx`, add:

```ts
import { useSubscription } from "../../lib/useSubscription";
```

Inside the component, replace the existing tier derivation:

```ts
// Replace these three lines:
const s = aiSettings.get();
const hasByok = !!(s.anthropicKey || s.openaiKey || s.groqKey);
const tierId = deriveTierId(s.plan, hasByok);
const tier = TIERS.find((t) => t.id === tierId)!;

// With:
const { tier: billingTier } = useSubscription();
const tierLabel = billingTier === "pro" ? "Pro" : billingTier === "starter" ? "Starter" : "Free";
const tierColor =
  billingTier === "pro" ? "var(--ember)" : billingTier === "starter" ? "var(--moss)" : "var(--ink-ghost)";
```

Replace the tier display in the JSX (the part rendering `{tier.label}` and `{tier.subtitle}`) with:

```tsx
<span
  className="f-sans"
  style={{
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: tierColor,
    background: `${tierColor}18`,
    padding: "3px 8px",
    borderRadius: 5,
  }}
>
  {tierLabel}
</span>
```

Remove the now-unused imports: `deriveTierId`, `TIERS` from `"../../lib/tiers"`, and `aiSettings` if it's only used for the tier derivation (check the rest of the file first — `aiSettings` may be used elsewhere; only remove if safe).

- [ ] **Step 2: Update `SettingsView.tsx` to add the Billing tab**

**a) Update `SectionId` type:**

```ts
type SectionId =
  | "appearance"
  | "account"
  | "billing"
  | "brain"
  | "data"
  | "ai"
  | "notifications"
  | "integrations"
  | "security"
  | "danger"
  | "admin";
```

**b) Add billing to `BASE_SECTIONS`** (after "account"):

```ts
  { id: "billing", label: "Billing" },
```

**c) Handle `?tab=billing` and `?billing=success` in the initial section detection:**

```ts
  const [section, setSection] = useState<SectionId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("calendarConnected") || params.has("calendarError")) return "integrations";
    if (params.has("gmailConnected") || params.has("gmailError")) return "integrations";
    if (params.get("tab") === "billing" || params.has("billing")) return "billing";
    return "appearance";
  });
```

**d) Add the import:**

```ts
import BillingTab from "../components/settings/BillingTab";
```

**e) Add the rendered section** (after the `account` section block, around line 598):

```tsx
              {preloaded.has("billing") && (
                <div style={{ display: section === "billing" ? "block" : "none" }}>
                  <SectionHeader
                    title="Billing"
                    subtitle="manage your plan, usage, and subscription."
                  />
                  <BillingTab />
                </div>
              )}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass (including the new usage, webhook, and useSubscription tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AccountTab.tsx src/views/SettingsView.tsx
git commit -m "feat(billing): wire BillingTab into SettingsView and update AccountTab tier badge"
```

---

## Spec Coverage Self-Review

| Spec requirement | Task(s) |
|---|---|
| `user_profiles` canonical table with RLS, trigger, backfill | Task 2 |
| `user_usage` table + `increment_usage` RPC | Task 2 |
| `user_ai_settings.plan` sync trigger (deprecated) | Task 2 |
| `checkAndIncrement` with BYOK bypass, free block, fail-open | Task 3 |
| Allow `starter` to use platform AI | Task 4 |
| Per-tier model selection (starter vs pro) | Task 4 |
| Usage gates in `llm.ts` and `capture.ts` | Task 5 |
| `user-data.ts` body buffering (bodyParser: false) | Task 6 |
| `stripe-checkout` handler | Task 6 |
| `stripe-webhook` handler (created, updated, deleted) | Task 6 |
| `stripe-portal` handler | Task 6 |
| Webhook tests (sig fail, pro tier, starter tier, deletion, idempotent) | Task 7 |
| `vercel.json` rewrites for 3 Stripe routes | Task 8 |
| `useSubscription` hook with expired grace period logic | Task 9 |
| `tiers.ts` updated with starter | Task 10 |
| `BillingTab` with usage meters + plan comparison | Task 11 |
| `UpgradeModal` (100% limit) | Task 12 |
| `UsageBanner` (90% limit) | Task 12 |
| `AccountTab` live tier badge | Task 13 |
| `SettingsView` Billing tab + `?tab=billing` routing | Task 13 |
| `.env.example` updated | Task 1 |
