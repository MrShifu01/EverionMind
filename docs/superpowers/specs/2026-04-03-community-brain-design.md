# Community Brain Design
**Date:** 2026-04-03
**Status:** Draft

## Problem

OpenBrain currently supports three brain types: **personal**, **family**, and **business**. All three assume a small, known group of people — you either own the brain or are explicitly invited by email.

There is no brain type for **communities**: groups larger than a household but smaller than a company, where membership is more fluid and the value comes from collective knowledge that no single person maintains.

Examples of communities that lose institutional knowledge constantly:
- Body corporates / HOAs — service providers, rules, AGM decisions rotate with committees
- Sports clubs / churches / schools — contacts, event history, supplier lists, venue details
- Stokvels / savings groups — contribution schedules, payout history, member details
- Neighbourhood groups — trusted tradespeople, emergency numbers, load shedding schedules
- Hobby groups / makerspaces — shared tools, supplier discounts, project notes

WhatsApp groups and committee handovers are where this knowledge currently lives and dies.

---

## Solution: Community Brain

A new brain type `"community"` that extends the existing multi-brain architecture with:

1. **Join links** — public or token-gated invite URLs (no email lookup required)
2. **Roles** — admin, contributor, viewer (extends existing owner/member/viewer)
3. **Moderation** — admin approval for new entries (optional, configurable)
4. **Discovery** — optional public listing so users can find and join local communities

---

## Data Model

### Brains table — add type

No schema change needed. The `brains.type` column is already a text field. Add `"community"` to the `validTypes` list in `api/brains.js`:

```js
const validTypes = ["personal", "family", "business", "community"];
```

### New columns on `brains` table

```sql
ALTER TABLE brains
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private'
    CHECK (visibility IN ('private', 'invite_link', 'public')),
  ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS moderation TEXT DEFAULT 'none'
    CHECK (moderation IN ('none', 'admin_approval')),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;
```

| Column | Purpose |
|--------|---------|
| `visibility` | `private` = invite only, `invite_link` = anyone with the link, `public` = discoverable |
| `join_code` | Short unique code for join links (e.g. `ob-dan-pienaar-7x3k`) |
| `moderation` | `none` = anyone can add entries, `admin_approval` = entries queue for admin review |
| `description` | Public-facing description shown on join page and discovery |
| `category` | For discovery: `neighbourhood`, `sports`, `faith`, `savings`, `school`, `hobby`, `other` |

### New: `brain_members` role extension

Current roles: `owner`, `member`, `viewer`.

