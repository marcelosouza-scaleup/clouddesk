
-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Agents (internal users)
CREATE TABLE public.agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  role TEXT CHECK (role IN ('admin', 'operator', 'viewer')) DEFAULT 'operator',
  status TEXT CHECK (status IN ('online', 'away', 'offline')) DEFAULT 'offline',
  max_concurrent_chats INT DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  browser_info JSONB DEFAULT '{}',
  location JSONB DEFAULT '{}',
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) NOT NULL,
  assigned_agent_id UUID REFERENCES public.agents(id),
  team TEXT DEFAULT 'support',
  channel TEXT CHECK (channel IN ('chat', 'email')) DEFAULT 'chat',
  status TEXT CHECK (status IN ('open', 'pending', 'snoozed', 'resolved')) DEFAULT 'open',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  subject TEXT,
  sla_deadline TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_type TEXT CHECK (sender_type IN ('contact', 'agent', 'bot', 'system')) NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  content_type TEXT CHECK (content_type IN ('text', 'html', 'image', 'file', 'note')) DEFAULT 'text',
  attachments JSONB DEFAULT '[]',
  is_private_note BOOLEAN DEFAULT false,
  ai_generated BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  UNIQUE(org_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_tags (
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, tag_id)
);
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- Macros
CREATE TABLE public.macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  category TEXT,
  variables JSONB DEFAULT '[]',
  created_by UUID REFERENCES public.agents(id),
  is_shared BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;

-- Activity log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id),
  agent_id UUID REFERENCES public.agents(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_conversations_org_status ON public.conversations(org_id, status);
CREATE INDEX idx_conversations_assigned ON public.conversations(assigned_agent_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_contacts_org ON public.contacts(org_id);
CREATE INDEX idx_contacts_email ON public.contacts(email);

-- Helper function to get agent's org_id
CREATE OR REPLACE FUNCTION public.get_agent_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.agents WHERE id = auth.uid()
$$;

-- RLS Policies - all scoped by org_id through agent membership

-- Organizations: agents can see their own org
CREATE POLICY "Agents can view own org" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_agent_org_id());

-- Agents: can see agents in same org
CREATE POLICY "Agents can view org agents" ON public.agents
  FOR SELECT TO authenticated
  USING (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can update own profile" ON public.agents
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- Contacts: scoped by org
CREATE POLICY "Agents can view org contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can insert org contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can update org contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (org_id = public.get_agent_org_id());

-- Conversations: scoped by org
CREATE POLICY "Agents can view org conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can insert org conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can update org conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (org_id = public.get_agent_org_id());

-- Messages: through conversation org check
CREATE POLICY "Agents can view conversation messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.org_id = public.get_agent_org_id()
    )
  );

CREATE POLICY "Agents can insert messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.org_id = public.get_agent_org_id()
    )
  );

-- Tags
CREATE POLICY "Agents can view org tags" ON public.tags
  FOR SELECT TO authenticated
  USING (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can manage org tags" ON public.tags
  FOR ALL TO authenticated
  USING (org_id = public.get_agent_org_id());

-- Conversation tags
CREATE POLICY "Agents can manage conversation tags" ON public.conversation_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.org_id = public.get_agent_org_id()
    )
  );

-- Macros
CREATE POLICY "Agents can view org macros" ON public.macros
  FOR SELECT TO authenticated
  USING (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can manage org macros" ON public.macros
  FOR ALL TO authenticated
  USING (org_id = public.get_agent_org_id());

-- Activity log
CREATE POLICY "Agents can view org activity" ON public.activity_log
  FOR SELECT TO authenticated
  USING (org_id = public.get_agent_org_id());

CREATE POLICY "Agents can insert activity" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_agent_org_id());

-- Enable realtime for messages and conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Trigger to auto-create agent profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _name TEXT;
BEGIN
  -- Get or create default org
  SELECT id INTO _org_id FROM public.organizations WHERE slug = 'cloudfy' LIMIT 1;
  IF _org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug) VALUES ('Cloudfy', 'cloudfy') RETURNING id INTO _org_id;
  END IF;
  
  _name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  
  INSERT INTO public.agents (id, org_id, name, email, role)
  VALUES (NEW.id, _org_id, _name, NEW.email, 'operator');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
