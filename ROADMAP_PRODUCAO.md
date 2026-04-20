# Roadmap para Produção — CloudDesk

## Visão geral do projeto

CloudDesk é um painel de suporte ao cliente interno da **Cloudfy**, composto por três partes: (1) painel de operadores com inbox em tempo real (3 colunas), (2) chat widget embeddable para clientes já autenticados no app Cloudfy, e (3) motor de IA via OpenAI que responde automaticamente e faz handoff para humano quando necessário. O stack é React 18 + TypeScript + Vite + Tailwind + shadcn/ui no frontend, com Supabase (Auth, Postgres, Realtime) como backend.

---

## Estado atual

### O que está funcionando
- **Inbox (Fase 1 completa):** layout 3 colunas, lista de conversas com Realtime, thread de mensagens com bolhas por tipo (contact/agent/bot/system/note), composer com suporte a notas internas, resolução e mudança de prioridade
- **Realtime duplo:** `postgres_changes` + broadcast channel para sincronizar operador↔widget mesmo sem publicação configurada no Supabase
- **Painel de detalhes:** ClientInfoPanel com dados reais de `account` + `purchases` (inclui alertas de deploy pendente), aba de conversas com timeline e stats
- **Widget funcional:** fluxo completo de criação de conversa, resposta via OpenAI (gpt-4o-mini), handoff automático via keyword `[TRANSFERIR]`, sync de mensagens do operador via broadcast
- **Base de Conhecimento (Knowledge page):** CRUD completo com editor, filtros, toggle publish/draft, delete com confirmação
- **Macros (Macros page):** implementada (não lida detalhadamente, mas existe)
- **Settings page:** existe
- **Sidebar colapsável** com badge de conversas abertas, toggle dark/light
- **Migration SQL** executada: `desk_conversations`, `desk_messages`, `desk_knowledge_base`, índices, triggers de `updated_at`, RLS e publicação Realtime

### O que está incompleto ou quebrado
- **⚠️ AuthGate desativado:** `App.tsx` tem `AuthGate` que é um passthrough — qualquer pessoa sem login acessa o painel inteiro
- **⚠️ Auth mockado no store:** `authStore.ts` tem usuário e agente hardcoded como mock; `fetchAgent` é no-op; login page existe mas não é roteada nem usada
- **⚠️ OPENAI_API_KEY exposta no frontend:** `VITE_OPENAI_API_KEY` está em `.env` e é lida diretamente no bundle do widget (`ChatWidget.tsx` linha 15)
- **Contacts page quebrada:** faz query na tabela `contacts` (não existe) em vez de `account`, com `any[]` sem tipagem
- **RLS permissiva demais:** as policies `desk_conversations_all` e `desk_messages_all` usam `USING (true)` — qualquer usuário anônimo ou autenticado lê e escreve tudo
- **`desk_agents` não existe:** a migration atual não cria `desk_agents`; o `authStore` referencia `org_id` que não existe na spec; o campo `agent.id` mockado é usado em `INSERT desk_messages.sender_id` — em produção isso vai retornar erro de FK inexistente
- **Login page não roteada:** existe `src/pages/Login.tsx` mas não está mapeada em `App.tsx`
- **WidgetPreview não inicializa sessão Supabase real:** usa `PREVIEW_ACCOUNT_USER_ID` fixo; o widget não faz `supabase.auth.getSession()` em nenhum momento — o fluxo de auth do cliente descrito na spec não está implementado
- **CSAT não salva no banco:** `CSATFeedback.tsx` existe mas não verificado se faz INSERT em `desk_csat` (tabela não existe na migration)
- **Muitas tabelas da spec ausentes na migration:** `desk_agents`, `desk_tags`, `desk_conversation_tags`, `desk_macros`, `desk_csat`, `desk_contact_notes`, `desk_activity_log`, `desk_ai_config`, `desk_snippets`, `desk_faq`, `desk_routing_rules`, `desk_ai_interactions` — nenhuma dessas existe
- **`supabase_realtime` publication:** a migration tenta `ALTER PUBLICATION supabase_realtime ADD TABLE` — isso falha silenciosamente em muitos ambientes Supabase hospedados se a publicação já contém `FOR ALL TABLES`
- **TypeScript `any`:** `Contacts.tsx` usa `useState<any[]>` — viola a regra do projeto
- **`chatStore.ts` órfão:** existe mas não é usado em nenhuma página atual

---

## Bloqueadores críticos (must-fix antes de ir a produção)

