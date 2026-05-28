# AUDIT.md — CloudDesk CTO Audit
> Gerado em: 2026-05-28 | Auditor: Claude Sonnet 4.6

---

## 1. Visão Geral do Projeto

**CloudDesk** é uma plataforma de suporte ao cliente interna da **Cloudfy**, startup SaaS brasileira de infraestrutura (~8.000 clientes). O sistema substitui o Intercom e é composto por 3 partes:

1. **Painel do Operador** — Dashboard web (inbox, CRM, gestão de KB, configurações)
2. **Chat Widget** — Bubble embeddável na área logada dos clientes Cloudfy (bundle JS standalone)
3. **Motor de IA** — Agente baseado em OpenAI GPT-4o-mini que responde automaticamente via RAG

O sistema **não é isolado**: roda no mesmo Supabase de produção da Cloudfy, consumindo as tabelas `account`, `purchases`, `products`, `infrastructure` (leitura apenas) e adicionando tabelas com prefixo `desk_`.

### Stack Tecnológica Completa

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + TypeScript | 18.3.1 |
| Build | Vite | 5.4.19 |
| Styling | Tailwind CSS | 3.4.17 |
| UI Components | shadcn/ui + Radix UI | latest |
| Estado Global | Zustand | 5.0.11 |
| Roteamento | React Router | 6.30.1 |
| Queries | TanStack React Query | 5.83.0 |
| Backend | Supabase (Auth, DB, Realtime, Storage, Edge Functions) | 2.98.0 |
| DB | PostgreSQL 15+ + pgvector (embeddings) | — |
| Edge Functions | Deno (Supabase Functions) | — |
| IA | OpenAI GPT-4o-mini (completions) + text-embedding-3-small | — |
| CRM Externo | Airtable API (via Edge Function) | — |
| Charts | Recharts | 2.15.4 |
| Forms | React Hook Form + Zod | — |
| Icons | Lucide React | 0.462.0 |
| Dates | date-fns + ptBR locale | — |
| Markdown | react-markdown | — |
| Toasts | Sonner | — |
| Testes | Vitest + @testing-library/react + jsdom | 3.2.4 |

### Estrutura de Pastas

