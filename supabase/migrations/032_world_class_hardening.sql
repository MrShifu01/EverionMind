-- ═══════════════════════════════════════════════════════════════════════════
-- 032: World-class DB hardening
--
-- Fixes applied:
--   [CRITICAL]  user_api_keys open-access policy (TO public / USING true)
--   [SECURITY]  All policies scoped TO authenticated or TO service_role
--   [SECURITY]  Missing RLS policies: concept_graphs, knowledge_shortcuts, query_feedback
--   [SECURITY]  brains table missing SELECT policy
--   [SECURITY]  Duplicate links policy removed
--   [PERF]      All auth.uid() wrapped in (SELECT auth.uid()) subquery
--   [PERF]      Missing FK indexes added
--   [SECURITY]  All SECURITY DEFINER functions get SET search_path = public
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── BRAINS: add SELECT + fix all to TO authenticated ────────────────────
DROP POLICY IF EXISTS "Authenticated users can create brains" ON brains;
DROP POLICY IF EXISTS "Brain owner can delete" ON brains;
DROP POLICY IF EXISTS "Brain owner can update" ON brains;

CREATE POLICY "brains_select" ON brains
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "brains_insert" ON brains
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "brains_update" ON brains
  FOR UPDATE TO authenticated
  USING  (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "brains_delete" ON brains
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));


-- ─── ENTRIES ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own entries" ON entries;

CREATE POLICY "entries_all" ON entries
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── TAGS ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own tags" ON tags;

CREATE POLICY "tags_all" ON tags
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── ENTRY_TAGS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own entry_tags" ON entry_tags;

CREATE POLICY "entry_tags_all" ON entry_tags
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM entries
    WHERE entries.id = entry_tags.entry_id
      AND entries.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM entries
    WHERE entries.id = entry_tags.entry_id
      AND entries.user_id = (SELECT auth.uid())
  ));


-- ─── LINKS: remove duplicate, fix remaining ───────────────────────────────
DROP POLICY IF EXISTS "Users can manage own links" ON links;
DROP POLICY IF EXISTS "Users manage own links" ON links;

CREATE POLICY "links_all" ON links
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── COLLECTIONS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own collections" ON collections;

CREATE POLICY "collections_all" ON collections
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── COLLECTION_ENTRIES ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own collection_entries" ON collection_entries;

CREATE POLICY "collection_entries_all" ON collection_entries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_entries.collection_id
      AND collections.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM collections
    WHERE collections.id = collection_entries.collection_id
      AND collections.user_id = (SELECT auth.uid())
  ));


-- ─── USER_MEMORY ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own memory" ON user_memory;

CREATE POLICY "user_memory_all" ON user_memory
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── MESSAGING_CONNECTIONS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own connections" ON messaging_connections;

CREATE POLICY "messaging_connections_all" ON messaging_connections
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── MESSAGING_PENDING_LINKS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own pending links" ON messaging_pending_links;

CREATE POLICY "messaging_pending_links_all" ON messaging_pending_links
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── USER_AI_SETTINGS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own ai settings" ON user_ai_settings;

CREATE POLICY "user_ai_settings_all" ON user_ai_settings
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── VAULT_KEYS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own vault key" ON vault_keys;

CREATE POLICY "vault_keys_all" ON vault_keys
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── VAULT_ENTRIES ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own vault entries" ON vault_entries;

CREATE POLICY "vault_entries_all" ON vault_entries
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── PUSH_SUBSCRIPTIONS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "users own their push subscriptions" ON push_subscriptions;

CREATE POLICY "push_subscriptions_all" ON push_subscriptions
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── NOTIFICATION_PREFS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "users own their notification prefs" ON notification_prefs;

CREATE POLICY "notification_prefs_all" ON notification_prefs
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── EXPIRY_NOTIFICATION_LOG ──────────────────────────────────────────────
DROP POLICY IF EXISTS "users own their expiry log" ON expiry_notification_log;

CREATE POLICY "expiry_notification_log_all" ON expiry_notification_log
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users own their notifications" ON notifications;

CREATE POLICY "notifications_all" ON notifications
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── CALENDAR_INTEGRATIONS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "users manage own calendar integrations" ON calendar_integrations;

