# Everion — Design Brief for AI Design Tools
**Version:** 1.0  
**Date:** 2026-04-20  
**Purpose:** Copy-paste brief for Claude Design / Canva AI / any design tool to improve Everion's UI/UX

---

## 1. What is Everion?

Everion is a **personal memory assistant and second brain**. Users capture notes, ideas, contacts, reminders, and links — then ask an AI to recall, synthesize, and surface connections across everything they've saved.

**Target user:** Knowledge workers, researchers, writers, and curious minds who want to externalise their memory and query it like a conversation.

**Tone:** Thoughtful, precise, warm. Not playful. Not corporate SaaS. Not cold or clinical. Feels like a premium physical instrument the user inhabits — like a beautiful notebook that thinks back.

**Tagline:** *"Your personal memory assistant"*

---

## 2. Design System Name

| Mode | Name | Feeling |
|---|---|---|
| Dark (default) | **Neural Obsidian** | Deep focus, volcanic depth, premium |
| Light | **Neural Alabaster** | Warm ivory clarity, organic warmth |

**Creative north star:** *"The Ethereal Synapse"* — the UI should feel like stepping inside your own mind. Depth over flatness. Warmth over cold tech.

---

## 3. Brand Identity

**Logo:** A ring with a centered dot. The ring = continuous preserved memory. The gap in the ring = the capture aperture. The dot = a captured thought.

**Brand color:** Muted Gold/Bronze — warm, natural, premium. Not yellow. Not orange. Think aged parchment or burnished copper.

**Logo mark usage:** Always paired with "Everion" wordmark in Lora serif. Subtitle "Neural Interface" in DM Sans uppercase with wide letter-spacing beneath.

---

## 4. Color System

### 4.1 Dark Mode — Neural Obsidian (Primary)

All colors defined in OKLCh for perceptual uniformity.

#### Surfaces (background hierarchy — low to high)
```
Page void:          oklch(6% 0.005 60)    ← Near-black warm charcoal
Surface dim:        oklch(8% 0.007 60)    ← Deepest layer
Surface container low:    oklch(15% 0.012 62)
Surface container:        oklch(17% 0.013 62)   ← Primary cards
Surface container high:   oklch(21% 0.015 65)   ← Elevated cards
Surface container highest: oklch(25% 0.016 65)  ← Active / selected
Surface bright:     oklch(31% 0.018 65)   ← Interactive hover
```

> Key: surfaces are never flat black — they are deep **warm charcoal** with a slight brown/amber cast (hue ~60–65°).

#### Accent Colors — Semantic Rules (Never Break)

| Token | OKLCh | Hex approx | Meaning | Allowed Uses | Forbidden Uses |
|---|---|---|---|---|---|
| `primary` | `oklch(68% 0.09 75)` | ~#A68B67 | **Action** | CTA buttons, active nav, focus rings, links, progress bars, starred items | AI generation indicators |
| `secondary` | `oklch(58% 0.022 75)` | ~#8A7D6E | **Receded / support** | Supporting UI, secondary actions — very low chroma, recedes without competing | Anything that needs to stand out |
| `tertiary` | `oklch(62% 0.10 145)` | ~#6B8C6E | **Merge / combine** | Merge actions, connection indicators, synthesis UI | Security/privacy, action buttons |
| `error` | `oklch(62% 0.18 25)` | ~#D4504A | **Danger** | Errors, failed sync, destructive confirmation | Informational content |
| `success` | `oklch(62% 0.15 142)` | ~#5A9460 | **Confirmation** | Success toasts, completed states | — |

#### Text Colors
```
Headings / titles:    oklch(96% 0.007 80)   ← Near-white with warm cast
Body / descriptions:  oklch(62% 0.012 70)   ← Warm mid-grey (NEVER pure white for body)
Borders:              oklch(38% 0.014 65)   ← Outline
Ghost borders:        oklch(22% 0.012 65)   ← Outline-variant (used at low opacity only)
```

### 4.2 Light Mode — Neural Alabaster

