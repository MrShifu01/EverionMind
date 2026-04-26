# Week 3 Sprint — Polish, Prep, Ship (Days 15–21)

**Goal:** Get to production-ready, launch publicly, and monitor the first 48 hours.

---

## Days 15–17: Polish

- [ ] **Simplify Settings to 3 tabs:** `Profile · Billing · Advanced`. Everything else collapses inside Advanced.
- [ ] **Empty-state + value-prop copy.** Every screen that can be empty (Feed on Day 1, Memory with 0 entries, Ask with no history) gets clear copy explaining what happens next. No "No results found" — always a call-to-action.
- [ ] **User test with 3 non-developers.** Ask: "What does this app do?" If they can't answer in one sentence, rewrite messaging. Watch them use it silently for 5 minutes. Note every moment of confusion.
- [ ] **Run `npm run typecheck`.** Fix everything.
- [ ] **Run Knip.** Remove dead exports/imports your changes orphaned.
- [ ] **Lighthouse audit.** LCP < 2.5s, CLS < 0.1. Use `chrome-devtools` MCP if needed.

---

## Days 18–19: Launch Prep

- [ ] **Landing page** (separate Vercel project). Hero: 60-second demo video. Sections: "Your brain, searchable" · "Pricing" · "FAQ" · CTA → app signup.
- [ ] **Pricing page copy** — use `pricing-strategy.md` Part 6 drafts verbatim, edit for tone.
- [ ] **Sentry alerts** for error-rate spikes (>1% over 5 min). Webhook to your phone/email.
- [ ] **"Free during early access — Starter coming soon"** banner in-app. Creates monetisation expectation without requiring Stripe to be live for every user.
- [ ] **Status page / uptime monitor** (Better Stack or similar, free tier).
- [ ] **Launch-day content drafts:**
  - 3 Twitter/X threads (problem → demo → pricing)
  - 1 Product Hunt draft
  - 1 Hacker News "Show HN" draft
  - 1 Reddit post for r/productivity, r/SideProject
- [ ] **Changelog page** (`/changelog`) for transparent ongoing updates.

---

## Days 20–21: Ship

- [ ] **Final UAT.** Every golden path + every error path. Test on mobile Safari, mobile Chrome, desktop Chrome, desktop Firefox.
- [ ] **Deploy to production.**
- [ ] **Post launch content.** Space across the day (Twitter 9am, HN 11am, PH 00:01 UTC, Reddit 2pm).
- [ ] **Monitor first 48 hours.** Sentry + Vercel Analytics + PostHog funnel. Fix anything critical within 1 hour.
- [ ] **Respond to every comment.** First 50 users are hand-held to success.

---

## Week 3 Definition of Done

- [ ] Settings has exactly 3 tabs: Profile · Billing · Advanced
- [ ] All empty states have actionable copy (zero "No results found")
- [ ] 3 non-developer user tests completed, confusion points addressed
- [ ] `npm run typecheck` passes clean
- [ ] Lighthouse: LCP < 2.5s, CLS < 0.1
- [ ] Landing page live on Vercel
- [ ] All launch content drafted for 4 channels
- [ ] Deployed to production
- [ ] 48h monitoring shift complete
