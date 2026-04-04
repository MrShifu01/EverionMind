# Community Brain Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-04-03-community-brain-design.md`

**Goal:** Add a `community` brain type with join links, optional moderation, and public discovery — enabling neighbourhoods, clubs, stokvels, and hobby groups to build shared knowledge.

**Architecture:** Extends the existing multi-brain system. Community brains use the same `brains` table with new columns for visibility, join codes, and moderation settings. A new `pending_entries` table handles moderated submissions. The frontend gets three new views (Join, Moderation, Discover) and extends existing components.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `api/brains.js` | Add community create, join, discover, moderate actions |
| Modify | `api/capture.js` | Route to pending_entries for moderated brains |
| Create | `supabase/migrations/004_community_brain.sql` | Schema: new columns + pending_entries table |
| Modify | `src/components/CreateBrainModal.jsx` | Add community type + extra fields |
| Create | `src/components/JoinBrainModal.jsx` | Join-by-code modal |
| Create | `src/views/CommunityDiscoverView.jsx` | Browse public community brains |
| Create | `src/views/ModerationView.jsx` | Admin pending entry review |
| Create | `src/views/BrainSettingsView.jsx` | Community settings + member management |
| Modify | `src/components/BrainSwitcher.jsx` | Group community brains separately |
| Modify | `src/OpenBrain.jsx` | Wire new views, nav items, join-link routing |

---

## Phase 1: Core — Community Brain Type + Join Links

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/004_community_brain.sql`

- [ ] **Step 1: Add columns to brains table**

```sql
ALTER TABLE brains
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private'
    CHECK (visibility IN ('private', 'invite_link', 'public')),
  ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS moderation TEXT DEFAULT 'none'
    CHECK (moderation IN ('none', 'admin_approval')),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_brains_join_code ON brains(join_code) WHERE join_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brains_community_public ON brains(type, visibility) WHERE type = 'community' AND visibility = 'public';
