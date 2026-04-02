
# OpenBrain — Integrations Roadmap

> Vision: OpenBrain becomes the single living brain for Chris's life and business — passively pulling in data from every system he uses, surfacing what matters, and auto-generating todos and reminders without manual capture.

---

## Current State

- Manual capture via Quick Capture bar (AI-parsed to structured entries)
- Fill Brain: 1000 curated questions + AI-generated gap questions
- Supabase for persistent storage
- Chat interface to query the brain
- Calendar + Todo views (manual, local)

---

## Phase 1 — Gmail Integration

**Goal:** Automatically capture important emails as brain entries and generate todos from action items.

### What it would do
- Connect Gmail via OAuth (Google API)
- Scan for: invoices, supplier confirmations, compliance deadlines, staff issues, bank notifications
- Auto-create brain entries from emails with relevant metadata
- Flag emails containing action items → add to Todo list automatically

### Key questions to answer
- Which labels/senders to watch (e.g. suppliers, bank, SARS, staff)
- How often to sync (realtime webhook vs. polling every X minutes)
- How to handle duplicates

### Tech path
- Google OAuth 2.0 + Gmail API (`gmail.readonly` scope)
- Vercel cron job to poll every 15 min, or Gmail push notifications via Pub/Sub
- Anthropic to classify and extract from email body

---

## Phase 2 — Google Calendar Integration

**Goal:** Show real calendar events in the OpenBrain Calendar view and auto-generate todos from upcoming events.

### What it would do
- Pull events from Google Calendar into the Calendar view
- Events with prep time (supplier meetings, tax deadlines, licence renewals) generate advance todos
- Reminders already in the brain (e.g. driving licence renewal) sync back to Google Calendar

### Tech path
- Google Calendar API (`calendar.readonly` scope)
- Bidirectional sync: brain reminders → Google Calendar, Google events → brain timeline
- Webhook for real-time event changes

---

## Phase 3 — POS Integration (SmashPOS / current POS)

**Goal:** Auto-populate business metrics, flag anomalies, and generate operational todos from daily trading data.

### What it would do
- Pull daily/weekly sales summaries into brain as metric entries
- Track: revenue vs target, top sellers, slow movers, voids, staff performance
- Auto-generate todos: "Stock running low on X", "Tuesday was 40% down vs last week — investigate"
- Eventually feed SmashPOS data directly once SmashPOS is live

### Tech path
- Depends on current POS export capability (CSV, API, or webhook)
- Intermediate step: manual CSV upload that gets AI-parsed
- Long-term: SmashPOS native API endpoint

---

## Phase 4 — Accounting / Xero Integration

**Goal:** Keep financial brain entries up to date — outstanding invoices, VAT periods, payroll due dates.

### What it would do
- Pull outstanding supplier invoices → todos with due dates
- VAT return period end → advance reminder todo
- Monthly P&L summary → brain metric entry
- Cashflow alerts: "bank balance below R X" → high priority todo

### Tech path
- Xero API (OAuth 2.0)
- Webhook for invoice status changes
- Monthly cron for P&L snapshot

---

## Phase 5 — WhatsApp / Telegram Capture

**Goal:** Capture voice notes, photos, and quick messages sent to OpenBrain from anywhere.

### What it would do
- Dedicated WhatsApp number or Telegram bot
- Send a photo of a document → parsed and stored
- Voice note → transcribed and added as brain entry
- Works when away from the app (travelling, at the restaurant)

### Tech path
- Telegram Bot API (already partially integrated)
- WhatsApp Business API via Twilio or Meta
- Anthropic vision for document photos, Whisper for voice

---

## Phase 6 — Unified Auto-Todo Engine

**Goal:** The Todo list requires zero manual input — it is assembled automatically from all connected sources.

### Sources that feed todos
| Source | Example todo generated |
|--------|----------------------|
| Gmail | "Reply to Bidfoods re: price increase" |
| Google Calendar | "Prep for liquor licence renewal — due in 14 days" |
| POS | "Investigate Tuesday drop — revenue 40% below average" |
| Xero | "Pay Ehrlichpark invoice — due Friday" |
| Brain reminders | "DLTC renewal process — start by August" |
| AI gap analysis | "You haven't updated staff list in 60 days" |

### Priority logic
- Due date proximity
- Financial impact
- Compliance risk (fines, licence loss)
- AI-inferred importance from brain context

---

## Implementation Notes

- All integrations run as Vercel serverless functions on cron schedules
- OAuth tokens stored encrypted in Supabase (never in client code)
- Each integration is opt-in — user connects via Settings view
- All auto-captured entries are tagged with their source (`gmail`, `calendar`, `pos`, etc.) for filtering

---

*Last updated: 2026-04-02*