CREATE POLICY "calendar_integrations_all" ON calendar_integrations
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── GMAIL_INTEGRATIONS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "users manage own gmail integrations" ON gmail_integrations;

CREATE POLICY "gmail_integrations_all" ON gmail_integrations
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ─── USER_PROFILES: replace auth.role() check with TO service_role ────────
DROP POLICY IF EXISTS "users read own profile"   ON user_profiles;
DROP POLICY IF EXISTS "users update own profile" ON user_profiles;
DROP POLICY IF EXISTS "service role full access" ON user_profiles;

CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING     (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "user_profiles_service" ON user_profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── USER_USAGE: same fix ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "users read own usage"             ON user_usage;
DROP POLICY IF EXISTS "service role full access on usage" ON user_usage;

CREATE POLICY "user_usage_select" ON user_usage
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "user_usage_service" ON user_usage
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── USER_API_KEYS: CRITICAL FIX — was TO public USING(true) ─────────────
DROP POLICY IF EXISTS "Service role full access" ON user_api_keys;

CREATE POLICY "user_api_keys_user" ON user_api_keys
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "user_api_keys_service" ON user_api_keys
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── BRAIN_API_KEYS: add user-facing policy alongside service ────────────
DROP POLICY IF EXISTS "Service role full access" ON brain_api_keys;

CREATE POLICY "brain_api_keys_user" ON brain_api_keys
  FOR ALL TO authenticated
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "brain_api_keys_service" ON brain_api_keys
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── CONCEPT_GRAPHS: add missing policies ─────────────────────────────────
CREATE POLICY "concept_graphs_user" ON concept_graphs
  FOR ALL TO authenticated
  USING (brain_id IN (
    SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (brain_id IN (
    SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())
  ));

CREATE POLICY "concept_graphs_service" ON concept_graphs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── KNOWLEDGE_SHORTCUTS: add missing policies ────────────────────────────
CREATE POLICY "knowledge_shortcuts_user" ON knowledge_shortcuts
  FOR ALL TO authenticated
  USING (brain_id IN (
    SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (brain_id IN (
    SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())
  ));

CREATE POLICY "knowledge_shortcuts_service" ON knowledge_shortcuts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── QUERY_FEEDBACK: add missing policies ─────────────────────────────────
CREATE POLICY "query_feedback_user" ON query_feedback
  FOR ALL TO authenticated
  USING (brain_id IN (
    SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (brain_id IN (
    SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())
  ));

CREATE POLICY "query_feedback_service" ON query_feedback
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─── MISSING FK INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_brain_api_keys_user_id
  ON brain_api_keys (user_id);

CREATE INDEX IF NOT EXISTS idx_expiry_notification_log_entry_id
  ON expiry_notification_log (entry_id);

CREATE INDEX IF NOT EXISTS idx_messaging_connections_brain_id
  ON messaging_connections (brain_id);

CREATE INDEX IF NOT EXISTS idx_messaging_pending_links_brain_id
  ON messaging_pending_links (brain_id);

CREATE INDEX IF NOT EXISTS idx_vault_entries_brain_id
  ON vault_entries (brain_id);


-- ─── FUNCTION search_path HARDENING ──────────────────────────────────────
CREATE OR REPLACE FUNCTION create_personal_brain_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO brains (name, owner_id) VALUES ('My Brain', NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO user_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_plan_to_ai_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE user_ai_settings
  SET plan = NEW.tier
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_period  TEXT,
  p_action  TEXT
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO user_usage (user_id, period)
  VALUES (p_user_id, p_period)
  ON CONFLICT (user_id, period) DO NOTHING;

  IF p_action = 'captures' THEN
    UPDATE user_usage SET captures = captures + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING captures INTO v_count;
  ELSIF p_action = 'chats' THEN
    UPDATE user_usage SET chats = chats + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING chats INTO v_count;
  ELSIF p_action = 'voice' THEN
    UPDATE user_usage SET voice = voice + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING voice INTO v_count;
  ELSIF p_action = 'improve' THEN
    UPDATE user_usage SET improve = improve + 1
    WHERE user_id = p_user_id AND period = p_period
    RETURNING improve INTO v_count;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  RETURN v_count;
END;
$$;
