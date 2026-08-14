-- desk_conversations.contact_last_read_at — até quando o CLIENTE já leu a conversa.
--
-- Por que existe: o widget passou a ter uma lista de chamados (o cliente volta
-- horas/dias depois para ver a resposta do operador). Para marcar "chamado com
-- resposta nova" na lista e contar o badge da bolha, é preciso saber o que ele
-- já viu. Guardar isso em localStorage funcionaria num navegador só — o mesmo
-- cliente abrindo no celular veria tudo como não lido de novo. Como a marca
-- pertence à conversa, ela mora na linha da conversa.
--
-- Só o gateway desk-widget-api escreve aqui (service role, após validar posse).
-- Nada no painel do operador lê/escreve esta coluna: o "visto pelo operador" é
-- outro relógio (first_seen_by_agent_at) e não deve ser confundido com este.

ALTER TABLE desk_conversations
  ADD COLUMN IF NOT EXISTS contact_last_read_at TIMESTAMPTZ;

-- Backfill: conversas que já existem entram como TOTALMENTE LIDAS.
-- O contrário (deixar NULL = tudo não lido) faria todo cliente abrir o widget
-- no dia do deploy com um badge cheio de mensagens antigas que ele já tinha
-- visto no chat aberto — barulho, não informação.
UPDATE desk_conversations
SET contact_last_read_at = COALESCE(last_message_at, updated_at, created_at)
WHERE contact_last_read_at IS NULL;
