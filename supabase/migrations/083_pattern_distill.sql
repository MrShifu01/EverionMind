-- Pattern distillation + recent matches.
--
-- The `summary` column on gmail_pattern_rules used to anchor on the FIRST
-- email's literal subject ("[cluster ×49] Run failed: CI - main (552f91e)"),
-- which made each row LOOK like a one-off rule even though the embedding
-- match generalises across senders / subjects above cosine 0.82.
--
-- Two columns added:
--   - recent_matches: rolling array of the last 5 emails that hit the
--     pattern. Powers the "matches emails like X / Y / Z" expanded view
--     and feeds the distiller.
--   - summary_distilled_at: timestamp of the last LLM-distilled summary
--     so the scorer can re-distill at hit-count milestones without
--     re-running on every bump.

ALTER TABLE public.gmail_pattern_rules
  ADD COLUMN IF NOT EXISTS recent_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_distilled_at timestamptz;
