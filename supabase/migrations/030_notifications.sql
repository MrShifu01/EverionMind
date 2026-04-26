-- ============================================================
-- Migration 030: In-app persistent notifications
-- Used for merge suggestions, gmail review prompts, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL,  -- 'merge_suggestion' | 'gmail_review' | 'auto_merged'
  title       text NOT NULL,
  body        text,
  data        jsonb DEFAULT '{}',
  read        boolean DEFAULT false,
  dismissed   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX notifications_user_unread
  ON notifications (user_id, dismissed, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their notifications"
  ON notifications
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
