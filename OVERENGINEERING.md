# OVERENGINEERING.md — O que simplificar no CloudDesk
> Contexto: startup com 7 funcionários e 8.000 clientes. Velocidade e confiabilidade valem mais que elegância técnica.

---

## 1. O que está Over-Engineered

### OE-1 — Cache de 30 segundos por tab na inbox com lógica de TTL manual
**O que foi feito**: `useInboxStore` implementa um `_tabCache` com timestamp por tab. Ao trocar de tab, checa se o cache expirou (30s). Lógica manual de invalidação + TTL + upsert em memória.

**Por que é desnecessário**: O Realtime do Supabase já mantém a lista atualizada via `upsertConversation`. O cache combate um problema que o Realtime resolve. Além disso, a lógica de invalidação está incompleta (Bug M1) — o cache não é invalidado quando o evento Realtime chega.

**Versão simples equivalente**: Carregar a tab quando o operador clica nela. Pronto. Com Realtime ativo, a lista se auto-atualiza. Se houver latência perceptível, adicionar um skeleton — isso é suficiente.

---

### OE-2 — TanStack React Query instalado e não usado
**O que foi feito**: `@tanstack/react-query@5.83.0` está no `package.json`. O `QueryClientProvider` não foi encontrado no `App.tsx`. Nenhum `useQuery` ou `useMutation` foi identificado nos componentes.

**Por que é desnecessário**: O projeto usa fetch direto do Supabase client nos componentes e nos Zustand stores. React Query foi instalado como dependência antecipada para uma arquitetura que não foi adotada.

**Versão simples equivalente**: Continuar com o padrão atual (Supabase client direto). Se surgir necessidade de caching/deduplication no futuro, adicionar React Query naquele momento.

**Ação**: Remover do `package.json`. Economiza ~50KB no bundle.

---

### OE-3 — Dual-store para widget: `chatStore.ts` + `useWidgetStore.ts`
**O que foi feito**: Existem duas Zustand stores para o widget — `chatStore.ts` e `widget/useWidgetStore.ts`. O widget usa apenas `useWidgetStore`. `chatStore` parece ser um resquício de uma implementação anterior.

**Por que é desnecessário**: Dois stores para o mesmo domínio. Estado duplicado potencial. Confusão ao debugar.

**Versão simples equivalente**: Deletar `chatStore.ts`. Tudo que o widget precisa já está em `useWidgetStore`.

---

### OE-4 — Componentes legados em `dashboard/` nunca removidos
**O que foi feito**: `src/components/dashboard/` contém `ConversationList.tsx`, `ChatThread.tsx`, `MessageComposer.tsx`, `ConversationDetails.tsx` — versões antigas dos componentes da inbox, completamente substituídas pelos arquivos em `src/components/inbox/`.

**Por que é desnecessário**: Dead code. Não são importados por nada. Confundem novos devs.

**Versão simples equivalente**: Deletar a pasta `src/components/dashboard/` inteira (exceto `AppSidebar.tsx` e `DashboardLayout.tsx` que são usados).

---

### OE-5 — `lib/supabase.ts` que apenas re-exporta `integrations/supabase/client.ts`
**O que foi feito**: Existe `src/lib/supabase.ts` cujo único conteúdo é re-exportar o client de `src/integrations/supabase/client.ts`. Alguns componentes importam de um path, outros do outro.

**Por que é desnecessário**: Indireção sem propósito. Cria dois paths de import para a mesma coisa, causando inconsistência.

**Versão simples equivalente**: Escolher um path canônico (`@/integrations/supabase/client`) e atualizar todos os imports. Deletar `src/lib/supabase.ts`.

---

### OE-6 — Scoring de SLA policy com algoritmo de 4 níveis em JavaScript
**O que foi feito**: `useConversationStore.applySlaPolicy()` carrega TODOS os policies ativos do banco, depois os pontua em JS com scores de 1–4 para encontrar o melhor match por plano + prioridade.

**Por que é desnecessário**: É uma query SQL de uma linha com `ORDER BY` e `LIMIT 1`. O banco faz isso 1000x mais eficientemente.

**Versão simples equivalente**:
```sql
SELECT first_response_minutes FROM desk_sla_policies
WHERE is_active = true
  AND (plan = $1 OR plan IS NULL)
  AND (priority = $2 OR priority IS NULL)
ORDER BY (plan IS NOT NULL)::int + (priority IS NOT NULL)::int DESC
LIMIT 1;
```
Uma chamada, sem código JS extra.

---

### OE-7 — 27 pacotes Radix UI instalados individualmente
**O que foi feito**: `package.json` lista `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`... 27 pacotes separados. Muitos deles (aspect-ratio, navigation-menu, menubar, carousel, input-otp) são componentes shadcn gerados mas nunca usados no CloudDesk.

**Por que é desnecessário**: Cada pacote Radix é uma dependência separada. Componentes como `carousel`, `input-otp`, `navigation-menu`, `context-menu`, `hover-card`, `menubar` não aparecem em nenhum componente do CloudDesk.

