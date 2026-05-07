# Landing Audit — 2026-05-07

> Public-launch landing page (`/`). ProductHunt-day traffic lands here. Audit covers `src/views/Landing.tsx`, `src/views/LandingHero.tsx`, `index.html` head, OG card, robots, sitemap, JSON-LD, scroll perf, fluid type, mobile rendering. CWV out of scope (covered by performance-audit). Login flow out of scope (login-signup-audit).

## Verdict

**Solid bones, three sharp edges.** Page architecture, copy voice, and SEO surface (robots, sitemap, OG, JSON-LD) are launch-grade. Three production blockers: (1) **canonical URL mismatch** between `index.html` (`everionmind.com`) and `Landing.tsx` (`everion.smashburgerbar.co.za`) — the SPA hook overwrites the head tag on mount, so Google sees both depending on render path. (2) **Hero CTA hierarchy is inverted** — the only above-the-fold button routes to "Sign in" (`onAuth("login")`), not signup; cold ProductHunt visitors hit a login screen, not a value-clear signup flow. (3) **Pricing inconsistency across surfaces** — JSON-LD says Pro is `$6`, Landing card says `$9.99`, BillingTab says `$9.99`. Search engines and rich-result eligibility see the wrong price.

Three medium edges: fabricated testimonials shipped (file comment admits it), Pro plan promises "Claude Sonnet" while project's active provider is Gemini (Anthropic key not yet valid per `CLAUDE.md`), and personal Gmail address exposed in footer. Eight low findings round it out — `100vh` instead of `100dvh` on the scroll container, hero image not preloaded for LCP, sitemap `lastmod` stale, missing kbd hint that code references, exit-intent slide-in does not honor `prefers-reduced-motion`, "Three tiers" copy + four cards mismatch.

**Ship blockers**: F1, F2, F3. Everything else can ship and patch in a hotfix.

---

## Architecture overview

```
/  (Landing.tsx)
│
├── <header className="landing-nav">  position: sticky; top:0; backdrop-blur
│   ├── Logo + ember-dot (design-breathe 3.5s)
│   └── Nav links + [Sign in] + [Start remembering / Sign up]   ← TWO CTAs in nav
│
├── <main>
│   │
│   ├── <LandingHero>                 minHeight: 100vh; full-bleed photo
│   │   ├── /landing-hero.webp        eager, opacity 0.85, z:0
│   │   ├── vignette overlay          z:1
│   │   ├── h1 "Everion•"             clamp(72px, 18vw, 220px) italic serif
│   │   ├── tagline                   "your second brain — for everything that matters."
│   │   ├── [Sign in ↗] ghost btn     ← PRIMARY ABOVE FOLD, routes onAuth("login")
│   │   ├── ↓ scroll hint
│   │   └── © 2026 Everion
│   │
│   ├── #what       "What Everion is" + chip cloud (17 chips, no animation)
│   ├──             FOUR PILLARS — Capture / Recall / Synthesize / The Shape
│   ├──             SOCIAL PROOF — 3 fabricated quotes (file marks placeholder)
│   ├── #demo       LandingDemo — 4-tab pre-recorded scenario picker, no IO
│   ├──             "Why not just use" — Notion / Apple Notes / 1Password
│   ├── #pricing    FOUR PlanCards: Hobby $0 / Starter $4.99 / Pro $9.99 (featured) / Max $19.99 (comingSoon)
│   ├──             FAQ — 3 items (1Password / encryption / bounce)
│   └──             FINAL CTA — "Start free" → onAuth("signup")
│
├── <footer>        4 cols (Product / For you / Learn / Support) + © + tagline
│
└── <ExitIntentSlideIn>   fixed bottom-right; mouseout-top OR scroll-up-past-pricing
```

