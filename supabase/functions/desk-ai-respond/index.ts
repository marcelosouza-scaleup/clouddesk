import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIRespondRequest {
  conversation_id: string;
  message: string;
  account_name?: string;
  account_email?: string; // passed by widget directly — avoids account table lookup
}

interface AIRespondResult {
  reply: string | null;
  should_handoff: boolean;
  blocked?: boolean;
}

interface MessageRow {
  sender_type: string;
  content: string;
}

interface KBMatch {
  id: string;
  title: string;
  content: string;
  category: string | null;
  similarity: number;
}

interface FAQMatch {
  id: string;
  question: string;
  answer: string;
  similarity: number;
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

interface ContactCustomer {
  name: string;
  email: string;
  customer_id: string;
  referral: string;
}

interface ContactSubscription {
  subscription_id: string;
  status: string;
  product: string;
  mrr: number;
  interval: string;
  promocode: string;
}

interface ContactInfra {
  subscription_id: string;
  infra_id: string;
  purchase_code: string;
  requests_24h: number;
  requests_7d: number;
  requests_30d: number;
}

interface ContactInfoResult {
  customer: ContactCustomer | null;
  subscriptions: ContactSubscription[];
  infras: ContactInfra[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSFER_KEYWORD = '[TRANSFERIR]';

const BASE_SYSTEM_PROMPT = `Você é Luna, assistente virtual de suporte da Cloudfy, uma empresa SaaS de infraestrutura.
Seja profissional, amigável e direta. Use linguagem simples e acessível.
Responda em português do Brasil. Respostas curtas e objetivas (máximo 3 parágrafos).
Ao final, pergunte se o cliente precisa de mais ajuda.`;

// ─── OpenAI helpers ───────────────────────────────────────────────────────────

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`);
  }

  const data: OpenAIEmbeddingResponse = await res.json();
  return data.data[0].embedding;
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat error ${res.status}: ${err}`);
  }

