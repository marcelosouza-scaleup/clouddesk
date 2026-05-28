/**
 * import-intercom-articles.ts
 *
 * Exporta artigos do Intercom, converte HTML → Markdown e importa em
 * desk_knowledge_base via upsert por source_id.
 *
 * Uso:
 *   npx tsx scripts/import-intercom-articles.ts
 *
 * Variáveis de ambiente (.env):
 *   INTERCOM_ACCESS_TOKEN   — token de acesso do Intercom
 *   VITE_SUPABASE_URL       — URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypassa RLS)
 */

import 'dotenv/config';
import TurndownService from 'turndown';
import { createClient } from '@supabase/supabase-js';

// ─── Env ──────────────────────────────────────────────────────────────────────

const INTERCOM_TOKEN    = process.env.INTERCOM_ACCESS_TOKEN;
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!INTERCOM_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌  Variáveis de ambiente ausentes. Verifique o .env:\n');
  console.error('   INTERCOM_ACCESS_TOKEN');
  console.error('   VITE_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY\n');
  process.exit(1);
}

// ─── Clients ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntercomArticle {
  id: string;
  title: string;
  body: string | null;       // HTML
  state: 'published' | 'draft';
  created_at: number;        // Unix timestamp
  updated_at: number;
  url: string | null;
}

interface IntercomPages {
  type: string;
  page: number;
  per_page: number;
  total_pages: number;
  // v2.11+ returns next as an object with starting_after cursor
  next?: {
    page?: number;
    starting_after?: string;
  } | null;
}

interface IntercomResponse {
  data: IntercomArticle[];
  pages: IntercomPages;
  total_count: number;
}

// ─── Intercom pagination ──────────────────────────────────────────────────────

async function fetchAllArticles(): Promise<IntercomArticle[]> {
  const articles: IntercomArticle[] = [];
  let page = 1;

  while (true) {
    const url = new URL('https://api.intercom.io/articles');
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));

    process.stdout.write(`  Página ${page}...`);

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${INTERCOM_TOKEN}`,
        'Accept': 'application/json',
        'Intercom-Version': '2.11',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Intercom API ${res.status}: ${err}`);
    }

    const body: IntercomResponse = await res.json();
    articles.push(...body.data);

    process.stdout.write(
      ` ${body.data.length} artigos | total acumulado: ${articles.length}` +
      ` | página ${body.pages.page}/${body.pages.total_pages}\n`,
    );

    if (body.pages.page >= body.pages.total_pages) break;
    page++;
  }

  return articles;
}

// ─── HTML → Markdown ──────────────────────────────────────────────────────────

function toMarkdown(html: string | null): string {
  if (!html) return '';
  // Strip Intercom-specific wrapper divs before converting
  const cleaned = html
    .replace(/<div[^>]*class="[^"]*intercom[^"]*"[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n');
  return td.turndown(cleaned).trim();
}

// ─── Supabase insert/update ───────────────────────────────────────────────────
// Partial unique indexes (WHERE source_id IS NOT NULL) are not recognised by the
// Supabase JS client for ON CONFLICT resolution. We do a manual check-then-write
// instead: SELECT the existing row by source_id, then UPDATE or INSERT accordingly.

async function upsertArticle(article: IntercomArticle): Promise<void> {
  const sourceId  = String(article.id);
  const markdown  = toMarkdown(article.body);
  const createdAt = new Date(article.created_at * 1000).toISOString();

  const record = {
    title:        article.title,
    content:      markdown || article.title, // fallback: never store empty content
    source:       'intercom',
    source_id:    sourceId,
    is_published: true,
    created_at:   createdAt,
  };

  // Check if a row with this source_id already exists
  const { data: existing, error: selectErr } = await supabase
    .from('desk_knowledge_base')
    .select('id')
    .eq('source_id', sourceId)
    .maybeSingle();

  if (selectErr) throw new Error(`Supabase select (${sourceId}): ${selectErr.message}`);

  if (existing?.id) {
    // UPDATE existing row
    const { error } = await supabase
      .from('desk_knowledge_base')
      .update({ title: record.title, content: record.content })
      .eq('id', existing.id);
    if (error) throw new Error(`Supabase update (${sourceId}): ${error.message}`);
  } else {
    // INSERT new row
    const { error } = await supabase
      .from('desk_knowledge_base')
      .insert(record);
    if (error) throw new Error(`Supabase insert (${sourceId}): ${error.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  Intercom → CloudDesk KB Import\n');

  // 1. Fetch
  console.log('📥  Buscando artigos do Intercom...');
  const all = await fetchAllArticles();
  console.log(`\n✅  ${all.length} artigos encontrados no total.\n`);

  // 2. Split published vs draft
  const published = all.filter((a) => a.state === 'published');
  const drafts    = all.filter((a) => a.state !== 'published');

  console.log(`📋  ${published.length} publicados  |  ${drafts.length} rascunhos (ignorados)\n`);

  // 3. Import
  console.log('📤  Importando artigos publicados para desk_knowledge_base...\n');

  const imported: string[] = [];
  const failed:   Array<{ title: string; error: string }> = [];

  for (const article of published) {
    process.stdout.write(`  ⬆  ${article.title.slice(0, 70)}...`);
    try {
      await upsertArticle(article);
      imported.push(article.title);
      process.stdout.write(' ✓\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ title: article.title, error: msg });
      process.stdout.write(` ✗ ${msg}\n`);
    }
  }

  // 4. Report
  console.log('\n─────────────────────────────────────────');
  console.log('📊  RELATÓRIO FINAL');
  console.log('─────────────────────────────────────────');
  console.log(`  Total encontrado : ${all.length}`);
  console.log(`  Importados       : ${imported.length}`);
  console.log(`  Rascunhos        : ${drafts.length}`);
  console.log(`  Erros            : ${failed.length}`);

  if (imported.length > 0) {
    console.log('\n✅  Artigos importados:');
    imported.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));
  }

  if (failed.length > 0) {
    console.log('\n❌  Erros:');
    failed.forEach(({ title, error }) => console.log(`   • ${title}: ${error}`));
  }

  console.log('\n─────────────────────────────────────────\n');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌  Erro fatal:', err.message ?? err);
  process.exit(1);
});