```
Page background:      oklch(98.5% 0.009 85)   ← Warm ivory, not white
Surface:              oklch(100% 0 0)          ← White cards
Surface container:    oklch(96% 0.008 80)      ← Slight cream tint
Primary (accent):     oklch(46% 0.09 75)       ← Darker gold for AA contrast
On-surface (text):    oklch(18% 0.012 65)      ← Deep warm brown (not black)
On-surface-variant:   oklch(42% 0.012 70)      ← Mid warm brown for body
```

> Light mode is warm ivory — not bright white. Think aged paper, not hospital white.

---

## 5. Typography

### Font Stack
- **Headlines / Brand:** `Lora` (variable, serif) — conveys warmth, thought, and gravitas
- **Body / UI:** `DM Sans` (variable, sans-serif) — clean, readable, modern
- **Fallback headline:** Georgia, serif
- **Fallback body:** system-ui, sans-serif

### Type Scale

| Token | Font | Size | Weight | Letter Spacing | Use Case |
|---|---|---|---|---|---|
| `display` | Lora | 56px | 700 | −0.04em | Hero statements, landing H1 |
| `headline-lg` | Lora | 40px | 700 | −0.03em | Main card titles, page headers |
| `headline-md` | Lora | 32px | 700 | −0.02em | Section headers |
| `headline-sm` | Lora | 24px | 700 | −0.02em | Modal titles |
| `title-lg` | Lora | 20px | 700 | −0.01em | Card titles |
| `title-sm` | DM Sans | 18px | 600 | 0 | Component names |
| `body-lg` | DM Sans | 16px | 400 | 0 | Primary body copy |
| `body-sm` | DM Sans | 14px | 400 | 0 | Secondary descriptions |
| `label` | DM Sans | 12px | 500 | 0 | Timestamps, metadata |
| `caption` | DM Sans | 10px | 500 | +0.2em | Nav labels (UPPERCASE), status pills |

### Typography Rules
1. **Lora serif** for all headlines — warmth and "thinking" quality
2. **DM Sans** for all body, UI labels, metadata
3. **Body text** is always `on-surface-variant` — never pure white for paragraphs
4. **Navigation labels** use `UPPERCASE` + `letter-spacing: 0.2em` + `10px`
5. **Minimum body text:** 16px for paragraph content
6. **Line length:** max 65ch on long-form text blocks

---

## 6. Spacing & Layout

### Spacing Scale (8px base)
```
4px   → icon-to-label gaps, tag padding
8px   → tight component internals
12px  → input padding, button padding
16px  → card internal padding (mobile)
24px  → card internal padding (desktop), section divider replacement
32px  → section separators
48px  → page-level section spacing
64px  → hero section spacing
```

### Border Radius Scale
```
4px   (rounded)      → micro elements, pills inside cards
8px   (rounded-lg)   → small interactive chips
12px  (rounded-xl)   → buttons, inputs, small cards
16px  (rounded-2xl)  → standard cards, modals
24px  (rounded-3xl)  → feature cards, large panels
9999px (rounded-full) → tags, avatars, bottom nav pill
```

**Nested corners rule:** Inner radius = Outer radius − gap. E.g. outer `24px`, 8px gap → inner `16px`.

---

## 7. Elevation & Depth Model

Depth is communicated through **surface luminance tiers**, not drop shadows.

```
z-5  Modal / Popover    Surface container highest + backdrop-blur(24px)
z-4  Sticky nav / bars  Surface dim + backdrop-blur(24px)
z-3  Active card        Surface container highest
z-2  Standard card      Surface container
z-1  Section bg         Surface container low
z-0  Page base          Background (the void)
```

**Shadows:** Only on floating elements (modals, sticky nav, CTAs). Static cards have no shadow.

```css
shadow-sm:  0 1px 3px oklch(5% 0.01 60 / 0.4)
shadow-md:  0 4px 12px oklch(5% 0.01 60 / 0.45)
shadow-lg:  0 12px 32px oklch(5% 0.01 60 / 0.5)
shadow-nav: 0 -1px 0 oklch(22% 0.012 65), 0 8px 24px oklch(5% 0.01 60 / 0.4)
```

