# Flexible Entry Types + Vault Auto-Routing — Design Spec
**Date:** 2026-04-07

## Problem

1. `TC` in `constants.ts` acts as a whitelist — unknown AI-generated types render without icon/colour.
2. VaultView filters `e.type === "secret"` — any non-"secret" encrypted entry is invisible.
3. Type filter chips in VaultView/UI are hardcoded from TC keys.
4. When AI captures a "secret" entry type, it goes to regular entries — not the vault.

---

## Design

### 1. `getTypeConfig(type: string): TypeConfig`

New function in `src/data/constants.ts`:

```ts
// Fallback config for unknown types — derive colour from type string hash
export function getTypeConfig(type: string): TypeConfig {
  if (TC[type]) return TC[type];
  // Deterministic colour from type string
  const colours = ["#9B59B6","#E67E22","#27AE60","#2980B9","#E74C3C","#16A085","#8E44AD","#D35400"];
  const idx = type.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colours.length;
  return { i: "🏷️", c: colours[idx] };
}
```

All components currently accessing `TC[entry.type]` switch to `getTypeConfig(entry.type)`.

### 2. Dynamic Type Filter Chips

Components showing type filters (VaultView, SuggestionsView, etc.) derive available types from actual entry data:

```ts
const availableTypes = [...new Set(entries.map(e => e.type))].sort();
```

No hardcoded lists. TC icons/colours used when known, `getTypeConfig` fallback otherwise.

### 3. Secret Auto-Routing

**Client-side (QuickCapture):** After AI parses captured text, if `parsed.type === "secret"`, set a flag before calling `/api/capture`. The capture request proceeds normally (type="secret" is stored as-is). The UI then:
- Shows "Saved to Vault" toast instead of regular "Saved" toast
- Triggers a vault refresh (via `onEntryCreated` callback that checks type)
- Does NOT show the entry in the regular entry grid

**VaultView:** Remove the hard filter `e.type === "secret"`. Instead, `secrets` is all entries where `entry.encrypted === true`. The type label is displayed dynamically using `getTypeConfig`.

**Server (api/capture.ts):** No change needed — type is already stored as-is. The "secret" type flows through unchanged.

### 4. TC stays as known-type icon map

TC is not deleted — it's the source of truth for well-known icons. It can grow as new common types emerge. Unknown types gracefully fall back.

---

## Tests

- `tests/lib/getTypeConfig.test.ts` — returns TC entry for known types, deterministic fallback for unknown
- `tests/components/QuickCapture.test.tsx` — secret type triggers vault routing flag
- VaultView renders dynamic type filters from entry data (not hardcoded)
