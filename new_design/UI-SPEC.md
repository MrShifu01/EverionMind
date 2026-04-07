# OpenBrain — UI Design Specification
**Design System:** Neural Obsidian (Dark) / Neural Alabaster (Light)  
**Version:** 2.0 — Post-Strip Rebuild  
**Last Updated:** 2026-04-06  
**Status:** Final — Do Not Implement Until Plan is Approved

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Token System — Colors](#2-token-system--colors)
3. [Token System — Typography](#3-token-system--typography)
4. [Token System — Spacing & Radius](#4-token-system--spacing--radius)
5. [Elevation & Depth Model](#5-elevation--depth-model)
6. [Global CSS Primitives](#6-global-css-primitives)
7. [Tailwind Configuration](#7-tailwind-configuration)
8. [Component Library](#8-component-library)
   - [8.1 Navigation — Desktop Sidebar](#81-navigation--desktop-sidebar)
   - [8.2 Navigation — Mobile Bottom Bar](#82-navigation--mobile-bottom-bar)
   - [8.3 Navigation — Mobile Header](#83-navigation--mobile-header)
   - [8.4 Brain Switcher](#84-brain-switcher)
   - [8.5 Quick Capture Bar](#85-quick-capture-bar)
   - [8.6 Entry Cards & Bento Grid](#86-entry-cards--bento-grid)
   - [8.7 Buttons](#87-buttons)
   - [8.8 Input Fields & Forms](#88-input-fields--forms)
   - [8.9 AI Chat Interface](#89-ai-chat-interface)
   - [8.10 Modals & Sheets](#810-modals--sheets)
   - [8.11 Toast Notifications](#811-toast-notifications)
   - [8.12 Skeleton Loading States](#812-skeleton-loading-states)
   - [8.13 Tags & Badges](#813-tags--badges)
   - [8.14 Empty States](#814-empty-states)
9. [Screen Specifications](#9-screen-specifications)
   - [9.1 Login / Auth Screen](#91-login--auth-screen)
   - [9.2 Onboarding Flow](#92-onboarding-flow)
   - [9.3 Home / Neural Hub](#93-home--neural-hub)
   - [9.4 Grid / Collections View](#94-grid--collections-view)
   - [9.5 Quick Capture](#95-quick-capture)
   - [9.6 Fill Brain / Suggestions](#96-fill-brain--suggestions)
   - [9.7 Ask AI / Chat](#97-ask-ai--chat)
   - [9.8 Entry Detail & Edit](#98-entry-detail--edit)
   - [9.9 Knowledge Graph](#99-knowledge-graph)
   - [9.10 Calendar View](#910-calendar-view)
   - [9.11 Refine & Links View](#911-refine--links-view)
   - [9.12 Settings](#912-settings)
   - [9.13 Vault](#913-vault)
10. [Responsive Layout System](#10-responsive-layout-system)
11. [Animation & Motion System](#11-animation--motion-system)
12. [PWA Integration Requirements](#12-pwa-integration-requirements)
13. [Desktop-Specific Behaviour](#13-desktop-specific-behaviour)
14. [Accessibility Standards](#14-accessibility-standards)
15. [Light Mode — Neural Alabaster](#15-light-mode--neural-alabaster)
16. [Do's and Don'ts](#16-dos-and-donts)

---

## 1. Design Philosophy

### The Ethereal Synapse

OpenBrain is not a productivity tool. It is a **cognitive extension** — a digital replica of how the mind stores and connects knowledge. The interface must feel like a physical environment the user inhabits, not a form they fill in.

**Three Core Pillars:**

| Pillar | Principle | Implementation |
|---|---|---|
| **Atmospheric Depth** | Dark backgrounds are never flat black — they are rich chromatic darks that suggest infinite space. Cards are stacked sheets of frosted glass, not boxes on a page. | Surface hierarchy via luminance shift, not borders. Ambient background radials. |
| **Intentional Asymmetry** | Text anchors left. Visual weight bleeds right. Hero elements overflow their containers. Nothing is centred unless centring creates drama. | Bento grid, large feature cards, typographic hierarchy. |
| **Color as Semantic Signal** | Every accent color has one and only one meaning. | Cyan = action/interaction. Violet = AI/synthesis. Rose = security/privacy. Never swap. |

### The No-Line Rule

> **Never use `1px solid` borders to separate content sections.**

Depth comes from luminance shifts between surface tiers. When you think you need a divider, add 24px more vertical space instead. Borders are allowed only for:
- Ghost button strokes at `border-primary/20`
- Input focus rings at `focus:ring-primary/20`
- Card hover state at `hover:border-primary/20`
- Accessibility fallback ghost borders at `rgba(72,72,71,0.15)`

### Design System Name Justification

- **Neural Obsidian** (Dark Mode): The obsidian stone — volcanic, glassy, deep — evokes the mind in deep focus. The word "neural" grounds it in the product's intelligence.
- **Neural Alabaster** (Light Mode): Alabaster is warm white stone, translucent, used in ancient lanterns. It suggests clarity and organic warmth — not clinical sterility.

---

## 2. Token System — Colors

### Dark Mode — Neural Obsidian

```
── Surfaces ────────────────────────────────────────────────
#0E0E0E   bg-background / bg-surface           ← The Void (page base)
#131313   bg-surface-container-low             ← Section layer
#1A1919   bg-surface-container                 ← Primary cards
#201F1F   bg-surface-container-high            ← Elevated cards
#262626   bg-surface-container-highest         ← Active / selected
#2C2C2C   bg-surface-bright                    ← Interactive hover state

── Brand Accents ────────────────────────────────────────────
#72EFF5   text-primary / border-primary        ← Cyan: action, CTA, links, focus
#1FB1B7   bg-primary-container                 ← Cyan gradient end
#D575FF   text-secondary                       ← Violet: AI, synthesis, generation
#9800D0   bg-secondary-container               ← Violet gradient end
#FF9AC3   text-tertiary                        ← Rose: security, encryption, private

── Text ────────────────────────────────────────────────────
#FFFFFF   text-on-surface                      ← Headings, titles
#ADAAAA   text-on-surface-variant              ← Body, secondary text
#777575   text-outline                         ← Placeholder, inactive elements

── Semantic ────────────────────────────────────────────────
#FF6E84   text-error                           ← Errors, warnings, sync failures
```

### Accent Usage Rules — Never Break These

| Color | Token | Allowed Uses | Forbidden Uses |
|---|---|---|---|
| `#72EFF5` | `primary` | CTA buttons, active nav, focus rings, links, search bar, progress bars, star/pin icons | AI generation indicators |
| `#D575FF` | `secondary` | AI response headers, "Generating…" badge, Brain-Switch active pill, ask AI icon | Security/privacy indicators |
| `#FF9AC3` | `tertiary` | Vault lock icon, encryption badge, private entry indicator, security settings | Action buttons |
| `#FF6E84` | `error` | Errors, failed sync, rate limit alert, destructive action confirmation | Informational content |

### Contrast Verification (WCAG AA)

| Pairing | Ratio | Status |
|---|---|---|
| `#FFFFFF` on `#0E0E0E` | 19.6:1 | AAA |
| `#ADAAAA` on `#0E0E0E` | 5.2:1 | AA |
| `#72EFF5` on `#0E0E0E` | 10.8:1 | AAA |
| `#D575FF` on `#0E0E0E` | 6.4:1 | AA |
| `#ADAAAA` on `#1A1919` | 5.0:1 | AA |
| `#777575` on `#0E0E0E` | 3.2:1 | AA Large |

> Note: `#777575` (outline/placeholder) only meets large text / non-text contrast. Never use it for body copy.

---

## 3. Token System — Typography

### Font Stack

```html
<!-- In <head> — load at session start, before render -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap"
  rel="stylesheet"
/>
```

**Manrope** — headlines, brand statements, card titles, navigation labels  
**Inter** — all body copy, descriptions, metadata, form inputs, AI responses

### Type Scale

| Token | Font | Size | Line Height | Weight | Letter Spacing | Use |
|---|---|---|---|---|---|---|
| `display` | Manrope | 56px / 3.5rem | 1.1 | 800 | -0.04em | Hero statements, landing H1 |
| `headline-lg` | Manrope | 40px / 2.5rem | 1.15 | 700 | -0.03em | Main insight card titles |
| `headline-md` | Manrope | 32px / 2rem | 1.2 | 700 | -0.02em | Section headers |
| `headline-sm` | Manrope | 24px / 1.5rem | 1.25 | 700 | -0.02em | Modal titles |
| `title-lg` | Manrope | 20px / 1.25rem | 1.3 | 700 | -0.01em | Card titles |
| `title-sm` | Inter | 18px / 1.125rem | 1.4 | 600 | 0 | Component names |
| `body-lg` | Inter | 16px / 1rem | 1.6 | 400 | 0 | Primary body copy |
| `body-sm` | Inter | 14px / 0.875rem | 1.5 | 400 | 0 | Secondary descriptions |
| `label` | Inter | 12px / 0.75rem | 1.4 | 500 | 0 | Timestamps, metadata |
| `caption` | Inter | 10px / 0.625rem | 1.3 | 500 | 0.2em | Nav labels (UPPERCASE), status pills |

### Typography Rules

1. **Gradient text** on key hero words only: `bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-tertiary`
2. **All navigation labels** use UPPERCASE + `tracking-[0.2em]` + `text-[10px]`
3. **Body text** is always `text-on-surface-variant` (`#ADAAAA`) — never pure white for paragraphs
4. **Headings** are always `text-on-surface` (`#FFFFFF`)
5. **Minimum body text** 16px — never smaller for paragraph content
6. **Line length cap**: `max-w-prose` (65ch) on all long-form text blocks

---

## 4. Token System — Spacing & Radius

### Spacing Scale (8px base)

```
4px   / 0.25rem   → gap-1   — Icon-to-label gaps, tag padding
8px   / 0.5rem    → gap-2   — Tight component internals
12px  / 0.75rem   → gap-3   — Input padding, button padding
16px  / 1rem      → gap-4   — Card internal padding (mobile)
24px  / 1.5rem    → gap-6   — Card internal padding (desktop)
32px  / 2rem      → gap-8   — Section separators
48px  / 3rem      → gap-12  — Page-level section spacing
64px  / 4rem      → gap-16  — Hero section spacing
```

**Rule:** Outer container padding ≥ inner element padding. Never invert.

### Border Radius Scale

```
4px   / rounded      → Micro elements (pills inside cards)
8px   / rounded-lg   → Small interactive chips
12px  / rounded-xl   → Buttons, inputs, small cards
16px  / rounded-2xl  → Standard cards, modals
24px  / rounded-3xl  → Feature cards, large panels
9999px / rounded-full → Tags, user avatars, bottom nav pill
```

**Nested corners rule:** Inner radius = Outer radius − gap. E.g. outer `rounded-3xl` (24px), 8px gap → inner `rounded-2xl` (16px).

---

## 5. Elevation & Depth Model

Depth is communicated through **surface tier contrast**, not drop shadows. The z-axis is defined by background color alone:

```
z-5  Modal / Popover overlay   rgba(38,38,38,0.60) + backdrop-blur(24px)   Glass Panel
z-4  Bottom nav / Sticky UI    rgba(19,19,19,0.60) + backdrop-blur(24px)   Dark Glass
z-3  Active / Selected card    #262626   surface-container-highest
z-2  Standard card             #1A1919   surface-container
z-1  Section background        #131313   surface-container-low
z-0  Page base                 #0E0E0E   background
```

### Glow System (Floating Elements Only)

Glows are used **only** on elements that float above the base layer (modals, nav, search bars, CTAs). They are forbidden on static cards.

```css
/* Standard synapse glow — primary cyan */
.synapse-glow {
  box-shadow:
    0 20px 40px rgba(0,0,0,0.4),
    0 0 20px rgba(114,239,245,0.05);
}

/* AI response glow — cyan variant for chat */
.ai-glow {
  box-shadow:
    0 20px 40px rgba(0,0,0,0.4),
    0 0 20px rgba(114,239,245,0.08);
}

/* Navigation glow — violet for bottom nav */
.nav-glow {
  box-shadow:
    0 20px 40px rgba(0,0,0,0.4),
    0 0 20px rgba(213,117,255,0.10);
}

/* CTA button glow — on primary gradient buttons */
.cta-glow {
  box-shadow:
    0 4px 24px rgba(114,239,245,0.20);
}

/* AI button glow — on violet/secondary buttons */
.ai-button-glow {
  box-shadow:
    0 4px 30px rgba(213,117,255,0.25);
}
```

### Ambient Background (Page-Level Atmosphere)

Applied as a fixed `z-0` non-interactive overlay on every page:

```css
.synapse-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(114,239,245,0.08) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(213,117,255,0.08) 0%, transparent 40%);
}
```

---

## 6. Global CSS Primitives

```css
/* ── Surfaces ────────────────────────────────────────── */
.glass-panel {
  background: rgba(38,38,38,0.60);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

.glass-panel-dark {
  background: rgba(19,19,19,0.60);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* ── Typography ──────────────────────────────────────── */
.gradient-text {
  background: linear-gradient(135deg, #72EFF5, #D575FF, #FF9AC3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.glow-text {
  text-shadow: 0 0 20px rgba(114,239,245,0.4);
}

/* ── Interactions ────────────────────────────────────── */
.press-scale {
  transition: transform 150ms cubic-bezier(0.34,1.56,0.64,1);
}
.press-scale:active {
  transform: scale(0.95);
}

/* ── Scrollbar ───────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #0e0e0e; }
::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #484847; }

/* ── Selection ───────────────────────────────────────── */
::selection {
  background: rgba(114,239,245,0.2);
  color: #ffffff;
}

/* ── Focus Rings (Accessibility) ─────────────────────── */
:focus-visible {
  outline: 2px solid #72EFF5;
  outline-offset: 3px;
  border-radius: 4px;
}

/* ── Reduced Motion ──────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .synapse-bg { display: none; }
}
```

---

## 7. Tailwind Configuration

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Dark Mode: Neural Obsidian ──────────────────
        background:                    '#0e0e0e',
        surface:                       '#0e0e0e',
        'surface-dim':                 '#0a0a0a',
        'surface-container-lowest':    '#000000',
        'surface-container-low':       '#131313',
        'surface-container':           '#1a1919',
        'surface-container-high':      '#201f1f',
        'surface-container-highest':   '#262626',
        'surface-variant':             '#262626',
        'surface-bright':              '#2c2c2c',

        // ── Brand Accents ───────────────────────────────
        primary:                       '#72eff5',
        'primary-dim':                 '#63e1e7',
        'primary-container':           '#1fb1b7',
        secondary:                     '#d575ff',
        'secondary-dim':               '#b90afc',
        'secondary-container':         '#9800d0',
        tertiary:                      '#ff9ac3',
        'tertiary-dim':                '#ec77aa',
        error:                         '#ff6e84',
        'error-dim':                   '#d73357',

        // ── On-Colors ──────────────────────────────────
        'on-surface':                  '#ffffff',
        'on-surface-variant':          '#adaaaa',
        'on-primary':                  '#00585b',
        'on-primary-container':        '#002829',
        'on-secondary':                '#390050',
        'on-secondary-container':      '#fff5fc',
        'on-tertiary':                 '#6b0c40',
        'on-error':                    '#490013',

        // ── Borders ─────────────────────────────────────
        outline:                       '#777575',
        'outline-variant':             '#484847',

        // ── Light Mode: Neural Alabaster ────────────────
        'alabaster-bg':                '#F5F3EF',
        'alabaster-surface':           '#FFFFFF',
        'alabaster-container':         '#EDEDEB',
        'alabaster-container-high':    '#E2E0DC',
        'alabaster-on-surface':        '#1C1C1E',
        'alabaster-on-variant':        '#4A4A52',
        'alabaster-outline':           '#C7C5C1',
      },

      fontFamily: {
        headline: ['Manrope', 'sans-serif'],
        body:     ['Inter', 'sans-serif'],
        label:    ['Inter', 'sans-serif'],
      },

      fontSize: {
        '10':  ['0.625rem', { lineHeight: '1rem', letterSpacing: '0.2em' }],
        '12':  ['0.75rem',  { lineHeight: '1rem' }],
        '14':  ['0.875rem', { lineHeight: '1.25rem' }],
        '16':  ['1rem',     { lineHeight: '1.6rem' }],
        '18':  ['1.125rem', { lineHeight: '1.4rem' }],
        '20':  ['1.25rem',  { lineHeight: '1.3rem' }],
        '24':  ['1.5rem',   { lineHeight: '1.25rem' }],
        '32':  ['2rem',     { lineHeight: '1.2rem' }],
        '40':  ['2.5rem',   { lineHeight: '1.15rem' }],
        '56':  ['3.5rem',   { lineHeight: '1.1rem' }],
      },

      borderRadius: {
        DEFAULT: '0.25rem',
        lg:      '0.5rem',
        xl:      '0.75rem',
        '2xl':   '1rem',
        '3xl':   '1.5rem',
        full:    '9999px',
      },

      boxShadow: {
        'synapse':     '0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(114,239,245,0.05)',
        'ai':          '0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(114,239,245,0.08)',
        'nav':         '0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(213,117,255,0.10)',
        'cta':         '0 4px 24px rgba(114,239,245,0.20)',
        'ai-button':   '0 4px 30px rgba(213,117,255,0.25)',
      },

      animation: {
        'shimmer':     'shimmer 1.5s infinite',
        'blob-drift':  'blob-drift 8s ease-in-out infinite',
        'pulse-glow':  'pulse-glow 2s ease-in-out infinite',
        'spin-slow':   'spin 3s linear infinite',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'blob-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':       { transform: 'translate(30px, -20px) scale(1.05)' },
          '66%':       { transform: 'translate(-20px, 15px) scale(0.95)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%':       { opacity: '1' },
        },
      },

      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
```

---

## 8. Component Library

### 8.1 Navigation — Desktop Sidebar

**Reference:** `screens/desktop_sidenavbar_with_theme_toggle.png`

**Dimensions:** Fixed, 288px (`w-72`), full viewport height, `z-40`  
**Background:** `#0E0E0E` with right edge `border-r border-surface-container`

```tsx
// Layout structure
<aside className="
  fixed left-0 top-0 h-dvh z-40
  flex flex-col
  w-72 px-6 py-8
  bg-background
  border-r border-surface-container
">
  {/* 1. Brand */}
  <div className="mb-10 flex items-center justify-between">
    <div>
      <h1 className="font-headline text-2xl font-bold tracking-tighter gradient-text">
        OpenBrain
      </h1>
      <p className="text-10 uppercase tracking-[0.2em] text-on-surface-variant/60 mt-0.5">
        Neural Interface
      </p>
    </div>
    <ThemeToggle />
  </div>

  {/* 2. Brain Switcher */}
  <BrainSwitcher className="mb-6" />

  {/* 3. Primary CTA */}
  <button className="
    mb-8 w-full py-3 px-4 rounded-xl
    bg-gradient-to-br from-primary to-primary-container
    text-on-primary-container font-headline font-bold text-sm
    flex items-center justify-center gap-2
    press-scale shadow-cta
  ">
    <PlusIcon className="w-4 h-4" />
    New Entry
  </button>

  {/* 4. Navigation */}
  <nav className="flex-1 space-y-1" aria-label="Primary navigation">
    <NavItem icon={HomeIcon}       label="Neural Hub"    href="/" />
    <NavItem icon={GridIcon}       label="Collections"   href="/grid" />
    <NavItem icon={ZapIcon}        label="Quick Capture" href="/capture" />
    <NavItem icon={SparkleIcon}    label="Fill Brain"    href="/fill" />
    <NavItem icon={MessageIcon}    label="Ask AI"        href="/ask" />
    <NavItem icon={NetworkIcon}    label="Knowledge Map" href="/graph" />
    <NavItem icon={CalendarIcon}   label="Timeline"      href="/calendar" />
    <NavItem icon={RefreshIcon}    label="Refine"        href="/refine" />
    <NavItem icon={ShieldIcon}     label="Vault"         href="/vault" />
  </nav>

  {/* 5. Footer: User + Settings */}
  <div className="pt-6 border-t border-outline-variant/10 space-y-2">
    <NavItem icon={SettingsIcon} label="Settings" href="/settings" />
    <UserProfileRow />
  </div>
</aside>

// NavItem sub-component
// Active: text-primary + left border + bg gradient
// Hover: text-white + bg-surface-container
// Inactive: text-on-surface-variant
<a className={cn(
  "flex items-center gap-3 px-4 py-3 rounded-r-lg",
  "font-label text-sm transition-all duration-300 group",
  isActive
    ? "text-primary font-semibold border-l-2 border-primary bg-gradient-to-r from-primary/10 to-transparent"
    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container border-l-2 border-transparent"
)}>
  <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-primary" : "text-inherit")} />
  <span>{label}</span>
  {badge && <span className="ml-auto text-10 bg-secondary text-on-secondary px-1.5 py-0.5 rounded-full">{badge}</span>}
</a>
```

**Desktop content offset:** `ml-72` on the main content wrapper.

---

### 8.2 Navigation — Mobile Bottom Bar

**Reference:** `screens/mobile_bottomnavbar_with_theme_toggle.png`

**Style:** Glassmorphic floating pill. Violet glow. Floats 24px above bottom safe area.

```tsx
<nav
  aria-label="Primary navigation"
  className="
    fixed bottom-6 left-1/2 -translate-x-1/2
    z-50
    flex items-center justify-around
    px-4 py-2
    w-[90vw] max-w-sm
    rounded-full
    glass-panel-dark
    shadow-nav
    border border-outline-variant/10
  "
  style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
>
  {/* Each tab — inactive */}
  <a
    aria-label="Home"
    className="
      flex flex-col items-center justify-center
      w-14 h-14 rounded-xl
      text-on-surface-variant
      transition-all duration-200
      active:scale-90
    "
  >
    <HomeIcon className="w-5 h-5" />
    <span className="text-10 uppercase tracking-widest mt-1">Home</span>
  </a>

  {/* Active tab — violet highlight */}
  <a
    aria-current="page"
    aria-label="Ask AI"
    className="
      flex flex-col items-center justify-center
      w-14 h-14 rounded-xl
      text-secondary bg-secondary/10
      transition-all duration-200
      active:scale-90
    "
  >
    <SparkleIcon className="w-5 h-5" />
    <span className="text-10 uppercase tracking-widest mt-1">Ask</span>
  </a>
</nav>

// Content padding to prevent overlap:
// <main className="pb-28"> — 112px clears the floated nav
```

**5 tabs (fixed order):** Home · Collections · Capture (center, slightly larger) · Ask AI · More

**Center Capture tab (FAB-style):**
```tsx
<button
  aria-label="Quick Capture"
  className="
    flex flex-col items-center justify-center
    w-16 h-16 rounded-2xl
    bg-gradient-to-br from-primary to-primary-container
    text-on-primary-container
    shadow-cta
    -mt-4
    active:scale-90 press-scale
  "
>
  <PlusIcon className="w-6 h-6" />
  <span className="text-10 uppercase tracking-widest mt-0.5">Add</span>
</button>
```

---

### 8.3 Navigation — Mobile Header

```tsx
<header
  className="
    sticky top-0 z-30
    flex items-center justify-between
    px-4 py-3
    glass-panel-dark
    border-b border-outline-variant/10
  "
  style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
>
  {/* Left: Brain name */}
  <div className="flex items-center gap-2 min-w-0">
    <span className="font-headline font-bold text-on-surface truncate text-lg">
      {brainName}
    </span>
    <ChevronDownIcon className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
  </div>

  {/* Right: Status + Actions */}
  <div className="flex items-center gap-2">
    {!isOnline && (
      <span className="text-10 uppercase tracking-widest text-error bg-error/10 px-2 py-1 rounded-full">
        Offline
      </span>
    )}
    {isSyncing && <SyncIcon className="w-4 h-4 text-primary animate-spin-slow" />}
    <button aria-label="Search" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant">
      <SearchIcon className="w-5 h-5" />
    </button>
    <button aria-label="Notifications" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant">
      <BellIcon className="w-5 h-5" />
    </button>
  </div>
</header>
```

---

### 8.4 Brain Switcher

**Reference:** `screens/openbrain_main_brain_settings.png`

Desktop: collapsible dropdown below brand mark.  
Mobile: tapping the brain name in the header opens a bottom sheet.

```tsx
// Trigger button
<button className="
  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
  bg-secondary-container/20
  border border-secondary/10
  text-on-surface font-semibold text-sm
  hover:bg-secondary-container/30
  transition-colors
  press-scale
">
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-secondary to-secondary-container flex items-center justify-center">
    <BrainIcon className="w-4 h-4 text-on-secondary-container" />
  </div>
  <span className="flex-1 truncate text-left">{activeBrain.name}</span>
  <ChevronDownIcon className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
</button>

// Dropdown panel
<div className="
  absolute top-full left-0 mt-2 w-64 z-50
  glass-panel rounded-2xl
  shadow-synapse
  border border-outline-variant/10
  py-2
">
  {brains.map(brain => (
    <button key={brain.id} className="
      w-full flex items-center gap-3 px-4 py-3
      hover:bg-surface-container
      text-on-surface-variant hover:text-on-surface
      transition-colors text-left
    ">
      <BrainIcon className="w-4 h-4 text-secondary" />
      <span className="font-body text-sm">{brain.name}</span>
      {brain.id === activeBrain.id && <CheckIcon className="ml-auto w-4 h-4 text-primary" />}
    </button>
  ))}
  <div className="border-t border-outline-variant/10 mt-2 pt-2">
    <button className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-primary/5 transition-colors text-sm">
      <PlusIcon className="w-4 h-4" />
      Create New Brain
    </button>
  </div>
</div>
```

---

### 8.5 Quick Capture Bar

**Reference:** `screens/openbrain_home_desktop.png`

Desktop: sticky top bar, full width (minus sidebar).  
Mobile: dedicated screen / bottom sheet.

```tsx
<section className="mb-16 sticky top-4 z-20">
  <div className="glass-panel rounded-2xl border border-outline-variant/10 shadow-synapse p-2">
    <div className="flex items-center gap-3 px-4 py-2">

      <SearchIcon className="w-5 h-5 text-primary flex-shrink-0" />

      <input
        aria-label="Search or capture a new memory"
        className="
          flex-1 bg-transparent border-none outline-none
          font-headline text-lg font-medium
          text-on-surface placeholder:text-on-surface-variant/50
        "
        placeholder="Search or capture a new insight..."
      />

      {/* Voice input */}
      <button aria-label="Voice input" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
        <MicIcon className="w-4 h-4" />
      </button>

      {/* File attach */}
      <button aria-label="Attach file" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-tertiary transition-colors">
        <PaperclipIcon className="w-4 h-4" />
      </button>

      {/* Synthesize — primary AI action */}
      <button className="
        flex items-center gap-2
        bg-gradient-to-r from-secondary to-secondary-container
        text-on-secondary-container
        px-5 py-2 rounded-xl
        font-headline font-bold text-sm
        shadow-ai-button
        press-scale
        relative overflow-hidden group
      ">
        {/* Shine sweep on hover */}
        <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <SparkleIcon className="w-4 h-4 relative" />
        <span className="relative">Synthesize</span>
      </button>

    </div>
  </div>
</section>
```

---

### 8.6 Entry Cards & Bento Grid

**Reference:** `screens/openbrain_grid_view_1.png`, `screens/openbrain_home_desktop.png`

#### Grid Layout

```tsx
// Desktop: 12-column CSS grid
<div className="grid grid-cols-12 gap-6">
  {/* Feature card — 8 columns */}
  <EntryCardLarge  className="col-span-12 lg:col-span-8" />
  {/* Sidebar panel — 4 columns */}
  <SidePanel       className="col-span-12 lg:col-span-4" />
  {/* Bento row — 3 small cards */}
  <EntryCardSmall  className="col-span-12 sm:col-span-6 lg:col-span-4" />
  <EntryCardSmall  className="col-span-12 sm:col-span-6 lg:col-span-4" />
  <EntryCardSmall  className="col-span-12 sm:col-span-6 lg:col-span-4" />
  {/* Full-width context card */}
  <EntryCardWide   className="col-span-12" />
</div>

// Mobile: single column, card list
<div className="flex flex-col gap-4">
  <EntryCard />
</div>
```

#### Standard Entry Card

```tsx
<article className="
  bg-surface-container rounded-3xl p-6
  border border-outline-variant/5
  hover:border-primary/20
  transition-all duration-500
  group cursor-pointer
  press-scale
">
  {/* Header row */}
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-3">
      {/* Type icon in colored circle */}
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
        <TypeIcon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="font-label text-xs font-medium text-on-surface-variant/70 uppercase tracking-widest">
          {entry.type}
        </p>
        <p className="font-label text-xs text-on-surface-variant/50">
          {relativeTime(entry.created_at)}
        </p>
      </div>
    </div>
    {/* More actions — appears on hover */}
    <button
      aria-label="Entry options"
      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant opacity-0 group-hover:opacity-100 hover:bg-surface-bright transition-all"
    >
      <EllipsisIcon className="w-4 h-4" />
    </button>
  </div>

  {/* Title */}
  <h3 className="font-headline text-title-lg text-on-surface font-bold mb-2 leading-tight tracking-tight line-clamp-2">
    {entry.title}
  </h3>

  {/* Content preview */}
  {entry.content && (
    <p className="font-body text-body-sm text-on-surface-variant line-clamp-2 mb-4">
      {entry.content}
    </p>
  )}

  {/* Tags */}
  <div className="flex flex-wrap gap-2">
    {entry.tags?.slice(0,3).map(tag => (
      <span key={tag} className="
        px-2.5 py-1 rounded-full
        text-10 font-semibold uppercase tracking-widest
        bg-surface-container-highest
        text-secondary border border-secondary/10
      ">
        #{tag}
      </span>
    ))}
    {entry.pinned && (
      <span className="ml-auto text-primary">
        <PinIcon className="w-3.5 h-3.5" />
      </span>
    )}
  </div>
</article>
```

#### Feature Card (Large, Desktop)

Same structure with `text-4xl` headline, optional ambient orb background element, and `p-8`.

---

### 8.7 Buttons

Four hierarchy levels — never mix:

```tsx
// Level 1: Primary CTA — cyan gradient
<button className="
  px-6 py-3 rounded-xl
  bg-gradient-to-br from-primary to-primary-container
  text-on-primary-container
  font-headline font-bold text-sm
  shadow-cta
  press-scale
">
  Primary Action
</button>

// Level 2: AI CTA — violet gradient + shine
<button className="
  px-6 py-3 rounded-xl
  bg-gradient-to-r from-secondary to-secondary-container
  text-on-secondary-container
  font-headline font-bold text-sm
  shadow-ai-button
  press-scale
  relative overflow-hidden group
">
  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
  <span className="relative flex items-center gap-2">
    <SparkleIcon className="w-4 h-4" />
    AI Action
  </span>
</button>

// Level 3: Ghost — bordered
<button className="
  px-5 py-2.5 rounded-xl
  border border-primary/25
  text-primary font-label font-semibold text-sm
  hover:bg-primary/5
  transition-colors
  press-scale
">
  Secondary
</button>

// Level 4: Text — subtle
<button className="
  text-on-surface-variant font-label text-xs uppercase tracking-[0.2em]
  hover:text-primary
  transition-colors
">
  Tertiary
</button>

// Icon Button — square
<button className="
  w-11 h-11 rounded-xl
  flex items-center justify-center
  bg-surface-container
  text-on-surface-variant
  hover:text-on-surface hover:bg-surface-bright
  transition-all
  press-scale
">
  <Icon className="w-5 h-5" />
</button>

// Destructive — red
<button className="
  px-5 py-2.5 rounded-xl
  bg-error/10 border border-error/20
  text-error font-label font-semibold text-sm
  hover:bg-error/15
  transition-colors
  press-scale
">
  Delete
</button>
```

**Loading state** — all async buttons must show this:
```tsx
<button disabled className="... opacity-70 cursor-not-allowed">
  <SpinnerIcon className="w-4 h-4 animate-spin" />
  <span>Saving…</span>
</button>
```

---

### 8.8 Input Fields & Forms

```tsx
// Standard input
<div className="space-y-1.5">
  <label
    htmlFor={id}
    className="block text-10 font-semibold uppercase tracking-[0.2em] text-on-surface-variant"
  >
    {label}
    {required && <span className="text-error ml-1">*</span>}
  </label>

  <input
    id={id}
    className="
      w-full
      bg-surface-container-highest
      rounded-xl px-4 py-3
      text-on-surface text-body-lg
      placeholder:text-on-surface-variant/40
      border border-outline-variant/20
      focus:outline-none
      focus:border-primary/60
      focus:ring-2 focus:ring-primary/15
      disabled:opacity-40 disabled:cursor-not-allowed
      transition-all duration-200
      min-h-[44px]
    "
  />

  {helperText && !error && (
    <p className="font-body text-xs text-on-surface-variant/60">{helperText}</p>
  )}
  {error && (
    <p role="alert" className="font-body text-xs text-error flex items-center gap-1">
      <AlertIcon className="w-3 h-3" />
      {error}
    </p>
  )}
</div>

// Textarea
<textarea
  className="
    w-full min-h-[120px] resize-y
    bg-surface-container-highest
    rounded-xl px-4 py-3
    text-on-surface text-body-lg
    placeholder:text-on-surface-variant/40
    border border-outline-variant/20
    focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15
    transition-all duration-200
  "
/>

// Select / Dropdown
<select className="
  w-full appearance-none
  bg-surface-container-highest
  rounded-xl px-4 py-3 pr-10
  text-on-surface text-body-sm
  border border-outline-variant/20
  focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15
  transition-all duration-200
  cursor-pointer
  min-h-[44px]
">
```

**Form validation rules:**
- Validate **on blur** (not on keystroke)
- Error appears inline beneath the field in `text-error`
- On submit with errors: auto-focus first invalid field
- Show asterisk for required, helper text below optional fields

---

### 8.9 AI Chat Interface

**Reference:** `screens/openbrain_ask_ai.png`, `screens/openbrain_ask_ai_desktop.png`

```tsx
// Chat container
<div className="flex flex-col h-full">

  {/* Message list */}
  <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">

    {/* User message */}
    <div className="flex justify-end">
      <div className="
        max-w-[80%] px-5 py-3.5 rounded-2xl rounded-br-sm
        bg-primary/15 border border-primary/20
        font-body text-body-lg text-on-surface
      ">
        {message.text}
      </div>
    </div>

    {/* AI response */}
    <div className="flex gap-3 items-start">
      <div className="
        w-9 h-9 rounded-full flex-shrink-0
        bg-gradient-to-br from-secondary to-secondary-container
        flex items-center justify-center
        shadow-ai-button
      ">
        <SparkleIcon className="w-4 h-4 text-on-secondary-container" />
      </div>
      <div className="flex-1">
        {/* AI label */}
        <p className="text-10 uppercase tracking-widest text-secondary mb-2 font-semibold">
          OpenBrain AI
        </p>
        <div className="
          bg-surface-container rounded-2xl rounded-tl-sm
          px-5 py-4
          border border-outline-variant/5
          shadow-ai
          font-body text-body-lg text-on-surface
          prose prose-invert max-w-none
        ">
          {message.text}
        </div>
      </div>
    </div>

    {/* Typing indicator */}
    <div className="flex gap-3 items-center">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-secondary to-secondary-container flex items-center justify-center shadow-ai-button animate-pulse">
        <SparkleIcon className="w-4 h-4 text-on-secondary-container" />
      </div>
      <div className="flex items-center gap-1.5 bg-surface-container px-5 py-3.5 rounded-2xl rounded-tl-sm">
        <span className="w-2 h-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>

  {/* Input bar — sticky bottom */}
  <div className="
    sticky bottom-0
    px-4 py-4
    border-t border-outline-variant/10
    glass-panel-dark
  ">
    <div className="flex items-end gap-3">
      <textarea
        aria-label="Ask your brain a question"
        rows={1}
        className="
          flex-1 resize-none
          bg-surface-container-highest
          rounded-xl px-4 py-3
          text-on-surface text-body-lg
          placeholder:text-on-surface-variant/40
          border border-outline-variant/20
          focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15
          transition-all max-h-36
          min-h-[44px]
        "
        placeholder="Ask your brain anything…"
      />
      <button
        aria-label="Send message"
        className="
          w-11 h-11 rounded-xl flex-shrink-0
          bg-gradient-to-br from-primary to-primary-container
          text-on-primary-container
          flex items-center justify-center
          shadow-cta press-scale
        "
      >
        <SendIcon className="w-5 h-5" />
      </button>
    </div>
    {/* Quick-ask chips */}
    <div className="flex gap-2 mt-3 flex-wrap">
      {['What should I do today?', 'Show recent entries', 'Find related ideas'].map(chip => (
        <button key={chip} className="
          px-3 py-1.5 rounded-full
          glass-panel border border-outline-variant/15
          text-10 font-semibold uppercase tracking-widest
          text-on-surface-variant hover:text-secondary hover:border-secondary/20
          transition-all
        ">
          {chip}
        </button>
      ))}
    </div>
  </div>

</div>
```

---

### 8.10 Modals & Sheets

**Rule:** Modals use `glass-panel` + synapse glow. Sheet on mobile = slides up from bottom.

```tsx
// Modal overlay
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  className="fixed inset-0 z-50 flex items-center justify-center p-4"
>
  {/* Scrim */}
  <div
    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
    onClick={onClose}
  />

  {/* Panel */}
  <div className="
    relative w-full max-w-xl max-h-[90dvh] overflow-y-auto
    glass-panel rounded-3xl
    shadow-synapse
    border border-outline-variant/10
    p-8
    animate-in fade-in zoom-in-95 duration-200
  ">
    {/* Close button */}
    <button
      aria-label="Close dialog"
      onClick={onClose}
      className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-all"
    >
      <XIcon className="w-5 h-5" />
    </button>

    <h2 id="modal-title" className="font-headline text-headline-sm font-bold text-on-surface mb-6">
      {title}
    </h2>

    {children}
  </div>
</div>

// Mobile bottom sheet (slides up)
<div
  role="dialog"
  aria-modal="true"
  className="
    fixed inset-x-0 bottom-0 z-50
    glass-panel rounded-t-3xl
    shadow-synapse
    border-t border-outline-variant/10
    px-6 pt-4
    animate-in slide-in-from-bottom duration-300
  "
  style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
>
  {/* Drag handle */}
  <div className="w-10 h-1 rounded-full bg-outline mx-auto mb-6" />
  {children}
</div>
```

---

### 8.11 Toast Notifications

```tsx
// Container — top-right desktop, top-center mobile
<div className="
  fixed top-4 right-4 z-[100]
  flex flex-col gap-3
  max-w-sm w-full
  sm:max-w-xs
">
  <div
    role="alert"
    aria-live="polite"
    className={cn(
      "flex items-start gap-3 px-4 py-3.5 rounded-2xl",
      "glass-panel border shadow-synapse",
      "animate-in slide-in-from-top-2 fade-in duration-300",
      type === 'success' && "border-primary/20 bg-primary/5",
      type === 'error'   && "border-error/20 bg-error/5",
      type === 'ai'      && "border-secondary/20 bg-secondary/5",
      type === 'info'    && "border-outline-variant/20",
    )}
  >
    <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5",
      type === 'success' && "text-primary",
      type === 'error'   && "text-error",
      type === 'ai'      && "text-secondary",
    )} />
    <div className="flex-1 min-w-0">
      {title && <p className="font-label font-semibold text-on-surface text-sm">{title}</p>}
      <p className="font-body text-xs text-on-surface-variant">{message}</p>
    </div>
    <button aria-label="Dismiss" onClick={dismiss} className="text-on-surface-variant hover:text-on-surface transition-colors">
      <XIcon className="w-4 h-4" />
    </button>
  </div>
</div>
```

**Auto-dismiss:** 4s for success, 6s for errors, persists for AI insights.

---

### 8.12 Skeleton Loading States

```tsx
// Card skeleton
<div
  role="status"
  aria-label="Loading entries"
  className="bg-surface-container rounded-3xl p-6 space-y-4"
>
  {/* Icon + meta row */}
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-full bg-surface-bright animate-shimmer" />
    <div className="space-y-1.5 flex-1">
      <div className="h-2.5 w-16 rounded bg-surface-bright animate-shimmer" />
      <div className="h-2 w-10 rounded bg-surface-bright animate-shimmer" />
    </div>
  </div>
  {/* Title */}
  <div className="h-5 w-3/4 rounded bg-surface-bright animate-shimmer" />
  <div className="h-5 w-1/2 rounded bg-surface-bright animate-shimmer" />
  {/* Body */}
  <div className="h-3.5 w-full rounded bg-surface-bright animate-shimmer" />
  <div className="h-3.5 w-5/6 rounded bg-surface-bright animate-shimmer" />
  {/* Tags */}
  <div className="flex gap-2">
    <div className="h-5 w-14 rounded-full bg-surface-bright animate-shimmer" />
    <div className="h-5 w-20 rounded-full bg-surface-bright animate-shimmer" />
  </div>
</div>

// Shimmer animation (already in Tailwind config above)
// bg-gradient-to-r from-surface-container via-surface-bright to-surface-container
// bg-[length:200%_100%] animate-shimmer
```

---

### 8.13 Tags & Badges

```tsx
// Entry type tag — teal/cyan
<span className="px-2.5 py-1 rounded-full text-10 font-semibold uppercase tracking-widest bg-primary/10 text-primary border border-primary/15">
  {type}
</span>

// AI badge — violet
<span className="px-2.5 py-1 rounded-full text-10 font-semibold uppercase tracking-widest bg-secondary/10 text-secondary border border-secondary/15">
  AI Generated
</span>

// Security badge — rose
<span className="px-2.5 py-1 rounded-full text-10 font-semibold uppercase tracking-widest bg-tertiary/10 text-tertiary border border-tertiary/15">
  Vault
</span>

// Status badge — neutral
<span className="px-2 py-0.5 rounded-full text-10 font-semibold uppercase tracking-widest bg-surface-container-highest text-on-surface-variant">
  {status}
</span>
```

---

### 8.14 Empty States

```tsx
<div className="
  flex flex-col items-center justify-center
  py-24 px-8 text-center
  rounded-3xl bg-surface-container-low
  border border-outline-variant/5
">
  {/* Ambient icon */}
  <div className="
    w-20 h-20 rounded-full
    bg-gradient-to-br from-primary/10 to-secondary/10
    flex items-center justify-center
    mb-6
  ">
    <Icon className="w-10 h-10 text-primary/60" />
  </div>
  <h3 className="font-headline text-headline-sm font-bold text-on-surface mb-3">
    {title}
  </h3>
  <p className="font-body text-body-sm text-on-surface-variant max-w-xs mb-8">
    {description}
  </p>
  <PrimaryCTAButton>{actionLabel}</PrimaryCTAButton>
</div>
```

---

## 9. Screen Specifications

### 9.1 Login / Auth Screen

**Reference:** `screens/openbrain_login.png`

**Layout:** Full-bleed split — desktop: left column (40%) = brand, right column (60%) = form. Mobile: centered single column.

**Left column (desktop):**
- Full-height `synapse-bg` ambient atmosphere
- Brand mark: large `gradient-text` OpenBrain wordmark, `glow-text` applied
- Subheadline: `on-surface-variant` Inter body-lg
- Decorative: subtle floating entry card previews at 20% opacity

**Right column / Mobile center:**
- `bg-surface-container-low` background
- Centered card: `glass-panel rounded-3xl p-10 max-w-sm w-full`
- Headline: "Welcome back." — Manrope 700 32px
- Sub: "Sign in to continue to your brain." — Inter 400 14px on-surface-variant
- Email input (standard input spec above)
- Primary CTA: "Send Magic Link" — gradient cyan button, full width
- Separator line: `border-t border-outline-variant/10` + "or" centered
- Google OAuth button: ghost button, full width, Google icon + "Continue with Google"
- Footer note: `text-10 text-on-surface-variant/50 text-center mt-6`

---

### 9.2 Onboarding Flow

**Reference:** `screens/onboarding_welcome.png`, `screens/onboarding_quick_capture.png`, `screens/onboarding_secure_your_mind.png`, `screens/onboarding_feature_discovery.png`

**3 steps** (condensed from previous 5):

**Step 1 — "What is this brain for?"**
- Full-screen with large brain type selection cards
- 3 options: Personal · Family · Business — each a bento card with icon, name, description
- Multi-select allowed (user can pick multiple)
- Selected state: `border-primary/60 bg-primary/10`
- Progress indicator: 3 dots bottom-center, current dot `bg-primary` scaled up

**Step 2 — Setup Confirmation**
- Shows customized brain name input
- Optional: choose an accent colour (secondary colour only, 3 presets)
- "Your brain is ready" framing

**Step 3 — Feature Discovery**
- 4 feature tiles (Quick Capture, Ask AI, Fill Brain, Knowledge Map) in 2x2 grid
- Each tile has icon, headline, one-sentence description
- "Add to Home Screen" tip shown here with animated arrow
- CTA: "Enter your brain" — full-width primary button

**Shared step chrome:**
- Full-screen backdrop with `synapse-bg`
- Skip button: top-right, text level 4 button
- Back: top-left, ghost button with arrow
- Step indicator: 3 dots, bottom-center

---

### 9.3 Home / Neural Hub

**Reference:** `screens/openbrain_home_desktop.png`, `screens/openbrain_knowledge_feed.png`

**Mobile layout:**
1. Mobile header (sticky)
2. Nudge banner (if active) — dismissable cyan-bordered card
3. Quick Capture bar (simplified — tap to expand)
4. Pinned entries section (horizontal scroll)
5. Recent entries feed (vertical list)
6. Bottom nav

**Desktop layout:**
1. Sidebar nav (fixed left)
2. Main area (padded left by `ml-72`):
   - Sticky quick capture bar (top 4, z-20)
   - 12-column bento grid:
     - Large feature card (col-span-8) — most recent important entry
     - AI nudge/insight panel (col-span-4) — violet-accented
     - 3 small bento cards (col-span-4 each) — pinned entries
     - Wide context card (col-span-12) — "Your brain at a glance" stats

**Nudge Banner:**
```tsx
<div className="
  flex items-start gap-3 px-5 py-4 rounded-2xl
  bg-primary/5 border border-primary/15
  mb-6
">
  <SparkleIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
  <p className="font-body text-body-sm text-on-surface flex-1">{nudge}</p>
  <button aria-label="Dismiss nudge" onClick={dismiss} className="text-on-surface-variant hover:text-on-surface transition-colors">
    <XIcon className="w-4 h-4" />
  </button>
</div>
```

---

### 9.4 Grid / Collections View

**Reference:** `screens/openbrain_grid_view_1.png`, `screens/openbrain_grid_view_2.png`, `screens/openbrain_collections_desktop.png`

**Filter bar** (sticky, below header):
```tsx
<div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
  <FilterButton active>All</FilterButton>
  <FilterButton>Person</FilterButton>
  <FilterButton>Document</FilterButton>
  <FilterButton>Recipe</FilterButton>
  {/* ... */}
  <SearchInput />
</div>
```

**Filter button:**
- Active: `bg-primary/10 text-primary border border-primary/20 rounded-full`
- Inactive: `text-on-surface-variant hover:text-on-surface bg-surface-container rounded-full`

**Grid responsive rules:**
- Mobile: 1 column
- Tablet (≥640px): 2 columns
- Desktop (≥1024px): 3 columns
- Wide desktop (≥1440px): 4 columns with bento feature rows

---

### 9.5 Quick Capture

**Reference:** `screens/onboarding_quick_capture.png`

**Mobile:** Full-screen bottom sheet slides up. Desktop: Modal (max-w-2xl).

```
Structure:
1. Type selector — horizontal scroll chips (Person, Document, Note, Recipe, Event…)
2. Title input (autofocused, large — font-headline title-lg)
3. Content textarea (expandable, min 3 rows)
4. Metadata section (collapsed by default, expands on tap):
   - Tags input (comma-separated pill tokenizer)
   - Image/file attach
5. AI "Capture & Enhance" CTA (violet, full-width)
6. "Save Draft" — ghost CTA below
```

**Type chip:**
```tsx
<button className={cn(
  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold flex-shrink-0 transition-all press-scale",
  isSelected
    ? "bg-primary/15 text-primary border border-primary/25"
    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
)}>
  <TypeIcon className="w-4 h-4" />
  {label}
</button>
```

---

### 9.6 Fill Brain / Suggestions

**Reference:** `screens/openbrain_ai_configuration.png`

**Layout:** Centered card stack. One question shown at a time (card swiping UX).

```
Current question card (full-width, prominent):
  - Violet accent header "Fill Brain" with AI sparkle
  - Large question text (headline-sm, Manrope)
  - Answer input (expandable textarea)
  - Progress: "Question 3 of 12" — linear progress bar in primary

Below card:
  - "Skip" (text button) · "Answer" (primary button) row
  - Previous question can be swiped back to
```

**Progress bar:**
```tsx
<div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
  <div
    className="h-full bg-gradient-to-r from-secondary to-primary rounded-full transition-all duration-500"
    style={{ width: `${(current/total)*100}%` }}
  />
</div>
```

---

### 9.7 Ask AI / Chat

**Reference:** `screens/openbrain_ask_ai.png`, `screens/openbrain_ask_ai_desktop.png`

Full spec in component section 8.9. Additional screen-level rules:

- **Desktop:** 2-column layout. Left: chat (65%). Right: source entries panel (35%) showing which entries informed the answer.
- **Source panel** uses compact entry cards with a `text-secondary` "Referenced" label.
- Chat history preserved across sessions (stored in `sessionStorage`).
- Vault-protected entries: if query needs vault data, show lock prompt first.

---

### 9.8 Entry Detail & Edit

**Reference:** `screens/openbrain_edit_profile.png`

**Mobile:** Full-screen takeover.  
**Desktop:** Right-panel drawer (480px wide) sliding in from right.

```
View mode:
  - Large title (headline-md)
  - Type badge + timestamp row
  - Content (body-lg, line-height 1.7)
  - Metadata grid (key-value pairs in surface-container-high cards)
  - Tags row
  - Linked entries section ("Connected memories")
  - Action bar: Edit · Pin · Share · Delete

Edit mode:
  - Title input (autofocused, headline size)
  - Content textarea
  - Type selector
  - Tags tokenizer
  - Metadata editor (key-value add/remove)
  - Save CTA + Cancel ghost button
  - Destructive "Delete entry" — bottom, red, confirmation required
```

---

### 9.9 Knowledge Graph

**Reference:** `screens/openbrain_network_desktop.png`, `screens/openbrain_network_nodes.png`

- Full-bleed canvas (`100dvh` minus nav)
- Node colors: match entry type (person = cyan, document = violet, recipe = rose)
- Active node: pulse glow `animate-pulse-glow`
- Edge lines: `rgba(114,239,245,0.2)` for connections, `rgba(213,117,255,0.2)` for AI-discovered links
- Hover over node: tooltip card appears (standard entry card in glass-panel)
- Selected node: right panel shows full entry detail
- Controls: zoom in/out, fit-to-screen, filter by type — floating control panel bottom-right, glass-panel

---

### 9.10 Calendar View

- Month grid. Day cells: `min-h-[44px]` (mobile), `min-h-[80px]` (desktop)
- Entries on a day: colored dot under date number (color = entry type)
- Selected day: `bg-primary/10 border border-primary/25`
- Today: `text-primary font-bold`
- Event detail on day tap: bottom sheet (mobile) or popover (desktop)

---

### 9.11 Refine & Links View

- Entry list on left (scrollable)
- Selected entry expanded on right (desktop) or full-screen (mobile)
- AI quality score per entry: color-coded ring around entry icon (green = good, amber = stale, red = contradicted)
- "Suggested links" at bottom: side-by-side entry pair with violet "Link these?" CTA

---

### 9.12 Settings

**Reference:** `screens/openbrain_main_brain_settings.png`, `screens/openbrain_ai_configuration.png`

Sectioned layout — no tabs, continuous scroll with sticky section headers:

| Section | Content |
|---|---|
| Brain | Name, type, privacy, delete brain |
| Account | Email, theme toggle, logout |
| AI Configuration | Provider, global model, per-task models, pricing tier badges |
| Notifications | Push, daily digest, expiry alerts |
| Security | PIN, Vault, export |
| Data | Import, export, storage usage |
| About | Version, changelog, docs link |

Each section uses a `surface-container` card with `rounded-3xl` and `p-6`, separated by `gap-4` not dividers.

---

### 9.13 Vault

**Reference:** `screens/openbrain_ask_ai.png` (vault unlock gate)

- Tertiary (rose) color scheme throughout — signals security
- PIN entry: 6-dot input field
- Locked state: lock icon, "Your vault is secured" message in tertiary color
- Unlocked state: entries shown with rose lock icon in top-right of each card
- Auto-lock after 5 minutes of inactivity

---

## 10. Responsive Layout System

### Breakpoints

| Name | Width | Layout |
|---|---|---|
| `sm` | 375px | Mobile — single column, bottom nav |
| `md` | 640px | Tablet — 2-column grid, bottom nav or sidebar |
| `lg` | 1024px | Desktop — fixed sidebar, bento grid |
| `xl` | 1280px | Wide desktop — wider bento, 4-column grid |
| `2xl` | 1440px | Ultra-wide — max-width content cap |

### Layout Shell

```tsx
// Root layout
<div className="min-h-dvh bg-background text-on-surface font-body relative">

  {/* Ambient atmosphere — fixed, non-interactive */}
  <div className="synapse-bg" aria-hidden="true" />

  {/* Desktop sidebar */}
  <DesktopSidebar className="hidden lg:flex" />

  {/* Mobile header */}
  <MobileHeader className="lg:hidden" />

  {/* Main content */}
  <main
    id="main-content"
    className="
      relative z-10
      px-4 sm:px-6 lg:px-8
      pt-4
      pb-28 lg:pb-8
      lg:ml-72
      max-w-[1440px] mx-auto
    "
    tabIndex={-1}
  >
    {/* Skip link target */}
    {children}
  </main>

  {/* Mobile bottom nav */}
  <MobileBottomNav className="lg:hidden" />
</div>
```

### Skip Link (Accessibility)

```tsx
<a
  href="#main-content"
  className="
    sr-only focus:not-sr-only
    fixed top-4 left-4 z-[200]
    px-4 py-2 rounded-lg
    bg-primary text-on-primary font-semibold text-sm
    focus:outline-none
  "
>
  Skip to main content
</a>
```

---

## 11. Animation & Motion System

### Timing Tokens

| Name | Duration | Easing | Use |
|---|---|---|---|
| `instant` | 0ms | — | State flags only |
| `micro` | 100ms | `ease-out` | Press feedback |
| `fast` | 150ms | `cubic-bezier(0.4,0,0.2,1)` | Color, opacity transitions |
| `standard` | 250ms | `cubic-bezier(0.4,0,0.2,1)` | Panel reveals, card hovers |
| `enter` | 300ms | `cubic-bezier(0.16,1,0.3,1)` | Modals, sheets entering |
| `exit` | 200ms | `cubic-bezier(0.4,0,1,1)` | Modals, sheets exiting |
| `spring` | 400ms | `cubic-bezier(0.34,1.56,0.64,1)` | Bounce interactions |

**Rule:** Exit animations are always shorter than enter (67% ratio).

### Interaction Animations

| Interaction | Animation |
|---|---|
| Button press | `scale(0.95)` → `scale(1)`, 150ms spring |
| Card hover | `border-primary/20` transition, 500ms ease |
| Nav item activate | Left border + bg gradient, 300ms ease |
| Modal enter | `opacity: 0 → 1` + `scale(0.95) → scale(1)`, 300ms out-expo |
| Sheet enter | `translateY(100%) → translateY(0)`, 300ms out-expo |
| Toast enter | `translateY(-8px) + opacity: 0 → 1`, 300ms out-expo |
| Skeleton shimmer | Background-position sweep, 1.5s linear infinite |
| AI typing dots | `translateY` bounce stagger 150ms, infinite |
| Synapse blob | Slow `translate + scale` oscillation, 8s ease-in-out infinite |

### What Not to Animate

- `width`, `height` — use `max-height` with overflow-hidden
- `layout` reflows
- More than 2 elements simultaneously
- Anything when `prefers-reduced-motion: reduce` is active

---

## 12. PWA Integration Requirements

### Manifest (`public/manifest.json`)

```json
{
  "name": "OpenBrain",
  "short_name": "OpenBrain",
  "description": "Your AI-powered second brain",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0E0E0E",
  "theme_color": "#72EFF5",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/mobile-home.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" },
    { "src": "/screenshots/desktop-home.png", "sizes": "1440x900", "type": "image/png", "form_factor": "wide" }
  ],
  "categories": ["productivity", "utilities"],
  "shortcuts": [
    { "name": "Quick Capture", "url": "/capture", "icons": [{ "src": "/icons/shortcut-capture.png", "sizes": "96x96" }] },
    { "name": "Ask AI", "url": "/ask", "icons": [{ "src": "/icons/shortcut-ask.png", "sizes": "96x96" }] }
  ]
}
```

### Meta Tags (`index.html`)

```html
<meta name="theme-color" content="#72EFF5" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0E0E0E" media="(prefers-color-scheme: dark)" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="OpenBrain" />
<link rel="apple-touch-icon" href="/icons/icon-180.png" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

**`viewport-fit=cover`** is required for safe-area-inset to work on notched devices.

### Safe Area Handling

All fixed UI elements (header, bottom nav, FAB) must use:
```css
padding-top: max(12px, env(safe-area-inset-top));
padding-bottom: max(24px, env(safe-area-inset-bottom));
```

### Offline Behaviour

- Service worker caches: app shell, last-loaded brain entries, AI system prompts
- Offline indicator: shown in MobileHeader when `navigator.onLine === false`
- Offline fallback page: branded page with "You're offline — your last sync is available below"
- Pending queue indicator in header shows count of unsynced operations

---

## 13. Desktop-Specific Behaviour

### Window Controls Overlay (Installed PWA)

When installed as a desktop PWA, the sidebar extends into the title bar:

```json
// manifest.json addition
"display_override": ["window-controls-overlay", "standalone"],
"window_controls_overlay": { "initial_bounds": { "x": 0, "y": 0, "width": 288, "height": 40 } }
```

```css
/* Push content below title bar on macOS / Windows */
.sidebar-brand {
  padding-top: env(titlebar-area-height, 8px);
}
```

### Keyboard Shortcuts (Desktop)

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Focus quick capture bar |
| `Cmd/Ctrl + /` | Open AI chat |
| `Cmd/Ctrl + N` | New entry |
| `Cmd/Ctrl + F` | Search entries |
| `Esc` | Close modal / sheet |
| `←` / `→` | Previous / next entry in detail view |

### Hover States (Desktop Only)

- Card hover: 500ms transition to `border-primary/20` + subtle `translateY(-2px)` lift
- Nav item hover: background fill transition 200ms
- Button hover: opacity increase + cursor:pointer
- Entry card "more options" button: appears on group hover (`group-hover:opacity-100`)

---

## 14. Accessibility Standards

**Target:** WCAG 2.2 AA across all screens.

### Checklist

- [ ] All text ≥16px for body copy
- [ ] All text meets 4.5:1 contrast (body) or 3:1 (large text / UI)
- [ ] All interactive elements are keyboard reachable (Tab order = visual order)
- [ ] All icon-only buttons have `aria-label`
- [ ] All modals have `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- [ ] Escape key closes all modals and sheets
- [ ] Focus returns to trigger element after modal close
- [ ] Forms: all inputs have `<label>` or `aria-label`, errors use `role="alert"`
- [ ] Navigation has `aria-label="Primary navigation"` and `aria-current="page"` on active item
- [ ] Images have `alt` text; decorative elements have `aria-hidden="true"`
- [ ] Toast notifications use `aria-live="polite"` (or `assertive` for errors)
- [ ] Canvas (Knowledge Graph) has `aria-label` describing content
- [ ] `prefers-reduced-motion` disables all animations
- [ ] Touch targets: minimum 44×44px on all interactive elements
- [ ] Skip link present and focusable: "Skip to main content"
- [ ] No content relies on color alone (all status uses icon + text + color)
- [ ] `viewport` never disables user scaling (`user-scalable=no` is forbidden)
- [ ] `lang="en"` on `<html>` element

---

## 15. Light Mode — Neural Alabaster

Activated via `.dark` class removal on `<html>`. All token swaps — no component code changes.

### Token Overrides

```css
:root:not(.dark) {
  --background:                    #F5F3EF;
  --surface:                       #FFFFFF;
  --surface-container-low:         #EDEDEB;
  --surface-container:             #E5E3DF;
  --surface-container-high:        #DDDBD7;
  --surface-container-highest:     #D5D3CF;
  --surface-bright:                #F0EEE9;

  --on-surface:                    #1C1C1E;
  --on-surface-variant:            #4A4A52;
  --outline:                       #8C8B8A;
  --outline-variant:               #C7C5C1;

  --primary:                       #006A6E;      /* Deep teal — AA on white */
  --primary-container:             #9EF0F4;
  --secondary:                     #7D00A3;      /* Deep violet — AA on white */
  --secondary-container:           #F3DAFF;
  --tertiary:                      #B5004B;      /* Deep rose — AA on white */
  --error:                         #B3001D;

  --glass-panel-bg:                rgba(255,255,255,0.70);
  --glass-panel-dark-bg:           rgba(237,237,235,0.80);
}
```

**Key differences from dark mode:**
- Accents shift to deeper, saturated variants for contrast on light backgrounds
- Glass panels use white-tinted backdrop blur instead of dark
- Ambient radials are lighter and warmer: `rgba(0,106,110,0.05)` and `rgba(125,0,163,0.05)`
- Surface elevation inverted: lightest surface = z-0, slightly tinted = z-1

---

## 16. Do's and Don'ts

### Do

- Use `synapse-bg` ambient radials on every page as a fixed background layer
- Apply `press-scale` to every interactive card and button
- Use Manrope for all headings, Inter for all body text — no exceptions
- Enforce the semantic color rule: cyan = action, violet = AI, rose = security
- Show skeleton loaders for every async data fetch
- Apply `min-h-[44px]` to every interactive element
- Use `glass-panel` for any element floating above base content
- Add `aria-label` to every icon-only button
- Validate form fields on blur, not on keystroke
- Test with `prefers-reduced-motion: reduce` — all animations must gracefully disable

### Don't

- Never use `1px solid` borders to create visual sections — use space and luminance shifts
- Never use `#000000` pure black for backgrounds — use `#0E0E0E`
- Never use `#FFFFFF` pure white for body text — use `#ADAAAA` for secondary text
- Never use drop shadows on static cards
- Never use `user-scalable=no` in viewport meta
- Never use emoji as structural icons — Lucide or Heroicons only
- Never use `alert()` for user feedback — toasts only
- Never place color as the sole indicator of state — always pair with icon or text
- Never animate `width`, `height`, `top`, or `left` — use `transform` and `opacity` only
- Never show a blank page state — all empty views must have an empty state component
- Never use more than 4 animation elements simultaneously

---

*End of UI Specification — OpenBrain v2.0*
