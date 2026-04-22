# Month 1–2 Sprint — Retention & Sharing (Weeks 4–8)

**Goal:** Prove the habit loop works and start the viral flywheel. Watch the PostHog funnel every morning.

---

## Metrics to Hit Before Moving On

- Day 7 retention ≥ 25%
- Free → Starter conversion ≥ 3%
- Weekly active users (WAU) growing week-over-week
- < 5% churn in first billing cycle

---

## Features to Build

- [ ] **Shareable Insight Cards.**
  - "Share this insight" button on AI responses.
  - OG-image-ready card (quote + brain logo + `everion.app`).
  - Copy-to-clipboard + direct share to X, LinkedIn, WhatsApp.
  - This is your organic acquisition engine. Users share AI insights that make them look smart.

- [ ] **Weekly Email Digest.**
  - Sunday evening: "Your brain this week — 12 captures, 3 patterns, 1 action suggested."
  - Links back to the Feed. Reactivates dormant users.
  - Use Resend (already integrated for brain invites).

- [ ] **Push Notifications (streak reminders).**
  - "Don't break your 7-day streak. What's on your mind?"
  - Respect quiet hours. Dismissible. Opt-out in Settings.

- [ ] **Chat Feedback v1** (see `chat-feedback-system.md`).
  - Thumbs up/down on every AI response.
  - Table: `chat_feedback` with question embedding.
  - Feeds into few-shot injection on next chat (top-3 similar thumbs-up examples).
  - Also feeds Layer 1 of `prompt-self-improvement.md`.

- [ ] **Prompt Improvement Layer 1** (see `prompt-self-improvement.md`).
  - Review thumbs-down responses weekly. Edit CAPTURE and CHAT prompts based on actual failure modes.
  - Pull entries with `type: "note"` — classification failures.

---

## Acquisition Channels (pick 2, commit 4 weeks each)

| Channel | Why it fits | Effort | Signal to watch |
|---|---|---|---|
| **SEO content** — "best second brain app 2026", "Notion alternatives", "AI journaling apps" | High intent traffic, compounds | 2–4 blog posts/week | Organic signups/week |
| **Twitter/X build-in-public** | Aligns with indie-dev narrative, shareable insights | Daily posts, 15min | Follower growth, reply-to-DM rate |
| **Reddit** (r/productivity, r/PKMS, r/Notion, r/ObsidianMD) | Exact audience, competitive positioning works | 2–3 thoughtful posts/week | Signups per post |
| **Partner with a PKM creator** (YouTube, newsletter) | One endorsement > 100 cold posts | 1 outreach campaign | Referral conversions |
| **Product Hunt re-launches** | New features = new PH launches every 6 months | Low | Spike in signups |

> **Do NOT** run paid ads before Day 7 retention ≥ 25%. You'll burn money fast.

---

## Weekly Rituals

- **Monday 9am:** Review PostHog funnel. Pick ONE number that dropped. Focus all improvement on that until it recovers.
- **Wednesday:** Read every thumbs-down chat feedback. Edit one prompt. Ship.
- **Friday:** Write one public post (blog, thread, or video). Build-in-public compounds.
- **Sunday evening:** Weekly email digest goes out automatically. Review a sample.

---

## Month 1–2 Definition of Done

- [ ] Shareable insight cards live with OG image generation
- [ ] Weekly email digest sending via Resend
- [ ] Push notifications with streak reminders enabled
- [ ] `chat_feedback` table live, thumbs up/down on every AI response
- [ ] At least one prompt improved from real thumbs-down data
- [ ] 2 acquisition channels chosen and running for 4 weeks
- [ ] Day 7 retention ≥ 25%
- [ ] Free → Starter conversion ≥ 3%
