-- ============================================================
-- 000_init.sql — Full schema snapshot captured at migration 042
-- ============================================================
-- This file was NOT run first — it is a snapshot of the live database
-- captured after 42 incremental migrations. Use it to understand the
-- complete schema without having to trace all migrations.
--
-- To rebuild from scratch: run this file, then run 043+ onward.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── brains ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brains ENABLE ROW LEVEL SECURITY;
CREATE POLICY brains_select ON brains FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY brains_insert ON brains FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY brains_update ON brains FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY brains_delete ON brains FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS brains_one_per_user ON brains (owner_id);

-- ── entries ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  title              text NOT NULL,
  content            text,
  type               text NOT NULL DEFAULT 'note',
  metadata           jsonb NOT NULL DEFAULT '{}',
  pinned             boolean NOT NULL DEFAULT false,
  archived           boolean NOT NULL DEFAULT false,
  importance         smallint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  tags               text[] NOT NULL DEFAULT '{}',
  fts                tsvector,
  brain_id           uuid REFERENCES brains(id) ON DELETE CASCADE,
  embedding          vector(768),
  embedded_at        timestamptz,
  embedding_provider text,
  deleted_at         timestamptz,
  status             text NOT NULL DEFAULT 'active',
  embedding_model    text,
  embedding_status   text NOT NULL DEFAULT 'pending'
);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY entries_all ON entries FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS entries_user_created_at_idx     ON entries (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_brain_created_idx       ON entries (brain_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_brain_id_idx            ON entries (brain_id);
CREATE INDEX IF NOT EXISTS entries_deleted_at_idx          ON entries (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS entries_embedded_at_idx         ON entries (embedded_at) WHERE embedded_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_embedding_status_idx    ON entries (user_id, embedding_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_status_idx              ON entries (status) WHERE status = 'staged';
CREATE INDEX IF NOT EXISTS entries_fts_idx                 ON entries USING gin (fts);
CREATE INDEX IF NOT EXISTS idx_entries_metadata            ON entries USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_entries_title_trgm          ON entries USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_user_archived       ON entries (user_id, archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_entries_user_pinned         ON entries (user_id, pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_entries_user_type           ON entries (user_id, type);
CREATE INDEX IF NOT EXISTS idx_entries_status_staged       ON entries (brain_id, created_at DESC) WHERE status = 'staged';
-- Vector similarity index (IVFFlat; reindex to HNSW once entries > 100k)
CREATE INDEX IF NOT EXISTS entries_embedding_idx           ON entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- URL dedup: one active URL per user
CREATE UNIQUE INDEX IF NOT EXISTS entries_user_source_url  ON entries (user_id, (metadata->>'source_url')) WHERE (metadata ? 'source_url') AND deleted_at IS NULL;

-- ── tags ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name       text NOT NULL,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_all ON tags FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags (user_id);

-- ── entry_tags ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

ALTER TABLE entry_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY entry_tags_all ON entry_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_tags.entry_id AND entries.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_tags.entry_id AND entries.user_id = (SELECT auth.uid())));
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags (tag_id);

-- ── links ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  from_entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  to_entry_id   uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  relationship  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  brain_id      uuid REFERENCES brains(id),
  UNIQUE (from_entry_id, to_entry_id, relationship)
);

ALTER TABLE links ENABLE ROW LEVEL SECURITY;
CREATE POLICY links_all ON links FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_links_from     ON links (from_entry_id);
CREATE INDEX IF NOT EXISTS idx_links_to       ON links (to_entry_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id  ON links (user_id);
CREATE INDEX IF NOT EXISTS links_brain_id_idx ON links (brain_id);

-- ── collections ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name        text NOT NULL,
  description text,
  icon        text,
  parent_id   uuid REFERENCES collections(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY collections_all ON collections FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_collections_user   ON collections (user_id);
CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections (parent_id);

-- ── collection_entries ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_entries (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  entry_id      uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, entry_id)
);

ALTER TABLE collection_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_entries_all ON collection_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_entries.collection_id AND collections.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_entries.collection_id AND collections.user_id = (SELECT auth.uid())));
CREATE INDEX IF NOT EXISTS idx_collection_entries_entry ON collection_entries (entry_id);

-- ── user_memory ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_memory (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id),
  content    text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_memory_all ON user_memory FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── messaging_connections ────────────────────────────────────

CREATE TABLE IF NOT EXISTS messaging_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  brain_id         uuid NOT NULL REFERENCES brains(id),
  platform         text NOT NULL CHECK (platform = 'telegram'),
  platform_user_id text NOT NULL,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (platform, platform_user_id)
);

ALTER TABLE messaging_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY messaging_connections_all ON messaging_connections FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_messaging_connections_user_id  ON messaging_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_connections_brain_id ON messaging_connections (brain_id);

-- ── messaging_pending_links ──────────────────────────────────

CREATE TABLE IF NOT EXISTS messaging_pending_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  brain_id   uuid NOT NULL REFERENCES brains(id),
  platform   text NOT NULL,
  code       text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messaging_pending_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY messaging_pending_links_all ON messaging_pending_links FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_messaging_pending_links_user_id  ON messaging_pending_links (user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_pending_links_brain_id ON messaging_pending_links (brain_id);

-- ── user_ai_settings ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id),
  openrouter_key    text,
  openrouter_model  text,
  updated_at        timestamptz DEFAULT now(),
  model_capture     text,
  model_questions   text,
  model_vision      text,
  model_refine      text,
  model_chat        text,
  pin_hash          text,
  pin_hash_salt     text,
  api_key           text,
  ai_model          text,
  ai_provider       text,
  groq_key          text,
  embed_provider    text,
  embed_openai_key  text,
  gemini_key        text,
  simple_mode       boolean DEFAULT true,
  embed_or_model    text,
  plan              text NOT NULL DEFAULT 'free',
  anthropic_key     text,
  openai_key        text,
  anthropic_model   text DEFAULT 'claude-sonnet-4-6',
  openai_model      text DEFAULT 'gpt-4o-mini',
  gemini_byok_model text DEFAULT 'gemini-2.5-flash-lite'
);

