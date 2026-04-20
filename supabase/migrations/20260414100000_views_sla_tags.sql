-- ─── 1. Tags RLS ─────────────────────────────────────────────────────────────
-- desk_tags table already exists (created directly in Supabase dashboard).
-- Only add the RLS policy if it doesn't exist yet.

ALTER TABLE public.desk_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desk_tags_all" ON public.desk_tags;
CREATE POLICY "desk_tags_all" ON public.desk_tags
  FOR ALL USING (true) WITH CHECK (true);

-- desk_conversation_tags RLS
ALTER TABLE public.desk_conversation_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desk_conversation_tags_all" ON public.desk_conversation_tags;
CREATE POLICY "desk_conversation_tags_all" ON public.desk_conversation_tags
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 2. Visualizações ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desk_views (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  emoji       text,
  color       text        DEFAULT '#6366f1',
  order_index integer     DEFAULT 0,
  filters     jsonb       DEFAULT '{}'::jsonb,
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT desk_views_pkey PRIMARY KEY (id)
);

ALTER TABLE public.desk_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desk_views_all" ON public.desk_views;
CREATE POLICY "desk_views_all" ON public.desk_views
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. SLA Policies ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desk_sla_policies (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  description             text,
  plan                    text,
  priority                text        CHECK (priority = ANY (ARRAY['low','medium','high','urgent'])),
  first_response_minutes  integer     NOT NULL DEFAULT 60,
  resolution_minutes      integer     NOT NULL DEFAULT 480,
  is_active               boolean     DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  CONSTRAINT desk_sla_policies_pkey PRIMARY KEY (id)
);

ALTER TABLE public.desk_sla_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desk_sla_policies_all" ON public.desk_sla_policies;
CREATE POLICY "desk_sla_policies_all" ON public.desk_sla_policies
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. Conversas não lidas ───────────────────────────────────────────────────

ALTER TABLE public.desk_conversations
  ADD COLUMN IF NOT EXISTS first_seen_by_agent_at timestamptz,
  ADD COLUMN IF NOT EXISTS unread_count            integer DEFAULT 0;
