# SmashOS Decisions Log

## 2026-04-24 — Second Brain Intelligence Pack

- **NLP parser extracted** to `src/lib/nlpParser.ts` — priority (p1-p4), tags (#label), energy (!high/!med/!low), dates (chrono-node)
- **Karma system** in `src/lib/karma.ts` — localStorage, +10pts per completion, streak by consecutive day
- **TodoRowItem** component — pointer-event swipe gestures (no framer-motion), swipe-right=complete, swipe-left=reschedule+1d
- **My Day tab** is now the default tab in TodoView, shows today's tasks + overdue
- **No mock data** — real Supabase entries used throughout
- **Framer Motion not installed** — native pointer events + CSS transitions used instead (zero new dependency)