ALTER TABLE user_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_ai_settings_all ON user_ai_settings FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── vault_keys ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vault_keys (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id),
  salt           text NOT NULL,
  verify_token   text NOT NULL,
  recovery_blob  text NOT NULL,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE vault_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_keys_all ON vault_keys FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── push_subscriptions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_all ON push_subscriptions FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── notification_prefs ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_prefs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  daily_enabled   boolean DEFAULT false,
  daily_time      time DEFAULT '20:00:00',
  daily_timezone  text DEFAULT 'UTC',
  nudge_enabled   boolean DEFAULT false,
  nudge_day       text DEFAULT 'sunday',
  nudge_time      time DEFAULT '10:00:00',
  nudge_timezone  text DEFAULT 'UTC',
  expiry_enabled  boolean DEFAULT false,
  expiry_lead_days integer[] DEFAULT '{90,30,7,1}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_prefs_all ON notification_prefs FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── expiry_notification_log ──────────────────────────────────

CREATE TABLE IF NOT EXISTS expiry_notification_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  entry_id    uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  item_label  text NOT NULL,
  expiry_date date NOT NULL,
  lead_days   integer NOT NULL,
  sent_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, entry_id, item_label, lead_days)
);

ALTER TABLE expiry_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY expiry_notification_log_all ON expiry_notification_log FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_expiry_notification_log_entry_id ON expiry_notification_log (entry_id);

-- ── brain_api_keys ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brain_api_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id       uuid NOT NULL REFERENCES brains(id),
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  api_key        text NOT NULL UNIQUE,
  label          text NOT NULL DEFAULT 'Default',
  is_active      boolean NOT NULL DEFAULT true,
  last_used_at   timestamptz,
  created_at     timestamptz DEFAULT now(),
  api_key_hash   text,
  api_key_salt   text,
  api_key_prefix text
);