```
clouddesk/
├── CLAUDE.md                          # Spec autoritativa do projeto
├── src/
│   ├── App.tsx                        # Router + AuthGate (middleware de auth)
│   ├── main.tsx                       # Entry point React
│   ├── index.css                      # CSS variables + tema claro/escuro
│   ├── lib/
│   │   ├── supabase.ts               # Re-export do client (wrapper)
│   │   ├── utils.ts                  # cn() (clsx + tailwind-merge)
│   │   └── theme.ts                  # Hook de tema claro/escuro
│   ├── integrations/supabase/
│   │   ├── client.ts                 # Singleton do Supabase client
│   │   └── types.ts                  # Tipos auto-gerados do schema
│   ├── stores/
│   │   ├── authStore.ts              # Zustand: operador autenticado + desk_agent
│   │   ├── useInboxStore.ts          # Zustand: lista de conversas + tabs + cache
│   │   ├── useConversationStore.ts   # Zustand: thread ativo + perfil do cliente
│   │   └── chatStore.ts              # Zustand: estado widget (possivelmente deprecated)
│   ├── hooks/
│   │   ├── useNotifications.ts       # Desktop notifications + som
│   │   ├── use-mobile.tsx            # Detecção mobile
│   │   └── use-toast.ts              # Toast hook (shadcn)
│   ├── pages/
│   │   ├── Login.tsx                 # Auth operadores
│   │   ├── Inbox.tsx                 # Layout 3 colunas principal
│   │   ├── Contacts.tsx              # CRM (busca Airtable)
│   │   ├── Knowledge.tsx             # CRUD base de conhecimento
│   │   ├── Settings.tsx              # Tags, Views, SLA
│   │   ├── Macros.tsx                # Placeholder vazio
│   │   ├── WidgetPreview.tsx         # Preview do widget
│   │   ├── Index.tsx                 # Redirect → /inbox
│   │   └── NotFound.tsx              # 404
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── AppSidebar.tsx        # Sidebar de navegação
│   │   │   ├── DashboardLayout.tsx   # Wrapper Sidebar + Outlet
│   │   │   ├── ConversationList.tsx  # LEGADO (substituído por inbox/)
│   │   │   ├── ChatThread.tsx        # LEGADO
│   │   │   ├── MessageComposer.tsx   # LEGADO
│   │   │   └── ConversationDetails.tsx # LEGADO
│   │   ├── inbox/
│   │   │   ├── ConversationList.tsx  # Col 1: lista com tabs, bulk actions, realtime
│   │   │   ├── ConversationThread.tsx# Col 2: thread + composer + broadcast
│   │   │   ├── ConversationDetails.tsx# Col 3: SLA, tags, activity
│   │   │   └── ClientInfoPanel.tsx   # Dados account + purchases + Airtable
│   │   ├── widget/
│   │   │   ├── ChatWidget.tsx        # Container principal do widget
│   │   │   ├── ChatBubbleButton.tsx  # Botão flutuante
│   │   │   ├── ChatWidgetHeader.tsx  # Header do widget
│   │   │   ├── ChatWidgetWelcome.tsx # Tela inicial
│   │   │   ├── ChatWidgetThread.tsx  # Thread de mensagens
│   │   │   ├── ChatWidgetComposer.tsx# Input do widget
│   │   │   ├── CSATFeedback.tsx      # Rating pós-resolução
│   │   │   ├── useWidgetStore.ts     # Zustand: estado do widget
│   │   │   └── types.ts              # Tipos do widget
│   │   └── ui/                       # 60+ componentes shadcn/ui
│   ├── widget-embed/
│   │   └── index.tsx                 # Entry point IIFE do bundle standalone
│   └── test/
│       ├── example.test.ts           # Exemplo vitest (sem testes reais)
│       └── setup.ts                  # Setup vitest
├── supabase/
│   ├── config.toml                   # Config Supabase CLI
│   ├── migrations/
│   │   ├── 20260223213604_*.sql      # Setup inicial
│   │   ├── 20260227193358_*.sql      # Updates de schema
│   │   ├── 20260312000000_desk_tables.sql       # Tabelas core + RLS (permissivo)
│   │   ├── 20260414000000_rag_functions.sql     # FAQ + embeddings pgvector
│   │   ├── 20260414100000_views_sla_tags.sql    # Views, SLA, Tags
│   │   └── 20260420000000_inbox_perf_indexes.sql# Índices de performance
│   └── functions/
│       ├── _shared/cors.ts           # CORS headers compartilhados
│       ├── desk-ai-respond/          # Pipeline de IA (OpenAI)
│       ├── desk-generate-embedding/  # Geração de embeddings para KB/FAQ
│       ├── desk-embed-article/       # Publicar artigo KB
│       ├── get-contact-info/         # Lookup Airtable por email
│       └── check-widget-eligibility/ # Verifica se cliente pode usar widget
└── public/
    ├── favicon.ico
    └── robots.txt
```

---

## 2. Inventário de Funcionalidades

