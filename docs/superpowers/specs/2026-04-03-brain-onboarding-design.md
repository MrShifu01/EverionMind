# Brain Onboarding Design
**Date:** 2026-04-03
**Status:** Approved

## Problem

Two gaps in the current new-user experience:

1. Personal brains are never auto-created. A brand-new user lands on the app with no active brain — `useBrain` falls back to `null`, entries don't load, and the app shows nothing useful.
2. After creating a family or business brain, users get no guidance on what to fill in first.

## Scope (Option B)

- Personal brain auto-created via Supabase trigger on signup
- Post-creation tip card after family/business brain creation
- Invite-aware onboarding deferred until the invite-accept frontend flow is built

---

## Part 1: Personal Brain Auto-Creation

### Migration: `supabase/migrations/003_personal_brain_trigger.sql`

A Postgres function + trigger fires `AFTER INSERT ON auth.users` and creates a personal brain for every new user:

```sql
CREATE OR REPLACE FUNCTION create_personal_brain_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO brains (name, owner_id, type)
  VALUES ('My Brain', NEW.id, 'personal');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_personal_brain_for_new_user();
```

### API fix: `api/brains.js`

Add `"personal"` to `validTypes` so the type is not silently coerced if a personal brain ever needs to be created via API in future:

```js
const validTypes = ["personal", "family", "business"];
```

### Frontend: `src/hooks/useBrain.js`

No changes needed. Already defaults to `data.find(b => b.type === "personal")` as the active brain.

---

## Part 2: Post-Creation Tip Card

### Behaviour

- Appears inline (not a modal) after `CreateBrainModal` calls `onCreate` successfully
- Positioned above the entry grid in `OpenBrain.jsx`
- Dismissed by × button or by clicking "Start filling →" (which also switches to Fill Brain view)
- In-session only — not persisted to localStorage

### Content

**Family brain:**
- Emergency contacts for each family member
- Medical aid numbers & blood types
- School names, contacts & pickup rules
- Home insurance policy & emergency numbers

**Business brain:**
- Key supplier contacts & account numbers
- Staff names, roles & emergency contacts
- Licences, registration numbers & renewal dates
- SOPs for your most common tasks

### Implementation

**`src/components/BrainTipCard.jsx`** — new file, ~60 lines, purely presentational. Props: `brain`, `onDismiss`, `onFill`.

**`src/OpenBrain.jsx`** — add `showBrainTip` state (null or brain object). Set it in the `onCreate` callback from `CreateBrainModal`. Render `<BrainTipCard>` when non-null. Clear it on dismiss or Fill Brain navigation.

**`src/components/CreateBrainModal.jsx`** — no changes. Already passes brain object back via `onCreate(brain, brainType)`.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/003_personal_brain_trigger.sql` | New — trigger to auto-create personal brain |
| `api/brains.js` | Add `"personal"` to validTypes |
| `src/components/BrainTipCard.jsx` | New — tip card component |
| `src/OpenBrain.jsx` | Add `showBrainTip` state + render BrainTipCard |

## Out of Scope

- Invite-aware onboarding (deferred — invite-accept frontend flow not yet built)
- Retroactively creating personal brains for existing users who signed up before this migration (handle separately if needed)