ALTER TABLE brain_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY brain_api_keys_user    ON brain_api_keys FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY brain_api_keys_service ON brain_api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_brain_api_keys_user_id ON brain_api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_brain_api_keys_brain   ON brain_api_keys (brain_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brain_api_keys_key     ON brain_api_keys (api_key) WHERE is_active = true;

-- ── vault_entries ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vault_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  title      text NOT NULL,
  content    text NOT NULL DEFAULT '',
  metadata   text NOT NULL DEFAULT '',
  tags       text[] NOT NULL DEFAULT '{}',
  brain_id   uuid REFERENCES brains(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE vault_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_entries_all ON vault_entries FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_vault_entries_brain_id   ON vault_entries (brain_id);
CREATE INDEX IF NOT EXISTS idx_vault_entries_user_active ON vault_entries (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- ── concept_graphs ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS concept_graphs (
  brain_id   uuid PRIMARY KEY REFERENCES brains(id),
  graph      jsonb NOT NULL DEFAULT '{"concepts":[],"relationships":[]}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE concept_graphs ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_graphs_user    ON concept_graphs FOR ALL TO authenticated USING (brain_id IN (SELECT id FROM brains WHERE owner_id = (SELECT auth.uid()))) WITH CHECK (brain_id IN (SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY concept_graphs_service ON concept_graphs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── user_api_keys ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  name         text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  key_prefix   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_api_keys_user    ON user_api_keys FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY user_api_keys_service ON user_api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_hash    ON user_api_keys (key_hash) WHERE revoked_at IS NULL;

-- ── query_feedback ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS query_feedback (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id           uuid NOT NULL REFERENCES brains(id),
  query              text NOT NULL,
  answer             text NOT NULL,
  retrieved_entry_ids uuid[] NOT NULL DEFAULT '{}',
  top_entry_ids      uuid[] NOT NULL DEFAULT '{}',
  feedback           smallint NOT NULL CHECK (feedback = ANY (ARRAY[-1, 1])),
  confidence         text NOT NULL DEFAULT 'medium',
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE query_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY query_feedback_user    ON query_feedback FOR ALL TO authenticated USING (brain_id IN (SELECT id FROM brains WHERE owner_id = (SELECT auth.uid()))) WITH CHECK (brain_id IN (SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY query_feedback_service ON query_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS query_feedback_brain_created ON query_feedback (brain_id, created_at DESC);

-- ── knowledge_shortcuts ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_shortcuts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id              uuid NOT NULL REFERENCES brains(id),
  trigger_query_pattern text NOT NULL,
  entity                text NOT NULL,
  role                  text NOT NULL,
  attribute             text NOT NULL,
  entry_ids             uuid[] NOT NULL DEFAULT '{}',
  confidence_score      float8 NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  usage_count           integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brain_id, entity, role, attribute)
);

ALTER TABLE knowledge_shortcuts ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_shortcuts_user    ON knowledge_shortcuts FOR ALL TO authenticated USING (brain_id IN (SELECT id FROM brains WHERE owner_id = (SELECT auth.uid()))) WITH CHECK (brain_id IN (SELECT id FROM brains WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY knowledge_shortcuts_service ON knowledge_shortcuts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS knowledge_shortcuts_brain_id ON knowledge_shortcuts (brain_id);

-- ── calendar_integrations ────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_integrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  provider          text NOT NULL CHECK (provider = ANY (ARRAY['google', 'microsoft'])),
  access_token      text,
  refresh_token     text NOT NULL,
  token_expires_at  timestamptz,
  calendar_email    text,
  sync_enabled      boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_integrations_all ON calendar_integrations FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── gmail_integrations ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS gmail_integrations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  access_token              text,
  refresh_token             text NOT NULL,
  token_expires_at          timestamptz,
  gmail_email               text,
  scan_enabled              boolean NOT NULL DEFAULT true,
  last_scanned_at           timestamptz,
  preferences               jsonb NOT NULL DEFAULT '{"custom":"","categories":["invoices","action-required","subscription-renewal","appointment","deadline"]}',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  history_id                text,
  token_encryption_version  integer NOT NULL DEFAULT 0
);

ALTER TABLE gmail_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY gmail_integrations_all ON gmail_integrations FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS gmail_integrations_enc_ver_idx ON gmail_integrations (token_encryption_version) WHERE token_encryption_version < 1;

-- ── notifications ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  data       jsonb DEFAULT '{}',
  read       boolean DEFAULT false,
  dismissed  boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_all ON notifications FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications (user_id, dismissed, created_at DESC);

-- ── user_profiles ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id                     uuid PRIMARY KEY REFERENCES auth.users(id),
  tier                   text NOT NULL DEFAULT 'free' CHECK (tier = ANY (ARRAY['free','starter','pro','max'])),
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text,
  tier_expires_at        timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_select  ON user_profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY user_profiles_update  ON user_profiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY user_profiles_service ON user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── user_usage ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_usage (
  user_id  uuid NOT NULL REFERENCES auth.users(id),
  period   text NOT NULL,
  captures integer NOT NULL DEFAULT 0,
  chats    integer NOT NULL DEFAULT 0,
  voice    integer NOT NULL DEFAULT 0,
  improve  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_usage_select  ON user_usage FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY user_usage_service ON user_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── idempotency_keys ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key text NOT NULL,
  entry_id        uuid REFERENCES entries(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_own ON idempotency_keys FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys (created_at);

-- ── entry_enrichment_jobs ────────────────────────────────────

CREATE TABLE IF NOT EXISTS entry_enrichment_jobs (
  entry_id    uuid PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  status      text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','retry','complete','dead_letter'])),
  attempt     integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  error       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entry_enrichment_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS entry_enrichment_jobs_drain_idx ON entry_enrichment_jobs (next_run_at) WHERE status = ANY (ARRAY['pending','retry']);

-- ── audit_log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id),
  action      text NOT NULL,
  resource_id uuid,
  request_id  text,
  metadata    jsonb,
  timestamp   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_own ON audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS audit_log_user_idx     ON audit_log (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log (resource_id);
