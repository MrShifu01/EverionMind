# Push Notifications — Design Spec
**Date:** 2026-04-03  
**Status:** Approved  

---

## Overview

Add PWA push notifications to OpenBrain. Three notification types: expiry reminders (passport, licence, insurance), Fill Brain nudges, and daily capture prompts. Users have full per-type control over timing and frequency. iOS users see onboarding instructions to add the app to Home Screen first.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React PWA)                                    │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ Notification     │  │ Service Worker               │  │
│  │ Settings UI      │  │ - push event handler         │  │
│  │ (per-type prefs) │  │ - notification click handler │  │
│  └────────┬────────┘  └──────────────────────────────┘  │
│           │ subscribe/unsubscribe                         │
└───────────┼─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│  Vercel API                                              │
│  POST /api/push-subscribe   — store subscription        │
│  DELETE /api/push-subscribe — remove subscription       │
│  POST /api/cron/push-expiry — check expiry dates        │
│  POST /api/cron/push-nudge  — fill brain nudge          │
│  POST /api/cron/push-daily  — daily capture prompt      │
└───────────┬─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│  Supabase                                                │
│  push_subscriptions table                               │
│  notification_prefs table                               │
│  expiry_notification_log table                          │
│  entries table (scanned for expiry dates)               │
└─────────────────────────────────────────────────────────┘
```

Vercel Cron triggers the three cron endpoints. Each job queries Supabase for users with that notification type enabled, then sends via `web-push`. VAPID keys stored as Vercel environment variables.

---

## Database Schema

### `push_subscriptions`
Stores the browser push endpoint per user per device. One user can have multiple rows (phone, laptop, tablet).

```sql
id           uuid DEFAULT gen_random_uuid() PRIMARY KEY
user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
endpoint     text NOT NULL
p256dh       text NOT NULL   -- browser encryption key
auth         text NOT NULL   -- auth secret
user_agent   text            -- e.g. "Chrome on Android"
created_at   timestamptz DEFAULT now()
UNIQUE(user_id, endpoint)
```

When sending, fan out to all subscriptions for the user. Auto-delete any that return HTTP 410 Gone (subscription expired/revoked).

### `notification_prefs`
One row per user. All columns have sensible defaults so users only need to update what they change.

```sql
id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY
user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE
-- Daily capture prompt
daily_enabled        boolean DEFAULT false
daily_time           time DEFAULT '20:00'
daily_timezone       text DEFAULT 'UTC'
-- Fill Brain nudge
nudge_enabled        boolean DEFAULT false
nudge_day            text DEFAULT 'sunday'
nudge_time           time DEFAULT '10:00'
nudge_timezone       text DEFAULT 'UTC'
-- Expiry reminders
expiry_enabled       boolean DEFAULT false
expiry_lead_days     int[] DEFAULT '{90,30,7,1}'
created_at           timestamptz DEFAULT now()
updated_at           timestamptz DEFAULT now()
```

### `expiry_notification_log`
Prevents duplicate expiry notifications for the same item + lead day combination.

```sql
id           uuid DEFAULT gen_random_uuid() PRIMARY KEY
user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
entry_id     uuid REFERENCES entries(id) ON DELETE CASCADE NOT NULL
item_label   text NOT NULL   -- e.g. "passport"
expiry_date  date NOT NULL
lead_days    int NOT NULL    -- which lead-day threshold triggered this
sent_at      timestamptz DEFAULT now()
UNIQUE(user_id, entry_id, item_label, lead_days)
```

---

## Service Worker

Push handlers injected into the existing Workbox service worker via `vite-plugin-pwa`'s `injectManifest` mode.

**Push event handler:**
- Receives payload: `{ title, body, url, icon }`
- Calls `self.registration.showNotification(title, { body, icon, data: { url } })`

**Notification click handler:**
- Reads `event.notification.data.url`
- Focuses existing OpenBrain window if open, otherwise opens a new one
- Closes the notification

---

## Vercel API Endpoints

### `POST /api/push-subscribe`
Body: `{ endpoint, keys: { p256dh, auth }, userAgent }`  
Upserts into `push_subscriptions` for the authenticated user.

### `DELETE /api/push-subscribe`
Body: `{ endpoint }`  
Removes the subscription row. Also calls `subscription.unsubscribe()` on the client side before hitting this endpoint.

### `POST /api/notification-prefs`
Body: partial `notification_prefs` shape  
Upserts the user's notification preferences.

### Cron endpoints (protected by `CRON_SECRET`)

**`GET /api/cron/push-daily`** — runs hourly  
Finds all users with `daily_enabled = true` whose current local time matches their `daily_time` (within the current hour). Sends: *"What's worth remembering today? Capture it in OpenBrain."*

**`GET /api/cron/push-nudge`** — runs hourly  
Finds users with `nudge_enabled = true` whose `nudge_day` and `nudge_time` match now. Queries count of unanswered Fill Brain questions. Sends: *"You have X questions waiting in Fill Brain."*

**`GET /api/cron/push-expiry`** — runs daily at 09:00 UTC  
For each user with `expiry_enabled = true`:
1. Fetches their entries filtered by expiry-related keywords (`expir`, `valid until`, `renew`, `passport`, `licence`, `insurance`, `policy`)
2. Sends filtered entry text to Claude to extract `[{ item, date }]`
3. For each extracted date, checks if `(today + lead_day) == expiry_date` for any value in `expiry_lead_days`
4. Checks `expiry_notification_log` to skip already-sent combos
5. Sends notification: *"Your [passport] expires in [30] days."* and logs to `expiry_notification_log`

---

## Frontend

### Notification Settings Panel
A new section in settings (or accessible from the sidebar). Contains:
- **Enable notifications** master toggle — triggers permission request + subscription
- **Daily capture prompt** toggle → time picker + timezone selector
- **Fill Brain nudge** toggle → day-of-week picker + time picker + timezone
- **Expiry reminders** toggle → multi-select lead days (90 / 30 / 7 / 1)

Permission state machine:
- `default` → show "Enable" button
- `granted` → show toggles, save prefs on change
- `denied` → show message explaining browser settings to change

### iOS Onboarding Step
Added as step 4 in `OnboardingModal` (before the final "Start capturing" step), shown only on iOS Safari when `Notification` is not available or `standalone` is false.

```
📱 Get notified on iPhone