| Funcionalidade | Status | Observação |
|---|---|---|
| Login de operadores | ✅ Funciona | Auth Supabase + verificação desk_agents |
| Inbox 3 colunas | ✅ Funciona | Layout responsivo sólido |
| Lista de conversas (4 tabs) | ✅ Funciona | Abertas, Pendentes, Adiadas, Resolvidas |
| Realtime conversas | ✅ Funciona | Postgres Changes subscription |
| Thread de mensagens | ✅ Funciona | 5 tipos de bolha + auto-scroll |
| Envio de mensagens (operador) | ✅ Funciona | Insert + broadcast ao widget |
| Notas internas | ✅ Funciona | is_private_note, visível só operadores |
| Realtime mensagens | ✅ Funciona | Postgres Changes filtrado por conversa |
| Broadcast widget↔operador | ✅ Funciona | Canal `conv-live:{id}` |
| Painel de detalhes (col 3) | ✅ Funciona | SLA countdown, tags, info do cliente |
| Dados do cliente (account) | ✅ Funciona | Busca via account_user_id |
| Dados de compras (purchases) | ✅ Funciona | Join com products |
| Lookup Airtable (CRM) | ✅ Funciona | Edge Function get-contact-info |
| SLA deadline + timer | ✅ Funciona | Cálculo + visual vermelho/amarelo/verde |
| Políticas de SLA (CRUD) | ✅ Funciona | Settings > SLA, match por plano+prioridade |
| Tags (CRUD) | ✅ Funciona | Settings > Tags |
| Views personalizadas (CRUD) | ✅ Funciona | Settings > Views, com filtros JSONB |
| Notificações desktop | ✅ Funciona | Web Notifications API |
| Som de notificação | ⚠️ Parcial | Código existe, arquivo MP3 ausente em `/public` |
| Atribuição de conversa | ✅ Funciona | "Atribuir a mim" + badge |
| Resolver conversa | ✅ Funciona | Status → resolved + resolved_at |
| Bulk resolve | ✅ Funciona | Seleção múltipla + resolve em lote |
| Mudar prioridade | ✅ Funciona | Dropdown + aplica SLA policy |
| Chat widget (cliente) | ✅ Funciona | Criar conversa + enviar mensagens |
| IA responde no widget | ✅ Funciona | Edge Function desk-ai-respond |
| Handoff IA → Humano | ✅ Funciona | [TRANSFERIR] keyword + botão "Falar com humano" |
| Realtime widget (operator messages) | ✅ Funciona | Broadcast channel + postgres fallback |
| CSAT (rating pós-resolução) | ⚠️ Parcial | UI existe, sem persistência em desk_csat |
| Base de conhecimento (CRUD) | ✅ Funciona | Create/edit/publish/delete artigos |
| Geração de embedding KB | ✅ Funciona | Edge Function desk-generate-embedding |
| RAG no motor de IA | ✅ Funciona | Semantic search KB + FAQ |
| FAQ dinâmico | ⚠️ Parcial | Tabela existe + busca funciona, sem auto-inserção de novos FAQs |
| CRM/Contatos | ⚠️ Parcial | Busca por email via Airtable, sem listagem paginada |
| Widget Preview | ✅ Funciona | Página standalone para preview |
| Macros | ❌ Quebrada | Placeholder vazio, sem implementação |
| Regras de routing/escalonamento | ❌ Não implementado | Tabela `desk_routing_rules` inexistente na migration |
| Configuração de IA (painel) | ❌ Não implementado | Sem UI para CRUD de providers/persona |
| Métricas da IA | ❌ Não implementado | desk_ai_interactions existe, sem dashboard |
| Stripe panel | ❌ Não implementado | Edge Function ausente, sem UI |
| Canal email (Resend) | ❌ Não implementado | Edge Function não existe |
| Dashboard de analytics | ❌ Não implementado | Recharts instalado, sem uso |
| Gestão de equipe (operadores) | ❌ Não implementado | Sem UI para criar/editar operadores |
| Atalhos de teclado | ❌ Não implementado | Definidos no CLAUDE.md, sem código |
| Typing indicator | ❌ Não implementado | Presence API não configurada |
| Busca global (Ctrl+K) | ❌ Não implementado | — |
| Widget check-eligibility | ⚠️ Parcial | Edge Function existe, não chamada pelo widget |

---

## 3. Bugs e Problemas Identificados

### CRÍTICO

**Bug C1 — RLS completamente aberta (zero segurança)**
- **Arquivo**: `supabase/migrations/20260312000000_desk_tables.sql`, linhas 73–77
- **Código**:
  ```sql
  CREATE POLICY "desk_conversations_all" ON public.desk_conversations
    FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "desk_messages_all" ON public.desk_messages
    FOR ALL USING (true) WITH CHECK (true);
  ```
- **Causa**: RLS habilitado mas policies com `USING (true)` — qualquer usuário autenticado lê e escreve qualquer dado
- **Impacto**: CRÍTICO. Qualquer cliente Cloudfy logado pode ler TODAS as conversas de suporte de todos os outros clientes, ver notas internas dos operadores, e manipular conversas alheias. Vazamento total de dados de suporte.

**Bug C2 — PREVIEW_ACCOUNT_USER_ID hardcoded no bundle do widget**
- **Arquivo**: `src/components/widget/ChatWidget.tsx`, linha 13
- **Código**: `const PREVIEW_ACCOUNT_USER_ID = "00000000-0000-0000-0000-000000000001";`
- **Causa**: UUID de fallback para sessões não autenticadas enviado para produção junto com o widget
- **Impacto**: CRÍTICO. Em produção, se a sessão falhar silenciosamente, o widget cria conversas atribuídas a um UUID fantasma, perdendo o vínculo com o cliente real. Não há validação se o usuário está autenticado antes de criar a conversa — o widget simplesmente usa o fallback.

