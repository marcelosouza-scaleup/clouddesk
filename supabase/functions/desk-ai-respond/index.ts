import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { corsHeaders } from '../_shared/cors.ts';

interface AIRespondRequest {
  conversation_id: string;
  message_id: string;
}

interface MessageRow {
  id: string;
  sender_type: string;
  content: string;
  created_at: string;
}

interface KnowledgeBaseMatch {
  id: string;
  title: string;
  content: string;
  category: string | null;
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Generate embedding from text using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  console.log(`[AI] Generating embedding for text: ${text.substring(0, 50)}...`);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding error: ${response.status} - ${error}`);
  }

  const data: OpenAIEmbeddingResponse = await response.json();
  console.log('[AI] Embedding generated successfully');
  return data.data[0].embedding;
}

// Call OpenAI Chat API (MVP: using gpt-4o-mini)
async function callOpenAI(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  console.log('[AI] Calling OpenAI Chat API with gpt-4o-mini');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI chat error: ${response.status} - ${error}`);
  }

  const data: OpenAIChatResponse = await response.json();
  const aiResponse = data.choices[0].message.content;

  console.log('[AI] Received response from OpenAI');
  return aiResponse;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request
    const body: AIRespondRequest = await req.json();
    const { conversation_id, message_id } = body;

    if (!conversation_id || !message_id) {
      console.error('[AI] Missing required fields: conversation_id, message_id');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: conversation_id, message_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[AI] Processing conversation ${conversation_id}, message ${message_id}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========================================
    // STEP 3: Fetch client data
    // ========================================
    console.log('[AI:Step3] Fetching client data...');

    const { data: conversationData, error: convError } = await supabase
      .from('desk_conversations')
      .select('account_user_id')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversationData) {
      throw new Error(`Failed to fetch conversation: ${convError?.message || 'Not found'}`);
    }

    const accountUserId = conversationData.account_user_id;
    console.log(`[AI:Step3] Account user ID: ${accountUserId}`);

    // Fetch account data
    const { data: accountData, error: accountError } = await supabase
      .from('account')
      .select('id, user_id, name, email')
      .eq('user_id', accountUserId)
      .single();

    if (accountError) {
      console.warn(`[AI:Step3] Could not fetch account data: ${accountError.message}`);
    }

    const clientName = accountData?.name || 'Cliente';
    const clientEmail = accountData?.email || 'unknown@email.com';
    console.log(`[AI:Step3] Client: ${clientName} (${clientEmail})`);

    // ========================================
    // STEP 6: Semantic search (RAG)
    // ========================================
    console.log('[AI:Step6] Performing semantic search...');

    // Fetch the current message content
    const { data: messageData, error: messageError } = await supabase
      .from('desk_messages')
      .select('content')
      .eq('id', message_id)
      .single();

    if (messageError || !messageData) {
      throw new Error(`Failed to fetch message: ${messageError?.message || 'Not found'}`);
    }

    const messageContent = messageData.content;
    console.log(`[AI:Step6] Message content: ${messageContent.substring(0, 50)}...`);

    // Generate embedding for the message
    const embedding = await generateEmbedding(messageContent);

    // Search knowledge base using match_knowledge_base RPC
    const { data: knowledgeBaseMatches, error: kbError } = await supabase.rpc(
      'match_knowledge_base',
      {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 3,
      }
    );

    if (kbError) {
      console.warn(`[AI:Step6] Knowledge base search failed: ${kbError.message}`);
    }

    const relevantArticles = (knowledgeBaseMatches || []) as KnowledgeBaseMatch[];
    console.log(`[AI:Step6] Found ${relevantArticles.length} relevant articles`);

    // ========================================
    // STEP 7: Fetch conversation history
    // ========================================
    console.log('[AI:Step7] Fetching conversation history...');

    const { data: messages, error: messagesError } = await supabase
      .from('desk_messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', conversation_id)
      .is('is_private_note', false) // Exclude private notes
      .order('created_at', { ascending: true })
      .limit(10);

    if (messagesError) {
      console.warn(`[AI:Step7] Failed to fetch messages: ${messagesError.message}`);
    }

    const conversationMessages = (messages || []) as MessageRow[];
    console.log(`[AI:Step7] Retrieved ${conversationMessages.length} messages`);

    // ========================================
    // STEP 8: Build prompt and call OpenAI
    // ========================================
    console.log('[AI:Step8] Building system prompt...');

    // Build system prompt with persona and context
    let systemPrompt = `Você é Luna, uma assistente virtual de suporte da Cloudfy.
Você é profissional, amigável e direta. Usa linguagem acessível para usuários não-técnicos.
Sempre cumprimente o cliente pelo nome quando apropriado.
Nunca invente informações — se não sabe, escale para humano.
Respostas curtas e objetivas (máximo 3 parágrafos).

## Contexto do Cliente
Nome: ${clientName}
Email: ${clientEmail}

`;

    // Add knowledge base articles if found
    if (relevantArticles.length > 0) {
      systemPrompt += `## Base de Conhecimento Relevante\n`;
      relevantArticles.forEach((article) => {
        systemPrompt += `- **${article.title}**: ${article.content.substring(0, 200)}...\n`;
      });
      systemPrompt += '\n';
    }

    systemPrompt += `Ao final de cada resposta, pergunte se o cliente resolveu o problema ou se precisa de mais ajuda.`;

    console.log('[AI:Step8] System prompt built');

    // Convert conversation history to chat format
    const chatMessages = conversationMessages.map((msg) => ({
      role: msg.sender_type === 'contact' ? 'user' : 'assistant',
      content: msg.content,
    }));

    console.log('[AI:Step8] Calling OpenAI...');

    // Call OpenAI
    const aiResponse = await callOpenAI(systemPrompt, chatMessages);

    // ========================================
    // Save response to database
    // ========================================
    console.log('[AI] Saving response to database...');

    const { data: insertedMessage, error: insertError } = await supabase
      .from('desk_messages')
      .insert({
        conversation_id,
        sender_type: 'bot',
        content: aiResponse,
        ai_generated: true,
        content_type: 'text',
      })
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`Failed to save AI response: ${insertError.message}`);
    }

    console.log(`[AI] Response saved with ID: ${insertedMessage?.id}`);

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message_id: insertedMessage?.id,
        content: aiResponse,
        knowledge_base_matches: relevantArticles.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI] Error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
