/**
 * PostHog funnel events — the 8-event taxonomy that drives the launch
 * dashboard (Signup → First Capture → First Chat → Day 7 Return → Tier
 * Upgrade). Defined here as a const map so call sites can't fat-finger an
 * event name and the dashboard stays in sync with the source.
 *
 * Why route through here instead of calling `track()` directly:
 *   - "first_*" events are one-shot per device — the localStorage gate sits
 *     in `firstOnce()` so call sites don't each re-implement it
 *   - "capture_method" / "nav_view_active" carry property shapes the
 *     dashboard expects — keeping them in one file means renaming a prop
 *     happens in one place
 *   - Consent is handled inside `track()` already; nothing here fires
 *     before the user accepts the analytics banner
 */
import { track } from "./posthog";

export const EVENT = {
  signupCompleted: "signup_completed",
  firstCapture: "first_capture",
  firstChat: "first_chat",
  firstInsightViewed: "first_insight_viewed",
  day7Return: "day_7_return",
  tierUpgraded: "tier_upgraded",
  tierDowngraded: "tier_downgraded",
  captureMethod: "capture_method",
  navViewActive: "nav_view_active",
} as const;

// Localstorage flag prefix for one-shot events. Per-device, not per-user;
// PostHog identify ties the device to the user-id for funnel math, so a
// fresh signup on a fresh device counts again as expected.
const FIRST_ONCE_PREFIX = "everion_event_fired:";

function firstOnce(key: string): boolean {
  if (typeof window === "undefined") return false;
  const storageKey = `${FIRST_ONCE_PREFIX}${key}`;
  try {
    if (localStorage.getItem(storageKey) === "1") return false;
    localStorage.setItem(storageKey, "1");
    return true;
  } catch {
    // Private mode / quota exceeded — fail open so we don't suppress the
    // event entirely. Worst case the funnel double-counts on the same
    // device, which is preferable to losing the signal.
    return true;
  }
}

// ─── One-shot funnel events ─────────────────────────────────────────────────

export function trackSignupCompleted(props: { email?: string } = {}): void {
  if (!firstOnce("signup_completed")) return;
  track(EVENT.signupCompleted, props);
}

export function trackFirstCapture(props: { method: CaptureMethod }): void {
  if (!firstOnce("first_capture")) return;
  track(EVENT.firstCapture, props);
}

export function trackFirstChat(): void {
  if (!firstOnce("first_chat")) return;
  track(EVENT.firstChat);
}

export function trackFirstInsightViewed(props: { entry_id?: string } = {}): void {
  if (!firstOnce("first_insight_viewed")) return;
  track(EVENT.firstInsightViewed, props);
}

// ─── Lifecycle events ───────────────────────────────────────────────────────

// Day-7 return: fired once per user-id after they've been registered ≥7 days
// AND they've come back to load the app. Gating by `signup_at` rather than
// device install means re-installs don't reset the counter.
export function trackDay7ReturnIfDue(props: { signup_at: string | Date }): void {
  if (typeof window === "undefined") return;
  const signupMs =
    typeof props.signup_at === "string" ? Date.parse(props.signup_at) : props.signup_at.getTime();
  if (!Number.isFinite(signupMs)) return;
  const ageDays = (Date.now() - signupMs) / 86_400_000;
  if (ageDays < 7) return;
  if (!firstOnce("day_7_return")) return;
  track(EVENT.day7Return, { age_days: Math.floor(ageDays) });
}

// ─── Tier changes ───────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, max: 3 };

// Compare prev vs next tier and emit the right direction event. Call sites
// pass both values so this module can be the single source of upgrade/
// downgrade truth (rather than scattering rank logic across views).
export function trackTierChange(prev: string | undefined, next: string | undefined): void {
  if (!prev || !next || prev === next) return;
  const prevRank = TIER_RANK[prev];
  const nextRank = TIER_RANK[next];
  if (prevRank === undefined || nextRank === undefined) return;
  if (nextRank > prevRank) track(EVENT.tierUpgraded, { from: prev, to: next });
  else if (nextRank < prevRank) track(EVENT.tierDowngraded, { from: prev, to: next });
}

// ─── Repeating events ───────────────────────────────────────────────────────

export type CaptureMethod = "text" | "voice" | "file" | "link" | "share-target" | "import";

// Fired on every capture, regardless of first/repeat. Pairs with first_capture
// to answer "what's the dominant capture surface for activation?"
export function trackCaptureMethod(props: { method: CaptureMethod }): void {
  track(EVENT.captureMethod, props);
}

// Fired on every primary-nav view change. Helps spot which views never get
// touched (kill candidates) and which the user keeps bouncing between.
export function trackNavViewActive(props: { view: string; from?: string }): void {
  track(EVENT.navViewActive, props);
}
