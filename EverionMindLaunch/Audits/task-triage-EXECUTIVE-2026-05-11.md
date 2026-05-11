# Task Triage — Executive Summary (2026-05-11)

The Linear-style dashboard exposed 1004 open `[ ]` tasks across 28 source docs. Three parallel triages categorised every one as **M / C / D / S** (Manual operator work / Code / Decision / Stale).

**Result: 1004 → 689 actually-open after stripping the 315 stale.**

Of the remaining 689: **518 Manual · 141 Code · 30 Decision.** The bulk is operator-hands work (Vercel/Supabase consoles, App Store, lawyer review, launch-day posting). The actually-launch-blocking code is tiny — ~5 surgical one-liners, 2–3h.

---

## Numbers

| Bundle | Tasks | M | C | D | S | Stale % |
|---|---:|---:|---:|---:|---:|---:|
| Core docs (Checklist + Roadmap + Playbook + 2 week files) | 468 | 219 | 107 | 14 | 128 | 27% |
| Setup/* install guides (ios, android, revenuecat, lemonsqueezy) | 271 | 105 | 5 | 4 | 157 | 58% |
| Long tail (marketing, Specs, Audits, Legal, Ops, Mobile, Brand, Support) | 265 | 194 | 29 | 12 | 30 | 11% |
| **Total** | **1004** | **518** | **141** | **30** | **315** | **31%** |

Detail files:
- [`task-triage-core-2026-05-11.md`](task-triage-core-2026-05-11.md)
- [`task-triage-setup-2026-05-11.md`](task-triage-setup-2026-05-11.md)
- [`task-triage-longtail-2026-05-11.md`](task-triage-longtail-2026-05-11.md)

---

## Five things that pop out

1. **Setup/revenuecat.md (88% stale) and Setup/lemonsqueezy.md (90% stale) are post-mortem documents pretending to be runbooks.** The integration shipped 2026-04-30 in commit `c484030`. Code at `src/lib/revenuecat.ts:36` already pins the entitlement ID. The dashboard config has been done once. Archive both. Only the LemonSqueezy live-mode cutover (~5 steps) is actual outstanding work — lift it to `LAUNCH_CHECKLIST.md`.

2. **`LAUNCH_CHECKLIST.md` has 14 line items duplicating other items in the same doc.** Vercel Pro upgrade appears 3 times (lines 36, 203, 545). SPF/DKIM/DMARC appears 4 times (lines 50, 368, 552, 682). Pure dedup alone strips ~30 rows.

3. **The post-launch iOS sprint is double-counted.** Lines 1175-1224 of `LAUNCH_CHECKLIST.md` is the proper deferred block, but ~30 `[iOS — DEFERRED]` siblings are scattered through the active list with their own `[ ]` boxes. Same work, counted twice.

4. **Brain Feed is the single biggest unshipped surface.** ROADMAP.md treats `/api/feed` + `FeedView.tsx` + streak counter as the P0 day-7-retention thesis. Code search confirms: no `FeedView` exists, no streak counter, no 8-event PostHog funnel. The shell ships without them and nobody flagged it.

5. **Audits/CONSOLIDATED-AUDIT.md is materially stale.** Seven P0/P1 items (lines 5325, 5326, 5328, 5331, 5340, plus parts of 5342 and 1313) reference `api/gmail.ts`, `api/_lib/gmailScan.ts`, `upsertGmailContact` — all deleted in commit `eba3299` this morning. Half the audit's launch-blocking security list is no-ops against current code.

Plus: `Setup/android.md` has two real code/doc drifts to resolve (env-var vs `keystore.properties` keystore mechanism; intent-filter host mismatch `everion.smashburgerbar.co.za` vs `everionmind.com`). And `public/.well-known/assetlinks.json` ships with a placeholder SHA256 — blocks Android App Links the moment Play Store accepts the build.

---

## What actually gates opening signups this week

After triage, only ~20 Manual items truly block public launch. Roughly:

- Vercel Pro upgrade (once — DNS Anycast + custom-domain perf headroom)
- Supabase Pro upgrade (PITR backups + larger free tier of compute)
- Billing operator config: LemonSqueezy live-mode cutover (~5 steps)
- Onboarding test with 3 strangers
- SPF/DKIM/DMARC for sender domain
- Sentry alert rules (3) + external uptime monitor
- Android Play Console submission (assetlinks fingerprint, Internal Testing track)
- Privacy + ToS lawyer review (POPIA/GDPR)
- "Lock the brand name" decision (D — unblocks ~15 downstream tasks across Brand + Legal)

That's the actual checklist. Everything else is either shipped, deferred, duplicated, or speculative.

---

## Recommended next actions

In order:

1. **Run a cleanup commit on `LAUNCH_CHECKLIST.md`** — strip the 14 internal dupes, mark obviously-shipped items `[x]`, move the scattered `[iOS — DEFERRED]` rows into the proper post-launch block at lines 1175-1224. Net: -30 to -40 rows.

2. **Archive `Setup/revenuecat.md` and `Setup/lemonsqueezy.md` to `Setup/archive/`** — lift LS live-mode cutover into `LAUNCH_CHECKLIST.md` first. Net: -107 visible rows.

3. **Patch the CONSOLIDATED-AUDIT** — mark the 7 Gmail-deleted P0/P1 items `[x]` with a "WONTFIX — code path removed in commit eba3299" annotation. Net: -7 false-blocker rows.

4. **Restructure `marketing/hunter-outreach.md`** — its 6 "checkboxes" are criteria definitions, not work. Pure formatting bug.

5. **Decide the brand name** — single most leveraged action on the list. Unblocks Brand/assets, Brand/press-kit, Legal/privacy-tos, Legal/trademarks-domains.

6. **Then return to the dashboard** — with 689 real tasks instead of 1004, the volume problem is mostly solved without changing the UI.

7. **Optional dashboard polish** — add a "Setup" mute toggle in the sidebar (collapses Setup/* sources by default once they're archived). Add a `kind` field to the `/tasks` response derived from the triage so M/C/D can be shown as a category column in the row UI.

---

## Process note

The dashboard isn't the bug. The docs are the bug. Every checkbox parsed by `/tasks` is a checkbox someone wrote in a `.md` once and never cleaned up — runbooks treated as journals, audits never archived, deferred work shadow-tracked in the active checklist. Triage caught it; the fix is in the source files.

The Linear-style UI helped *find* this — until 2026-05-11 morning, the operator's mental model said "I have a launch checklist." After the parse, the mental model says "I have 1004 unactioned tasks I had no idea existed." Both are wrong. The right model is "I have ~20 launch-blocking manual steps and the rest is housekeeping." This triage produces that view.