**Versão simples equivalente**: Auditar quais componentes shadcn são realmente usados e remover os demais (tanto o arquivo em `src/components/ui/` quanto o pacote Radix correspondente).

---

### OE-8 — Pipeline de context building da IA over-specified antes de existir
**O que foi feito**: O CLAUDE.md descreve um pipeline de 8 steps para a IA incluindo: histórico de todas as conversas anteriores do cliente, status em tempo real da infraestrutura, scoring de FAQ, FAQ auto-insert, routing rules. A Edge Function implementa apenas Steps 1, 3 e 6.

**Por que é desnecessário agora**: Steps 4 (status de infraestrutura) e 5 (histórico completo de conversas) adicionam latência significativa à Edge Function (mais queries ao banco) antes de existir evidência de que os clientes precisam dessas informações na IA. O sistema já funciona sem eles.

**Versão simples equivalente**: Implementar Steps 4 e 5 apenas quando um operador reportar que a IA falhou por falta desse contexto. Medir primeiro, otimizar depois.

---

### OE-9 — Multi-LLM architecture planejada antes de ter 1 LLM funcionando bem
**O que foi feito**: CLAUDE.md especifica suporte a OpenAI, Anthropic, Google, Groq e "Custom endpoint", com tabela `desk_ai_config` configurável por admin. Implementação atual: GPT-4o-mini hardcoded.

**Por que é desnecessário**: Com 7 funcionários e 8.000 clientes, trocar de LLM é uma decisão estratégica que acontece raramente. Construir infraestrutura para trocar de provider dinamicamente via painel de admin antes de estabilizar com 1 provider é premature optimization.

**Versão simples equivalente**: Hardcode do provider em variável de ambiente. `OPENAI_MODEL=gpt-4o-mini`. Quando precisar trocar, muda a variável e faz deploy. Se chegar o dia de suportar múltiplos providers simultaneamente, aí sim constrói o painel.

---

### OE-10 — `desk_views` com filtros JSONB para uma feature que poucos usarão
**O que foi feito**: Views personalizadas da inbox com filtros em JSONB (`{ airtable_product?, status?, priority? }`), drag-and-drop para reordenar, toggle ativo/inativo, cor, emoji.

**Por que é desnecessário agora**: Com 7 funcionários, os filtros de inbox que realmente importam são "minhas conversas" e as 4 tabs padrão. Views customizáveis são features de times maiores.

**Versão simples equivalente**: Manter as 4 tabs (Open, Pending, Snoozed, Resolved) + filtro "minhas conversas". Se um operador pedir um filtro específico, adicionar como opção fixa no código — não como sistema dinâmico configurável.

---

## 2. Abstrações Prematuras

### AP-1 — Zustand store para dados que poderiam ser state local
`useConversationStore` guarda `clientProfile` e `airtableInfo` globalmente. Esses dados são relevantes apenas quando o painel de detalhes está aberto para uma conversa específica. Se o operador fechar o painel, os dados ficam "pendurados" na store global até serem limpos manualmente. São dados de escopo de componente, não de escopo global.

### AP-2 — `convLiveChannelName()` como função exportada
`src/components/inbox/ConversationThread.tsx` exporta `convLiveChannelName` como função nomeada para garantir que o nome do canal de broadcast seja consistente entre operador e widget. É uma string template `conv-live:${id}` com wrapper de função. Um comentário no código com o formato exato seria suficiente — não precisa de função exportada.

### AP-3 — `broadcast + postgres_changes` como dois canais paralelos no widget
O widget assina dois canais diferentes para receber mensagens do operador: postgres_changes e broadcast. Isso existe porque o Realtime pode não estar configurado em produção. A solução certa é configurar o Realtime em produção, não manter dois caminhos paralelos indefinidamente.

### AP-4 — `scorePolicy()` em JavaScript para matching de SLA
(Ver OE-6) — Algoritmo de scoring em JS para uma query SQL trivial.

### AP-5 — `_tabCache` como Map interno na Zustand store
Cache manual com TTL implementado dentro de uma Zustand store, quando o Realtime já resolve o problema de dados desatualizados e um simples re-fetch ao trocar de tab seria suficiente.

---

## 3. Funcionalidades que Não Deveriam Existir Ainda

### FN-1 — Sistema completo de Views personalizadas
Views com CRUD, drag-and-drop, filtros JSONB, emoji, cor. Feature de time de 30+ operadores. Para 7 pessoas, as 4 tabs padrão são suficientes.

### FN-2 — `desk_views` com `order_index` e `filters JSONB`
Schema elaborado para uma feature que não será usada de forma significativa no curto prazo.

### FN-3 — Arquitetura multi-LLM com `desk_ai_config`
Tabela configurável de providers, fallback providers, confidence threshold dinâmico. Complexidade que só faz sentido quando houver 3+ LLMs em uso simultâneo ou necessidade de trocar de provider por cliente.

### FN-4 — FAQ dinâmico com auto-inserção e pipeline de hit_count
O mecanismo de auto-learning do FAQ (criar FAQs automaticamente a partir de respostas da IA) é uma feature sofisticada que requer curadoria humana para ser útil. Sem um admin ativamente gerenciando o FAQ gerado automaticamente, ele vira ruído. Para começar: FAQ 100% manual é mais confiável.

