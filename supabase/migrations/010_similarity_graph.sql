-- ============================================================
-- Migration 010: Similarity Graph
-- Builds pairwise similarity links from entry embeddings.
-- Used by the knowledge graph visualization.
-- ============================================================

CREATE OR REPLACE FUNCTION build_similarity_graph(
  p_brain_id   uuid,
  p_threshold  float DEFAULT 0.4
)
RETURNS TABLE (
  "from" uuid,
  "to"   uuid,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id AS "from",
    b.id AS "to",
    1 - (a.embedding <=> b.embedding) AS similarity
  FROM entries a
  JOIN entries b ON a.id < b.id
    AND a.brain_id = b.brain_id
  WHERE
    a.brain_id = p_brain_id
    AND a.embedding IS NOT NULL
    AND b.embedding IS NOT NULL
    AND 1 - (a.embedding <=> b.embedding) >= p_threshold
  ORDER BY similarity DESC
  LIMIT 200;
$$;
