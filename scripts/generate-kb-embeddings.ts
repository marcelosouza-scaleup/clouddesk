/**
 * generate-kb-embeddings.ts
 *
 * Gera embeddings para todos os artigos em desk_knowledge_base que ainda
 * não possuem embedding (embedding IS NULL), chamando a Edge Function
 * desk-generate-embedding para cada um.
 *
 * Uso:
 *   npx tsx scripts/generate-kb-embeddings.ts
 *
 * Variáveis de ambiente (.env):
 *   VITE_SUPABASE_URL         — URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypassa RLS)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌  Variáveis de ambiente ausentes. Verifique o .env:\n');
  console.error('   VITE_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY\n');
  process.exit(1);
}

// ─── Clients ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/desk-generate-embedding`;
const DELAY_MS = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  Buscando artigos sem embedding em desk_knowledge_base...\n');

  const { data: articles, error } = await supabase
    .from('desk_knowledge_base')
    .select('id, title')
    .is('embedding', null);

  if (error) {
    console.error('❌  Erro ao buscar artigos:', error.message);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log('✅  Nenhum artigo sem embedding encontrado. Tudo já está processado!');
    return;
  }

  const total = articles.length;
  console.log(`📄  ${total} artigo(s) para processar.\n`);

  let success = 0;
  let failed = 0;
  const errors: { id: string; title: string; reason: string }[] = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const index = i + 1;

    process.stdout.write(`[${index}/${total}] "${article.title}" ... `);

    // Buscar o content completo do artigo
    const { data: full, error: fetchError } = await supabase
      .from('desk_knowledge_base')
      .select('content')
      .eq('id', article.id)
      .single();

    if (fetchError || !full) {
      console.log('❌  erro ao buscar content');
      failed++;
      errors.push({ id: article.id, title: article.title, reason: fetchError?.message ?? 'content vazio' });
      await sleep(DELAY_MS);
      continue;
    }

    const text = `${article.title}\n\n${full.content}`;

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        text,
        table: 'desk_knowledge_base',
        record_id: article.id,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.log(`❌  HTTP ${response.status}`);
      failed++;
      errors.push({ id: article.id, title: article.title, reason: `HTTP ${response.status}: ${body}` });
    } else {
      console.log('✅');
      success++;
    }

    if (i < articles.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // ─── Relatório final ──────────────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────');
  console.log('📊  Relatório final');
  console.log('─────────────────────────────────────────');
  console.log(`   Total processado : ${total}`);
  console.log(`   ✅ Sucesso        : ${success}`);
  console.log(`   ❌ Falhas         : ${failed}`);

  if (errors.length > 0) {
    console.log('\n   Artigos com erro:');
    for (const e of errors) {
      console.log(`   - [${e.id}] "${e.title}": ${e.reason}`);
    }
  }

  console.log('─────────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌  Erro inesperado:', err);
  process.exit(1);
});