**Bug C3 — Chave Supabase exposta no bundle público do widget**
- **Arquivo**: `src/widget-embed/index.tsx` + `.env`
- **Causa**: `VITE_SUPABASE_ANON_KEY` é injetada no bundle IIFE. Como o widget é embeddado em páginas de clientes, qualquer pessoa com DevTools pode ver a anon key.
- **Impacto**: CRÍTICO em combinação com C1. A anon key + RLS aberta = acesso completo ao banco por qualquer pessoa.
- **Mitigação atual**: A anon key é "publishable" por design no Supabase, mas sem RLS adequada isso é perigoso.

**Bug C4 — Motor de IA insere resposta no banco mesmo quando `should_handoff = true`**
- **Arquivo**: `supabase/functions/desk-ai-respond/index.ts`, linhas 275–280
- **Causa**: A função retorna `{ reply: rawReply, should_handoff: true }` mas NÃO filtra o `rawReply` — ele contém a string `[TRANSFERIR]` completa. O cliente no widget (ChatWidget.tsx linha 170) filtra corretamente (`else if aiResult.should_handoff`), mas se a função fosse chamada por outro consumer que não implementasse esse filtro, a string `[TRANSFERIR]` seria exibida ao cliente.
- **Impacto**: MÉDIO. O fluxo atual no widget está correto, mas a Edge Function não faz sanitização server-side da resposta.

**Bug C5 — Arquivo de som de notificação ausente**
- **Arquivo**: `src/hooks/useNotifications.ts` + `public/`
- **Causa**: O código referencia `/notification-sound.mp3` mas o arquivo não existe em `public/`
- **Impacto**: MÉDIO. Erro silencioso no console, `audio.play()` rejeita a Promise — sem try/catch, gera unhandled rejection.

---

### MÉDIO

**Bug M1 — Cache da tab de conversas de 30 segundos sem invalidação por evento**
- **Arquivo**: `src/stores/useInboxStore.ts`
- **Causa**: `_tabCache` com TTL de 30s por tab. Quando um evento Realtime chega via `upsertConversation()`, ele atualiza a lista em memória mas não invalida o cache da tab. Se o operador trocar de tab em menos de 30s, verá dados potencialmente desatualizados do banco.
- **Impacto**: MÉDIO. Pode mostrar conversas com status errado por até 30 segundos.

**Bug M2 — first_seen_by_agent_at atualizado sem coluna na migration**
- **Arquivo**: `src/components/inbox/ConversationThread.tsx`, linhas 82–97
- **Causa**: Código tenta atualizar `desk_conversations.first_seen_by_agent_at` mas essa coluna NÃO existe na migration `20260312000000_desk_tables.sql`. A migration principal não tem essa coluna. Pode estar em uma das migrations anteriores não lidas, mas o cast `as typeof conversation & { first_seen_by_agent_at?: string | null }` é um red flag.
- **Impacto**: MÉDIO. Update silenciosamente falha (Supabase retorna erro mas está em `.then()` sem tratamento adequado). O indicador de "não lido" nunca é marcado como visto.

**Bug M3 — CSAT sem persistência**
- **Arquivo**: `src/components/widget/CSATFeedback.tsx`
- **Causa**: UI de CSAT (😞😐😊) existe mas sem INSERT em `desk_csat`. A tabela `desk_csat` está definida no CLAUDE.md mas ausente nas migrations aplicadas.
- **Impacto**: MÉDIO. Dados de satisfação do cliente perdidos.

**Bug M4 — Contador de tab "open" mostra "não lido" com lógica errada**
- **Arquivo**: `src/components/inbox/ConversationList.tsx`, linha 191
- **Código**: `const unreadCount = conversations.filter((c) => !c.first_seen_by_agent_at).length;`
- **Causa**: Como `first_seen_by_agent_at` nunca é efetivamente salvo (Bug M2), o unreadCount sempre será igual ao total de conversas abertas em memória, não refletindo o estado real.
- **Impacto**: MÉDIO. Badge de "não lido" sempre mostrará o total de conversas abertas.

