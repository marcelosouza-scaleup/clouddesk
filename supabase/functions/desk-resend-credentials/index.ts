import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResendRequest {
  infra_id: string;
}

interface ResendResult {
  success?: true;
  error?: string;
}

interface CloudfyResponse {
  success?: boolean;
  message?: string;
  error?: string;
  data?: { infrastructureId?: string };
}

// ─── Config ─────────────────────────────────────────────────────────────────

const CLOUDFY_BASE = 'https://partner.cloudfy.space';
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Handler ──────────────────────────────────────────────────────────────────
// Triggers Cloudfy's own credential-resend flow for a given infrastructure.
// Cloudfy sends the email itself — this function only forwards the request,
// authenticated with the server-side CLOUDFY_PARTNER_KEY secret sent in the
// X-Partner-Key header (NOT Authorization: Bearer).

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: ResendResult, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { infra_id }: ResendRequest = await req.json();

    if (!infra_id || typeof infra_id !== 'string') {
      return json({ error: 'Missing infra_id' }, 400);
    }

    const partnerKey = Deno.env.get('CLOUDFY_PARTNER_KEY');
    if (!partnerKey) {
      console.error('[desk-resend-credentials] Missing CLOUDFY_PARTNER_KEY');
      return json({ error: 'Server configuration error' }, 500);
    }

    const url = `${CLOUDFY_BASE}/api/partners/infrastructure/${encodeURIComponent(infra_id)}/resend-credentials`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Partner-Key': partnerKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'AbortError'
        ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
        : (err instanceof Error ? err.message : 'unknown');
      console.error(`[desk-resend-credentials] fetch failed: ${reason}`);
      return json({ error: 'Não foi possível contatar o serviço da Cloudfy' }, 502);
    } finally {
      clearTimeout(timer);
    }

    // Cloudfy returns a JSON body on both success and error. Parse it once so
    // we can surface the upstream `error` message to the client instead of a
    // generic status code.
    let body: CloudfyResponse | null = null;
    try {
      body = await res.json() as CloudfyResponse;
    } catch {
      // Non-JSON body — fall through with body=null
    }

    if (!res.ok || body?.success === false) {
      const upstreamError = body?.error ?? body?.message ?? `HTTP ${res.status}`;
      console.error(`[desk-resend-credentials] Cloudfy ${res.status} for infra ${infra_id}: ${upstreamError}`);
      return json({ error: upstreamError }, 502);
    }

    console.log(`[desk-resend-credentials] OK for infra ${infra_id}`);
    return json({ success: true }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[desk-resend-credentials] error:', msg);
    return json({ error: msg }, 500);
  }
});