**No glassmorphism.** The design previously used glass panels — they are now solid, theme-aware surfaces. Do not reintroduce background blur on static elements.

---

## 8. Component Inventory

### Navigation — Desktop Sidebar
- Fixed left sidebar, `width: 288px` (w-72)
- Top: Logo ring + "Everion" wordmark (Lora) + "Neural Interface" subtitle (DM Sans uppercase)
- Primary CTA: full-width "Capture Memory" button
- Nav items: icon + uppercase label, active state = left border `primary` color + subtle gradient background fill
- Bottom footer: theme toggle + user avatar + name
- No top-level dividers — spacing separates groups

### Navigation — Mobile Bottom Bar
- Floating pill, centered, `rounded-full`, `backdrop-blur`
- 5 primary tabs with icon + label
- Active tab = icon + label highlighted in `primary` color
- Theme toggle integrated as 6th icon
- Sits ~16px above safe area

### Mobile Header
- Minimal: logo left, action icons right (search, notifications)
- Does not repeat navigation labels

### Quick Capture Bar
- Sticky to top of content area on home screen
- Full-width input, rounded-full, `surface-container-high` background
- Placeholder: "What's on your mind?" 
- Right side: type selector chips + submit button

### Entry Cards (Bento Grid)
- **Desktop:** 12-column bento grid
  - Feature card: 8 columns, tall, has ambient gradient orb in background corner
  - Small cards: 4 columns each
- **Mobile:** Single column list
- Card anatomy: type icon (colored circle) → metadata row (date + reading time) → title (Lora) → preview text (DM Sans) → tags row
- Hover: `border-primary/20` transition (500ms ease), no shadow
- Press: `scale(0.97)` on active

### Entry Type Color Coding
Each entry type has a unique icon background:
- Note: primary/gold
- Link: blue
- Reminder: amber/yellow
- Contact: purple
- File: teal
- Idea: orange

### AI Chat Interface
- Full-height layout, sidebar-less on mobile
- User bubbles: right-aligned, `surface-container-high`, `rounded-2xl rounded-br-sm`
- AI bubbles: left-aligned, `surface-container`, top gradient accent line, "Intelligence Output" badge
- Generating state: 3 pulsing dots + "SYNTHESIZING..." uppercase label
- Input: fixed to bottom, full-width, send button right-aligned

### Modals & Sheets
- Centered modal: `rounded-3xl`, `shadow-lg`, scrim backdrop `blur(24px)`
- Mobile: bottom sheet sliding up from bottom edge
- No hard borders on modal edges — luminance separation from backdrop

### Toast Notifications
- Fixed bottom-right (desktop) or bottom-center (mobile)
- Left-border color pill design:
  - Gold border = default/info
  - Tertiary/sage border = success / AI action
  - Error border = failure
- Auto-dismiss: 4–6 seconds
- Max 3 visible at once, stack upward

### Skeleton Loading
- `skeleton-shimmer` class: gradient sweep animation, 1.5s infinite
- Matches exact shape of content it replaces
- Colors: `surface-container-low` → `surface-container` → `surface-container-low`

### Tags & Badges
- `rounded-full`, `px-3 py-1`, `body-sm` weight 500
- Background: `primary-container` (gold tinted) at low opacity
- Text: `on-primary-container`

### Empty States
- Centered illustration or icon, headline (Lora), description (DM Sans body-sm)
- Primary CTA to add first item
- Subtle ambient radial gradient behind illustration

### OmniSearch
- Full-screen overlay on mobile, popover on desktop
- Instant results as user types
- Groups results by type (Memories, AI Answers, Collections)

---

## 9. Key Screens

| Screen | Purpose | Key UI Notes |
|---|---|---|
| **Home / Neural Hub** | Memory feed + quick capture | Bento grid, nudge banner, sticky capture bar |
| **Ask AI / Chat** | Converse with your memory | Full-height chat, synthesizing states |
| **Collections / Grid** | Browse + filter all entries | Filter chips, list/grid toggle |
| **Timeline / Calendar** | Entries by date | Calendar grid, dot density = memory activity |
| **Vault** | Encrypted private entries | Tertiary/rose color accent, lock iconography |
| **Knowledge Graph** | Visual node map of connections | Full-bleed canvas, hover cards, pan/zoom |
| **Settings** | Account, AI config, brain config | Tab sidebar, grouped sections |
| **Login / Auth** | Magic link + OAuth | Centered card, warm background, logo hero |
| **Onboarding** | 4-step setup flow | Full-screen steps, progress indicator |