### ⚠️ 1. OPENAI_API_KEY exposta no bundle do cliente
**Arquivo:** [src/components/widget/ChatWidget.tsx](src/components/widget/ChatWidget.tsx#L15)

```ts
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
```

Qualquer `VITE_*` é embutida no bundle JS e visível no DevTools. A chave `sk-proj-...` do `.env` será pública. **Isso precisa ir para uma Edge Function Supabase** que faz a chamada à OpenAI server-side.

**Correção mínima para MVP:** criar Edge Function `desk-ai-respond` que recebe `{ conversation_id, message }` e chama OpenAI internamente. Remover a chave do frontend.

---

### ⚠️ 2. AuthGate desativado — painel sem autenticação
**Arquivo:** [src/App.tsx](src/App.tsx#L19-L21)

```ts
// DEV MODE: AuthGate bypassed — mock user active via authStore
function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

Em produção qualquer URL do painel estará pública. Precisa:
1. Implementar `AuthGate` real: verificar `supabase.auth.getSession()`, redirecionar para `/login` se não autenticado
2. Rotear `/login` em `App.tsx`
3. Implementar `fetchAgent` no `authStore` para verificar se o email existe em `desk_agents`

---

### ⚠️ 3. RLS completamente aberta
**Arquivo:** [supabase/migrations/20260312000000_desk_tables.sql](supabase/migrations/20260312000000_desk_tables.sql#L73-L78)

```sql
CREATE POLICY "desk_conversations_all" ON public.desk_conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "desk_messages_all" ON public.desk_messages
  FOR ALL USING (true) WITH CHECK (true);
```

Qualquer usuário anônimo pode ler todas as conversas e mensagens de todos os clientes. Isso é uma violação grave de privacidade. Precisa de policies separadas para operadores (`desk_agents`) e clientes (acesso apenas às próprias conversas).

---

### ⚠️ 4. Tabela `desk_agents` não existe — crash em produção
O `authStore` e `ConversationThread` usam `agent.id` como `sender_id` em INSERT. Se `desk_agents` não existir, o campo FK não valida, mas o fluxo de auth real quebraria ao tentar buscar o agente. A migration precisa criar `desk_agents` antes do deploy.

---

### ⚠️ 5. `Contacts.tsx` faz query em tabela errada
**Arquivo:** [src/pages/Contacts.tsx](src/pages/Contacts.tsx#L17)

```ts
supabase.from("contacts").select("*").order("last_seen_at", ...)
```

A tabela é `account`, não `contacts`. Esta página vai retornar vazio silenciosamente (ou erro RLS) em produção. Os campos `last_seen_at` e `first_seen_at` também não existem em `account`.

---

### ⚠️ 6. `.env` com chaves reais commitado no repositório
O arquivo `.env` (não `.env.local`) contém `VITE_SUPABASE_ANON_KEY` e `VITE_OPENAI_API_KEY` com valores reais. Se o repo for público ou acessado por terceiros, as chaves estão comprometidas. A OpenAI key **já deve ser considerada comprometida** — rotacionar imediatamente.

---

## Ajustes importantes (should-fix)

1. **Widget não verifica sessão Supabase do cliente:** conforme spec, deve fazer `supabase.auth.getSession()` e buscar `account WHERE user_id = session.user.id`. Hoje usa `PREVIEW_ACCOUNT_USER_ID` fixo. Sem isso o widget não sabe quem é o cliente.

2. **Login page sem rota:** `Login.tsx` existe e está funcional mas não tem rota em `App.tsx`. Precisa adicionar `<Route path="/login" element={<Login />} />`.

3. **`chatStore.ts` órfão** em `src/stores/chatStore.ts` — remover ou integrar.

4. **TypeScript `any` em `Contacts.tsx`** — viola as regras do projeto.

5. **"Falar com humano" no widget não persiste o handoff:** o botão no widget durante `isAiResponding` adiciona uma mensagem local mas não chama `handleHandoff()` para atualizar o banco (`status=pending`, `ai_active=false`). O operador nunca vai ver que o cliente pediu atendimento humano.

6. **CSAT não salva no banco:** verificar se `CSATFeedback.tsx` faz INSERT em alguma tabela. A tabela `desk_csat` não existe na migration atual.

7. **`desk_knowledge_base` sem campo `created_by`:** a migration não inclui essa coluna, mas o código faz referência implícita ao agente logado ao criar artigos. Não é um crash, mas a auditoria fica incompleta.

8. **Sem controle de erro no `enrichConversations`:** se a query de `account` falhar (RLS, rede), o store silencia o erro (`accountsRes.data ?? []`) e exibe conversas sem nome. Adicionar toast de erro.

9. **`supabase_realtime` publication:** a linha `ALTER PUBLICATION supabase_realtime ADD TABLE` pode já ter sido executada ou pode falhar em instâncias com `FOR ALL TABLES`. Verificar no painel Supabase se as tabelas estão publicadas.

---

## Novas features para produção

Estas features estão na spec (CLAUDE.md) mas não implementadas:

| Feature | Complexidade | Bloqueia MVP? |
|---|---|---|
| Autenticação real de operadores (AuthGate + fetchAgent + desk_agents) | Média | **Sim** |
| Edge Function `desk-ai-respond` (mover OpenAI para servidor) | Média | **Sim** |
| Widget com auth real do cliente (`getSession` → `account`) | Baixa | Não para MVP interno |
| CSAT (tabela + insert + UI) | Baixa | Não |
| Tags em conversas | Baixa | Não |
| Atribuição de conversa a agente específico | Baixa | Não |
| Notificações desktop + som | Baixa | Não |
| Atalhos de teclado | Baixa | Não |
| Analytics / Reports page | Alta | Não |
| Motor de IA completo (pipeline 8 etapas com context, routing rules, embeddings, FAQ dinâmico) | Muito alta | Não |
| Stripe panel | Média | Não |
| Canal de email (Resend) | Alta | Não |
| Gestão de equipe (Settings > Equipe) | Média | Não |
| SLA visual na inbox | Baixa | Não |

---

## Dívida técnica (pode ficar para depois)

- `any` em Contacts — tipar corretamente
- `chatStore.ts` — remover arquivo morto
- Testes unitários: `src/test/example.test.ts` existe mas está vazio (`example.test.ts` só tem o setup)
- Duplicação de componentes: `src/components/dashboard/` tem `ConversationList`, `ChatThread`, `MessageComposer`, `ConversationDetails` que parecem ser versões antigas dos componentes em `src/components/inbox/` — verificar e remover os não usados
- `org_id` no `authStore` referenciado como campo de `Agent` mas não existe na spec de `desk_agents` — remover ou adicionar à migration
- Variável de ambiente `VITE_SUPABASE_ANON_KEY` duplicada com `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` — padronizar para um só nome
- Sem `.env.example` no repositório — documentar variáveis necessárias

---

## Checklist de deploy

### Pré-deploy obrigatório
- [ ] ⚠️ Rotacionar a OpenAI API key (a atual está comprometida no `.env`)
- [ ] Criar `.env.production` com as variáveis corretas (nunca commitar)
- [ ] Adicionar `.env` ao `.gitignore` se não estiver
- [ ] Aplicar migration `desk_agents` (criar tabela)
- [ ] Aplicar migration de RLS correta (policies por role, não `USING (true)`)
- [ ] Criar Edge Function `desk-ai-respond` no Supabase com a OpenAI key como secret
- [ ] Verificar no painel Supabase que `desk_conversations` e `desk_messages` estão na publicação Realtime
- [ ] Implementar AuthGate real + rotear `/login`
- [ ] Criar pelo menos 1 registro em `desk_agents` para o operador admin

### Build
- [ ] `npm run build` sem erros de TypeScript (`npx tsc --noEmit`)
- [ ] Verificar bundle size (OpenAI key não pode aparecer no JS gerado após a mudança)
- [ ] Testar build localmente com `npm run preview`

### Infraestrutura
- [ ] Domínio com HTTPS configurado
- [ ] Variável `VITE_SUPABASE_URL` apontando para o Supabase de produção
- [ ] CORS no Supabase permite o domínio de produção

### Pós-deploy
- [ ] Testar fluxo completo: login operador → inbox → selecionar conversa → enviar mensagem
- [ ] Testar widget: criar conversa → IA responder → operador responder no painel → widget recebe
- [ ] Testar handoff: widget → "Falar com humano" → conversa aparece como `pending` no painel

---

## Estimativa de esforço

| Tarefa | Esforço | Prioridade |
|---|---|---|
| Rotacionar OpenAI key + criar Edge Function `desk-ai-respond` | 3-4h | **P0** |
| AuthGate real + Login roteado + fetchAgent + desk_agents migration | 2-3h | **P0** |
| RLS adequada (policies por role) | 1-2h | **P0** |
| Corrigir Contacts.tsx (query `account` correta) | 30min | **P0** |
| Corrigir "Falar com humano" no widget (persistir handoff) | 1h | **P1** |
| Widget auth real (getSession → account) | 1-2h | **P1** |
| CSAT: criar tabela + implementar INSERT | 1h | **P2** |
| Notificações desktop + som | 1h | **P2** |
| Remover arquivos mortos (chatStore, dashboard/ duplicados) | 30min | **P2** |

**Total P0 (must-fix):** ~7-10 horas de trabalho concentrado.

---

## Veredicto: 1 dia é viável para soft launch?

**Sim, com escopo reduzido.** O core (inbox + realtime + widget + IA) está funcionalmente implementado. Os bloqueadores são de segurança e auth — não de lógica de negócio.

**Mínimo viável para um soft launch interno (uso apenas pela equipe da Cloudfy):**

1. Mover OpenAI key para Edge Function (~3h)
2. Implementar AuthGate real + desk_agents + login funcional (~3h)
3. Corrigir RLS (~1h)
4. Corrigir Contacts (~30min)

Com ~8 horas de trabalho, o sistema está pronto para uso interno por operadores autenticados, com widget funcional para clientes. Features como CSAT, tags, SLA visual, analytics e motor de IA completo ficam para sprints seguintes.

**O que NÃO fazer no soft launch:** não expor o painel publicamente sem resolver os itens P0 acima. A RLS aberta e o AuthGate desativado são riscos reais.