To receive notifications, OpenBrain needs to be on
your Home Screen.

1. Tap the Share button (□↑) in Safari
2. Tap "Add to Home Screen"
3. Open OpenBrain from your Home Screen
4. Come back to Settings → Notifications to enable

[ Skip for now ]    [ Got it → ]
```

Android and desktop users skip this step entirely — they go straight to the browser permission prompt.

---

## Vercel Configuration

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/push-daily",  "schedule": "0 * * * *" },
    { "path": "/api/cron/push-nudge",  "schedule": "0 * * * *" },
    { "path": "/api/cron/push-expiry", "schedule": "0 9 * * *" }
  ]
}
```

### Environment Variables Required
```
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
VAPID_SUBJECT=mailto:your@email.com
CRON_SECRET=<vercel injects automatically>
```

---

## Dependencies

One new package: `web-push` (Node.js Web Push library).

```bash
npm install web-push
```

No other new dependencies. VAPID keys generated once via `web-push generate-vapid-keys` and stored in Vercel env vars.

---

## Migration

New migration file: `supabase/migrations/002_push_notifications.sql`  
Creates: `push_subscriptions`, `notification_prefs`, `expiry_notification_log` with RLS policies (users can only read/write their own rows).

---

## Out of Scope

- Push to shared brain members (only own-user notifications for now)
- Rich notifications with action buttons
- Notification history / read receipts
- Firebase Cloud Messaging
