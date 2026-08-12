-- desk_conversations.last_message_at — horário da última mensagem da conversa.
--
-- Por que existe: a inbox ordenava por updated_at, mas o horário exibido em cada
-- linha vem da última mensagem. São relógios diferentes — updated_at muda com
-- QUALQUER alteração da linha (status, assigned_agent_id, tags, first_seen_by_
-- agent_at, reativação da IA), então uma conversa cuja última mensagem é de 45min
-- podia aparecer acima de uma de 11h. Com "mais antigas primeiro" isso ficava
-- explícito e errado.
--
-- Ordenar no cliente não resolveria: o .limit(100) faz o Postgres escolher QUAIS
-- 100 linhas retornam, então a chave errada seleciona o conjunto errado.

ALTER TABLE desk_conversations
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Backfill: última mensagem de cada conversa; conversas sem mensagem caem para
-- created_at, para nunca ficarem com NULL (que ordenaria de forma imprevisível).
-- Ignora notas internas, o mesmo critério do trigger abaixo — senão a coluna
-- teria dois significados diferentes conforme a linha fosse antiga ou nova.
UPDATE desk_conversations c
SET last_message_at = COALESCE(
  (SELECT MAX(m.created_at)
     FROM desk_messages m
    WHERE m.conversation_id = c.id
      AND COALESCE(m.is_private_note, false) = false),
  c.created_at
)
WHERE c.last_message_at IS NULL;

ALTER TABLE desk_conversations
  ALTER COLUMN last_message_at SET DEFAULT now();

-- Mantém a coluna em dia a cada mensagem nova. Notas internas NÃO contam: elas
-- são invisíveis para o cliente e não representam atividade na conversa — o
-- mesmo critério usado no preview da lista.
CREATE OR REPLACE FUNCTION desk_touch_last_message_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_private_note, false) THEN
    RETURN NEW;
  END IF;

  UPDATE desk_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id
    AND (last_message_at IS NULL OR last_message_at < NEW.created_at);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_desk_messages_touch_conversation ON desk_messages;

CREATE TRIGGER trg_desk_messages_touch_conversation
  AFTER INSERT ON desk_messages
  FOR EACH ROW
  EXECUTE FUNCTION desk_touch_last_message_at();

-- Índices espelhando os de updated_at (a inbox filtra por status e ordena por
-- last_message_at, nas duas direções — um índice B-tree serve ASC e DESC).
CREATE INDEX IF NOT EXISTS idx_desk_conversations_last_message_at
  ON desk_conversations (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_desk_conversations_status_last_message
  ON desk_conversations (status, last_message_at DESC);