---

## 10. Animation & Motion

```
View transitions:    slide-up 320ms cubic-bezier(0.16, 1, 0.3, 1)
Fade in:             fade-in 200ms ease-out
Modal open:          zoom-in-95 → scale(1) 200ms expo
Sheet open:          slide-in-from-bottom 250ms expo
Press feedback:      scale(0.97) 120ms expo on :active
Shimmer:             background-position sweep 1.5s infinite
Typing indicator:    3-dot bounce, staggered 0.1s delay each
```

**Always honor `prefers-reduced-motion: reduce`** — all animations and transitions set to `0.01ms`.

---

## 11. Design Principles — Do & Don't

### DO
- Use luminance shifts (lighter surface tier) to separate content sections
- Add 24px vertical space instead of a divider line
- Use `Lora` for every headline — it carries the brand
- Use `DM Sans` uppercase + wide tracking for all nav labels and metadata
- Keep the color palette warm — all surfaces have a brown/amber hue cast (60–80° oklch hue)
- Use `press-scale` (scale 0.97) on every interactive element
- Respect color semantics: Gold = action, Sage = merge/connect, Stone = receded
- Keep mobile touch targets ≥ 44px
- Use skeleton screens (not spinners) for async loading
- In light mode, use warm ivory (`oklch(98.5% 0.009 85)`) — never pure white — as the page background

### DON'T
- Use flat black (`#000000`) — always warm charcoal with hue
- Use `1px solid` borders to divide content sections
- Use glassmorphism / `backdrop-filter: blur` on static cards
- Use pure white for body text — use `on-surface-variant`
- Mix color semantics (e.g. use gold for AI features, use sage for CTAs)
- Add drop shadows to static cards
- Use cool/blue-grey tones in the neutral palette — everything must lean warm
- Use `Geist` or `Inter` for headlines — Lora only
- Center content just because there's space — left-anchor text, let visual weight bleed right
- Add bounce or elastic animations — motion should be confident and precise

---

## 12. Tech Context (For Design Handoff)

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (`@theme` tokens in CSS) |
| Components | shadcn/ui (Radix primitives) + custom |
| Icons | Custom SVG set (NavIcons.tsx) + Lucide |
| Fonts | `@fontsource-variable/geist` (unused legacy) + Google Fonts: Lora, DM Sans |
| Theme | Dark/light via `.dark` class on `<html>` |
| Responsive | Mobile-first, 4 breakpoints: sm/md/lg/xl |
| PWA | Service worker, manifest, web push |
| Target | WCAG 2.2 AA accessibility |

---

## 13. What Needs Improvement (Design Direction)

These are the areas where the current UI can be elevated:

1. **Entry cards** feel generic — the bento grid concept isn't fully realised. The feature card (8-col) needs a stronger visual identity — ambient orb, richer typography hierarchy, more intentional use of the gold primary.

2. **Empty states** are functional but forgettable — they need illustration or iconographic warmth that reinforces the "second brain" metaphor.

3. **Onboarding** needs more personality — the steps should feel like setting up a physical space, not filling out a form.

4. **AI Chat** generating states need more visual drama — the "synthesizing" moment is when users feel the product's intelligence. It should look and feel more alive.

5. **Light mode** needs more attention — currently it defaults to white/grey rather than leaning fully into the warm ivory/parchment direction.

6. **Knowledge Graph** is underdeveloped visually — node cards, edge styling, and the overall canvas atmosphere need to reflect the depth and richness of the rest of the system.

7. **Mobile Quick Capture** should be the most delightful interaction in the app — it needs more polish on the input animation, type selection, and confirmation state.

---

*End of brief. Share all sections above when prompting a design tool for improvements.*
