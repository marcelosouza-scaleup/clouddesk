# INTERCOM_REFERENCE.md — Referência de UI/UX/Features (foco: INBOX)

> Documento de referência para o desenvolvimento do **CloudDesk**, que está sendo
> construído para substituir o Intercom na Cloudfy.
>
> **Metodologia desta análise:** diferente de uma leitura de marketing, esta referência
> foi extraída **diretamente da Inbox real de produção da Cloudfy no Intercom**
> (workspace `hhvxnqty`), navegando com a sessão logada via Chrome DevTools MCP em
> 29/05/2026. Os labels, atalhos de teclado, estrutura de painéis e ações abaixo são os
> textos e comportamentos **reais** observados na interface — não documentação genérica.
> Complementado com docs oficiais do Intercom (Help Center) onde indicado.
>
> **Foco principal:** a **Inbox (painel do operador)**, conforme solicitado. As demais
> seções (widget, IA, UI/UX) estão ancoradas no que foi observado a partir da Inbox.

---

## Sumário

1. [Visão geral da Inbox (3 + 1 colunas)](#1-visão-geral-da-inbox)
2. [Coluna 1 — Navegação / Views / Inboxes](#2-coluna-1--navegação-views-e-inboxes)
3. [Coluna 2 — Lista de conversas](#3-coluna-2--lista-de-conversas)
4. [Coluna 3 — Thread + Composer + Header de ações](#4-coluna-3--thread-composer-e-header-de-ações)
5. [Coluna 4 — Painel de detalhes + Copiloto](#5-coluna-4--painel-de-detalhes-e-copiloto)
6. [Atalhos de teclado (reais + oficiais)](#6-atalhos-de-teclado)
7. [Features de IA na Inbox: Fin vs Copilot](#7-features-de-ia-na-inbox-fin-vs-copilot)
8. [Messenger (widget) — observado a partir da Inbox](#8-messenger-widget)
9. [Gap analysis: o que o CloudDesk ainda não tem (priorizado)](#9-gap-analysis-priorizado)
10. [Referências de UI/UX](#10-referências-de-uiux)
11. [Fontes](#11-fontes)

---

## 1. Visão geral da Inbox

A Inbox do Intercom usa um layout de **4 painéis horizontais** (não 3 como o CloudDesk
planeja hoje):

```
┌────┬──────────────┬─────────────────┬───────────────────────┬──────────────────┐
│ N  │  COLUNA 1    │   COLUNA 2      │   COLUNA 3            │   COLUNA 4       │
│ A  │              │                 │                       │                  │
│ V  │ Navegação:   │ Lista de        │ Thread da conversa    │ Detalhes (CRM)   │
│    │ - Caixas     │ conversas da    │ + Header de ações     │ OU Copiloto (IA) │
│ G  │ - Views      │ caixa/view      │ + Composer            │ (abas no topo)   │
│ L  │   salvas     │ selecionada     │                       │                  │
│ O  │ - Inboxes de │                 │                       │                  │
│ B  │   equipe     │                 │                       │                  │
│ A  │ - Membros    │                 │                       │                  │
│ L  │   da equipe  │                 │                       │                  │
└────┴──────────────┴─────────────────┴───────────────────────┴──────────────────┘
```

Existe ainda uma **barra de navegação global vertical** à esquerda de tudo (ícones):
`Inbox`, `Fin AI Agent`, `Conhecimento`, `Relatórios`, `Saídas` (outbound), `Contatos`,
`Pesquisar`, `Configurações do Messenger`, `Configurações`.

> **Insight para o CloudDesk:** o CloudDesk hoje planeja Inbox em **3 colunas**. O Intercom
> separa "navegação de caixas" (coluna 1) da "lista de conversas" (coluna 2). No CloudDesk
> isso está fundido na `Sidebar` + `ConversationList`. A coluna 4 (detalhes) **é alternável
> entre CRM e IA via abas** ("Detalhes" / "Copiloto") — algo que o CloudDesk ainda não tem.

---

## 2. Coluna 1 — Navegação: Views e Inboxes

A coluna 1 é muito mais rica que uma simples sidebar de status. Está organizada em **grupos**:

### Caixas pessoais / sistema (topo)
- **Sua caixa de entrada** (atribuídas a mim) — com contador (ex.: `1.712`)
- **Menções** — quando outro operador te @menciona em nota interna
- **Criado por você** — conversas que você iniciou
- **Todos** — todas as conversas (`2.049`)
- **Não atribuído** — fila sem dono (`3`)
- **Spam** (`38`)
- **Painel** (dashboard de métricas da inbox)

### Visualizações (Views salvas) — seção crítica
Views são **filtros salvos e nomeados**, com contador ao vivo, criados pela equipe. Os reais da Cloudfy:
- `CLIENTES MAX`, `CLIENTES ULTRA`, `CLIENTES ADVANCED` (segmentação por plano)
- `Blocked - PAGO`, `MIGRAÇÃO CLOUD`, `PL STARTER`, `Retenção por cupom`
- `Email`, `Email Old`, `Churn completed - Fluxo`

Cada view é uma URL com `view/{id}` e o filtro vai serializado em base64 na query string
(observado: filtro por `conversation.tag_ids`).

### Fin for Service (views relacionadas a automação/IA)
- `Todas as conversas`, `Resolvido`, `Necessita de contribuições dos membros da equipe`,
  `Escalonamento e transferência`, `Pendente`, `Spam`

### Inboxes da equipe (filas por time)
- `Suporte` (`328`), `Financeiro` (`0`) — filas compartilhadas por equipe, com contador.

> **Insight para o CloudDesk:** o conceito de **Views salvas com filtros arbitrários +
> contador ao vivo** é a maior diferença estrutural. O CloudDesk hoje tem filtros fixos
> por status. Adicionar "views salvas" (filtro nomeado, compartilhado, com badge de contagem
> em tempo real via Realtime) é alto valor. O agrupamento **Inboxes de equipe** mapeia
> bem para o `escalate_to_team` que já existe no pipeline de IA do CloudDesk.

---

## 3. Coluna 2 — Lista de conversas

- Cabeçalho com o nome da view atual (ex.: "Todos") e um botão de **toggle de layout** da lista.
- Cada item exibe: **avatar com inicial**, **nome do contato**, **preview da última mensagem**
  (ex.: "Boa noite"), e **timestamp relativo** (ex.: `3m`).
- Rodapé com **"Ver tudo (2049)"** quando a view tem prévia limitada.
- Atualização em **tempo real** — durante a navegação, contadores subiram sozinhos
  (`2.048 → 2.049`, `Sua caixa 1.711 → 1.712`), confirmando push em tempo real, sem polling.

> **Insight para o CloudDesk:** o `ConversationItem` do CloudDesk já cobre o essencial
> (avatar, nome, preview, tempo relativo). Falta: **toggle de densidade da lista** e
> a contagem viva por view. O CloudDesk já usa Realtime (`useRealtimeInbox`), então a
> contagem ao vivo é viável sem esforço extra de arquitetura.

---

## 4. Coluna 3 — Thread, Composer e Header de ações

### 4.1 Header da conversa
- Título = **nome do contato** (`cristiano silva vilela`).
- **Tag visível inline** na thread (ex.: chip `PL STARTER`), clicável → leva à busca filtrada por tag.
- Botões de ação no header (labels reais capturados via tooltip):

| Ícone | Ação real (tooltip) | Atalho |
|-------|---------------------|--------|
| ⭐ | **Marcar prioridade** | — |
| ⋯ | **Mais ações** (menu, ver 4.4) | — |
| 🎫 | **Converter em ticket de cliente** | `Ctrl B` |
| 💤 | **Adiar** (snooze) | `Z` |
| **Fechar** | Fechar/resolver conversa | (`Ctrl Shift Enter` envia e fecha) |

### 4.2 Thread de mensagens
- Mensagens do **bot/Fin** aparecem com **avatar do bot** e timestamp relativo.
- Conteúdo de mensagem suporta **emoji inline** (ex.: `⏰`) e texto formatado.
- **Quick reply buttons** renderizados abaixo da mensagem do bot como **chips clicáveis**:
  `Sobre n8n, Evolution, Postgres e fluxos` · `Faturas e Assinaturas` ·
  `Minha infra está fora do ar / Erro`.
  → Esse é exatamente o padrão "quick_actions" que o widget do CloudDesk já prevê.

### 4.3 Composer (editor de resposta)
- **Dois modos** alternáveis via dropdown:
  - **Responder** (atalho `R`) — resposta pública ao cliente
  - **Notas** (atalho `N`) — nota interna privada (equipe)
- **Resposta sugerida pela IA** aparece pré-preenchida em cinza com hint **`Tab`** para aceitar
  (ex.: *"Olá, boa tarde! Desculpe a demora. Sou Marc do time Cloudfy e vou te ajudar."*).
- **Dica de pro inline**: *"toque em `Ctrl` `Shift` `Enter` para enviar e fechar"*.
- **Barra de ferramentas do composer** (labels reais via tooltip, da esquerda p/ direita):

| Ferramenta | Tooltip real | Atalho |
|-----------|--------------|--------|
| ⚡ Atalhos | **Mostrar atalhos** | `Ctrl K` |
| `#` Macro | **Usar macro** | `#` (ou `\`) |
| 😀 Emoji | **Inserir emoji** | `:` |
| 📖 Artigo | **Inserir um artigo** | `Ctrl Shift H` |
| 📎 Anexo | **Upload do anexo** | `Ctrl Shift A` |
| 🖼️ Imagem | **Fazer upload de imagem** | `Ctrl Shift I` |
| ✨ IA | **AI Compose** (reescrever/gerar) | `Ctrl J` |

- Botão **Enviar** com dropdown (enviar / enviar e fechar / etc.), desabilitado quando vazio.

### 4.4 Menu "Mais ações" (⋯) — labels reais
- **Gerenciar participantes**
- **Mesclar com…** (`Ctrl Shift M`) — merge de conversas duplicadas
- **Nova conversa**
- **Exportar conversa como texto**
- **Exportar conversa como PDF**
- **Exibir eventos de conversa** (`Ctrl Shift E`) — timeline de eventos do sistema

> **Insight para o CloudDesk:** vários itens aqui são gaps diretos — ver seção 9.
> Destaques: **AI Compose** (reescrever a resposta do operador com IA — diferente da
> resposta automática da IA), **Inserir artigo** (linkar artigo da KB direto no composer),
> **Mesclar conversas**, **Converter em ticket**, **Exportar (texto/PDF)** e
> **modo Notas com atalho dedicado `N`**.

---

## 5. Coluna 4 — Painel de detalhes e Copiloto

A coluna 4 tem **duas abas no topo**: **Detalhes** e **Copiloto**.

### 5.1 Aba "Detalhes" (CRM contextual) — seções reais observadas
- **Titular** (operador dono) + **Inbox de equipe** (atribuição: "Não atribuído").
- **Links**: `Ticket de rastreamento`, `Tickets de back-office`, `Conversas paralelas`
  (cada um com botão `+` para vincular).
- **Dados do usuário** (expandível) — campos reais:
  `Nome`, `Empresa`, `Type` (Usuário), `Localização` (com **hora local**: "12:05 · Brasília, Brazil"),
  `Email`, e um bloco completo de **dados do Stripe**:
  `Stripe id`, `Stripe delinquent`, `Stripe plan` (ex.: "Cloud Advanced • Advanced - Monthly (USD/BRL)"),
  `Stripe plan price`, `Stripe subscription status` (active), `Stripe subscriptions`, `Stripe customer`.
- **Stripe** (app/card dedicado): `Customer`, `Email`, `Created`, `Balance`, `ID`,
  botão **"View in Stripe ↗"** (deep-link).
- **Conversas recentes** (`2`) — histórico de conversas anteriores com timestamps relativos.
- **Notas do usuário** — notas persistentes sobre o contato (não sobre a conversa).
- **Tags do usuário** — tags no nível do contato (≠ tags da conversa).
- **Segmentos do usuário** — segmentação dinâmica.
- **Visualizações de página recentes** — páginas que o cliente visitou (event tracking).
- **Solucionar problemas de fluxos de trabalho** — debug de workflows/automação.
- Botão **"Editar apps"** — customizar quais cards aparecem no painel.

> **Insight para o CloudDesk:** o painel de detalhes do CloudDesk (`ConversationDetails`
> + `ClientInfoPanel` + `StripePanel`) já cobre boa parte (account, purchases, Stripe).
> Gaps relevantes: **hora local do cliente**, **Notas no nível do contato** (CloudDesk tem
> `desk_contact_notes` — ✅ já modelado!), **Tags de contato** (CloudDesk só tem tags de
> conversa), **Segmentos**, **page views/event tracking** e **deep-link "View in Stripe"**.

### 5.2 Aba "Copiloto" (IA para o operador) — texto real
> *"O Copilot está aqui para ajudar. Basta perguntar. O Copilot pode encontrar respostas
> para as perguntas dos clientes pesquisando no conteúdo de suporte da sua equipe e em
> conversas anteriores. Ele pode ajudar você a decidir o que fazer usando os artigos
> internos da sua equipe. (…) As conversas com o Copilot são visíveis apenas para você."*

- Campo de input: **"Faça uma pergunta…"**.
- O Copilot é **privado por operador** (clientes nunca veem).
- Fonte de conhecimento: help center, artigos internos, **conversas anteriores**, snippets, PDFs, URLs.

---

## 6. Atalhos de teclado

Combinação dos atalhos **reais observados na Inbox** + cheat sheet oficial do Intercom.

| Atalho | Ação | Origem |
|--------|------|--------|
| `Ctrl/Cmd K` | Menu de comando (Command-K): responder, nota, macro, fechar, adiar, atribuir | oficial + observado |
| `R` | Modo **Responder** no composer | observado |
| `N` | Modo **Notas** (interna) no composer | observado |
| `A` | **Atribuir** conversa a colega/inbox | oficial |
| `Z` | **Adiar** (snooze) | observado |
| `Ctrl/Cmd Shift Enter` | **Enviar e fechar** conversa | observado |
| `#` ou `\` | Inserir **macro** | observado + oficial |
| `:` | Inserir **emoji** | observado |
| `Ctrl Shift H` | Inserir **artigo** da KB | observado |
| `Ctrl Shift A` | **Anexar arquivo** | observado |
| `Ctrl Shift I` | **Inserir imagem** | observado |
| `Ctrl J` | **AI Compose** (gerar/reescrever resposta com IA) | observado |
| `Ctrl B` | **Converter em ticket** | observado |
| `Ctrl Shift M` | **Mesclar** conversas | observado |
| `Ctrl Shift E` | **Exibir eventos** da conversa | observado |

> **Insight para o CloudDesk:** a tabela de atalhos do `CLAUDE.md` (seção 11) é boa mas
> incompleta vs Intercom. Faltam (alto valor): tecla única `R`/`N` para alternar modo
> resposta/nota, `Z` para snooze, `#` para macro (CloudDesk usa `/` — manter `/` é ok,
> mas vale alinhar), e um **Command-K** (`Ctrl K`) unificado para todas as ações.

---

## 7. Features de IA na Inbox: Fin vs Copilot

O Intercom separa **dois produtos de IA** distintos — distinção que o CloudDesk deveria adotar:

| | **Fin (AI Agent)** | **Copilot (AI Assistant)** |
|--|--------------------|----------------------------|
| Para quem | **Cliente final** (no widget) | **Operador** (na Inbox, aba Copiloto) |
| O que faz | Responde o cliente automaticamente | Ajuda o operador a responder |
| Visibilidade | Pública (cliente vê) | Privada (só o operador vê) |
| Fontes | KB, artigos, snippets, PDFs, URLs, conversas passadas | Mesmas + decide "o que fazer" via artigos internos |
| Handoff | **Auto-handoff** quando é a opção mais segura; contexto compartilhado | Sugere macros (aceita com `Tab`) e respostas |
| No CloudDesk | ≈ pipeline `desk-ai-respond` (✅ já existe) | ❌ **NÃO existe** |

**Como o Fin lida com handoff (relevante p/ o pipeline do CloudDesk):**
- Fin e o time humano trabalham do **mesmo registro do cliente** — handoff carrega contexto completo.
- Fin faz **handoff automático** quando essa é a opção mais segura (≈ `confidence < threshold`
  e `escalate_to_human` que o CloudDesk já modela na seção 7 do CLAUDE.md).

**Como o Copilot usa a base de conhecimento (gap do CloudDesk):**
- Gera resposta direta combinando **múltiplas fontes** e **lista as fontes usadas** abaixo
  da resposta (transparência/citações), com links clicáveis para validar.
- Usa **últimos ~4 meses** de conversas/tickets como fonte.
- **Sugere macros automaticamente** no composer — operador aperta `Tab` para inserir, `Esc` para rejeitar.

> **Insight central para o CloudDesk:** hoje o CloudDesk tem o equivalente ao **Fin**
> (IA que responde o cliente), mas **não tem o equivalente ao Copilot** (IA que assiste o
> operador na Inbox). Esse é o maior gap de IA. O pipeline de contexto (busca semântica em
> `desk_knowledge_base` + `desk_snippets` + `desk_faq`) já existe — daria para reaproveitá-lo
> para alimentar um "Copiloto" na coluna 4 + **sugestão de resposta com `Tab` no composer**.

---

## 8. Messenger (widget)

> Observação: `intercom.com/messenger` hoje **redireciona para fin.ai** (a Intercom
> reposicionou o produto em torno do Fin). Abaixo, o que foi possível confirmar a partir
> da Inbox real (lado do operador) + docs.

- **Quick replies / action buttons**: confirmados na thread como **chips clicáveis** enviados
  pelo bot (ex.: as 3 opções da Cloudfy). Padrão idêntico ao `quick_actions` planejado no widget do CloudDesk.
- **Formatação de texto**: emoji inline confirmado; rich text/markdown e blocos de código são
  suportados pelo Messenger (operador insere via toolbar: artigo, imagem, anexo).
- **Imagens / anexos**: o operador tem upload de **imagem** e **anexo** separados — sugere que
  o Messenger renderiza ambos de forma distinta (imagem inline vs arquivo para download).
- **Artigos inline**: operador pode **inserir um artigo** (`Ctrl Shift H`) que vira um card
  navegável dentro do Messenger (help center embutido).
- **Typing indicator / read receipts / CSAT**: padrões do Messenger (o CloudDesk já planeja
  todos: `useTypingIndicator`, CSAT `😞😐😊` em `desk_csat`).

> **Insight para o CloudDesk:** o widget planejado já está alinhado com o Messenger no
> essencial (quick actions, CSAT, typing). O gap é **artigo como card navegável dentro do
> widget** e **distinção visual imagem vs anexo**.

---

## 9. Gap analysis priorizado

Comparando a Inbox real do Intercom com o que o CloudDesk já tem (CLAUDE.md). Priorização:
**P0 = alto impacto / baixo esforço** (reaproveita o que já existe), até **P3 = nice-to-have**.

### P0 — Implementar primeiro (alto valor, baixo esforço)
1. **Modo Notas com atalho `N` + modo Responder `R`** no composer. CloudDesk já tem
   `content_type='note'` e `is_private_note` — falta só o toggle + atalho. (1 dia)
2. **Resposta sugerida pela IA no composer com `Tab` para aceitar.** O pipeline
   `desk-ai-respond` já gera respostas — expor como sugestão em vez de envio automático
   quando `ai_active=false`. (2–3 dias)
3. **Command-K (`Ctrl K`)** unificado: responder, nota, macro, fechar, adiar, atribuir.
   CloudDesk já planeja `Ctrl K` para busca — expandir para ações. (2 dias)
4. **Inserir artigo da KB no composer** (`Ctrl Shift H`). Reaproveita `desk_knowledge_base`. (1–2 dias)
5. **Snooze / Adiar** (tecla `Z`) — CloudDesk já tem `status='snoozed'` e `snoozed_until`!
   Falta só a UI + atalho. (1 dia)

### P1 — Próxima onda (estrutural, médio esforço)
6. **Views salvas** (filtros nomeados + contador ao vivo, compartilhados pela equipe).
   Maior diferença estrutural. Nova tabela `desk_views` + Realtime nos contadores. (1 semana)
7. **Copiloto (IA para o operador)** na coluna 4: pergunta livre → resposta com **citação de
   fontes**, usando o mesmo pipeline de contexto. Privado por operador. (1–2 semanas)
8. **Sugestão automática de macros** no composer (operador aceita com `Tab`). (3–5 dias)
9. **Inboxes de equipe** como filas dedicadas (mapeia para `escalate_to_team`). (3–5 dias)
10. **Tags de contato** (≠ tags de conversa) + **Notas de contato** na coluna 4
    (CloudDesk já tem `desk_contact_notes` ✅ — só expor na UI). (2–3 dias)

### P2 — Enriquecimento do painel de detalhes
11. **Hora local do cliente** no painel ("12:05 · Brasília").
12. **"View in Stripe ↗"** deep-link a partir do `StripePanel`.
13. **Timeline de eventos da conversa** (`Ctrl Shift E`) — CloudDesk tem `desk_activity_log` ✅.
14. **Conversas paralelas / linkar tickets** (relacionamento entre conversas).
15. **Page views / event tracking** do cliente (exige instrumentação no app Cloudfy).

### P3 — Nice-to-have
16. **Mesclar conversas** duplicadas (`Ctrl Shift M`).
17. **Exportar conversa** como texto / PDF.
18. **Converter conversa em ticket** (`Ctrl B`) — se o CloudDesk adotar modelo de tickets.
19. **AI Compose** (`Ctrl J`) — reescrever/ajustar tom da resposta do operador.
20. **Toggle de densidade** da lista de conversas.

---

## 10. Referências de UI/UX

Observado na Inbox real (tema claro do Intercom):

- **Layout**: 4 painéis + nav global vertical. Densidade alta, muito conteúdo sem poluir
  graças a **seções colapsáveis** (todos os blocos da coluna 4 abrem/fecham).
- **Quick replies**: chips arredondados, borda sutil, fundo branco, clicáveis — alinhados
  horizontalmente abaixo da mensagem do bot.
- **Bolha do bot**: cor de fundo azul-clara (accent suave), com **avatar do bot** + timestamp
  relativo discreto.
- **Hints contextuais inline**: o composer mostra dicas em texto cinza ("⚡️ Dica de pro: …",
  sugestão com `Tab`) — microcopy que ensina atalhos no fluxo, sem modal.
- **Tags inline**: chip clicável dentro da própria thread, não só no painel lateral.
- **Contadores ao vivo**: badges numéricos em cada view/caixa que atualizam via Realtime.
- **Tooltips com atalho**: cada ícone da toolbar mostra tooltip **"Ação + atalho"**
  (ex.: "Upload do anexo · Ctrl Shift A") — ensina o teclado progressivamente.
- **Timestamps relativos** em toda parte (`3m`, "há 2 meses", "há 3 meses").
- **Deep-links externos**: ações como "View in Stripe ↗" com seta indicando saída do app.

> **Alinhamento com o Design System do CloudDesk (CLAUDE.md §10):** o CloudDesk usa
> **tema escuro** por padrão (Intercom observado em tema claro). Os padrões a importar são
> **comportamentais**, não de cor: seções colapsáveis no painel de detalhes, chips de quick
> reply, microcopy de atalhos no composer, tooltips "ação + atalho", contadores ao vivo, e
> timestamps relativos (CloudDesk já exige todos via pt-BR/`há 2 min`).

---

## 11. Fontes

**Primárias (sessão logada na Inbox de produção da Cloudfy, 29/05/2026):**
- Inbox real — workspace `hhvxnqty`, conversa `215473462750213` (labels, atalhos, painéis,
  menus e textos extraídos diretamente da UI via Chrome DevTools MCP).

**Secundárias (docs oficiais Intercom):**
- [Get started with Intercom Inbox](https://www.intercom.com/help/en/articles/6274899-get-started-with-intercom-inbox)
- [The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained)
- [How to use Command-K with Intercom Inbox](https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-with-intercom-inbox)
- [Using macros in the Inbox](https://www.intercom.com/help/en/articles/6584504-using-macros-in-the-inbox)
- [Close a conversation](https://www.intercom.com/help/en/articles/8363763-close-a-conversation)
- [Fin AI Agent explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)
- [How to use Copilot](https://www.intercom.com/help/en/articles/8587194-how-to-use-copilot)
- [Copilot, the personal AI assistant for every support agent](https://www.intercom.com/helpdesk/copilot)
- [Knowledge sources to power AI, agents and self-serve support](https://www.intercom.com/help/en/articles/9440354-knowledge-sources-to-power-ai-agents-and-self-serve-support)
- [Announcing Fin AI Copilot (Intercom blog)](https://www.intercom.com/blog/announcing-fin-ai-copilot/)