**Animation budget on landing**: ZERO IntersectionObserver, ZERO framer-motion, ZERO useScroll. Only motion is the `design-breathe` CSS keyframe on the ember dot (`Landing.tsx:709`, `LandingHero.tsx` doesn't use it but inherits via `<header>` nav dot). LandingHero uses one `eager` photo + two static gradient overlays. Cheap to render.

---

## CTA inventory

| # | Surface | File:Line | Label | Variant | Routes to | Visual weight | Above fold? |
|---|---|---|---|---|---|---|---|
| 1 | Nav | `Landing.tsx:756` | "Sign in" | outline sm | `onAuth("login")` | medium | ✅ |
| 2 | Nav | `Landing.tsx:759` | "Start remembering" / "Sign up" | default sm | `onAuth("signup")` | high | ✅ |
| 3 | Hero center | `LandingHero.tsx:144-177` | "Sign in ↗" | glass ghost btn | `onAuth("login")` | dominant | ✅ |
| 4 | Hero scroll hint | `LandingHero.tsx:195-220` | "scroll ↓" | text only | scroll to `#what` | low | ✅ |
| 5 | Demo section | `Landing.tsx:431-433` | "Try it with your own thoughts" | default lg | `goto("signup")` | high | scroll |
| 6 | Pricing — Hobby | `Landing.tsx:1056` | "Start free" | outline lg | `goto("signup")` | medium | scroll |
| 7 | Pricing — Starter | `Landing.tsx:1071` | "Start free" | outline lg | `goto("signup")` | medium | scroll |
| 8 | Pricing — Pro | `Landing.tsx:1087` (featured) | "Start free" | default lg | `goto("signup")` | high | scroll |
| 9 | Pricing — Max | `Landing.tsx:1104` | "Notify me" | outline lg disabled | no-op | low | scroll |
| 10 | Final CTA | `Landing.tsx:1215` | "Start free" | default lg | `goto("signup")` | high | scroll |
| 11 | Cmd/Ctrl+K | `Landing.tsx:628-637` | invisible | keybind | `onAuth("signup")` | n/a | n/a |
| 12 | Exit-intent | `ExitIntentSlideIn.tsx` | email capture | dialog | `marketing_leads` insert | overlay | n/a |

**Above-the-fold dominance** (LandingHero): three CTAs visible — nav "Sign in", nav "Start remembering / Sign up", center "Sign in ↗". The center one is the visually dominant element by a wide margin (glass-effect button under a 220px italic wordmark). It routes to **login**, not signup.

---

## What's solid

- **JSON-LD coverage** is genuinely good for AI-search era: `Organization` + `WebSite` + `SoftwareApplication` (with offers) + standalone `FAQPage` with 9 Q&As (`index.html:55-186`). Reinforced via `/learn.html` per the comment. Strong AEO/GEO surface.
- **Robots.txt** has explicit AI-bot allowlist (`GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `Bingbot`) and explicit `CCBot: Disallow: /` — matches `EML/STRATEGY.md` AI SEO posture (`public/robots.txt:1-89`). Disallows `/api/`, `/v1/`, `/admin`, `/login`, `/reset-password` — correct.
- **OG card present and correctly dimensioned**: `public/og.png` is `1200×630` PNG (`8961` bytes — small, will load fast). All four standard tags set: `og:title`, `og:description`, `og:image` (with width/height/alt), `og:url`, `twitter:card=summary_large_image` (`index.html:31-49`).
- **Meta description launch-grade** (`index.html:26-29`): 234 chars, ends concept-rich (`local-first, end-to-end encrypted`). Not the Vite default.
- **Sitemap.xml** present and references the canonical domain; lists `/`, `/learn.html`, `/vs/notion.html`, `/vs/mem.html`, `/vs/1password.html`, `/research/second-brain-2026.html`, `/privacy`, `/terms`, `/status` (`public/sitemap.xml:1-58`). Footer links match.
- **No render-blocking 3rd-party scripts in `<head>`**. PostHog and Sentry are lazy-loaded from `src/main.tsx:32,60` — they ship with the bundle but don't gate first paint.
- **Google Fonts is preload-only** (`index.html:199-208`); main.tsx injects the stylesheet so `<link>` is non-blocking. CSP-aware (the comment explains why no inline `onload` swap).
- **Inline app-shell boot screen** (`index.html:223-419`) means visitors see content at ~500ms not 4-5s on cold cell.
- **Fluid type via `clamp()`**: hero `clamp(72px, 18vw, 220px)`, all section h2s `clamp(28-32px, 4.5-5vw, 44-56px)`, hero subhead `clamp(14px, 1.6vw, 18px)`. Consistent and well-bounded.
- **No IntersectionObserver / framer-motion / useScroll on Landing or LandingHero** — scroll cost is essentially zero. CSS `design-breathe` on ember dot is the only running animation.
- **Footer Privacy + Terms links present** (`Landing.tsx:1273-1275, 1303-1304`) — legal launch requirement satisfied.
- **JSON-LD `FAQPage`** mirrors the in-page FAQ — good for AI Overviews extraction.
- **Mobile nav collapse** at 820px hides text links, keeps the two CTA buttons. Safe-area-top respected via `calc(18px + env(safe-area-inset-top))` (`Landing.tsx:673`).
- **Hero photo `loading="eager"`, `decoding="async"`** (`LandingHero.tsx:54`) — correct LCP signal.
- **CSP-conscious markup**: no inline event handlers, watchdog script self-hosted (`index.html:421-428`).

---

## Findings

### F1 — Canonical URL mismatch between index.html and Landing.tsx

**Severity: HIGH** — SEO blocker

`index.html:30`:
```html
<link rel="canonical" href="https://everionmind.com/" />
```

`Landing.tsx:619-624`:
```ts
useDocumentMeta({
  title: "Everion — your second memory, quietly kept.",
  description: "...",
  canonical: "https://everion.smashburgerbar.co.za/",
});
```

`useDocumentMeta` (`src/hooks/useDocumentMeta.ts:32`) writes the `canonical` attribute on mount. So:
- Bot that doesn't run JS sees `everionmind.com`
- Bot that does run JS sees `everion.smashburgerbar.co.za`
- Both are real reachable surfaces (custom domain + Vercel-pinned subdomain)

Google will pick one canonical and split equity. ProductHunt + AI-search citation links arrive on `everionmind.com` and the canonical hook tells Google the canonical is the OTHER domain.

**Fix**: change `Landing.tsx:623` to `https://everionmind.com/` and verify across `LoginScreen`, `/privacy`, `/terms`, `/status`, `/learn.html` for the same drift. JSON-LD already uses `everionmind.com` consistently — that's the right canonical.

### F2 — Hero CTA routes to login, not signup

**Severity: HIGH** — conversion blocker

`LandingHero.tsx:144-177`:
```tsx
<button
  type="button"
  onClick={() => onAuth("login")}
  ...
>
  Sign in
  <span aria-hidden="true">↗</span>
</button>
```

The single visually dominant above-the-fold CTA — under the 220px italic wordmark, glass-effect, the only button in the center stack — routes to **login**. Cold ProductHunt traffic = zero existing accounts. The visitor sees: huge brand, italic tagline, "Sign in" button. Their intent is "maybe sign up", but the dominant button is for users who already have accounts. The signup path is buried in nav as "Start remembering" / "Sign up" (`Landing.tsx:759`) — text-button-sized at the top-right corner, easily missed at hero.

The primary button below the wordmark is the highest-clicked element on any landing page. Pointing it at login costs every signup not yet recovered by the user finding pricing later.

**Fix**: change `LandingHero.tsx:145` to `onAuth("signup")`, and the button label to `"Start free"` or `"Start remembering"` to match the nav. Add a smaller "Already have an account? Sign in" text link below the primary, routing to login. Standard SaaS hero pattern.

### F3 — Pricing inconsistency: JSON-LD says Pro is $6, page says $9.99

**Severity: HIGH** — rich-result + trust blocker

`index.html:91-98`:
```json
{
  "@type": "Offer",
  "name": "Pro",
  "price": "6",
  "priceCurrency": "USD",
  "description": "Hosted AI, sync across devices, shared brains. 14-day trial, no card required."
}
```

`Landing.tsx:1077`: `price="$9.99"`
`BillingTab.tsx:402,415,477`: `$9.99/mo`
`ChatView.tsx:230`: `Pro $9.99/mo`
`ROADMAP.md:57`: `LEMONSQUEEZY_PRO_VARIANT_ID ($9.99/mo)`

Three problems:
1. Schema.org Offer says `$6` — Google AI Overviews + Perplexity will cite the wrong price.
2. JSON-LD references "14-day trial" — `Landing.tsx` has zero "14-day" or "trial" copy. The trial promise lives only in structured data; users won't see it on the page. Either it's a feature or it isn't.
3. JSON-LD lists only `Hobby` + `Pro` — missing `Starter` ($4.99) and `Max` ($19.99) that the page advertises.

**Fix**: rewrite the `offers` array in `index.html:83-99` to four Offers matching the four PlanCards (Hobby $0, Starter $4.99, Pro $9.99, Max $19.99 with `availability: "PreOrder"` for Max). Drop the trial line OR add the trial CTA + caption to the page.

### F4 — "Three tiers. All honest." copy + four cards rendered

**Severity: MEDIUM** — copy/UX inconsistency

`Landing.tsx:1021`:
```tsx
<h2 ...>Three tiers. All honest.</h2>
```

`Landing.tsx:1046-1113` renders four `<PlanCard>` components: Hobby, Starter, Pro, Max. Max is `comingSoon` so visually muted, but it's still a fourth card the user sees.

The copy was right when there were three tiers. Adding Max broke it.

**Fix**: rewrite to `"Four tiers. All honest."` OR `"Pricing that earns its place."` — pick prose that matches the rendered count, or hide Max behind a "+ Max coming soon" footnote below the three-card grid.

### F5 — Fabricated testimonials shipped to launch surface

**Severity: MEDIUM** — trust + legal/FTC risk

`Landing.tsx:887`:
```tsx
{/* SOCIAL PROOF — placeholder quotes, replace with real ones post-launch */}
```

`Landing.tsx:905-916` ships three named testimonials:
- "Sarah · founder"
- "Andre · senior engineer"
- "Megan · operator"

These are fabricated. The file comment admits it. ProductHunt audiences read testimonials carefully; AI search engines extract them as quotes. Inventing first-name-plus-title testimonials before launch carries FTC endorsement-rule exposure (16 CFR §255) and a reputational hit if a competitor or HN comment flags them.

**Fix (pick one)**:
1. **Remove the section entirely** until real beta-cohort quotes exist (recommended pre-launch).
2. **Replace with one anonymized real quote** from a beta tester + `EML/Analytics/beta-cohort.md` source.
3. **Replace with capability lines, not personas**: "Captures from 14 real beta users · 1,200 entries indexed · 380 chats answered" — provable claims, no fake people.

Lifting placeholder testimonials into pre-launch should be a `LAUNCH_CHECKLIST.md` P0 item.

### F6 — Pro tier promises Claude Sonnet, project's active AI is Gemini

**Severity: MEDIUM** — commitment vs reality

`Landing.tsx:1080-1086`:
```tsx
bullets={[
  "Everything in Starter",
  "Premium AI (Claude Sonnet)",
  "2,000 captures · 1,000 chats / month",
  ...
]}
```

`Landing.tsx:1054`:
```tsx
"Bring your own key (Anthropic, OpenAI, OpenRouter, OpenRouter, Groq)",
```

`CLAUDE.md`:
> **This project runs on Gemini, not Anthropic.** `GEMINI_API_KEY` is the active provider key. The Anthropic key is not yet valid — do not assume `ANTHROPIC_API_KEY` is configured.

Pro plan landing copy explicitly names `Claude Sonnet` as the premium model. If a Pro purchaser checks under the hood and finds Gemini Flash 2.0, that's a contractual mismatch on the very first paid feature.

**Fix (pick one)**:
1. Update `Landing.tsx:1082` to `"Premium AI (Gemini Pro / equivalent frontier model)"` — matches what actually ships.
2. Get a valid Anthropic key wired into the Pro routing path BEFORE launch (the LS variant ID env still maps the SKU; the code switching the provider is the work).
3. Soften: `"Premium AI (top-tier reasoning model)"` — vague but not a lie.

Same audit applies to Hobby BYOK list mentioning Anthropic — check whether the BYOK route actually accepts Anthropic keys today (`api/llm.ts` provider list).

### F7 — Personal email exposed in footer

**Severity: MEDIUM** — privacy + spam risk

`Landing.tsx:1301`:
```tsx
["Email support", "mailto:stander.christian@gmail.com"],
```

Public-launch landing page hard-codes a personal Gmail. Three issues:
1. Spam harvest target the moment ProductHunt drops — your inbox dies day 1.
2. Brand mismatch — `support@everionmind.com` reads professional, `stander.christian@gmail.com` reads side-project.
3. GDPR / privacy footprint — the support address ends up in user records, then in your Gmail under personal data.

**Fix**: register `support@everionmind.com` (Cloudflare email routing or Vercel domains forwarding → personal inbox is fine, but the *visible* address is the brand domain). Update `mailto:` link.

### F8 — Hero scroll container uses `100vh` not `100dvh`

**Severity: MEDIUM** — iOS Safari layout

`Landing.tsx:653-661`:
```tsx
<div className="scrollbar-hide" style={{
  height: "100vh",
  overflowY: "auto",
  ...
}}>
```

`LandingHero.tsx:31`:
```tsx
minHeight: "100vh",
```

iOS Safari computes `100vh` against the *largest* viewport (URL bar hidden). When the page first loads with the URL bar visible, the layout extends ~88px below the visible area. The user sees a scrollbar where there shouldn't be one and the hero "Sign in" CTA can be clipped at the bottom edge on smaller phones (iPhone SE, iPhone 13 mini).

`100dvh` is the right unit (dynamic — adapts to the URL bar's actual current state). `100lvh` is the largest-viewport version. Use `dvh` here so the hero exactly fills what's visible at any URL-bar state.

`tokens.css` already shows the project knows `100dvh` and `100lvh` — `index.html:246-254` uses both correctly. Landing was missed.

**Fix**: replace `100vh` with `100dvh` at `Landing.tsx:656` and `LandingHero.tsx:31`. Verify hero photo still covers (`object-fit: cover` + `inset:0` is fine).

### F9 — Hero image not preloaded — LCP cost

**Severity: MEDIUM** — performance

The hero `<img src="/landing-hero.webp">` is the LCP element on the landing route. It loads `eager` (good) but is not `<link rel="preload">`-ed in the head. On a cold connection, the image discovery happens after `main.tsx` parses, mounts the React tree, renders LandingHero — that's 4-5 round-trips of latency before the browser even starts the image fetch.

`index.html` only preloads the Google Fonts stylesheet. No image preload. The boot-shell hides this by showing the orbital animation until React mounts, but the LCP timer doesn't pause for the boot shell — it counts wall-clock from navigation.

**Fix**: add to `index.html` head:
```html
<link rel="preload" as="image" href="/landing-hero.webp" fetchpriority="high" />
```
Conditional concern: this only helps the landing route. If the same `index.html` serves the signed-in app shell, the preload wastes bytes. Solution: inject the preload tag only when a server-side route rewrites to landing, OR accept the small cost (the asset is `<200KB`, served from `/public/`).

Note: `/public/landing-hero.webp` is referenced by `LandingHero.tsx:17,21` but `Glob public/landing-hero*` returned **no matches**. Either the file exists outside the path I checked (Vercel deploys it from elsewhere), the file is missing entirely (the `onError` fallback to gradient kicks in), or it's named differently. **Verify before launch** — without the file, the hero is just a dark gradient with no photo.

### F10 — Sitemap `lastmod` stale

**Severity: LOW**

`public/sitemap.xml:5,11,17,...` — every URL has `<lastmod>2026-04-29</lastmod>`. Today is 2026-05-07. Landing page has been edited since (this audit's parent commits modify `LAUNCH_CHECKLIST`, etc.).

Crawlers use `lastmod` as a recrawl signal. Stale `lastmod` = lower crawl priority post-launch even if you ship daily.

**Fix**: regenerate sitemap from a script run on `vercel build`. Pull `git log --format=%cI -1 -- <path>` for each URL, write that as `<lastmod>`. Or accept manual update + add to LAUNCH_CHECKLIST.

### F11 — Cmd/Ctrl+K keybind has no visible kbd hint

**Severity: LOW** — copy/code inconsistency

`Landing.tsx:626-637`:
```ts
// Cmd/Ctrl+K on the landing page = the same thing the kbd hint promises:
// start the signup flow. The hint exists, so the binding has to honor it.
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      onAuth("signup");
    }
  };
  ...
}, [onAuth]);
```

Comment claims "the kbd hint promises" Cmd+K. **Grep `<kbd>` and `Cmd` and `Ctrl+K` in Landing.tsx returns no matches.** The hint was removed (or never shipped) but the binding stayed. So:
- A power user who hits Cmd+K on the landing page gets navigated to signup with no prompt — surprise behavior.
- A user who copies text with Cmd+C then mistypes Cmd+K loses their place.

**Fix (pick one)**:
1. Remove the keybind (`Landing.tsx:628-637`) — no hint, no bind.
2. Add the kbd hint somewhere visible (under hero CTA, next to capture bar) — `<kbd>⌘K</kbd> to start`.

Keep code and copy in lockstep.

### F12 — ExitIntentSlideIn fade ignores `prefers-reduced-motion`

**Severity: LOW** — a11y

`ExitIntentSlideIn.tsx:178`:
```ts
animation: "exit-slide-in-fade 320ms cubic-bezier(0.16, 1, 0.3, 1)",
```

`ExitIntentSlideIn.tsx:325-328`:
```css
@keyframes exit-slide-in-fade {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

The 12px translateY + opacity fade fires unconditionally. Users with `prefers-reduced-motion: reduce` on get a vestibular-trigger animation. `tokens.css:322` and `:362` show the project respects the media query elsewhere — exit-intent missed it.

**Fix**: wrap the keyframe in `@media (prefers-reduced-motion: no-preference) { ... }` OR add a `@media (prefers-reduced-motion: reduce) { .exit-slide-in { animation: none !important; } }` block.

Same media query check should apply to `design-breathe` ember dot — `tokens.css:274-281` defines the keyframe but I didn't verify it has a reduced-motion override. Check before launch.

### F13 — Trust signals: missing user count / press / partner logos

**Severity: LOW** — conversion lift opportunity

The page has 3 (fabricated) testimonials and a "honest" voice — no other social proof. ProductHunt-day visitors look for:
- "X users" or "X captures stored" count
- Press mentions (TechCrunch, ProductHunt featured badge, Hacker News post)
- "As seen on" or partner logos
- Star ratings or App Store / Play Store ratings (post-launch)

Absent today. Beta cohort exists per `EML/Analytics/beta-cohort.md`. A live counter ("1,247 captures this week") wired to a Supabase aggregate beats a fake testimonial twice over.

**Fix**: post-launch task. Add a "by the numbers" strip below the hero or above the final CTA pulling live from `entries` table aggregate (cached 1h). Lift to `EML/LAUNCH_CHECKLIST.md` under P2.

### F14 — No horizontal-scroll check evidence at 360px

**Severity: LOW** — verify

I cannot run a real browser in this audit. The landing has `padding: "120px 40px"` on most sections. At 360px viewport, that leaves 280px content width — fine for text, but the pricing grid has `minmax(240px, 1fr)` (`Landing.tsx:1040`). 240px + 40px+40px padding = 320px minimum to render one column without hscroll. Acceptable — but the chip cloud at `Landing.tsx:811-834` has 17 chips with `gap: 8` and no max-line-length constraint; on 360px a chip with text "credit cards (vault)" might overflow. Manual check at 360px CSS pixel width before launch.

**Fix**: open Chrome DevTools, set device to 360×800, scroll the full page, look for any element extending past 360px width. Common offenders: wide testimonial cards, pre/code blocks, and unconstrained images. Capture screenshot in `EML/Audits/landing-360px-check-2026-05-07.png` to lock the result.

### F15 — Footer `Learn` links may 404

**Severity: LOW** — verify

`Landing.tsx:1287-1296` links to:
- `/learn.html`
- `/research/second-brain-2026.html`
- `/vs/notion.html`
- `/vs/mem.html`
- `/vs/1password.html`

Sitemap also lists them. **I did not verify these files exist in `public/`.** Out of scope but blocker if missing — clicking them would give the user a 404 on the launch page.

**Fix**: `Glob public/{learn.html,vs/*.html,research/*.html}` and confirm. If missing, either ship the static pages OR remove the footer links until they ship. Sitemap also needs to drop URLs that 404 — Google penalizes sitemap-listed-but-404 URLs.

### F16 — Pricing card "All features included" on Pro is vague

**Severity: LOW** — copy

`Landing.tsx:1085`:
```tsx
"All features included",
```

Inside Pro card. Reads like filler. The visitor is comparing tiers — they want to know what's actually included, not a marketing tautology. The other Pro bullets are concrete (capture quotas, Claude Sonnet [F6], shared brain). This one is empty.

**Fix**: replace with a concrete capability — "Voice mode unlimited", "Calendar + Gmail integration", "Export anytime", or "Priority email support". Match the specificity of "Shared brain with one other person".

---

## Surface map

| Surface | File | Status | Notes |
|---|---|---|---|
| Hero | `src/views/LandingHero.tsx:1-234` | F2, F8, F9 | LCP element, photo file existence unverified |
| Header / nav | `Landing.tsx:664-764` | OK | Sticky, backdrop-blur, two CTAs visible |
| What it is | `Landing.tsx:772-849` | OK | 17-chip cloud, no animation |
| Four pillars | `Landing.tsx:852-885` | OK | Static grid, no scroll triggers |
| Social proof | `Landing.tsx:887-918` | F5 | Fabricated testimonials |
| Demo | `Landing.tsx:314-449, 921-961` | OK | 4-tab pre-recorded, no live AI calls |
| Comparisons | `Landing.tsx:964-1004` | OK | Notion / Apple Notes / 1Password |
| Pricing | `Landing.tsx:1007-1115` | F3, F4, F6, F16 | Pricing math correct on page; JSON-LD wrong |
| FAQ | `Landing.tsx:1118-1174` | OK | 3 items, mirrored in JSON-LD |
| Final CTA | `Landing.tsx:1177-1222` | OK | "Start free" routes to signup |
| Footer | `Landing.tsx:1226-1324` | F7, F15 | Personal email, possibly-missing /learn pages |
| Exit-intent | `src/components/ExitIntentSlideIn.tsx:1-340` | F12 | Reduced-motion not honored |
| Head meta | `index.html:1-103` | F1, F3 | Canonical mismatch, JSON-LD pricing wrong |
| Robots | `public/robots.txt:1-89` | OK | Best-in-class AI bot allowlist |
| Sitemap | `public/sitemap.xml:1-58` | F10 | Stale lastmod |
| OG card | `public/og.png` | OK | 1200×630, 8961 bytes |

---

## Pre-launch checklist (lift to LAUNCH_CHECKLIST.md)

| Tier | Finding | Action | Owner |
|---|---|---|---|
| **P0** | F1 | Set `Landing.tsx:623` canonical to `https://everionmind.com/` | dev |
| **P0** | F2 | Hero CTA → `onAuth("signup")` + label "Start free", add small "Sign in" text link | dev |
| **P0** | F3 | Rewrite `index.html` JSON-LD `offers` array to four Offers w/ correct prices | dev |
| **P0** | F5 | Replace or remove fabricated testimonials | dev + Christian |
| **P1** | F6 | Reconcile Pro AI promise (Claude Sonnet) with shipped provider (Gemini) | dev |
| **P1** | F7 | Register `support@everionmind.com`, swap mailto in footer | ops |
| **P1** | F8 | `100vh` → `100dvh` on Landing scroll container + LandingHero minHeight | dev |
| **P1** | F9 | Add `<link rel="preload" as="image" href="/landing-hero.webp">` to head | dev |
| **P1** | F15 | Verify `/learn.html`, `/vs/*.html`, `/research/*.html` exist or remove links | dev |
| **P2** | F4 | "Three tiers" copy → match four-card render | dev |
| **P2** | F10 | Build-time sitemap regeneration | dev |
| **P2** | F11 | Add visible kbd hint OR remove Cmd+K binding | dev |
| **P2** | F12 | `prefers-reduced-motion` opt-out for exit-intent fade | dev |
| **P2** | F14 | 360px viewport manual scroll check + screenshot | qa |
| **P2** | F16 | Replace "All features included" with concrete bullet | dev |
| **P2** | F13 | Live "by the numbers" social proof strip post-launch | dev |

---

## Recommendations (priority)

1. **[P0] Ship F1 + F2 + F3 in one commit before any external link to `/`.** Canonical, hero CTA, JSON-LD pricing — all SEO/conversion blockers, ~30 min combined.
2. **[P0] F5 — kill or replace fabricated testimonials.** Five-minute change, removes legal exposure, removes embarrassment if HN catches it.
3. **[P1] F6 + F7 — get Pro plan AI promise true OR change copy, register support email.** Both are 1-hour fixes (env + copy, or DNS routing + footer line).
4. **[P1] F8 + F9 — `100dvh` + image preload.** Both LCP/layout-correctness items, ~10 min each.
5. **[P2] F10 + F12 + F16.** Polish before ProductHunt morning.
6. **Post-launch] F13** — wire live counter for trust signal, ship in week 1.

---

## Method

- Read `src/views/Landing.tsx` (1347 lines) and `src/views/LandingHero.tsx` (234 lines) end-to-end. Mapped every section, every CTA (12 total), every animation trigger (one CSS keyframe).
- Read `index.html` (431 lines) — meta tags, OG, JSON-LD, font preload, boot shell, CSP context.
- Verified `public/og.png` dimensions via `file` (1200×630, 8961 bytes).
- Read `public/robots.txt` (89 lines) and `public/sitemap.xml` (58 lines) line-by-line.
- Grepped `IntersectionObserver`, `useScroll`, `framer-motion`, `gsap` in landing files — zero matches confirms no scroll-driven cost.
- Grepped `prefers-reduced-motion` across `src/` — found 3 files, none in landing surface.
- Grepped `clamp(` — confirmed fluid type on hero h1, hero subhead, every section h2.
- Cross-referenced pricing across `Landing.tsx`, `BillingTab.tsx`, `ChatView.tsx`, `index.html` JSON-LD, and `EML/ROADMAP.md` to find F3.
- Cross-referenced `CLAUDE.md` "Gemini not Anthropic" rule against Pro plan copy to find F6.
- Read `src/components/ExitIntentSlideIn.tsx` (340 lines) — fade animation, no reduced-motion guard.
- Read `src/hooks/useDocumentMeta.ts` (67 lines) — confirmed `useDocumentMeta` overwrites the head canonical on mount, so `Landing.tsx:623` wins over `index.html:30` for JS-rendering crawlers.
- Did not run a real browser. F14 (360px hscroll) and F15 (`/learn.html` existence) are flagged as verify items, not confirmed defects.

**Audit kicked off by**: senior staff engineer evidence-based pre-launch review on 2026-05-07.
