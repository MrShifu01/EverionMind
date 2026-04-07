# OpenBrain — Neural Obsidian UI Redesign Guide

**Design System Name:** Neural Obsidian (Dark) / Neural Alabaster (Light)  
**Creative North Star:** "The Ethereal Synapse"  
**Philosophy:** High-end, futuristic dark-mode aesthetic that feels like a premium AI instrument — not a SaaS dashboard. The UI breathes. It uses light and depth instead of borders and dividers.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Elevation & Depth](#4-elevation--depth)
5. [Core CSS Primitives](#5-core-css-primitives)
6. [Tailwind Config Token Map](#6-tailwind-config-token-map)
7. [Components](#7-components)
   - [Navigation — Desktop SideNav](#71-navigation--desktop-sidenav)
   - [Navigation — Mobile BottomNav](#72-navigation--mobile-bottomnav)
   - [Glassmorphic Search / Quick Capture Bar](#73-glassmorphic-search--quick-capture-bar)
   - [Cards & Bento Grid](#74-cards--bento-grid)
   - [Buttons](#75-buttons)
   - [Input Fields](#76-input-fields)
   - [AI Chat Interface](#77-ai-chat-interface)
   - [Modals](#78-modals)
   - [Toast Notifications](#79-toast-notifications)
   - [Skeleton Screens](#710-skeleton-screens)
   - [Floating Brain-Switch Pill](#711-floating-brain-switch-pill)
8. [Screen-by-Screen Redesign Specs](#8-screen-by-screen-redesign-specs)
9. [Light Mode — Neural Alabaster](#9-light-mode--neural-alabaster)
10. [Do's and Don'ts](#10-dos-and-donts)
11. [Final Prompt for AI-Assisted Implementation](#11-final-prompt-for-ai-assisted-implementation)

---

## 1. Design Philosophy

### The Ethereal Synapse

This is not a template reskin. The design system creates a digital environment that feels like a **physical extension of thought**.

**Three core pillars:**

| Pillar | Principle |
|---|---|
| **Atmospheric Depth** | Dark backgrounds are never flat black — they are rich chromatic darks that suggest infinite space. Cards are stacked sheets of frosted glass, not boxes on a page. |
| **Intentional Asymmetry** | Text anchors left. Visual weight bleeds right. Hero elements overflow their containers. Nothing is centred unless centring creates drama. |
| **Color as Semantic Signal** | Cyan (`#72EFF5`) = action, interaction, data. Violet (`#D575FF`) = AI intelligence, synthesis, generation. Rose (`#FF9AC3`) = security, privacy, encryption. These rules are never broken. |

### The No-Line Rule

> **Never use 1px solid borders to separate content sections.**

Sections are divided by **luminance shifts** — a card on `surface-container` against a `surface-container-low` background has implicit separation without any border. Borders are a crutch. When you think you need a divider, you need 24px more vertical space.

---

## 2. Color System

### Design Tokens (Dark Mode — Neural Obsidian)

```
Background (The Void):         #0E0E0E   → bg-background / bg-surface
Section Layer:                  #131313   → bg-surface-container-low
Primary Cards:                  #1A1919   → bg-surface-container
Active/Elevated:                #262626   → bg-surface-container-highest / bg-surface-variant
Interactive Hover:              #2C2C2C   → bg-surface-bright

Primary (Cyan — Action):        #72EFF5   → text-primary / border-primary
Primary Container:              #1FB1B7   → CTA gradient end
Secondary (Violet — Intel):     #D575FF   → text-secondary / AI indicators
Secondary Container:            #9800D0   → Glassmorphic Brain-Switch bg
Tertiary (Rose — Security):     #FF9AC3   → Security/encryption indicators

On-Surface (Titles):            #FFFFFF
On-Surface-Variant (Body):      #ADAAAA   → Never pure white for body text
Outline:                        #777575
Outline-Variant (Ghost stroke): #484847   → Use at 10-20% opacity only

Error:                          #FF6E84
```

### Surface Hierarchy — Stacked Glass Sheets

```
z-4 (Modal/Popover):   rgba(38,38,38,0.60) + backdrop-blur(24px)   [Glass Panel]
z-3 (Active Card):     #262626   [surface-container-highest]
z-2 (Card):            #1A1919   [surface-container]
z-1 (Section bg):      #131313   [surface-container-low]
z-0 (Page base):       #0E0E0E   [surface / background]
```

### Accent Usage Map

| Color | Token | Use For |
|---|---|---|
| `#72EFF5` | `primary` | CTAs, active nav, links, focus rings, search bars, progress bars |
| `#D575FF` | `secondary` | AI response headers, "Generating" states, Brain-Switch active pill, synapse animations |
| `#FF9AC3` | `tertiary` | Security badges, encryption indicators, private/locked items |
| `#FF6E84` | `error` | Warnings, failed syncs, rate limit alerts |

---

## 3. Typography

**Font Stack:** Google Fonts — load both at session start.

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
```

| Scale | Font | Size | Weight | Use |
|---|---|---|---|---|
| Display | Manrope | 3.5rem (56px) | 800 | Hero statements, landing H1 |
| Headline LG | Manrope | 2.5rem (40px) | 700 | Main insight card titles |
| Headline MD | Manrope | 2rem (32px) | 700 | Section headers |
| Title LG | Manrope | 1.25rem (20px) | 700 | Card titles |
| Title SM | Inter | 1.125rem (18px) | 600 | Component-level naming |
| Body LG | Inter | 1rem (16px) | 400 | Long-form content |
| Body SM | Inter | 0.875rem (14px) | 400 | Secondary content, descriptions |
| Label | Inter | 0.75rem (12px) | 500 | Metadata, timestamps, tags |
| Caption | Inter | 0.625rem (10px) | 500 | UPPERCASE + tracking-widest for nav labels, status pills |

**Tailwind Font Families:**
```js
fontFamily: {
  headline: ["Manrope"],
  body: ["Inter"],
  label: ["Inter"],
}
```

**Typography Patterns:**
- Gradient text on key hero words: `bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-tertiary`
- Tight tracking on brand: `tracking-tighter` on all Manrope headlines
- ALL CAPS + tracking-[0.2em] for metadata labels (nav items, status indicators)
- `on-surface` (#FFF) for headings — `on-surface-variant` (#ADAAAA) for body

---

## 4. Elevation & Depth

**No drop shadows on static cards.** Depth comes from the surface tier contrast, not shadow casting.

### Synapse Glow (Floating Elements Only)
```css
.synapse-glow {
  box-shadow:
    0px 20px 40px rgba(0, 0, 0, 0.4),
    0px 0px 20px rgba(114, 239, 245, 0.05);
}
```
Apply to: Modals, floating nav, search bars, bottom nav, Brain-Switch pill.

### AI Response Glow (Cyan variant)
```css
box-shadow:
  0px 20px 40px rgba(0, 0, 0, 0.4),
  0px 0px 20px rgba(114, 239, 245, 0.08);
```

### Violet Intelligence Glow (Bottom Nav)
```css
box-shadow:
  0px 20px 40px rgba(0, 0, 0, 0.4),
  0px 0px 20px rgba(213, 117, 255, 0.10);
```

### Ghost Border Fallback (Accessibility only)
```css
border: 1px solid rgba(72, 72, 71, 0.15); /* outline-variant at 15% */
```

### Ambient Background Radials (Page-level atmosphere)
```css
.synapse-bg {
  background-image:
    radial-gradient(circle at 20% 30%, rgba(114, 239, 245, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(213, 117, 255, 0.08) 0%, transparent 40%);
}
```
Apply as a fixed `z-0` overlay on the `<body>` for all pages.

---

## 5. Core CSS Primitives

Add these to your global stylesheet or `index.css`:

```css
/* Glass Panel — modals, nav, search bars */
.glass-panel {
  background: rgba(38, 38, 38, 0.60);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* Darker glass variant for mobile nav */
.glass-panel-dark {
  background: rgba(19, 19, 19, 0.60);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* Floating glow for elevated interactive elements */
.synapse-glow {
  box-shadow: 0px 20px 40px rgba(0,0,0,0.4), 0px 0px 20px rgba(114,239,245,0.05);
}

/* Ethereal ambient background — apply to body or fixed overlay */
.synapse-bg {
  background-image:
    radial-gradient(circle at 20% 30%, rgba(114,239,245,0.08) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(213,117,255,0.08) 0%, transparent 40%);
}

/* Glowing text effect for hero elements */
.glow-text {
  text-shadow: 0 0 20px rgba(114, 239, 245, 0.4);
}

/* Grain texture overlay for premium feel */
.grain-overlay {
  background-image: url('https://www.transparenttextures.com/patterns/asfalt-dark.png');
  opacity: 0.03;
  mix-blend-mode: overlay;
  pointer-events: none;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0e0e0e; }
::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #484847; }
```

---

## 6. Tailwind Config Token Map

```js
// tailwind.config.js — extend this into your existing config
theme: {
  extend: {
    colors: {
      // Surface hierarchy
      "background":                "#0e0e0e",
      "surface":                   "#0e0e0e",
      "surface-dim":               "#0e0e0e",
      "surface-container-lowest":  "#000000",
      "surface-container-low":     "#131313",
      "surface-container":         "#1a1919",
      "surface-container-high":    "#201f1f",
      "surface-container-highest": "#262626",
      "surface-variant":           "#262626",
      "surface-bright":            "#2c2c2c",

      // Brand accents
      "primary":           "#72eff5",
      "primary-dim":       "#63e1e7",
      "primary-fixed":     "#72eff5",
      "primary-fixed-dim": "#63e1e7",
      "primary-container": "#1fb1b7",

      "secondary":           "#d575ff",
      "secondary-dim":       "#b90afc",
      "secondary-container": "#9800d0",

      "tertiary":     "#ff9ac3",
      "tertiary-dim": "#ec77aa",

      "error":     "#ff6e84",
      "error-dim": "#d73357",

      // On-colors
      "on-background":     "#ffffff",
      "on-surface":        "#ffffff",
      "on-surface-variant":"#adaaaa",
      "on-primary":        "#00585b",
      "on-primary-container": "#002829",
      "on-secondary":      "#390050",
      "on-secondary-container": "#fff5fc",
      "on-tertiary":       "#6b0c40",
      "on-error":          "#490013",

      // Borders
      "outline":         "#777575",
      "outline-variant": "#484847",

      // Inverse (Light Mode)
      "inverse-surface":    "#fcf8f8",
      "inverse-on-surface": "#565554",
      "inverse-primary":    "#006a6e",
    },
    borderRadius: {
      DEFAULT: "0.25rem",
      lg: "0.5rem",
      xl: "0.75rem",   // Cards use this
      "2xl": "1rem",
      "3xl": "1.5rem", // Large feature cards
      full: "9999px",
    },
    fontFamily: {
      headline: ["Manrope", "sans-serif"],
      body: ["Inter", "sans-serif"],
      label: ["Inter", "sans-serif"],
    },
  },
}
```

---

## 7. Components

### 7.1 Navigation — Desktop SideNav

**Screenshot:** `screens/desktop_sidenavbar_with_theme_toggle.png`

Layout: Fixed left rail, 288px wide (`w-72`), full height. Background `#0E0E0E` with right border `border-[#1A1919]`.

```jsx
// SideNav structure
<aside className="fixed left-0 top-0 h-full z-40 flex flex-col p-6 w-72 bg-[#0E0E0E] border-r border-[#1A1919] font-headline tracking-tight">

  {/* Brand */}
  <div className="mb-10">
    <h1 className="text-2xl font-bold tracking-tighter bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">
      OpenBrain
    </h1>
    <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mt-1 opacity-60">
      Neural Interface
    </p>
  </div>

  {/* Primary CTA */}
  <button className="mb-8 w-full py-3 px-4 bg-gradient-to-br from-primary to-primary-container rounded-xl text-on-primary-container font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg">
    + New Entry
  </button>

  {/* Nav Items */}
  <nav className="flex-1 space-y-2">
    {/* Active item */}
    <a className="flex items-center gap-3 px-4 py-3 text-primary font-semibold border-r-2 border-primary bg-gradient-to-r from-primary/10 to-transparent transition-all duration-300">
      [Icon] Neural Hub
    </a>
    {/* Inactive item */}
    <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-white hover:bg-surface-container transition-all duration-300 group">
      [Icon] Knowledge Vault
    </a>
  </nav>

  {/* User + Theme Toggle at bottom */}
  <div className="pt-6 border-t border-outline-variant/10">
    {/* Theme toggle switch */}
    {/* User avatar + name */}
  </div>
</aside>
```

**Active state rule:** `text-primary` + `border-r-2 border-primary` + `bg-gradient-to-r from-primary/10 to-transparent`  
**Hover state rule:** `hover:text-white hover:bg-surface-container`

---

### 7.2 Navigation — Mobile BottomNav

**Screenshot:** `screens/mobile_bottomnavbar_with_theme_toggle.png`

Glassmorphic pill, floats above content. Uses violet glow.

```jsx
<nav className="
  fixed bottom-6 left-1/2 -translate-x-1/2 z-50
  bg-surface-container/60 backdrop-blur-2xl
  rounded-2xl w-[90%] max-w-sm
  flex justify-around items-center px-4 py-2
  shadow-[0px_20px_40px_rgba(0,0,0,0.4),0px_0px_20px_rgba(213,117,255,0.1)]
">
  {/* Inactive tab */}
  <a className="flex flex-col items-center p-2 text-on-surface-variant hover:text-white transition-all active:scale-90">
    [Icon]
    <span className="text-[10px] uppercase tracking-widest mt-1">Home</span>
  </a>

  {/* Active tab */}
  <a className="flex flex-col items-center p-2 text-secondary bg-secondary/10 rounded-xl active:scale-90">
    [Icon filled]
    <span className="text-[10px] uppercase tracking-widest mt-1">Ask</span>
  </a>

  {/* Theme toggle icon — integrated as 5th tab slot */}
</nav>
```

**Active state rule:** `text-secondary bg-secondary/10 rounded-xl` (violet highlight)  
**5 tabs:** Home, Collections, Quick-Add/Fill, Ask AI, More

---

### 7.3 Glassmorphic Search / Quick Capture Bar

**Screenshot:** `screens/openbrain_home_desktop.png` (sticky top section)

```jsx
<section className="mb-16 sticky top-4 z-20">
  <div className="glass-panel p-2 rounded-2xl border border-outline-variant/10 synapse-glow">
    <div className="flex items-center gap-4 px-4 py-2">
      {/* Search icon in primary */}
      <SearchIcon className="text-primary" />

      <input
        className="bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50 w-full font-headline text-lg font-medium"
        placeholder="Search or capture a new insight..."
      />

      {/* Action buttons */}
      <button className="p-2 hover:bg-surface-container rounded-lg text-on-surface-variant transition-colors">
        [Mic]
      </button>
      <button className="p-2 hover:bg-surface-container rounded-lg text-on-surface-variant transition-colors">
        [Attach]
      </button>

      {/* Primary AI action — violet */}
      <button className="flex items-center gap-2 bg-secondary text-on-secondary px-6 py-2.5 rounded-xl font-bold transition-transform active:scale-95">
        ✦ Synthesize
      </button>
    </div>
  </div>
</section>
```

---

### 7.4 Cards & Bento Grid

**Screenshot:** `screens/openbrain_home_desktop.png`

**Grid system:** 12-column. Large feature card = `col-span-8`, sidebar = `col-span-4`. Small bento cards = `col-span-4` (3 per row). Wide full-bleed card = `col-span-12`.

```jsx
{/* Large Feature Card */}
<div className="col-span-8 bg-surface-container rounded-3xl p-8 border border-outline-variant/5 hover:border-primary/20 transition-all duration-500 group">

  {/* Card Header */}
  <div className="flex justify-between items-start mb-6">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        [Icon in text-primary]
      </div>
      <div>
        <h3 className="text-on-surface font-headline font-bold text-xl tracking-tight">
          Card Title
        </h3>
        <p className="text-on-surface-variant text-xs">Updated 2m ago</p>
      </div>
    </div>
    <button className="text-on-surface-variant hover:text-primary transition-colors">
      [More]
    </button>
  </div>

  {/* Editorial headline — this is the hero text */}
  <h2 className="text-4xl font-headline font-extrabold text-on-surface mb-6 leading-tight">
    The convergence of{" "}
    <span className="text-primary italic">Key Concept</span>{" "}
    and Related Idea.
  </h2>

  {/* Tags */}
  <div className="flex items-center gap-4 flex-wrap">
    <span className="px-3 py-1 bg-surface-container-highest rounded-full text-xs font-semibold text-secondary border border-secondary/10">
      #Tag
    </span>
  </div>
</div>

{/* Small Bento Card */}
<div className="col-span-4 bg-surface-container-low rounded-3xl p-6 border border-outline-variant/5 hover:bg-surface-container transition-colors cursor-pointer group">
  <span className="text-tertiary mb-4 block">[Icon filled]</span>
  <h4 className="text-on-surface font-headline font-bold text-lg mb-2">Card Name</h4>
  <p className="text-on-surface-variant text-sm">Description text here.</p>
</div>

{/* Wide Context Card with ambient glow */}
<div className="col-span-12 bg-gradient-to-r from-surface-container to-surface-container-low rounded-3xl p-10 border border-outline-variant/5 relative overflow-hidden group">
  {/* Background ambient orb */}
  <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px] group-hover:bg-primary/10 transition-colors" />
  {/* Content */}
</div>
```

---

### 7.5 Buttons

```jsx
{/* PRIMARY — Gradient CTA */}
<button className="px-6 py-3 bg-gradient-to-br from-primary to-primary-container rounded-xl text-on-primary-container font-headline font-bold transition-transform active:scale-95 shadow-lg">
  Primary Action
</button>

{/* PRIMARY — Violet AI CTA (for synthesis/generation actions) */}
<button className="px-6 py-3 bg-gradient-to-r from-secondary to-secondary-container rounded-xl text-on-secondary font-headline font-bold shadow-[0px_0px_30px_rgba(213,117,255,0.25)] active:scale-95 relative overflow-hidden group">
  {/* Shine on hover */}
  <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
  <span className="relative">AI Action</span>
</button>

{/* SECONDARY — Ghost */}
<button className="px-5 py-2 rounded-lg text-sm font-semibold text-primary border border-primary/20 hover:bg-primary/5 transition-colors">
  Secondary
</button>

{/* TERTIARY — Text only */}
<button className="text-on-surface-variant font-label text-xs uppercase tracking-[0.2em] hover:text-primary transition-colors">
  Tertiary Action
</button>

{/* ICON BUTTON */}
<button className="w-12 h-12 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center text-on-primary-container active:scale-90 transition-transform duration-200">
  [SendIcon]
</button>
```

---

### 7.6 Input Fields

**Screenshot:** `screens/openbrain_login.png`

```jsx
{/* Text Input */}
<div className="relative">
  <label className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-2 block">
    Field Label
  </label>
  <input
    className="
      w-full bg-surface-container-highest
      rounded-xl px-4 py-3
      text-on-surface placeholder:text-on-surface-variant/40
      border border-outline-variant/20
      focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20
      transition-all duration-200
    "
    placeholder="placeholder text..."
  />
</div>

{/* Chat / Multi-line Input (floating) */}
<div className="
  bg-surface-container/80 backdrop-blur-3xl
  rounded-2xl border border-outline-variant/30
  synapse-glow p-2 flex items-center gap-2
  focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20
  transition-all duration-300
">
  <button className="w-12 h-12 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors">
    [AddIcon]
  </button>
  <input
    className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/50"
    placeholder="Ask your brain..."
  />
  <button className="w-12 h-12 bg-gradient-to-br from-primary to-primary-container rounded-xl flex items-center justify-center text-on-primary-container active:scale-90 transition-transform">
    [SendIcon filled]
  </button>
</div>
```

**Focus state:** No thick border ring. A thin `border-primary/60` + soft `ring-1 ring-primary/20` is the entire focus indicator.

---

### 7.7 AI Chat Interface

**Screenshots:** `screens/openbrain_ask_ai.png`, `screens/openbrain_ask_ai_desktop.png`

```jsx
{/* User message — right-aligned */}
<div className="flex flex-col items-end gap-3 max-w-[85%] ml-auto">
  <div className="bg-surface-container-highest px-6 py-4 rounded-2xl rounded-tr-none text-on-surface">
    <p>User message text here.</p>
  </div>
  <span className="text-xs uppercase tracking-widest text-on-surface-variant px-2">10:42 AM</span>
</div>

{/* AI Response — left-aligned with Intelligence Output header */}
<div className="flex flex-col items-start gap-4 max-w-[95%]">

  {/* AI header badge */}
  <div className="flex items-center gap-3 mb-1">
    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center border border-secondary/20">
      [SparkleIcon filled in text-secondary]
    </div>
    <span className="text-xs uppercase tracking-widest text-secondary font-semibold">
      Intelligence Output
    </span>
  </div>

  {/* AI response card */}
  <div className="glass-panel synapse-glow border border-primary/10 rounded-3xl p-8 relative overflow-hidden">
    {/* Top gradient line — "generating" indicator */}
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-50" />

    <h2 className="text-xl font-headline font-semibold text-primary mb-4">
      Response Title
    </h2>
    <p className="text-on-surface-variant leading-relaxed">
      Response body with{" "}
      <span className="text-white font-medium">highlighted key terms</span>{" "}
      inline.
    </p>

    {/* Mini bento grid for structured insights */}
    <div className="grid grid-cols-2 gap-4 mt-4">
      <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
        [Icon in text-tertiary]
        <h3 className="text-sm font-semibold mb-1 mt-3">Insight Label</h3>
        <p className="text-xs text-on-surface-variant">Detail text.</p>
      </div>
    </div>
  </div>
</div>

{/* Generating state */}
<div className="flex flex-col items-start gap-4 max-w-[95%]">
  <div className="flex items-center gap-3 mb-1">
    <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center">
      [SparkleIcon in text-secondary]
    </div>
    <span className="text-xs uppercase tracking-widest text-secondary font-semibold">
      Generating Insights...
    </span>
  </div>

  {/* Loading card */}
  <div className="w-full h-48 bg-surface-container rounded-3xl overflow-hidden border border-outline-variant/20 flex items-center justify-center relative">
    {/* Ambient background image at 40% opacity + mix-blend-luminosity */}
    <div className="z-10 flex flex-col items-center gap-4">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-75" />
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-150" />
      </div>
      <span className="text-sm text-primary/80 tracking-widest uppercase font-label">
        Synthesizing...
      </span>
    </div>
  </div>
</div>
```

---

### 7.8 Modals

**Screenshot:** `screens/openbrain_create_shared_brain_modal.png`

```jsx
{/* Overlay */}
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">

  {/* Modal panel */}
  <div className="glass-panel rounded-3xl border border-outline-variant/15 p-8 w-full max-w-lg synapse-glow">

    {/* Header */}
    <div className="flex justify-between items-center mb-8">
      <h2 className="text-xl font-headline font-bold text-on-surface">Modal Title</h2>
      <button className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-container">
        [CloseIcon]
      </button>
    </div>

    {/* Content */}
    <div className="space-y-6">
      {/* Form fields, options, etc. */}
    </div>

    {/* Footer actions */}
    <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-outline-variant/10">
      <button className="px-5 py-2 text-sm font-semibold text-on-surface-variant hover:text-white transition-colors">
        Cancel
      </button>
      <button className="px-6 py-3 bg-gradient-to-br from-primary to-primary-container rounded-xl text-on-primary-container font-bold active:scale-95 transition-transform">
        Confirm
      </button>
    </div>
  </div>
</div>
```

---

### 7.9 Toast Notifications

**Screenshot:** `screens/neural_toast_concept.png`

```jsx
{/* Toast container — fixed top-right desktop, top-center mobile */}
<div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-sm">

  {/* Success toast */}
  <div className="glass-panel border-l-2 border-primary rounded-xl px-5 py-4 flex items-start gap-4 synapse-glow">
    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
      [CheckIcon in text-primary]
    </div>
    <div className="flex-1">
      <p className="text-on-surface font-semibold text-sm">Synapse Synced</p>
      <p className="text-on-surface-variant text-xs mt-0.5">Neural pathways mirrored to cloud backup.</p>
    </div>
    <button className="text-on-surface-variant hover:text-white transition-colors">
      [CloseIcon text-sm]
    </button>
  </div>

  {/* Warning toast */}
  <div className="glass-panel border-l-2 border-[#FF9AC3] rounded-xl px-5 py-4 flex items-start gap-4">
    <div className="w-8 h-8 rounded-lg bg-tertiary/10 flex items-center justify-center flex-shrink-0">
      [WarningIcon in text-tertiary]
    </div>
    <div>
      <p className="text-on-surface font-semibold text-sm">API Rate Limit</p>
      <p className="text-on-surface-variant text-xs mt-0.5">External synthesis may be throttled.</p>
    </div>
  </div>

  {/* Info toast (AI generated) */}
  <div className="glass-panel border-l-2 border-secondary rounded-xl px-5 py-4 flex items-start gap-4">
    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
      [SparkleIcon in text-secondary]
    </div>
    <div>
      <p className="text-on-surface font-semibold text-sm">New Insight Generated</p>
      <p className="text-on-surface-variant text-xs mt-0.5">AI detected a new connection in your knowledge graph.</p>
    </div>
  </div>
</div>
```

**Toast color = border-left color:**
- Success = `border-primary` (cyan)
- AI/Info = `border-secondary` (violet)
- Security = `border-tertiary` (rose)
- Error = `border-error` (red)

---

### 7.10 Skeleton Screens

Use on every loading state. Never show empty containers.

```jsx
{/* Skeleton card */}
<div className="bg-surface-container rounded-3xl p-8 animate-pulse">
  {/* Header skeleton */}
  <div className="flex items-center gap-3 mb-6">
    <div className="w-10 h-10 rounded-full bg-surface-container-highest" />
    <div className="space-y-2">
      <div className="h-4 w-32 bg-surface-container-highest rounded-full" />
      <div className="h-3 w-20 bg-surface-container-highest rounded-full" />
    </div>
  </div>
  {/* Title skeleton */}
  <div className="space-y-3 mb-6">
    <div className="h-8 w-3/4 bg-surface-container-highest rounded-full" />
    <div className="h-8 w-1/2 bg-surface-container-highest rounded-full" />
  </div>
  {/* Body skeleton */}
  <div className="space-y-2">
    <div className="h-4 w-full bg-surface-container-highest rounded-full" />
    <div className="h-4 w-5/6 bg-surface-container-highest rounded-full" />
    <div className="h-4 w-4/6 bg-surface-container-highest rounded-full" />
  </div>
</div>

{/* Skeleton list item */}
<div className="flex items-center gap-4 p-4 animate-pulse">
  <div className="w-12 h-12 rounded-full bg-surface-container-highest flex-shrink-0" />
  <div className="flex-1 space-y-2">
    <div className="h-4 w-1/3 bg-surface-container-highest rounded-full" />
    <div className="h-3 w-1/2 bg-surface-container-highest rounded-full" />
  </div>
  <div className="h-6 w-16 bg-surface-container-highest rounded-full" />
</div>
```

---

### 7.11 Floating Brain-Switch Pill

**Screenshot:** `screens/openbrain_home_desktop.png` (bottom center)

A glassmorphic pill for switching AI modes. Uses violet glass (secondary) to reinforce intelligence concept.

```jsx
<div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
  <div className="bg-secondary-container/30 backdrop-blur-2xl border border-secondary/20 p-1 rounded-full flex items-center gap-1 synapse-glow">

    {/* Active mode */}
    <button className="bg-secondary text-on-secondary px-6 py-2.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
      [PsychologyIcon filled] Deep Thought
    </button>

    {/* Inactive modes */}
    <button className="px-6 py-2.5 rounded-full text-on-surface-variant hover:text-on-surface transition-colors font-bold text-sm">
      Fast Inference
    </button>
    <button className="px-6 py-2.5 rounded-full text-on-surface-variant hover:text-on-surface transition-colors font-bold text-sm">
      Search Only
    </button>
  </div>
</div>
```

---

## 8. Screen-by-Screen Redesign Specs

### 8.1 Landing / Welcome Screen
**Screenshot:** `screens/onboarding_welcome.png`, `screens/openbrain_landing_light_mode.png`

- Full-screen centered layout, no nav
- Fixed `synapse-bg` atmospheric radials behind everything
- Hero: Large glass circle with glowing brain icon + pulsing orbital rings
- H1 uses gradient text across 3 accent colors: `from-primary via-secondary to-tertiary`
- Single primary CTA (violet gradient) + two ghost text links below
- Footer: 3-column bento feature cards using `glass-panel`
- Bottom: Atmospheric neural image at 40% opacity + `mix-blend-screen + grayscale`

**Key pattern:**
```jsx
// Hero logo with orbital rings
<div className="relative group">
  <div className="absolute -inset-8 bg-gradient-to-tr from-primary/20 via-secondary/20 to-tertiary/20 rounded-full blur-3xl opacity-60" />
  <div className="relative w-40 h-40 glass-panel border border-outline-variant/15 rounded-full flex items-center justify-center">
    [BrainIcon className="text-6xl text-primary glow-text"]
    <div className="absolute inset-0 border border-primary/20 rounded-full scale-110 animate-pulse" />
    <div className="absolute inset-0 border border-secondary/10 rounded-full scale-125" />
  </div>
</div>
```

---

### 8.2 Login Screen
**Screenshot:** `screens/openbrain_login.png`

- Single column, centered, mobile-first
- Same hero logo at top (smaller — `w-24 h-24`)
- App name + tagline below
- Two inputs: Email ("EMAIL NODE") + Password ("ACCESS KEY")
  - Labels in ALL CAPS tracking-[0.2em] style
- Submit: Full-width gradient button (cyan) with sync icon
- Ghost links: "Forgotten Synapse?" + "Join the Collective"
- Footer: Two pills "PROTOCOL" + "ENCRYPTED" in `text-on-surface-variant text-xs`

---

### 8.3 Onboarding — 3 Screens
**Screenshots:** `screens/onboarding_welcome.png`, `screens/onboarding_feature_discovery.png`, `screens/onboarding_quick_capture.png`, `screens/onboarding_secure_your_mind.png`

**Rule:** No sign-up required until a "Save" action. Value before friction.

Screen 1 — **Welcome** (`onboarding_welcome`): Brand + value prop. CTA = "Experience OpenBrain"  
Screen 2 — **Feature Discovery** (`onboarding_feature_discovery`): Show 3 features in glass cards. Swipeable.  
Screen 3 — **Quick Capture** (`onboarding_quick_capture`): Demonstrate the capture flow inline. "Try it now" before signing up.  
Screen 4 — **Secure Your Mind** (`onboarding_secure_your_mind`): Show encryption/privacy. Social proof of zero-knowledge.

Progress indicator: 4 small dots, `bg-primary` for active, `bg-surface-container-highest` for inactive.

---

### 8.4 Knowledge Feed / Home
**Screenshots:** `screens/openbrain_knowledge_feed.png`, `screens/openbrain_home_desktop.png`

**Desktop layout:** SideNav (288px) + scrollable main (remaining width) + TopBar (64px)  
**Mobile layout:** BottomNav + scrollable content + sticky search bar at top

Top: Sticky `glass-panel` search/capture bar (see 7.3)  
Main: `grid-cols-12` bento layout:
- 8/12: Large editorial card with hero headline
- 4/12: Sidebar stats + media card
- 4/12 × 3: Small action bento cards
- 12/12: Wide CTA integration card

Floating Brain-Switch pill at bottom center.

---

### 8.5 Collections / Grid View
**Screenshots:** `screens/openbrain_grid_view_1.png`, `screens/openbrain_collections_desktop.png`

Mobile: Single-column list. Each collection = tall card with name, count badge, description.  
Desktop: 2 or 3-column grid of large cards.

```jsx
{/* Collection card */}
<div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/5 hover:border-primary/20 transition-all duration-300 cursor-pointer group">
  <div className="flex justify-between items-start mb-4">
    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
      [CollectionIcon in text-primary]
    </div>
    {/* Entry count badge */}
    <span className="bg-surface-container-highest px-3 py-1 rounded-full text-xs font-bold text-on-surface-variant">
      24 entries
    </span>
  </div>
  <h3 className="font-headline font-bold text-lg text-on-surface mb-2">Collection Name</h3>
  <p className="text-on-surface-variant text-sm line-clamp-2">Description of what's in this collection.</p>
  <button className="mt-4 text-primary text-sm font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
    Open [ArrowIcon]
  </button>
</div>
```

---

### 8.6 Ask AI / Chat Interface
**Screenshots:** `screens/openbrain_ask_ai.png`, `screens/openbrain_ask_ai_desktop.png`

Full-height chat view. Scrollable message area. Floating input at bottom.

- User bubbles: right-aligned, `bg-surface-container-highest`, `rounded-2xl rounded-tr-none`
- AI bubbles: left-aligned, `glass-panel` with synapse glow, `rounded-3xl`, top gradient line
- "Intelligence Output" badge with violet spark icon above each AI response
- AI responses contain embedded mini bento grids for structured facts
- Generating state: floating ambient image + 3 pulsing cyan dots + UPPERCASE "Synthesizing..." text

---

### 8.7 Profile / Edit Profile
**Screenshot:** `screens/openbrain_edit_profile.png`

- Large circular avatar (`w-24 h-24`) with `ring-2 ring-primary/20`
- Form fields below with ALL CAPS labels
- Bottom: Danger zone section in `surface-container-low` with `error`-tinted text

---

### 8.8 Network / Members
**Screenshots:** `screens/openbrain_network_nodes.png`, `screens/openbrain_network_desktop.png`

- Page header: Large bold title + key stats in `text-primary` (Global Latency, Nodes Active)
- Member list cards: Avatar + name + role + Sync Rate progress bar
  - Progress bar: `h-1.5 bg-surface-container-highest rounded-full` + fill `bg-primary`
  - Sync rate percentage in `text-primary font-bold`
- Access Log section at bottom: Timestamped event list with `text-on-surface-variant text-xs`

---

### 8.9 Notification Center
**Screenshots:** `screens/notification_center.png`, `screens/neural_toast_concept.png`

Desktop: Full-page notification hub with left sidebar filter tabs  
Mobile: Sheet/drawer overlay

Notification categories use colored left-border pills:
- AI Insights = violet (`secondary`)
- Syncs = cyan (`primary`)
- Security = rose (`tertiary`)
- System = gray (`on-surface-variant`)

---

### 8.10 AI Configuration / Settings
**Screenshot:** `screens/openbrain_ai_configuration.png`, `screens/openbrain_main_brain_settings.png`

- Section headers: ALL CAPS + tracking-widest + `text-on-surface-variant`
- Toggle switches: Active = `bg-primary`, Inactive = `bg-surface-container-highest`
- Model selector: Glassmorphic dropdown cards
- Danger zone: Separate section with `border border-error/20 rounded-2xl p-6`

---

## 9. Light Mode — Neural Alabaster

**Screenshot:** `screens/openbrain_landing_light_mode.png`, `screens/final_unified_design_guide_light_dark_mode_1.png`

The light mode inverts the surface hierarchy while keeping the same accent colors.

```
Background:         #FAFAFA
Surface:            #FFFFFF
surface-container:  #F5F5F5
surface-container-low: #EFEFEF
Cards:              bg-white, border-neutral-200

On-Surface (Title): #1A1A1A
On-Surface-Variant: #6B7280

Primary (Cyan):     #0891B2  ← darkened for light mode contrast
Secondary (Violet): #7C3AED  ← darkened for contrast
```

**Implementation:** Use Tailwind `darkMode: "class"` on `<html>`. Toggle `dark` class via a `ThemeContext` provider.

```jsx
// ThemeContext.jsx
const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

```jsx
// Theme toggle button (in SideNav bottom or BottomNav 5th slot)
<button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
  className="w-10 h-6 rounded-full bg-surface-container-highest relative transition-colors duration-300 focus:outline-none">
  <div className={`absolute top-1 w-4 h-4 rounded-full bg-primary transition-transform duration-300 ${theme === 'dark' ? 'left-1' : 'left-5'}`} />
</button>
```

---

## 10. Do's and Don'ts

### Do
- Use `on-surface-variant` (#ADAAAA) for body text — never pure white
- Use asymmetry: text anchors left, visual elements bleed right
- Embrace negative space — 24px gap is a separator
- Use `primary` (cyan) for all interactive actions and `secondary` (violet) for all AI-generated content
- Apply `rounded-3xl` on large cards, `rounded-xl` on small cards and buttons, `rounded-full` on pills/tags
- Apply `synapse-glow` on every floating/elevated interactive element
- Use skeleton screens on every data fetch — no empty containers, no spinners
- Keep all primary mobile interactions in the bottom 40% of the screen
- Use `font-headline` (Manrope) for all h1-h4 and `font-body` (Inter) for all prose

### Don't
- Never use `border` as a primary separator — use surface tier contrast
- Never use 100% white (#FFF) for body text — only for headings
- Never use high-opacity black shadows — they mud the dark background
- Never mix corner radii within a single card (`rounded-xl` tops + `rounded-none` bottom is fine, but don't do `rounded-xl` top-left and `rounded-2xl` top-right)
- Never use a flat solid color for primary CTAs — always a gradient
- Never show empty loading states — always skeleton
- Don't center content unless it creates intentional drama (landing/onboarding only)
- Don't add borders to navigation items — use background gradients for active state

---

## 11. Final Prompt for AI-Assisted Implementation

Copy and paste the following into Claude Code to begin the UI reskin:

---

> I need you to reskin my existing OpenBrain React PWA using the "Neural Obsidian" design system. This is a **style swap only** — do NOT change any data fetching, routing, state management, or content. Preserve all Supabase queries, TanStack Query hooks, and auth logic.
>
> **Tech stack:** React, Tailwind CSS, Framer Motion, Lucide React (or Material Symbols Outlined), Radix UI / Shadcn UI components.
>
> **Core design system:**
>
> 1. **Dark mode base:** Background `#0E0E0E`. Surface cards `#1A1919` (`rounded-3xl`, `border border-[#484847]/10`). No 1px dividers — use surface tier contrast instead.
> 2. **Accent colors:** Cyan `#72EFF5` (primary — all interactions), Violet `#D575FF` (secondary — AI/intelligence), Rose `#FF9AC3` (tertiary — security/encryption). Never swap these roles.
> 3. **Typography:** `Manrope` (weights 600/700/800) for all headings. `Inter` (weights 400/500/600) for all body/labels. Load both from Google Fonts.
> 4. **Glass panels:** `background: rgba(38,38,38,0.60); backdrop-filter: blur(24px)` for all modals, floating nav, and search bars.
> 5. **Synapse glow:** `box-shadow: 0px 20px 40px rgba(0,0,0,0.4), 0px 0px 20px rgba(114,239,245,0.05)` on all floating/elevated interactive elements.
> 6. **Ambient background:** `radial-gradient` at 8% opacity — cyan top-left, violet bottom-right — on a fixed z-0 layer behind all page content.
>
> **Navigation:**
> - Desktop (≥1024px): Glassmorphic fixed SideNav, 288px wide, with brand header, primary CTA button, nav links (active = cyan left border + cyan/10 bg gradient), user profile + theme toggle at bottom.
> - Mobile (<1024px): Glassmorphic BottomNav pill (`rounded-2xl`, violet glow), 5 tabs with 10px ALL-CAPS labels. Active tab = violet background pill.
> - Theme toggle: Integrated into nav. Uses Tailwind `darkMode: "class"` + ThemeContext provider.
>
> **Per-screen reskin rules:**
> - **Landing:** Full-screen centered, hero logo in glass circle with pulsing orbital rings, gradient H1 text, violet CTA with shine hover effect, 3-column glass feature card footer.
> - **Login:** Single-column, same hero logo (smaller), ALL-CAPS field labels, full-width cyan gradient submit button.
> - **Knowledge Feed / Home:** Sticky glass search+capture bar at top. 12-column bento grid: 8-col editorial hero card + 4-col sidebar. Small bento cards in 3×4-col rows. Wide 12-col integration CTA. Floating Brain-Switch pill (violet glass, bottom center, desktop only).
> - **Ask AI:** User bubbles right-aligned in `surface-container-highest`. AI responses left-aligned in glass panel with cyan top-gradient line. "Intelligence Output" badge in violet above each AI response. Generating state: 3 pulsing cyan dots + "SYNTHESIZING..." caption. Floating glass chat input fixed at bottom.
> - **Collections / Grid:** Card grid with icon + count badge + description. Hover: `border-primary/20`.
> - **Profile:** Large circular avatar with cyan ring. ALL-CAPS field labels. Danger zone in `surface-container-low` with red-tinted text.
> - **Network / Members:** Member cards with progress bar ("Sync Rate") in cyan. Access log at bottom.
> - **Notifications:** Left-border colored toasts grouped by category. Full notification center with filter sidebar on desktop.
> - **All loading states:** Skeleton screens only — `animate-pulse` blocks in `surface-container-highest`. No spinners.
>
> **Accessibility:** WCAG 2.2 — all touch targets minimum 48×48px. Text contrast ≥ 4.5:1.
>
> **Performance:** Skeleton screens on all data fetches. Local storage for theme preference.
>
> Start with `src/index.css` (add CSS primitives), then `tailwind.config.js` (add full token map), then `ThemeContext`, then navigation components, then screens in priority order: Home → Ask AI → Collections → Login → Profile → Network.

---

## Reference Images

All design screenshots are in `new_design/screens/`:

| File | Description |
|---|---|
| `openbrain_home_desktop.png` | Desktop home — bento grid layout + sidenav |
| `desktop_sidenavbar_with_theme_toggle.png` | Desktop sidenav with theme toggle variant |
| `mobile_bottomnavbar_with_theme_toggle.png` | Mobile bottom nav with theme toggle |
| `onboarding_welcome.png` | Welcome / landing screen |
| `openbrain_landing_light_mode.png` | Full landing page in light mode |
| `openbrain_login.png` | Login screen |
| `onboarding_feature_discovery.png` | Onboarding step 2 |
| `onboarding_quick_capture.png` | Onboarding step 3 |
| `onboarding_secure_your_mind.png` | Onboarding step 4 |
| `openbrain_knowledge_feed.png` | Mobile knowledge feed |
| `openbrain_ask_ai.png` | Mobile AI chat interface |
| `openbrain_ask_ai_desktop.png` | Desktop AI chat interface |
| `openbrain_grid_view_1.png` | Mobile collections list |
| `openbrain_grid_view_2.png` | Mobile collections alternate |
| `openbrain_collections_desktop.png` | Desktop collections view |
| `openbrain_create_shared_brain_modal.png` | Create collection modal |
| `openbrain_edit_profile.png` | Profile editor |
| `openbrain_network_nodes.png` | Mobile network/members |
| `openbrain_network_desktop.png` | Desktop network view |
| `notification_center.png` | Full notification center |
| `neural_toast_concept.png` | Toast notification system |
| `openbrain_main_brain_settings.png` | Brain/collection settings |
| `openbrain_ai_configuration.png` | AI model configuration |
| `final_unified_design_guide_light_dark_mode_1.png` | Full design guide page 1 |
| `final_unified_design_guide_light_dark_mode_2.png` | Full design guide page 2 |

---

*Neural Obsidian Design System — "Every pixel should feel intentional, secure, and cutting-edge."*
