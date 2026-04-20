
-- Tabela account (simulação local para testes)
CREATE TABLE IF NOT EXISTS public.account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  stripe_customer_id TEXT,
  has_password BOOLEAN DEFAULT false,
  has_purchase BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: operadores podem ler accounts
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view accounts"
  ON public.account FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agents a WHERE a.id = auth.uid()
  ));
