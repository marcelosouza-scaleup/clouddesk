-- ─── Operadores podem subir imagens na Base de Conhecimento ───────────────────
--
-- O bucket desk-kb-images foi criado em 20260727100000 apenas para o script de
-- migração do Intercom (service role escreve, todo mundo lê). Agora o editor de
-- artigos aceita colar/arrastar prints direto no markdown, então o operador
-- logado precisa poder gravar no bucket pelo browser.
--
-- Leitura pública continua como está (a central /ajuda é pública). Escrita é
-- restrita a agentes via is_desk_agent() — SECURITY DEFINER, sem recursão de RLS
-- (ver 20260602110000_fix_agents_rls_no_recursion.sql).

DROP POLICY IF EXISTS "desk_kb_images_agent_insert" ON storage.objects;
CREATE POLICY "desk_kb_images_agent_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'desk-kb-images' AND public.is_desk_agent());

-- Update permite o upsert (mesmo hash reenviado) sem erro.
DROP POLICY IF EXISTS "desk_kb_images_agent_update" ON storage.objects;
CREATE POLICY "desk_kb_images_agent_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'desk-kb-images' AND public.is_desk_agent())
  WITH CHECK (bucket_id = 'desk-kb-images' AND public.is_desk_agent());

-- Deleção: só admin, e só neste bucket (limpeza de imagem errada).
DROP POLICY IF EXISTS "desk_kb_images_admin_delete" ON storage.objects;
CREATE POLICY "desk_kb_images_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'desk-kb-images' AND public.is_desk_admin());
