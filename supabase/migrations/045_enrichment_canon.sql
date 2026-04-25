-- ============================================================
-- 045_enrichment_canon.sql — canonicalise enrichment flags
-- ============================================================
--
-- Phase 4 of the enrichment rewrite (see phases.md). Stamps explicit
-- booleans on legacy entries so the upcoming strict-only flag checks
-- (api/_lib/enrichFlags.ts) treat them as enriched without needing
-- fallback heuristics.
--
-- Stamps:
--   parsed=true            where any non-skip metadata key exists
--   has_insight=true       where metadata.ai_insight is set
--   concepts_extracted=true where metadata.concepts is non-empty array
--                          OR legacy enrichment.concepts_count > 0
--
-- Strips:
--   enrichment.concepts_count  — replaced by concepts_extracted
--   enrichment.has_related      — never read anywhere
--   enrichment.embedded         — duplicate of embedded_at column
--
-- Idempotent — every condition uses NOT (… already true), so re-running
-- the migration is a no-op.
-- ============================================================

-- Skip set duplicated from api/_lib/enrichBatch.ts. Any non-skip key in
-- metadata indicates the entry has structured data → it's "parsed."
DO $$
DECLARE
  skip_keys TEXT[] := ARRAY[
    'enrichment',
    'source',
    'full_text',
    'gmail_from',
    'gmail_subject',
    'gmail_thread_id',
    'gmail_message_id'
  ];
BEGIN
  -- ── parsed = true where metadata has any non-skip key ──────────────
  UPDATE entries
  SET metadata = jsonb_set(
    metadata,
    '{enrichment}',
    COALESCE(metadata->'enrichment', '{}'::jsonb) || '{"parsed": true}'::jsonb
  )
  WHERE deleted_at IS NULL
    AND type <> 'secret'
    AND COALESCE(metadata->'enrichment'->>'parsed', '') <> 'true'
    AND EXISTS (
      SELECT 1
      FROM jsonb_object_keys(COALESCE(metadata, '{}'::jsonb)) AS k
      WHERE k <> ALL(skip_keys)
    );

  -- ── has_insight = true where metadata.ai_insight is set ────────────
  UPDATE entries
  SET metadata = jsonb_set(
    metadata,
    '{enrichment}',
    COALESCE(metadata->'enrichment', '{}'::jsonb) || '{"has_insight": true}'::jsonb
  )
  WHERE deleted_at IS NULL
    AND type <> 'secret'
    AND COALESCE(metadata->'enrichment'->>'has_insight', '') <> 'true'
    AND metadata ? 'ai_insight'
    AND length(metadata->>'ai_insight') > 0;

  -- ── concepts_extracted = true where concepts already exist ─────────
  UPDATE entries
  SET metadata = jsonb_set(
    metadata,
    '{enrichment}',
    COALESCE(metadata->'enrichment', '{}'::jsonb) || '{"concepts_extracted": true}'::jsonb
  )
  WHERE deleted_at IS NULL
    AND type <> 'secret'
    AND COALESCE(metadata->'enrichment'->>'concepts_extracted', '') <> 'true'
    AND (
      (jsonb_typeof(metadata->'concepts') = 'array' AND jsonb_array_length(metadata->'concepts') > 0)
      OR COALESCE((metadata->'enrichment'->>'concepts_count')::int, 0) > 0
    );

  -- ── strip the legacy fields the new pipeline doesn't read ──────────
  UPDATE entries
  SET metadata = jsonb_set(
    metadata,
    '{enrichment}',
    (metadata->'enrichment')
      - 'concepts_count'
      - 'has_related'
      - 'embedded'
  )
  WHERE deleted_at IS NULL
    AND (
      metadata->'enrichment' ? 'concepts_count'
      OR metadata->'enrichment' ? 'has_related'
      OR metadata->'enrichment' ? 'embedded'
    );
END $$;
