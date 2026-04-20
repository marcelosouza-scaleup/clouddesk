import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIRespondRequest {
  conversation_id: string;
  message: string;
  account_name?: string;
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

function buildSystemPrompt(
  kbMatches: KBMatch[],
  faqMatches: FAQMatch[],
  clientName?: string,
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

  return `${BASE_SYSTEM_PROMPT}
${clientSection}
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
    const { conversation_id, message, account_name } = body;

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
      .select('ai_active, status')
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

    // ── Step 1: Conversation history (last 10 messages, oldest-first) ─────────
    const { data: historyRows, error: historyErr } = await supabase
      .from('desk_messages')
      .select('sender_type, content')
      .eq('conversation_id', conversation_id)
      .eq('is_private_note', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (historyErr) console.warn('[AI] History fetch failed:', historyErr.message);

    const history = ((historyRows ?? []) as MessageRow[]).reverse();
    console.log(`[AI] History: ${history.length} messages`);

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
    const systemPrompt = buildSystemPrompt(kbMatches, faqMatches, account_name);

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
