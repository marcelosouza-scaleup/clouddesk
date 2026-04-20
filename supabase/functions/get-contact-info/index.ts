import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableResponse {
  records: AirtableRecord[];
}

export interface ContactInfo {
  airtable_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  plan: string | null;
  status: string | null;
  mrr: number | null;
  company: string | null;
  notes: string | null;
  stripe_customer_id: string | null;
  created_at: string | null;
  raw: Record<string, unknown>;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email } = await req.json() as { email?: string };

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing required field: email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey = Deno.env.get('AIRTABLE_API_KEY');
    const baseId = Deno.env.get('AIRTABLE_BASE_ID');
    const tableName = Deno.env.get('AIRTABLE_TABLE_NAME');

    if (!apiKey || !baseId || !tableName) {
      console.warn('[Airtable] Missing secrets — returning null');
      return new Response(
        JSON.stringify({ contact: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const formula = encodeURIComponent(`{Email} = "${email.replace(/"/g, '\\"')}"`);
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${formula}&maxRecords=1`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Airtable] API error ${res.status}: ${err}`);
      // Return null instead of 500 so the panel degrades gracefully
      return new Response(
        JSON.stringify({ contact: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data: AirtableResponse = await res.json();

    if (!data.records || data.records.length === 0) {
      return new Response(
        JSON.stringify({ contact: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const record = data.records[0];
    const f = record.fields;

    // Normalize common field name variants (Name/Nome, Plan/Plano, Status, MRR, Phone/Telefone, etc.)
    const get = (...keys: string[]): unknown => {
      for (const k of keys) {
        if (f[k] !== undefined && f[k] !== null && f[k] !== '') return f[k];
      }
      return null;
    };

    const contact: ContactInfo = {
      airtable_id: record.id,
      name: (get('Name', 'Nome', 'name', 'nome') as string | null),
      email: (get('Email', 'email', 'E-mail') as string | null),
      phone: (get('Phone', 'Telefone', 'phone', 'telefone') as string | null),
      plan: (get('Plan', 'Plano', 'plan', 'plano', 'Product', 'Produto') as string | null),
      status: (get('Status', 'status') as string | null),
      mrr: (get('MRR', 'mrr', 'MRR (BRL)', 'MRR (USD)', 'Monthly Revenue') as number | null),
      company: (get('Company', 'Empresa', 'company', 'empresa') as string | null),
      notes: (get('Notes', 'Notas', 'Observações', 'notes') as string | null),
      stripe_customer_id: (get('Stripe Customer ID', 'stripe_customer_id', 'StripeID') as string | null),
      created_at: (get('Created', 'created_at', 'Data de criação') as string | null),
      raw: f,
    };

    console.log(`[Airtable] Found contact for ${email}: id=${record.id}`);

    return new Response(
      JSON.stringify({ contact }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Airtable] Fatal error:', msg);
    // Always return null rather than 500 — degraded state is better than broken panel
    return new Response(
      JSON.stringify({ contact: null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
