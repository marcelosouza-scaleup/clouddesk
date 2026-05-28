import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContactInfoRequest {
  email: string;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableResponse {
  records?: AirtableRecord[];
}

interface CustomerInfo {
  name: string;
  email: string;
  customer_id: string; // Stripe cus_...
  referral: string;    // from first subscription — Customers table has no Referral column
}

interface SubscriptionInfo {
  subscription_id: string;
  status: string;   // active | trialing | canceled | internal
  product: string;  // ex: "Cloud Advanced"
  mrr: number;
  interval: string; // month | year
  promocode: string;
  created_at: string; // ISO 8601 from Airtable "Created At" field
}

interface InfraInfo {
  subscription_id: string; // which subscription this infra belongs to
  infra_id: string;
  purchase_code: string;
  requests_24h: number;
  requests_7d: number;
  requests_30d: number;
}

interface ContactInfoResult {
  customer: CustomerInfo | null;
  subscriptions: SubscriptionInfo[];
  infras: InfraInfo[];
  airtable_limited?: boolean;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const TABLE_CUSTOMERS     = 'Customers';
const TABLE_SUBSCRIPTIONS = 'Subscriptions';
const TABLE_INFRAS        = 'Infras';

const REQUEST_TIMEOUT_MS = 8_000;

// Sentinel: signals an HTTP 429 from Airtable without throwing.
const RATE_LIMITED = Symbol('rate_limited');

type FieldsWithId = Record<string, unknown> & { _recordId: string };
type FetchResult  = FieldsWithId | null | typeof RATE_LIMITED;
type FetchAllResult = FieldsWithId[] | typeof RATE_LIMITED;

// ─── Field helpers ──────────────────────────────────────────────────────────
// Lookup/linked fields in Airtable come back as arrays — unwrap the first value.

function str(fields: Record<string, unknown>, key: string): string {
  const v = fields[key];
  if (v == null) return '';
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : '';
  return String(v);
}

function num(fields: Record<string, unknown>, key: string): number {
  const v = fields[key];
  if (v == null) return 0;
  const raw = Array.isArray(v) ? (v.length > 0 ? v[0] : null) : v;
  if (raw == null) return 0;
  // Strip currency formatting ("R$82,50", "U$15.00") → number
  const cleaned = typeof raw === 'string'
    ? raw.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    : raw;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ─── Field mappers ──────────────────────────────────────────────────────────
// Column names verified live against the real Airtable base on 2026-05-28.
//
// Customers:     email, name, customer_id (Stripe cus_...)
// Subscriptions: Subscription ID, Status, Products (array), MRR, Interval,
//                Promocode, Referral, Email (array)
// Infras:        infra_id, purchase_code, Subscription (linked record array),
//                requests_24h, requests_7d, requests_30d

function mapCustomer(fields: Record<string, unknown>, referral: string): CustomerInfo {
  return {
    name:        str(fields, 'name'),
    email:       str(fields, 'email'),
    customer_id: str(fields, 'customer_id'),
    referral,
  };
}

function mapSubscription(fields: Record<string, unknown>): SubscriptionInfo {
  return {
    subscription_id: str(fields, 'Subscription ID'),
    status:          str(fields, 'Status'),
    product:         str(fields, 'Products'),  // array — str() unwraps first element
    mrr:             num(fields, 'MRR'),
    interval:        str(fields, 'Interval'),
    promocode:       str(fields, 'Promocode'),
    created_at:      str(fields, 'Created At'),
  };
}

function mapInfra(fields: Record<string, unknown>, subscriptionId: string): InfraInfo {
  return {
    subscription_id: subscriptionId,
    infra_id:        str(fields, 'infra_id'),
    purchase_code:   str(fields, 'purchase_code'),
    requests_24h:    num(fields, 'requests_24h'),
    requests_7d:     num(fields, 'requests_7d'),
    requests_30d:    num(fields, 'requests_30d'),
  };
}

// ─── Airtable fetch helpers ──────────────────────────────────────────────────

/** Escapes a value for safe interpolation inside an Airtable filterByFormula. */
function esc(value: string): string {
  return value.replace(/"/g, '\\"');
}

function buildUrl(baseId: string, table: string, params: {
  filter: string;
  maxRecords?: number;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
}): string {
  let url =
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}` +
    `?filterByFormula=${encodeURIComponent(params.filter)}`;
  if (params.maxRecords) url += `&maxRecords=${params.maxRecords}`;
  if (params.sortField) {
    url += `&sort[0][field]=${encodeURIComponent(params.sortField)}`;
    url += `&sort[0][direction]=${params.sortDir ?? 'desc'}`;
  }
  return url;
}

async function airtableFetch(url: string, apiKey: string): Promise<Response | typeof RATE_LIMITED | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (res.status === 429) return RATE_LIMITED;
    if (!res.ok) {
      console.error(`[get-contact-info] Airtable error ${res.status} for ${url.split('?')[0]}`);
      return null;
    }
    return res;
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError'
      ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
      : (err instanceof Error ? err.message : 'unknown');
    console.error(`[get-contact-info] fetch failed: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches the first matching record. Returns FieldsWithId, null, or RATE_LIMITED. */
async function fetchFirstRecord(
  baseId: string,
  apiKey: string,
  table: string,
  filter: string,
  sortField?: string,
): Promise<FetchResult> {
  const url = buildUrl(baseId, table, { filter, maxRecords: 1, sortField });
  const res = await airtableFetch(url, apiKey);
  if (res === RATE_LIMITED) return RATE_LIMITED;
  if (!res) return null;
  const data: AirtableResponse = await res.json();
  const rec = data.records?.[0];
  return rec ? { ...rec.fields, _recordId: rec.id } : null;
}

/** Fetches ALL matching records (up to 100). Returns FieldsWithId[], or RATE_LIMITED. */
async function fetchAllRecords(
  baseId: string,
  apiKey: string,
  table: string,
  filter: string,
  sortField?: string,
): Promise<FetchAllResult> {
  const url = buildUrl(baseId, table, { filter, maxRecords: 100, sortField, sortDir: 'desc' });
  const res = await airtableFetch(url, apiKey);
  if (res === RATE_LIMITED) return RATE_LIMITED;
  if (!res) return [];
  const data: AirtableResponse = await res.json();
  return (data.records ?? []).map((r) => ({ ...r.fields, _recordId: r.id }));
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email }: ContactInfoRequest = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey = Deno.env.get('AIRTABLE_API_KEY');
    const baseId = Deno.env.get('AIRTABLE_BASE_ID');

    if (!apiKey || !baseId) {
      console.error('[get-contact-info] Missing Airtable credentials');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let airtableLimited = false;

    // ── RT1: Customer (by email) ─────────────────────────────────────────────
    const customerFields = await fetchFirstRecord(
      baseId, apiKey, TABLE_CUSTOMERS,
      `{email}="${esc(email)}"`,
    );
    if (customerFields === RATE_LIMITED) airtableLimited = true;

    const customerOk = customerFields && customerFields !== RATE_LIMITED;

    // ── RT2: ALL Subscriptions for this email, newest first ──────────────────
    // Ordered: active ones naturally sort to top when combined with Created At desc
    // because active subscriptions tend to be newer — but we return all so the
    // AI can list them explicitly (active ✅, canceled ❌, etc.)
    let subRecords: FieldsWithId[] = [];
    if (customerOk) {
      const subResult = await fetchAllRecords(
        baseId, apiKey, TABLE_SUBSCRIPTIONS,
        `{Email}="${esc(email)}"`,
        'Created At',
      );
      if (subResult === RATE_LIMITED) {
        airtableLimited = true;
      } else {
        subRecords = subResult;
      }
    }

    console.log(`[get-contact-info] ${email} → ${subRecords.length} subscription(s)`);

    // Referral from the first (most recent) subscription
    const referral = subRecords.length > 0 ? str(subRecords[0], 'Referral') : '';
    const customer = customerOk
      ? mapCustomer(customerFields as Record<string, unknown>, referral)
      : null;

    const subscriptions = subRecords.map((r) => mapSubscription(r as Record<string, unknown>));

    // ── RT3: ALL Infras for this email in one request ────────────────────────
    // Filtering linked-record columns (Subscription) by record ID is not supported
    // in Airtable filterByFormula. Instead, fetch all infras for this email via the
    // lookup field "email (from customer_id) (from Subscription)", then cross-reference
    // each infra's Subscription array (contains the Airtable record ID) against the
    // subscription records we already fetched.
    let infras: InfraInfo[] = [];
    if (subRecords.length > 0) {
      const infraResult = await fetchAllRecords(
        baseId, apiKey, TABLE_INFRAS,
        `{email (from customer_id) (from Subscription)}="${esc(email)}"`,
      );

      if (infraResult === RATE_LIMITED) {
        airtableLimited = true;
      } else {
        infras = infraResult
          .map((infraFields) => {
            // {Subscription} is an array containing the Airtable record ID of the linked subscription
            const subRecordIdArr = infraFields['Subscription'];
            const subRecordId = Array.isArray(subRecordIdArr) ? subRecordIdArr[0] : subRecordIdArr;

            // Find the matching subscription by its Airtable record ID
            const matchedSub = subRecords.find((s) => s._recordId === subRecordId);
            const subscriptionId = matchedSub
              ? str(matchedSub as Record<string, unknown>, 'Subscription ID')
              : String(subRecordId ?? '');

            return mapInfra(infraFields as Record<string, unknown>, subscriptionId);
          })
          .filter((i): i is InfraInfo => i.infra_id !== '' || i.purchase_code !== '');
      }
    }

    console.log(`[get-contact-info] ${email} → ${infras.length} infra(s)`);

    const result: ContactInfoResult = { customer, subscriptions, infras };
    if (airtableLimited) result.airtable_limited = true;

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[get-contact-info] error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