Add:
- **`admin`** — can approve entries, manage members, edit brain settings (but doesn't own/pay)
- **`contributor`** — can add entries, comment (same as current `member`)

```sql
-- No migration needed if role is already a text field
-- Just update the API validation
```

### New: `pending_entries` table (for moderated brains)

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

---

## API Changes

### `api/brains.js`

#### POST /api/brains — create community brain

Extend existing handler. When `type === "community"`:
- Generate a unique `join_code` (8-char nanoid, prefixed with `ob-`)
- Accept `description`, `category`, `visibility`, `moderation` from body
- Default visibility to `invite_link` for community brains

```js
if (brainType === "community") {
  const { nanoid } = await import("nanoid");
  body.join_code = `ob-${nanoid(8)}`;
  body.visibility = req.body.visibility || "invite_link";
  body.moderation = req.body.moderation || "none";
  body.description = req.body.description?.slice(0, 500) || "";
  body.category = validCategories.includes(req.body.category) ? req.body.category : "other";
}
```

#### POST /api/brains?action=join — join via code

New action. Looks up brain by `join_code`, checks visibility, adds user as contributor:

```js
if (method === "POST" && action === "join") {
  const { code } = req.body;
  // Look up brain by join_code
  // Check visibility !== 'private'
  // Insert into brain_members with role = 'contributor'
  // Return brain object
}
```

#### GET /api/brains?action=discover — public brain directory

New action. Returns public community brains, optionally filtered by category:

```js
if (method === "GET" && action === "discover") {
  const { category } = req.query;
  // SELECT from brains WHERE type='community' AND visibility='public'
  // Optionally filter by category
  // Include member count (subquery or join)
  // Return array
}
```

#### POST /api/brains?action=moderate — approve/reject pending entry

New action for admins:

```js
if (method === "POST" && action === "moderate") {
  const { entry_id, decision } = req.body; // decision: 'approved' | 'rejected'
  // Verify caller is admin or owner of the brain
  // If approved: copy from pending_entries to entries + entry_brains
  // Update pending_entries status
}
```

### `api/capture.js`

Extend to check if the target brain has `moderation === 'admin_approval'` and the user is not an admin/owner. If so, insert into `pending_entries` instead of `entries`.

---

## Frontend Changes

### 1. CreateBrainModal — add Community type

**File:** `src/components/CreateBrainModal.jsx`

Add to `BRAIN_TYPES`:

```js
{ value: "community", label: "Community", emoji: "🏘️", desc: "For neighbourhoods, clubs, stokvels, hobby groups" },
```

When community is selected, show additional fields:
- Description (textarea, 500 chars max)
- Category dropdown (neighbourhood, sports, faith, savings, school, hobby, other)
- Visibility toggle (invite link / public)
- Moderation toggle (open / admin approval)

### 2. JoinBrainModal — new component

**File:** `src/components/JoinBrainModal.jsx`

Simple modal with:
- Input for join code (or paste full URL)
- "Join" button that calls `POST /api/brains?action=join`
- Success state that switches to the joined brain

Accessible from:
- Nav sidebar: "Join a Brain" button (next to "Add Family or Business Brain")
- Direct URL: `/#join/ob-xxxxx` (parsed on app mount)

### 3. CommunityDiscoverView — new view

**File:** `src/views/CommunityDiscoverView.jsx`

Grid of public community brains:
- Card per brain: emoji, name, description, category badge, member count
- Category filter tabs
- "Join" button on each card
- Search by name/description

Accessible from nav sidebar as "Discover Communities".

### 4. ModerationView — new view

**File:** `src/views/ModerationView.jsx`

For community admins. Shows pending entries:
- Entry preview card (title, content, type, submitted by, timestamp)
- Approve / Reject buttons
- Batch approve option
- Badge count in nav sidebar

### 5. BrainSettingsView — new view

**File:** `src/views/BrainSettingsView.jsx`

For community owners/admins:
- Edit name, description, category
- Toggle visibility (private / invite link / public)
- Toggle moderation (open / admin approval)
- Copy join link
- View/manage members (promote to admin, remove)
- Danger zone: delete brain, transfer ownership

### 6. BrainSwitcher — show community brains

Update grouping in dropdown:
- Personal
- Shared (family + business)
- Communities (type === "community")

Each community shows member count badge.

### 7. Nav sidebar updates

Add nav items (shown only when active brain is community type):
- "Moderation" (with pending count badge) — admin/owner only
- "Members" — view who's in the community
- "Settings" — admin/owner only

Add global nav item:
- "Discover Communities" — always visible

---

## Security Considerations

### Access Control

| Action | Who can do it |
|--------|---------------|
| Create community brain | Any authenticated user |
| Join via invite link | Any authenticated user with the code |
| Join public brain | Any authenticated user |
| Add entries (unmoderated) | Contributors, admins, owner |
| Add entries (moderated) | Admins and owner directly; contributors go to pending |
| Approve/reject pending | Admins and owner only |
| Edit brain settings | Admins and owner only |
| Manage members | Admins and owner only |
| Delete brain | Owner only |
| Remove members | Admins and owner (admins can't remove other admins) |

### Rate limiting

- Join: 10 joins per hour per user (prevent mass-joining bots)
- Create community: 5 per day per user
- Pending entries: max 50 per brain in queue (prevent spam flooding)

### Content moderation

- Moderation mode is the first line of defence for community quality
- Future: add reporting mechanism for entries and members
- Future: AI-assisted content screening before submission

---

## User Flows

### Flow 1: Create a neighbourhood brain

1. User taps hamburger menu -> "Add Family or Business Brain" (relabelled to "Add Brain")
2. Selects "Community" type
3. Fills in: name ("Dan Pienaar Neighbourhood"), description, category (neighbourhood)
4. Chooses visibility: "Invite Link" and moderation: "Open"
5. Brain created -> gets join link to share in WhatsApp group
6. Other neighbours click link -> join -> start adding entries

### Flow 2: Join via link

1. User receives link: `openbrain.app/#join/ob-dp7x3k`
2. Opens app -> JoinBrainModal appears -> confirms join
3. Brain appears in BrainSwitcher under "Communities"
4. User can browse existing entries and add new ones

### Flow 3: Moderated community

1. Admin creates stokvel brain with moderation enabled
2. Member submits entry: "Monthly contribution: R500, due 15th"
3. Entry goes to `pending_entries`, admin sees badge in nav
4. Admin opens Moderation view -> approves entry -> entry moves to main brain
5. All members can now see it

### Flow 4: Discover public communities

1. User taps "Discover Communities" in nav
2. Browses public brains by category
3. Finds "Bloem Runners Club" -> taps "Join"
4. Gets immediate access to club contacts, route maps, event schedule

---

## Entry Types — Community-Specific Patterns

Community brains benefit from the same entry types, but some patterns emerge:

| Entry Type | Community Use Case |
|------------|-------------------|
| Contact | Trusted service providers, committee members, emergency numbers |
| Reminder | AGM dates, payment deadlines, event schedules |
| Decision | Meeting outcomes, rule changes, policy updates |
| Document | Constitution, rules, permits, insurance policies |
| Place | Venues, meeting rooms, parking info |
| Person | Committee roles, key contacts with roles annotated |
| Idea | Proposals for community vote, event suggestions |
| Note | General info: gate codes, WiFi passwords, procedures |

No new entry types needed. The existing types cover community use cases well.

---

## Migration Path

### Phase 1 — Core (MVP)
- Add `"community"` to valid brain types
- Add `join_code`, `visibility`, `description`, `category` columns
- Join-by-code API and frontend
- Community option in CreateBrainModal
- JoinBrainModal component

### Phase 2 — Moderation
- `pending_entries` table
- Moderation API endpoints
- ModerationView component
- Modified capture flow for moderated brains

### Phase 3 — Discovery
- Public brain visibility
- Discover API endpoint
- CommunityDiscoverView
- Category browsing and search

### Phase 4 — Community Management
- BrainSettingsView
- Member management (promote, remove)
- Admin role support
- Transfer ownership

### Phase 5 — Scale & Trust
- Reporting mechanism (flag entries, flag members)
- AI content screening
- Community analytics (growth, activity, top contributors)
- Community brain templates (pre-built category suggestions)