**Bug M5 — FAQ dinâmico não insere novos registros automaticamente**
- **Arquivo**: `supabase/functions/desk-ai-respond/index.ts`
- **Causa**: O CLAUDE.md especifica que após cada resposta bem-sucedida da IA, o sistema deve criar um novo FAQ com `source='auto'` se não houver match com similaridade > 0.92. A Edge Function não implementa isso — apenas faz a busca semântica mas nunca insere.
- **Impacto**: MÉDIO. O sistema não aprende. FAQ dinâmico é funcionalidade morta.

**Bug M6 — Duplicate Realtime subscriptions possíveis no widget**
- **Arquivo**: `src/components/widget/ChatWidget.tsx`, linhas 308–350
- **Causa**: O componente cria dois canais: `widget-conv:{convId}` (postgres_changes) e `conv-live:{convId}` (broadcast). O canal de broadcast em `ChatWidget.tsx` e o canal de broadcast em `ConversationThread.tsx` usam o mesmo nome `conv-live:{convId}`. Se dois usuários (operador + cliente) estiverem no mesmo canal broadcast, o widget pode receber suas próprias mensagens duplicadas ao inserir via `insertMessage`.
- **Impacto**: MÉDIO. Duplicação de mensagens no widget em edge cases.

**Bug M7 — Tabela `desk_routing_rules` não existe nas migrations**
- **Causa**: O CLAUDE.md e o AUDIT descrevem routing rules como parte do motor de IA, mas a tabela não foi criada em nenhuma migration. A Edge Function `desk-ai-respond` não implementa nenhuma lógica de routing.
- **Impacto**: MÉDIO. Funcionalidade completamente ausente mesmo sendo descrita como core da IA.

**Bug M8 — onlineAgents hardcoded no widget**
- **Arquivo**: `src/components/widget/ChatWidget.tsx`, linha 358
- **Código**: `onlineAgents={2}`
- **Causa**: Número de agentes online fixo em 2. Widget sempre mostrará "2 agentes online" independente da realidade.
- **Impacto**: BAIXO/MÉDIO. Experiência enganosa para o cliente.

---

### BAIXO

**Bug L1 — TypeScript strict mode desabilitado**
- **Arquivo**: `tsconfig.json`
- **Causa**: `noImplicitAny: false`, `strictNullChecks: false`
- **Impacto**: BAIXO. Permite código inseguro passar sem erros. Dificulta refactors futuros.

**Bug L2 — Componentes legados em dashboard/ nunca removidos**
- **Arquivos**: `src/components/dashboard/ConversationList.tsx`, `ChatThread.tsx`, `MessageComposer.tsx`, `ConversationDetails.tsx`
- **Causa**: Foram substituídos pelos componentes em `inbox/` mas não deletados.
- **Impacto**: BAIXO. Confusão de navegação, bundle ligeiramente maior.

**Bug L3 — `chatStore.ts` possivelmente orphan**
- **Arquivo**: `src/stores/chatStore.ts`
- **Causa**: Existe uma store separada (`chatStore`) além de `useWidgetStore`. Não está claro qual é usada.
- **Impacto**: BAIXO. Dead code potencial.

**Bug L4 — Sem paginação na lista de conversas**
- **Arquivo**: `src/stores/useInboxStore.ts`
- **Causa**: `loadConversations` carrega as conversas sem LIMIT ou paginação. Com 8.000 clientes, uma tab "Resolvidas" pode conter milhares de linhas.
- **Impacto**: BAIXO agora, CRÍTICO em produção com volume real.

**Bug L5 — sem tratamento de erro no broadcast channel do widget**
- **Arquivo**: `src/components/widget/ChatWidget.tsx`, linhas 330–345
- **Causa**: Subscribe sem tratamento de `status === 'CHANNEL_ERROR'`
- **Impacto**: BAIXO. Widget pode ficar sem receber mensagens do operador silenciosamente.

---

## 4. Dependências com Risco

