# CSP Inline Style Migration Plan

Source finding: `EverionMindLaunch/Audits/audit-production-hardening-2026-05-06.md` P2-8.

Current state: `vercel.json` still requires:

```txt
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

Reason: the React app uses inline `style={{ ... }}` heavily for layout,
token colors, dynamic transforms, drag positions, canvas overlays, and small
one-off spacing. A May 7 inventory found more than 100 `.tsx` files with inline
style props. Removing `'unsafe-inline'` directly would break production UI.

## Target CSP

```txt
style-src 'self' https://fonts.googleapis.com
```

Optional interim if runtime-injected style tags need a nonce:

```txt
style-src 'self' 'nonce-{requestNonce}' https://fonts.googleapis.com
```

Do not add `'unsafe-hashes'` as the default migration path; it is brittle for a
Vite/React app with frequent class and style churn.

## Migration Phases

### Phase 1 — Stop adding new inline style debt

- Add an ESLint rule or local script that counts `style={{` by file.
- Allow existing files temporarily via a generated baseline.
- Fail CI only when new files or increased counts add inline style debt.
- Prefer class names backed by `src/index.css` and design tokens.

### Phase 2 — Extract repeated inline patterns

Priority files by current count:

- `src/components/settings/AdminTab.tsx`
- `src/views/Landing.tsx`
- `src/components/settings/ProfileTab.tsx`
- `src/LoginScreen.tsx`
- `src/components/settings/GmailSyncTab.tsx`
- `src/views/TodoSomedayTab.tsx`
- `src/views/DetailModal.tsx`
- `src/views/TodoView.tsx`
- `src/components/settings/ClaudeCodeTab.tsx`
- `src/views/VaultUnlocked.tsx`

Extract these first because they represent the largest repeated patterns:

- `display: flex/grid`, `gap`, `alignItems`, `justifyContent`
- text color and font-size token usage
- card borders/backgrounds
- small margin/padding rhythm
- modal/sheet max-width and overflow rules

### Phase 3 — Keep only genuinely dynamic styles

Some inline styles are legitimate runtime values and need a different treatment:

- drag/swipe transforms
- progress widths
- canvas or graph coordinates
- dynamic color swatches
- measured heights/positions

For these, prefer CSS custom properties set through a typed helper:

```tsx
style={cssVars({ "--progress": `${pct}%` })}
```

Then migrate CSS to consume variables from classes:

```css
.progressBar { width: var(--progress); }
```

This still uses the `style` attribute, so it does not by itself remove the need
for `'unsafe-inline'`; it narrows the remaining surface to explicit dynamic
variables before the nonce phase.

### Phase 4 — Add nonce support only if needed

If third-party or framework-injected style tags remain, add per-request nonces:

- Generate a nonce in Vercel middleware or server response layer.
- Inject it into CSP as `style-src 'self' 'nonce-{nonce}' https://fonts.googleapis.com`.
- Ensure any runtime-injected `<style>` tags receive the nonce.

Do this after class extraction. Nonces do not fix React `style` attributes.

### Phase 5 — Remove `'unsafe-inline'`

Acceptance criteria:

- `rg -n "style=\\{\\{" src -g "*.tsx"` returns only approved dynamic-style
  exceptions, with a tracking comment or helper.
- Production build passes.
- Visual smoke test covers login, capture, settings, Gmail staging, chat,
  detail modal, vault, todo, graph, and mobile shell.
- CSP report-only has run in production for at least 7 days with no style
  violations from normal user flows.

## Tracking

Keep this as the canonical plan until the CSP row is removed from the launch
checklist. Update this document when the inline-style baseline changes.