### FN-5 — `desk_routing_rules` com 5 tipos de action e target_team
Routing inteligente por keywords com escalação para times específicos é feature de CRM enterprise. Para 7 operadores, uma regra simples é suficiente: "se o cliente mencionar cancelamento ou billing, escalar imediatamente". Isso pode ser hardcoded na Edge Function ou configurado como 2-3 keywords fixas.

### FN-6 — Presence API para typing indicator
Typing indicator em tempo real requer Supabase Presence configurado, estado gerenciado com debounce, e toda a infra. Para uma equipe de 7 pessoas com 8.000 clientes, o valor é baixo. Nenhum cliente de suporte vai desistir de esperar porque não viu "digitando...".

### FN-7 — Shadow DOM para o widget
Correto tecnicamente, mas adiciona complexidade de desenvolvimento (CSS em string, estilos não compartilhados, debug difícil). Como o widget é embeddado no próprio app da Cloudfy (controlado por vocês), conflito de CSS pode ser gerenciado com namespace CSS simples.

---

## 4. Dependências Desnecessárias

| Dependência | Por que está no projeto | Por que deveria ser removida |
|---|---|---|
| `@tanstack/react-query` | Antecipação de arquitetura | Não usada. Fetch direto do Supabase client funciona. Remover agora. |
| `react-hook-form` | Forms de configurações | Usado minimamente. Os forms de Settings poderiam usar `useState` simples. |
| `@hookform/resolvers` | Validação com Zod | Dependência de dependência desnecessária. |
| `zod` | Schema validation | Validação de forms simples pode usar verificações inline. |
| `vaul` | Drawer shadcn | Componente instalado via shadcn sem uso confirmado. |
| `cmdk` | Command palette | Busca global não implementada, pacote dormindo. |
| `input-otp` | OTP shadcn | Sem uso no CloudDesk. |
| `embla-carousel-react` | Carousel shadcn | Sem uso no CloudDesk. |
| `recharts` | Dashboard de analytics | Dashboard não implementado. Remover até implementar. |
| `@radix-ui/react-aspect-ratio` | shadcn aspect-ratio | Sem uso. |
| `@radix-ui/react-navigation-menu` | shadcn nav-menu | Sem uso. |
| `@radix-ui/react-menubar` | shadcn menubar | Sem uso. |
| `@radix-ui/react-context-menu` | shadcn context-menu | Sem uso. |
| `@radix-ui/react-hover-card` | shadcn hover-card | Sem uso. |

**Estimativa de redução do bundle**: Remover essas dependências pode reduzir o bundle de produção em 15–25%.

---

## 5. O que Cortaria Primeiro (Lista Priorizada)

**Prioridade 1 — Segurança imediata (não é over-engineering, é obrigação)**
1. Corrigir RLS (AUDIT Bug C1) — essa não é sobre simplificar, é sobre não ter vazamento de dados
2. Remover PREVIEW_ACCOUNT_USER_ID do bundle de produção (AUDIT Bug C2)
3. Adicionar validação de autenticação antes de criar conversa no widget

**Prioridade 2 — Remover código morto (rápido, sem risco)**
1. Deletar `src/components/dashboard/ConversationList.tsx`, `ChatThread.tsx`, `MessageComposer.tsx`, `ConversationDetails.tsx`
2. Deletar `src/stores/chatStore.ts`
3. Remover `lib/supabase.ts` e padronizar import path
4. Remover `@tanstack/react-query` do package.json
5. Remover `recharts` até dashboard ser implementado

**Prioridade 3 — Simplificar lógica existente (baixo risco)**
1. Substituir `_tabCache` por re-fetch direto ao trocar de tab
2. Mover lógica de SLA scoring para SQL (OE-6)
3. Consolidar dois canais Realtime do widget para um (depois de confirmar que Realtime está em produção)

**Prioridade 4 — Não construir por ora**
1. Multi-LLM / `desk_ai_config` — usar variáveis de ambiente
2. `desk_routing_rules` com 5 tipos de action — hardcode 3 keywords críticas na Edge Function
3. FAQ auto-inserção — manter FAQ 100% manual no início
4. Views personalizadas — congelar feature, usar tabs padrão
5. Typing indicator — não implementar
6. Shadow DOM para widget — usar namespace CSS

**Prioridade 5 — Remover shadcn components não usados**
Auditar `src/components/ui/` e remover os que nunca são importados por nenhum componente do projeto:
- `carousel.tsx`, `input-otp.tsx`, `navigation-menu.tsx`, `menubar.tsx`, `context-menu.tsx`, `hover-card.tsx`, `aspect-ratio.tsx`

**Resultado esperado após aplicar tudo**: Codebase ~30% menor, sem funcionalidades removidas que sejam usadas, sem dívida técnica de código morto, sem abstrações que complicam manutenção. Time pode se mover 20–30% mais rápido nas features que realmente importam.