| Dependência | Risco | Detalhes |
|---|---|---|
| `@radix-ui/*` (27 pacotes) | BAIXO | Versões recentes, mantidas ativamente |
| `zustand@5.0.11` | BAIXO | Versão major 5 é recente (2024), API mudou vs v4 — CLAUDE.md ainda diz "v4" |
| `@supabase/supabase-js@2.98.0` | BAIXO | Up-to-date |
| `react-hook-form` | BAIXO | Instalado mas sem uso identificado nos componentes principais |
| `zod` | BAIXO | Instalado, uso mínimo identificado |
| `@tanstack/react-query@5.83.0` | BAIXO | Instalado, sem uso identificado — o código faz fetch direto do Supabase |
| `recharts@2.15.4` | BAIXO | Instalado mas sem uso (dashboard não implementado) |
| `input-otp` | BAIXO | Componente shadcn instalado, zero uso identificado |
| `vaul` (drawer) | BAIXO | Instalado via shadcn, uso incerto |
| `cmdk` (command palette) | BAIXO | Instalado, busca global não implementada |
| Airtable (via Edge Function) | MÉDIO | Dependência externa não-oficial — sem SDK, fetch manual; se Airtable mudar a API, quebra silenciosamente |
| OpenAI (hardcoded) | MÉDIO | Provider único hardcoded na Edge Function; sem fallback. Se a API cair, IA para completamente |
| Lovable (deployment) | MÉDIO | README indica deploy via plataforma Lovable — dependência de vendor para CI/CD |

---

## 5. Gaps de Implementação

Funcionalidades **especificadas no CLAUDE.md** mas **não implementadas**:

| Funcionalidade | Onde está no CLAUDE.md | Status Real |
|---|---|---|
| Multi-LLM (Anthropic, Google, Groq, Custom) | Seção 7.4 — providers completos com código de exemplo | Apenas OpenAI hardcoded na Edge Function |
| `desk_ai_config` table (CRUD providers) | Seção 4.2 — schema completo | Tabela não existe nas migrations |
| Persona editor (nome, tom, regras) | Seção 7.1 — JSONB persona completo | Hardcoded na Edge Function como `BASE_SYSTEM_PROMPT` |
| Pipeline de contexto completo (8 steps) | Seção 7.3 — Steps 1-8 detalhados | Implementado até Step 3 (sem Steps 4-5: infra histórico anterior) |
| Histórico de conversas anteriores do cliente (Step 5) | Seção 7.3 | Não implementado |
| Status da infraestrutura no contexto da IA (Step 4) | Seção 7.3 | Não implementado |
| FAQ auto-inserção (`source='auto'`) | Seção 7.5 | Não implementado |
| Routing rules inteligentes | Seção 7.6 — tabela + lógica completa | Tabela não existe, zero lógica na Edge Function |
| Edge Function `desk-ai-evaluate-routing` | Seção 9 | Não existe |
| Edge Function `desk-stripe-customer` | Seção 9 | Não existe |
| Edge Function `desk-inbound-email` | Seção 9 | Não existe |
| StripePanel no painel de detalhes | Seção CLAUDE estrutura | Não implementado |
| Métricas da IA (tokens, custo, taxa escalação) | Seção 7.8 | `desk_ai_interactions` existe mas sem UI |
| Dashboard de analytics (Recharts) | Fase 5 | Não implementado |
| Gestão de equipe (criar/editar operadores) | `SettingsTeam.tsx` no CLAUDE.md | Não existe |
| Macros CRUD | `Macros.tsx` page | Placeholder vazio |
| Atalhos de teclado | Seção 11 | Não implementado |
| Typing indicator (Presence API) | Seção 6 | Não implementado |
| Busca global Ctrl+K | Seção 11 | Não implementado |
| `desk_macros` table | Seção 4.2 | Não está nas migrations |
| `desk_ai_config` table | Seção 4.2 | Não está nas migrations |
| `desk_csat` table | Seção 4.2 | Não está nas migrations |
| `desk_contact_notes` table | Seção 4.2 | Não está nas migrations |
| `desk_activity_log` table | Seção 4.2 | Não está nas migrations |
| `desk_routing_rules` table | Seção 7.2 | Não está nas migrations |
| `desk_snippets` table | Seção 4.2 | Não está nas migrations |
| Confiança abaixo do threshold → escalação automática | Seção 7.7 | Não implementado |
| Reativação da IA pelo operador | Seção 7.7 ("Reativar IA") | Sem botão no UI |
| Shadow DOM para o widget | Seção 8 | Widget injeta estilos globalmente, sem Shadow DOM |

---

## 6. Problemas de Integração

