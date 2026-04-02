# OpenBrain — Product Roadmap

## Vision

OpenBrain starts as a personal second brain, then expands to shared brains for families and businesses, and ultimately becomes a platform where anyone can create their own OpenBrain with optional shared spaces.

---

## Phase 1: Personal Brain (Current)

**Status: Built**

Single-user personal knowledge base with AI-powered capture, connections, search, and chat.

- Quick capture with AI classification
- Connection discovery between entries
- Fuzzy search, daily digest, data export
- Fill Brain guided knowledge building

---

## Phase 2: Family Shared Brain

**Goal:** A second brain that the whole family contributes to and benefits from.

### What changes:

**New concept: Brains**
- Each user has a **Personal Brain** (private, only they see it)
- A user can create or join a **Shared Brain** (e.g. "Stander Family")
- Entries belong to a brain, not just a user
- Users can copy/move entries between their personal brain and a shared brain

**Family use cases:**
- Emergency contacts everyone can access
- Medical aid details, doctor info, allergies
- Home maintenance contacts (plumber, electrician, gardener)
- Important documents (home insurance policy number, alarm company code)
- Shared grocery/shopping lists
- Family calendar events and reminders
- Kids' school info, teacher contacts, schedule
- Vehicle details (registration, service due dates, insurance)
- WiFi passwords, gate codes, alarm codes

**Permissions model:**
- Brain owner: full control, can invite/remove members
- Member: can view, add, edit entries in the shared brain
- Viewer: read-only access (e.g. for kids or extended family)

**Key UX decisions:**
- Brain switcher in the header: "Chris's Brain" | "Stander Family" | "Smash Burger Bar"
- When capturing, choose which brain it goes to (default to last used)
- Notifications when someone adds to a shared brain you're in
- Each brain has its own connection graph

### Database changes needed:

```sql
-- Brains table
CREATE TABLE brains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'personal', -- 'personal' | 'shared'
  created_at timestamptz DEFAULT now()
);

-- Brain membership
CREATE TABLE brain_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id uuid REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member', -- 'owner' | 'member' | 'viewer'
  joined_at timestamptz DEFAULT now(),
  UNIQUE(brain_id, user_id)
);

-- Add brain_id to entries
ALTER TABLE entries ADD COLUMN brain_id uuid REFERENCES brains(id);

-- Add brain_id to links
ALTER TABLE links ADD COLUMN brain_id uuid REFERENCES brains(id);

-- Row-level security: users can access entries in brains they belong to
CREATE POLICY "Brain member access" ON entries
  FOR ALL USING (
    brain_id IN (
      SELECT brain_id FROM brain_members WHERE user_id = auth.uid()
    )
  );
```

### Migration path:
1. Create a default "personal" brain for every existing user
2. Move all existing entries under their personal brain
3. Add brain switcher to the UI
4. Add invite flow (email-based)

---

## Phase 3: Business Shared Brain

**Goal:** Teams and businesses share operational knowledge.

### What's different from family:

- **Role-based access**: Owner, Manager, Staff — managers can edit, staff can view
- **Entry categories matter more**: suppliers, SOPs, recipes, contacts, schedules
- **Audit trail**: who added/edited what and when (entry history already exists)
- **Templates per business type**: restaurant, retail, services, etc.

### Restaurant-specific features (Smash Burger Bar as template):
- Supplier directory with reorder actions
- Recipe/prep notes (not for public, internal only)
- Staff contact list
- Opening/closing checklists (tied to Todos)
- Equipment inventory with warranty dates
- Cost tracking per supplier/ingredient

### Additional database changes:

```sql
-- Activity log for shared brains
CREATE TABLE brain_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id uuid REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  action text NOT NULL, -- 'created' | 'updated' | 'deleted' | 'connected'
  entry_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Brain settings (templates, defaults)
CREATE TABLE brain_settings (
  brain_id uuid REFERENCES brains(id) ON DELETE CASCADE PRIMARY KEY,
  settings jsonb DEFAULT '{}'::jsonb
);
```

---

## Phase 4: Platform — Open to New Users

**Goal:** Anyone can sign up and build their own OpenBrain.

### What changes:

**Onboarding flow:**
1. Sign up (email/Google/Apple)
2. Personal brain created automatically
3. Guided setup: "What do you want to remember?" (pre-selects relevant Fill Brain categories)
4. Optional: create a shared brain for family or business
5. Invite others

**Monetisation options:**
- **Free tier**: 1 personal brain, 100 entries, basic AI (limited Haiku calls/day)
- **Pro tier** (~R99/month or $5/month): unlimited entries, unlimited AI, 2 shared brains, data export
- **Team tier** (~R199/month or $10/month): unlimited shared brains, role-based access, activity log, priority support

**Platform concerns:**
- Multi-tenant: all data isolated by brain_id + user_id
- Rate limiting per user (already have rateLimit.js)
- API key management: shared Anthropic key with per-user quotas, or let users BYO key
- Data privacy: entries are private by default, shared only within explicit brain memberships
- POPIA/GDPR compliance: data export (already built), account deletion, privacy policy
- Abuse prevention: content moderation on shared brains

**Infrastructure scaling:**
- Supabase handles auth + DB + RLS out of the box
- Anthropic API costs scale with users — need per-user call budgets
- Consider caching AI responses (same question asked twice shouldn't cost twice)
- CDN for static assets (Vercel already handles this)

**Landing page:**
- "Your second brain — for you, your family, your business"
- Demo video showing capture → connection → recall
- Pricing table
- "Start free" CTA

---

## Phase 5: Future Ideas (Long-term)

- **Mobile app** (React Native or Capacitor wrapper of the PWA)
- **WhatsApp bot**: forward messages to OpenBrain, it captures automatically
- **Gmail integration**: auto-capture important emails (receipts, confirmations, bookings)
- **Calendar sync**: pull Google Calendar events as reminder entries
- **POS integration**: auto-capture daily sales, stock levels (for restaurant brain)
- **AI agents**: "Every Monday, summarise what changed in the business brain and send to the team"
- **Public brains**: opt-in shareable knowledge bases (e.g. "Best restaurants in Bloemfontein")
- **API access**: let developers build on top of OpenBrain data

---

## Guiding Principles

1. **Capture should be effortless** — if it takes more than 5 seconds, people won't do it
2. **The AI should think for you** — classify, connect, remind, surface — not just store
3. **Shared doesn't mean complicated** — inviting someone should be as easy as sharing a WhatsApp link
4. **Your data is yours** — export everything, delete everything, no lock-in
5. **Start simple, grow with the user** — a new user sees a clean personal brain, not a complex platform
