-- ============================================================
-- Migration 004: Push Notifications
-- push_subscriptions, notification_prefs, expiry_notification_log
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their push subscriptions"
  ON push_subscriptions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_prefs (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  daily_enabled     boolean   DEFAULT false,
  daily_time        time      DEFAULT '20:00',
  daily_timezone    text      DEFAULT 'UTC',
  nudge_enabled     boolean   DEFAULT false,
  nudge_day         text      DEFAULT 'sunday',
  nudge_time        time      DEFAULT '10:00',
  nudge_timezone    text      DEFAULT 'UTC',
  expiry_enabled    boolean   DEFAULT false,
  expiry_lead_days  int[]     DEFAULT '{90,30,7,1}',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their notification prefs"
  ON notification_prefs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expiry_notification_log (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_id     uuid REFERENCES entries(id) ON DELETE CASCADE NOT NULL,
  item_label   text NOT NULL,
  expiry_date  date NOT NULL,
  lead_days    int  NOT NULL,
  sent_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, entry_id, item_label, lead_days)
);

ALTER TABLE expiry_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their expiry log"
  ON expiry_notification_log
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