### Supabase
- **RLS**: As policies atuais permitem acesso total a qualquer usuário autenticado (ver Bug C1). Clientes Cloudfy que são usuários do mesmo Supabase podem acessar dados de suporte que não são deles.
- **Realtime Publication**: A migration `20260312000000` adiciona `desk_conversations` e `desk_messages` à `supabase_realtime` publication, mas em produção isso pode não estar aplicado. O widget usa um canal de broadcast como fallback justamente porque "this is the reliable fallback path that doesn't depend on publication settings" — isso sugere que Realtime de postgres_changes pode não estar funcionando no ambiente de produção.
- **Schema Types**: `src/integrations/supabase/types.ts` pode estar desatualizado em relação às migrations mais recentes (RAG functions, views, SLA). O tipo `Tables<'desk_conversations'>` pode não incluir colunas adicionadas depois da geração inicial.
- **first_seen_by_agent_at**: Coluna referenciada no código mas ausente na migration principal (Bug M2).

### OpenAI
- **Chave**: Armazenada como Supabase Secret (`OPENAI_API_KEY`) — correto.
- **Sem fallback**: Se a OpenAI API estiver indisponível, `desk-ai-respond` retorna 500 e o widget mostra mensagem de erro genérica. Nenhum retry, nenhum fallback para outro provider.
- **Sem rate limiting**: Edge Function não implementa controle de taxa. Se houver burst de mensagens, pode gerar custos inesperados.
- **Sem configuração dinâmica**: Modelo (`gpt-4o-mini`) e temperatura (0.7) estão hardcoded. Não há como mudar sem deploy.

### Airtable
- **Sem SDK oficial**: `get-contact-info` faz fetch manual à API do Airtable.
- **Sem cache**: Cada abertura do painel de detalhes faz uma nova chamada à API.
- **Sem tratamento de rate limit**: Airtable tem limite de 5 req/s por base. Com múltiplos operadores abrindo conversas simultaneamente, pode ser throttled.
- **Campo plan**: O `airtableInfo.plan` é usado para matching de SLA policies mas se o campo estiver vazio/nulo no Airtable, cai para a política global.

### Widget embed
- **Sem Shadow DOM**: CSS do widget pode conflitar com o app host da Cloudfy.
- **Bundle size**: Widget inclui todo o React + Supabase client + componentes. Sem análise de tamanho do bundle atual.
- **check-widget-eligibility**: Edge Function existe mas não é chamada pelo widget atual — qualquer usuário autenticado no Supabase pode iniciar uma conversa, independente de ter compra ativa.

---

## 7. Problemas de Ambiente

### Variáveis de ambiente
```env
# .env (committado no repo — contém chaves reais)
VITE_SUPABASE_URL=https://tgjvjgvbqckoqjtgbjqx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_IASe8OseXyTsDBuAJTAJWA_NViAyIR4
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_IASe8OseXyTsDBuAJTAJWA_NViAyIR4
```
- **Problema**: O arquivo `.env` (não `.env.local`) está presente no repositório e provavelmente commitado. Isso expõe a URL e a anon key do Supabase de PRODUÇÃO no histórico git.
- **Problema**: `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_ANON_KEY` têm o mesmo valor — duplicação desnecessária.

### Configurações hardcoded
- `gpt-4o-mini` model na Edge Function `desk-ai-respond`
- `text-embedding-3-small` model para embeddings
- `temperature: 0.7`, `max_tokens: 512` fixos
- `PREVIEW_ACCOUNT_USER_ID` no bundle do widget
- `onlineAgents={2}` no ChatWidgetHeader
- CORS: `_shared/cors.ts` permite qualquer origin (`Access-Control-Allow-Origin: *`) — sem validação de origin nas Edge Functions

### Configuração ausente
- **`OPENAI_API_KEY`**: Precisa estar configurada nos Supabase Secrets de produção. Não há documentação de como fazer isso além do CLAUDE.md.
- **`AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID`**: Necessários para `get-contact-info`. Sem documentação do campo exato do Airtable que contém o email do cliente.
- **`STRIPE_SECRET_KEY`**: Referenciado no CLAUDE.md, Edge Function não existe ainda.
- **notification-sound.mp3**: Arquivo ausente em `public/`.
- **`.gitignore`**: Não verificado se `.env` está incluído. Provável que não esteja se as chaves estão expostas.