  const data: OpenAIChatResponse = await res.json();
  return data.choices[0].message.content;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildClientContext(info: ContactInfoResult | null): string {
  if (!info?.customer) return '';

  const { customer, subscriptions, infras } = info;

  const intervalLabel = (i: string) => i === 'month' ? 'Mensal' : i === 'year' ? 'Anual' : i;

  const subLines = subscriptions.length > 0
    ? subscriptions.map((s) => {
        const infra = infras.find((inf) => inf.subscription_id === s.subscription_id);
        const infraStr = infra
          ? `${infra.purchase_code} (24h: ${infra.requests_24h} req, 7d: ${infra.requests_7d} req)`
          : 'Não provisionada';
        const statusIcon = s.status === 'active' ? '✅' : '❌';
        const planLabel = [s.product, s.interval ? intervalLabel(s.interval) : ''].filter(Boolean).join(' · ');
        return `  ${statusIcon} ${planLabel} — Status: ${s.status}${s.mrr > 0 ? ` — MRR: R$${s.mrr}` : ''}${s.promocode ? ` — Promo: ${s.promocode}` : ''}\n     Infra: ${infraStr}`;
      }).join('\n')
    : '  Nenhuma subscription encontrada';

  return `
--- CONTEXTO DO CLIENTE ---
Nome: ${customer.name}
Email: ${customer.email}
Stripe ID: ${customer.customer_id}${customer.referral ? `\nReferral: ${customer.referral}` : ''}
Subscriptions:
${subLines}
---------------------------

--- REGRAS DE COMUNICAÇÃO ---
- NUNCA mencione valores financeiros como MRR, LTV, receita ou qualquer métrica interna
- NUNCA mencione nomes de campos internos: MRR, purchase_code, infra_id, customer_id, subscription_id
- Para se referir ao plano, use apenas: "seu plano Cloud Advanced" ou "sua assinatura"
- Para se referir ao valor, diga apenas "o valor da sua assinatura" — nunca o número
- Para se referir à infra, use o purchase_code como apelido amigável se necessário, mas prefira "sua infraestrutura"
- Tom: prestativo, direto, sem jargão técnico
-----------------------------
`;
}

function buildSystemPrompt(
  kbMatches: KBMatch[],
  faqMatches: FAQMatch[],
  clientName?: string,
  contactInfo?: ContactInfoResult | null,
  isFirstMessage?: boolean,
): string {
  const clientSection = clientName
    ? `\n[CLIENTE]\nVocê está atendendo: ${clientName}. Cumprimente-o pelo nome na primeira mensagem.\n`
    : '';

  // Build KB section — show title + full content for each relevant article
  let contextSection: string;
  if (kbMatches.length === 0 && faqMatches.length === 0) {
    contextSection = 'Nenhum conteúdo relevante encontrado na base de conhecimento para esta pergunta.';
  } else {
    const parts: string[] = [];

    if (kbMatches.length > 0) {
      parts.push('[ARTIGOS RELEVANTES]');
      for (const kb of kbMatches) {
        parts.push(`### ${kb.title}${kb.category ? ` (${kb.category})` : ''}\n${kb.content}`);
      }
    }

    if (faqMatches.length > 0) {
      parts.push('[PERGUNTAS FREQUENTES RELEVANTES]');
      for (const faq of faqMatches) {
        parts.push(`P: ${faq.question}\nR: ${faq.answer}`);
      }
    }

    contextSection = parts.join('\n\n---\n\n');
  }

  const contactContext = buildClientContext(contactInfo ?? null);

  const firstMessageInstruction = isFirstMessage && contactInfo?.customer
    ? `
[PRIMEIRA MENSAGEM — SAUDAÇÃO PROATIVA OBRIGATÓRIA]
Esta é a primeira mensagem do cliente. NÃO pergunte apenas "Como posso ajudar?".
Cumprimente pelo nome e apresente um resumo do que você já sabe sobre ele, no seguinte formato:

"Olá, ${contactInfo.customer.name}! Vi aqui no seu perfil:
${contactInfo.subscriptions.filter(s => s.status === 'active').map(s => {
  const infra = contactInfo.infras.find(i => i.subscription_id === s.subscription_id);
  const interval = s.interval === 'month' ? 'Mensal' : s.interval === 'year' ? 'Anual' : s.interval;
  const planStr = [s.product, interval].filter(Boolean).join(' · ');
  return infra
    ? `• ${planStr} (sua infraestrutura: ${infra.purchase_code})`
    : `• ${planStr}`;
}).join('\n')}

Sobre o que você precisa de ajuda hoje?"

Se não houver assinaturas ativas, apenas cumprimente pelo nome e pergunte como pode ajudar.
Adapte o tom — não copie o formato acima palavra por palavra, mas inclua as informações.
`
    : '';

  return `${BASE_SYSTEM_PROMPT}
${clientSection}${contactContext}${firstMessageInstruction}
---

[REGRA DE TRANSFERÊNCIA — OBRIGATÓRIA]
Se o cliente pedir explicitamente para falar com um humano, OU se a dúvida dele NÃO puder ser respondida usando EXCLUSIVAMENTE os conteúdos abaixo, você DEVE responder APENAS com a palavra-chave: ${TRANSFER_KEYWORD}
Não adicione nenhum texto antes ou depois. Não explique. Só retorne: ${TRANSFER_KEYWORD}

---

[BASE DE CONHECIMENTO — USE APENAS ISTO PARA RESPONDER]
${contextSection}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: AIRespondRequest = await req.json();
    const { conversation_id, message, account_name, account_email } = body;

    if (!conversation_id || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: conversation_id, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[AI] conversation=${conversation_id} message="${message.substring(0, 60)}"`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase env vars');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Guard: skip if conversation is not AI-active or already resolved/pending ─
    const { data: convRow, error: convErr } = await supabase
      .from('desk_conversations')
      .select('ai_active, status, account_user_id')
      .eq('id', conversation_id)
      .maybeSingle();

    if (convErr) {
      console.warn('[AI] Failed to fetch conversation state:', convErr.message);
    }

    if (
      convRow &&
      (!convRow.ai_active || convRow.status === 'pending' || convRow.status === 'resolved')
    ) {
      console.log(`[AI] Blocked — ai_active=${convRow.ai_active} status=${convRow.status}`);
      const blocked: AIRespondResult = { reply: null, should_handoff: false, blocked: true };
      return new Response(
        JSON.stringify(blocked),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY secret');

    // ── Step 1: Conversation history + client contact info in parallel ─────────
    const accountUserId = (convRow as Record<string, unknown> | null)?.account_user_id as string | undefined;

    // Resolve client email: use account_email from request body if provided (widget path),
    // otherwise fall back to querying the account table by user_id.
    // Non-fatal: if any step fails, the AI proceeds without client context.
    const contactInfoPromise: Promise<ContactInfoResult | null> = (async () => {
      try {
        let email = account_email ?? null;

        if (!email && accountUserId) {
          const { data: acc } = await supabase
            .from('account')
            .select('email')
            .eq('user_id', accountUserId)
            .maybeSingle();
          email = acc?.email ?? null;
        }

        if (!email) return null;

        const res = await fetch(`${supabaseUrl}/functions/v1/get-contact-info`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        if (!res.ok) return null;
        return await res.json() as ContactInfoResult;
      } catch (e) {
        console.warn('[AI] get-contact-info failed:', e instanceof Error ? e.message : e);
        return null;
      }
    })();

    const historyPromise = supabase
      .from('desk_messages')
      .select('sender_type, content')
      .eq('conversation_id', conversation_id)
      .eq('is_private_note', false)
      .order('created_at', { ascending: false })
      .limit(10);

    const [contactInfo, { data: historyRows, error: historyErr }] = await Promise.all([
      contactInfoPromise,
      historyPromise,
    ]);

    if (historyErr) console.warn('[AI] History fetch failed:', historyErr.message);
    console.log(`[AI] contact=${contactInfo?.customer?.name ?? 'unknown'}`);

    const history = ((historyRows ?? []) as MessageRow[]).reverse();
    const isFirstMessage = history.length === 0;
    console.log(`[AI] History: ${history.length} messages, firstMessage=${isFirstMessage}`);

    // ── Step 2: Semantic search (RAG) ─────────────────────────────────────────
    // Generate embedding for the user's message, then query KB and FAQ in parallel.
    // Falls back gracefully: if embedding fails, the AI responds without KB context.
    let kbMatches: KBMatch[] = [];
    let faqMatches: FAQMatch[] = [];

    try {
      const embedding = await generateEmbedding(message, apiKey);
      console.log('[AI] Embedding generated');

      const [kbRes, faqRes] = await Promise.all([
        supabase.rpc('match_knowledge_base', {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: 5,
        }),
        supabase.rpc('match_faq', {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: 3,
        }),
      ]);

      if (kbRes.error) {
        console.warn('[AI] KB search failed:', kbRes.error.message);
      } else {
        kbMatches = (kbRes.data ?? []) as KBMatch[];
      }

      if (faqRes.error) {
        console.warn('[AI] FAQ search failed:', faqRes.error.message);
      } else {
        faqMatches = (faqRes.data ?? []) as FAQMatch[];
      }

      console.log(`[AI] RAG: ${kbMatches.length} KB articles, ${faqMatches.length} FAQs`);
    } catch (embedErr) {
      // Non-fatal: AI will respond without KB context rather than failing entirely
      console.warn('[AI] Embedding/search failed — responding without KB context:', embedErr);
    }

    // ── Step 3: Build prompt + call OpenAI ────────────────────────────────────
    const systemPrompt = buildSystemPrompt(kbMatches, faqMatches, account_name, contactInfo, isFirstMessage);

    const chatMessages = history.map((m) => ({
      role: m.sender_type === 'contact' ? 'user' : 'assistant',
      content: m.content,
    }));
    chatMessages.push({ role: 'user', content: message });

    const rawReply = await callOpenAI(apiKey, systemPrompt, chatMessages);
    console.log(`[AI] Reply: "${rawReply.substring(0, 80)}"`);

    const should_handoff = rawReply.includes(TRANSFER_KEYWORD);

    return new Response(
      JSON.stringify({ reply: rawReply, should_handoff }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AI] Fatal error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
