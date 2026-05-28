-- ─── Fix RLS: substituir policies permissivas (USING true) por policies corretas
--
-- Regras:
--   Operadores (desk_agents)  → acesso total a todas as tabelas desk_*
--   Clientes (account.user_id = auth.uid()) → apenas suas próprias conversas/mensagens
--   Edge Functions             → usam SUPABASE_SERVICE_ROLE_KEY que bypassa RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── desk_conversations ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "desk_conversations_all"          ON public.desk_conversations;
DROP POLICY IF EXISTS "agents_full_access_conversations" ON public.desk_conversations;
DROP POLICY IF EXISTS "contacts_own_conversations"       ON public.desk_conversations;
DROP POLICY IF EXISTS "contacts_insert_conversations"    ON public.desk_conversations;

-- Operadores lêem e escrevem todas as conversas
CREATE POLICY "agents_full_access_conversations"
  ON public.desk_conversations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- Clientes lêem apenas suas próprias conversas
CREATE POLICY "contacts_select_own_conversations"
  ON public.desk_conversations
  FOR SELECT
  USING (account_user_id = auth.uid());

-- Clientes criam apenas conversas vinculadas ao próprio user_id
CREATE POLICY "contacts_insert_own_conversations"
  ON public.desk_conversations
  FOR INSERT
  WITH CHECK (account_user_id = auth.uid());

-- ── desk_messages ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "desk_messages_all"          ON public.desk_messages;
DROP POLICY IF EXISTS "agents_full_access_messages" ON public.desk_messages;
DROP POLICY IF EXISTS "contacts_read_own_messages"  ON public.desk_messages;
DROP POLICY IF EXISTS "contacts_insert_messages"    ON public.desk_messages;

-- Operadores lêem e escrevem todas as mensagens (incluindo notas internas)
CREATE POLICY "agents_full_access_messages"
  ON public.desk_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- Clientes lêem apenas mensagens de suas conversas — NUNCA notas internas
CREATE POLICY "contacts_select_own_messages"
  ON public.desk_messages
  FOR SELECT
  USING (
    is_private_note = false
    AND EXISTS (
      SELECT 1 FROM public.desk_conversations
      WHERE id = conversation_id
        AND account_user_id = auth.uid()
    )
  );

-- Clientes inserem apenas mensagens do tipo 'contact' em suas conversas
CREATE POLICY "contacts_insert_own_messages"
  ON public.desk_messages
  FOR INSERT
  WITH CHECK (
    sender_type = 'contact'
    AND is_private_note = false
    AND EXISTS (
      SELECT 1 FROM public.desk_conversations
      WHERE id = conversation_id
        AND account_user_id = auth.uid()
    )
  );

-- ── desk_knowledge_base ───────────────────────────────────────────────────────
-- Manter lógica existente: qualquer um lê artigos publicados, operadores gerenciam

DROP POLICY IF EXISTS "desk_kb_read_published"       ON public.desk_knowledge_base;
DROP POLICY IF EXISTS "desk_kb_authenticated_all"    ON public.desk_knowledge_base;

CREATE POLICY "desk_kb_read_published"
  ON public.desk_knowledge_base
  FOR SELECT
  USING (is_published = true);

CREATE POLICY "desk_kb_agents_all"
  ON public.desk_knowledge_base
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- ── desk_tags ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "desk_tags_all" ON public.desk_tags;

-- Clientes não precisam ver tags — apenas operadores
CREATE POLICY "agents_full_access_tags"
  ON public.desk_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- ── desk_conversation_tags ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "desk_conversation_tags_all" ON public.desk_conversation_tags;

CREATE POLICY "agents_full_access_conversation_tags"
  ON public.desk_conversation_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- ── desk_views ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "desk_views_all" ON public.desk_views;

CREATE POLICY "agents_full_access_views"
  ON public.desk_views
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- ── desk_sla_policies ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "desk_sla_policies_all" ON public.desk_sla_policies;

CREATE POLICY "agents_full_access_sla_policies"
  ON public.desk_sla_policies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents
      WHERE auth_user_id = auth.uid()
    )
  );

-- ── desk_agents ───────────────────────────────────────────────────────────────
-- desk_agents não tem RLS habilitado ainda — habilitar agora

ALTER TABLE public.desk_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_read_all_agents" ON public.desk_agents;
DROP POLICY IF EXISTS "agents_manage_agents"   ON public.desk_agents;

-- Operadores podem ver todos os agentes (necessário para agentMap no ConversationList)
CREATE POLICY "agents_read_all_agents"
  ON public.desk_agents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents da
      WHERE da.auth_user_id = auth.uid()
    )
  );

-- Apenas admins gerenciam agentes (role = 'admin')
CREATE POLICY "admins_manage_agents"
  ON public.desk_agents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.desk_agents da
      WHERE da.auth_user_id = auth.uid()
        AND da.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.desk_agents da
      WHERE da.auth_user_id = auth.uid()
        AND da.role = 'admin'
    )
  );

-- Operador pode atualizar o próprio status (online/away/offline)
CREATE POLICY "agents_update_own_status"
  ON public.desk_agents
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ── desk_faq ──────────────────────────────────────────────────────────────────
-- FAQ: clientes não precisam acessar diretamente (a IA usa service_role)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'desk_faq'
  ) THEN
    ALTER TABLE public.desk_faq ENABLE ROW LEVEL SECURITY;

    EXECUTE $p$
      DROP POLICY IF EXISTS "agents_full_access_faq" ON public.desk_faq;
      CREATE POLICY "agents_full_access_faq"
        ON public.desk_faq
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.desk_agents
            WHERE auth_user_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.desk_agents
            WHERE auth_user_id = auth.uid()
          )
        );
    $p$;
  END IF;
END $$;
