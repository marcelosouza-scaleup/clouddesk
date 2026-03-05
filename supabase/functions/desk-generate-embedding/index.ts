import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { corsHeaders } from '../_shared/cors.ts';

interface EmbeddingRequest {
  text: string;
  table: 'desk_knowledge_base' | 'desk_snippets';
  record_id: string;
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

async function generateEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

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
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data: OpenAIEmbeddingResponse = await response.json();
  return data.data[0].embedding;
}

async function updateEmbedding(
  supabase: ReturnType<typeof createClient>,
  table: string,
  recordId: string,
  embedding: number[]
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ embedding: embedding })
    .eq('id', recordId);

  if (error) {
    throw new Error(`Database update error: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body: EmbeddingRequest = await req.json();

    // Validate required fields
    if (!body.text || !body.table || !body.record_id) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: text, table, record_id',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate table name
    if (body.table !== 'desk_knowledge_base' && body.table !== 'desk_snippets') {
      return new Response(
        JSON.stringify({
          error: 'Invalid table. Must be "desk_knowledge_base" or "desk_snippets"',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate embedding via OpenAI
    const embedding = await generateEmbedding(body.text);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update database with embedding
    await updateEmbedding(supabase, body.table, body.record_id, embedding);

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Embedding generated and saved for ${body.table} record ${body.record_id}`,
        embedding_dimension: embedding.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
