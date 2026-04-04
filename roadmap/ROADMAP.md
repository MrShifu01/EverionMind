# OpenBrain Roadmap

## Shipped

- [x] **Core App** — Capture, search, graph, timeline, calendar, chat
- [x] **AI Parsing** — Claude-powered entry extraction from text, voice, images
- [x] **Multi-Brain** — Personal, Family, Business brains with role-based sharing
- [x] **Offline-First** — IndexedDB queue with auto-sync on reconnect
- [x] **Onboarding** — 30 starter questions, brain type selection, guided setup
- [x] **PIN Security** — Sensitive content gating with PIN/biometric
- [x] **Mobile UI Fix** — Responsive layout, overflow fixes, sync reliability

## In Progress

### Community Brain
**Spec:** `docs/superpowers/specs/2026-04-03-community-brain-design.md`
**Plan:** `docs/superpowers/plans/2026-04-03-community-brain.md`

A new brain type for groups larger than a household — neighbourhoods, clubs, stokvels, schools, hobby groups. Enables shared collective memory with join links, optional moderation, and public discovery.

| Phase | What | Status |
|-------|------|--------|
| Phase 1 | Community type + join links | Planned |
| Phase 2 | Moderation (admin approval queue) | Planned |
| Phase 3 | Discovery (browse public communities) | Planned |
| Phase 4 | Community management (settings, members) | Planned |
| Phase 5 | Scale & trust (reporting, AI screening) | Future |

**Why it matters:** Communities lose institutional knowledge every time a committee rotates, a WhatsApp group gets buried, or a key person leaves. A community brain is permanent collective memory.

## Planned

### Push Notifications
**Spec:** `docs/superpowers/specs/2026-04-03-push-notifications-design.md`

Proactive reminders for expiring documents, upcoming deadlines, and stale entries. Web Push API via service worker.

### Smart Suggestions
AI-driven prompts to fill gaps in your brain — "You have 8 suppliers but no insurance provider. Want to add one?"

### Data Export
Full brain export to CSV, JSON, or PDF. Critical for community brain committee handovers and personal data portability.

### Entry Attachments
File uploads (PDFs, images, receipts) attached to entries. Stored in Supabase Storage.

### Recurring Reminders
Repeating reminders with cron-like schedules — monthly rent, annual licence renewals, weekly supplier orders.

## Future Ideas

- **Brain Templates** — Pre-built brain structures for common use cases (Body Corporate, Sports Club, New Home)
- **Entry Comments** — Discussion threads on shared brain entries
- **Activity Feed** — Timeline of changes across shared brains
- **AI Insights** — Weekly digest of patterns, anomalies, and recommendations
- **Cross-Brain Links** — Connect entries across different brains (personal supplier linked to business brain)
- **Mobile App** — Native iOS/Android wrapper with offline support and biometric auth
- **API Access** — Public API for power users to integrate OpenBrain with other tools
