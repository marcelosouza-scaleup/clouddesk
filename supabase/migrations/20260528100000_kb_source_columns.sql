-- Add source tracking columns to desk_knowledge_base
-- Enables upsert-by-source_id for import scripts (e.g. Intercom migration)

ALTER TABLE public.desk_knowledge_base
  ADD COLUMN IF NOT EXISTS source    TEXT    DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Unique constraint on source_id so we can upsert without duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_desk_kb_source_id
  ON public.desk_knowledge_base (source_id)
  WHERE source_id IS NOT NULL;
