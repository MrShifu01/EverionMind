-- 084_audit_hardening.sql
--
-- Consolidated follow-up from the May 2026 audit batch. This migration is
-- intentionally conservative and idempotent: it hardens policies/functions,
-- adds missing FK indexes, documents FK behavior, and bounds webhook-event
-- retention. It does not drop product tables or unused indexes.

-- ── RLS cleanup ────────────────────────────────────────────────────────────
-- The old all-in-one vault_entries policy overlaps the brain-scoped policies
-- from 079_vault_entries_brain_required.sql. Drop both quoted/unquoted names
-- because earlier migrations created both variants on some environments.
DROP POLICY IF EXISTS vault_entries_all ON public.vault_entries;
DROP POLICY IF EXISTS "vault_entries_all" ON public.vault_entries;

DROP POLICY IF EXISTS "gmail_pattern_rules_owner_rw" ON public.gmail_pattern_rules;
CREATE POLICY "gmail_pattern_rules_owner_rw"
  ON public.gmail_pattern_rules
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_enrich_quota_owner_read ON public.user_enrich_quota;
CREATE POLICY user_enrich_quota_owner_read
  ON public.user_enrich_quota
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── Function search_path hardening ─────────────────────────────────────────
-- pg_temp is included after public so temp-object shadowing cannot win name
-- resolution inside SECURITY DEFINER functions. Postgres has no
-- `ALTER FUNCTION IF EXISTS` syntax, so each statement is wrapped in a DO
-- block that swallows undefined_function — applying what's there, skipping
-- what isn't (e.g. envs where a per-feature migration was never run).
DO $do$ BEGIN
  ALTER FUNCTION public.create_personal_brain_for_new_user() SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.user_personas_touch_updated_at() SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.match_gmail_pattern(vector, vector, double precision, integer) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.match_gmail_pattern(uuid, vector, double precision, integer) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.important_memories_touch() SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public._lock_billing_columns() SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.enforce_entries_brain_owner_match() SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.bulk_apply_embeddings(jsonb) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.claim_pending_enrichments(uuid, uuid, integer) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.consume_enrich_quota(uuid, integer) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;
DO $do$ BEGIN
  ALTER FUNCTION public.recompute_enrichment_state(uuid[]) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL; END $do$;

-- ── RPC execute hardening ──────────────────────────────────────────────────
-- These mutating RPCs are intended for server/service-role paths. Revoke anon
-- by default; re-grant authenticated only for RPCs the app intentionally calls
-- from authenticated PostgREST contexts.
REVOKE EXECUTE ON FUNCTION public.bulk_apply_embeddings(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_enrichments(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_enrich_quota(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_enrichment_state(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bulk_apply_embeddings(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_enrichments(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_enrich_quota(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_enrichment_state(uuid[]) TO authenticated, service_role;

-- Trigger-only functions should not be callable by app users directly.
REVOKE EXECUTE ON FUNCTION public.create_personal_brain_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.create_personal_brain_for_new_user() TO supabase_auth_admin;

-- ── Missing FK-side indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_brain_invites_invited_by
  ON public.brain_invites (invited_by);
CREATE INDEX IF NOT EXISTS idx_brain_members_invited_by
  ON public.brain_members (invited_by);
CREATE INDEX IF NOT EXISTS idx_brain_vault_grants_granted_by
  ON public.brain_vault_grants (granted_by);
CREATE INDEX IF NOT EXISTS idx_entry_shares_shared_by
  ON public.entry_shares (shared_by);

-- ── Document intentional FK behavior ───────────────────────────────────────
COMMENT ON CONSTRAINT entries_brain_id_fkey ON public.entries IS
  'NO ACTION is intentional: brain deletion is an explicit product action and should not silently cascade user memories.';
COMMENT ON CONSTRAINT links_brain_id_fkey ON public.links IS
  'NO ACTION is intentional: graph/link rows should not silently cascade from brain deletion without an explicit cleanup path.';

-- ── Bounded webhook-event retention ────────────────────────────────────────
-- webhook_events is an idempotency ledger, not permanent audit history.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DELETE FROM public.webhook_events
WHERE seen_at < now() - interval '30 days';

-- Ensure stale webhook_events continue to be purged daily.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'webhook_events_retention'
  ) THEN
    PERFORM cron.schedule(
      'webhook_events_retention',
      '0 1 * * *',
      $$DELETE FROM public.webhook_events WHERE seen_at < now() - interval '30 days'$$
    );
  END IF;
END$$;

