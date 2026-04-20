-- Enable pgvector extension (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── desk_faq table (referenced by match_faq below) ──────────────────────────
-- Only creates if it doesn't exist — no-op if already present.
CREATE TABLE IF NOT EXISTS public.desk_faq (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  category      TEXT,
  hit_count     INT DEFAULT 1,
  last_asked_at TIMESTAMPTZ DEFAULT now(),
  source        TEXT CHECK (source IN ('auto', 'manual')) DEFAULT 'auto',
  embedding     VECTOR(1536),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Add embedding column to desk_knowledge_base if it doesn't exist yet
ALTER TABLE public.desk_knowledge_base
  ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);

-- ─── IVFFlat indexes for cosine similarity search ────────────────────────────
-- lists=100 is appropriate for tables up to ~1M rows.
-- DROP first to allow re-running this migration cleanly.
DROP INDEX IF EXISTS idx_desk_kb_embedding;
DROP INDEX IF EXISTS idx_desk_faq_embedding;

CREATE INDEX idx_desk_kb_embedding
  ON public.desk_knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_desk_faq_embedding
  ON public.desk_faq
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── match_knowledge_base ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count     INT   DEFAULT 5
)
RETURNS TABLE (
  id         UUID,
  title      TEXT,
  content    TEXT,
  category   TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content,
    kb.category,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM public.desk_knowledge_base kb
  WHERE kb.is_published = true
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── match_faq ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_faq(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count     INT   DEFAULT 3
)
RETURNS TABLE (
  id         UUID,
  question   TEXT,
  answer     TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.question,
    f.answer,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM public.desk_faq f
  WHERE f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RLS for desk_faq (same permissive policy as other desk_ tables for now)
ALTER TABLE public.desk_faq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desk_faq_all" ON public.desk_faq;
CREATE POLICY "desk_faq_all" ON public.desk_faq
  FOR ALL USING (true) WITH CHECK (true);