```

- [ ] **Step 2: Create pending_entries table**

```sql
CREATE TABLE IF NOT EXISTS pending_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'note',
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_pending_entries_brain ON pending_entries(brain_id, status);
```

Run migration against Supabase. Verify columns exist with a test query.

---

### Task 2: API — community brain creation + join

**Files:**
- Modify: `api/brains.js`

- [ ] **Step 1: Add `"community"` to validTypes**

In `api/brains.js`, line 73, update:

```js
const validTypes = ["personal", "family", "business", "community"];
```

- [ ] **Step 2: Generate join_code for community brains**

In the POST create handler, after building the body, add:

```js
if (brainType === "community") {
  const code = crypto.randomUUID().slice(0, 8);
  body.join_code = `ob-${code}`;
  body.visibility = ["private", "invite_link", "public"].includes(req.body.visibility) ? req.body.visibility : "invite_link";
  body.moderation = ["none", "admin_approval"].includes(req.body.moderation) ? req.body.moderation : "none";
  body.description = (req.body.description || "").slice(0, 500);
  const validCategories = ["neighbourhood", "sports", "faith", "savings", "school", "hobby", "other"];
  body.category = validCategories.includes(req.body.category) ? req.body.category : "other";
}
```

- [ ] **Step 3: Add join action**

New handler: `POST /api/brains?action=join`

```js
if (method === "POST" && action === "join") {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Join code required" });

  // Look up brain by join_code
  const brainRes = await fetch(
    `${SB_URL}/rest/v1/brains?join_code=eq.${encodeURIComponent(code)}&select=*`,
    { headers: hdrs() }
  );
  const brains = await brainRes.json();
  if (!brains.length) return res.status(404).json({ error: "Brain not found" });

  const brain = brains[0];
  if (brain.visibility === "private") return res.status(403).json({ error: "This brain is private" });

  // Check if already a member
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/brain_members?brain_id=eq.${brain.id}&user_id=eq.${user.id}`,
    { headers: hdrs() }
  );
  const existing = await existingRes.json();
  if (existing.length || brain.owner_id === user.id) {
    return res.status(200).json({ ...brain, myRole: existing[0]?.role || "owner", already_member: true });
  }

  // Add as contributor
  await fetch(`${SB_URL}/rest/v1/brain_members`, {
    method: "POST",
    headers: hdrs({ "Prefer": "resolution=ignore-duplicates" }),
    body: JSON.stringify({ brain_id: brain.id, user_id: user.id, role: "contributor" }),
  });

  console.log(`[audit] JOIN community brain=${brain.id} user=${user.id}`);
  return res.status(200).json({ ...brain, myRole: "contributor" });
}
```

- [ ] **Step 4: Add discover action**

New handler: `GET /api/brains?action=discover`

```js
if (method === "GET" && action === "discover") {
  const { category } = req.query;
  let url = `${SB_URL}/rest/v1/brains?type=eq.community&visibility=eq.public&order=created_at.desc&limit=50`;
  if (category && category !== "all") url += `&category=eq.${encodeURIComponent(category)}`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) return res.status(502).json({ error: "Failed to fetch communities" });
  return res.status(200).json(await r.json());
}
```

Test: create a community brain via API, verify join_code is set, join from another user.

---

### Task 3: Frontend — CreateBrainModal community type

**Files:**
- Modify: `src/components/CreateBrainModal.jsx`

- [ ] **Step 1: Add community to BRAIN_TYPES**

```js
const BRAIN_TYPES = [
  { value: "family", label: "Family", emoji: "🏠", desc: "For household, kids, shared finances, emergencies" },
  { value: "business", label: "Business", emoji: "🏪", desc: "For staff, suppliers, SOPs, costs, licences" },
  { value: "community", label: "Community", emoji: "🏘️", desc: "For neighbourhoods, clubs, stokvels, hobby groups" },
];
```

- [ ] **Step 2: Add community-specific fields**

When `brainType === "community"`, show below the name input:
- `description` textarea (placeholder: "What's this brain for?")
- `category` select (neighbourhood, sports, faith, savings, school, hobby, other)
- `visibility` toggle: "Invite link" / "Public"
- `moderation` toggle: "Open" / "Admin approval"

- [ ] **Step 3: Pass extra fields to API**

In `handleCreate`, include the extra fields in the POST body when `brainType === "community"`.

- [ ] **Step 4: Show join link after creation**

After community brain is created, show a "Share this link" card with the join URL and a copy button.

---

### Task 4: Frontend — JoinBrainModal

**Files:**
- Create: `src/components/JoinBrainModal.jsx`

- [ ] **Step 1: Create JoinBrainModal component**

Modal with:
- Text input for join code (accepts full URL or just `ob-xxxxx`)
- Parse logic: extract code from URL like `openbrain.app/#join/ob-xxxxx`
- "Join" button -> `POST /api/brains?action=join`
- Loading state, error handling
- Success: show brain name + switch to it

- [ ] **Step 2: Wire into OpenBrain.jsx**

Add state: `const [showJoinBrain, setShowJoinBrain] = useState(false);`

Add button in nav sidebar:

```jsx
<button onClick={() => { setNavOpen(false); setShowJoinBrain(true); }}>
  Join a Community Brain
</button>
```

Render the modal:

```jsx
{showJoinBrain && <JoinBrainModal onClose={() => setShowJoinBrain(false)} onJoined={(brain) => { ... }} />}
```

- [ ] **Step 3: Handle join links on mount**

In `useEffect` on mount, check `window.location.hash` for `#join/ob-xxxxx` pattern. If found, auto-open JoinBrainModal with the code pre-filled.

Test: create community brain, copy join link, open in new tab, verify join flow works.

---

## Phase 2: Moderation

### Task 5: API — moderation endpoints

**Files:**
- Modify: `api/capture.js`
- Modify: `api/brains.js`

- [ ] **Step 1: Route captures to pending_entries for moderated brains**

In `api/capture.js`, before inserting into `entries`:
1. Look up the target brain's `moderation` setting
2. Check if the user is admin/owner
3. If brain is moderated AND user is contributor (not admin/owner), insert into `pending_entries` instead
4. Return `{ pending: true, id: pending_entry_id }`

- [ ] **Step 2: Add moderate action**

`POST /api/brains?action=moderate` — approve or reject:
- Verify caller is admin/owner of the brain
- If approved: copy entry from `pending_entries` to `entries`, link via `entry_brains`
- Update `pending_entries.status` and `reviewed_by`/`reviewed_at`

- [ ] **Step 3: Add pending count endpoint**

`GET /api/brains?action=pending_count&brain_id=...` — returns count of pending entries for badge display.

---

### Task 6: Frontend — ModerationView

**Files:**
- Create: `src/views/ModerationView.jsx`

- [ ] **Step 1: Build ModerationView**

List of pending entries:
- Card per entry: type icon, title, content preview, submitted by, timestamp
- Approve (green) / Reject (red) buttons per card
- Batch approve checkbox + button
- Empty state: "No entries waiting for review"

- [ ] **Step 2: Wire into nav**

Show "Moderation" nav item when active brain is community AND user is admin/owner. Show badge with pending count.

---

## Phase 3: Discovery

### Task 7: Frontend — CommunityDiscoverView

**Files:**
- Create: `src/views/CommunityDiscoverView.jsx`

- [ ] **Step 1: Build discover view**

Grid layout:
- Card per public community brain: emoji, name, description, category badge, member count
- Category filter tabs at top
- Search input for name/description
- "Join" button on each card -> calls join API -> switches brain

- [ ] **Step 2: Add to nav**

Add "Discover" nav item (always visible). Icon: `🔍` or `🏘️`.

---

## Phase 4: Community Management

### Task 8: Frontend — BrainSettingsView

**Files:**
- Create: `src/views/BrainSettingsView.jsx`

- [ ] **Step 1: Build settings view**

Sections:
- **Details**: Edit name, description, category (auto-saves on blur)
- **Access**: Visibility toggle, join link with copy button, regenerate link option
- **Moderation**: Toggle admin approval on/off
- **Members**: List with role badges, promote/demote/remove actions
- **Danger zone**: Delete brain (with confirmation), transfer ownership

- [ ] **Step 2: Wire into nav**

Show "Settings" nav item when active brain is community AND user is admin/owner.

---

## Phase 5: Scale & Trust (Future)

These items are deferred and not part of the initial build:

- [ ] **Reporting**: Flag button on entries and members -> `reports` table -> admin review
- [ ] **AI screening**: Pre-submission content check via Claude for spam/abuse
- [ ] **Analytics**: Community dashboard — growth chart, activity heatmap, top contributors
- [ ] **Templates**: Pre-built community brain templates (e.g. "Body Corporate" with suggested categories and starter questions)
- [ ] **Notifications**: Push notifications for new entries, moderation requests, join events
- [ ] **Export**: Community data export for committee handovers (CSV/PDF)
