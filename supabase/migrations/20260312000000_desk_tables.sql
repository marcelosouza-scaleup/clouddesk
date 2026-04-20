-- desk_conversations: conversas de suporte (prefixo desk_ conforme spec)
CREATE TABLE IF NOT EXISTS public.desk_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_user_id   UUID NOT NULL,          -- FK lógica → account.user_id (sem FK física)
  assigned_agent_id UUID,
  channel           TEXT CHECK (channel IN ('chat', 'email')) DEFAULT 'chat',
  status            TEXT CHECK (status IN ('open', 'pending', 'snoozed', 'resolved')) DEFAULT 'open',
  priority          TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  subject           TEXT,
  sla_deadline      TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  snoozed_until     TIMESTAMPTZ,
  ai_active         BOOLEAN DEFAULT true,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- desk_messages: mensagens das conversas
CREATE TABLE IF NOT EXISTS public.desk_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.desk_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_type     TEXT CHECK (sender_type IN ('contact', 'agent', 'bot', 'system')) NOT NULL,
  sender_id       UUID,
  content         TEXT NOT NULL,
  content_type    TEXT CHECK (content_type IN ('text', 'html', 'image', 'file', 'note')) DEFAULT 'text',
  attachments     JSONB DEFAULT '[]',
  is_private_note BOOLEAN DEFAULT false,
  ai_generated    BOOLEAN DEFAULT false,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- desk_knowledge_base: artigos da central de ajuda
CREATE TABLE IF NOT EXISTS public.desk_knowledge_base (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  category     TEXT,
  tags         TEXT[] DEFAULT '{}',
  is_published BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_desk_conv_status  ON public.desk_conversations(status);
CREATE INDEX IF NOT EXISTS idx_desk_conv_user    ON public.desk_conversations(account_user_id);
CREATE INDEX IF NOT EXISTS idx_desk_conv_updated ON public.desk_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desk_msg_conv     ON public.desk_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_desk_msg_created  ON public.desk_messages(created_at DESC);

-- Trigger para manter updated_at atualizado em desk_conversations
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER desk_conversations_updated_at
  BEFORE UPDATE ON public.desk_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.desk_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para MVP (todos os usuários autenticados e anon têm acesso)
CREATE POLICY "desk_conversations_all" ON public.desk_conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "desk_messages_all" ON public.desk_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Base de conhecimento: qualquer um pode ler artigos publicados; autenticados gerenciam
CREATE POLICY "desk_kb_read_published" ON public.desk_knowledge_base
  FOR SELECT USING (is_published = true);

CREATE POLICY "desk_kb_authenticated_all" ON public.desk_knowledge_base
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Habilitar Realtime para as tabelas desk_*
ALTER PUBLICATION supabase_realtime ADD TABLE public.desk_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.desk_messages;
