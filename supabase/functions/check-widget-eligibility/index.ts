import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AIRTABLE_API_KEY  = Deno.env.get("AIRTABLE_API_KEY")  ?? "";
const AIRTABLE_BASE_ID  = Deno.env.get("AIRTABLE_BASE_ID")  ?? "";
const AIRTABLE_TABLE    = Deno.env.get("AIRTABLE_TABLE_NAME") ?? "Purchases";

const STARTER_PRODUCT = "Cloud Starter";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

async function fetchAirtableRecords(email: string): Promise<AirtableRecord[]> {
  const filterFormula = encodeURIComponent(`{Email} = "${email}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE}?filterByFormula=${filterFormula}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });

  if (!res.ok) {
    console.error(`[check-widget-eligibility] Airtable error ${res.status}`);
    return [];
  }

  const body = (await res.json()) as AirtableResponse;
  return body.records ?? [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  let email: string;
  try {
    const body = (await req.json()) as { email?: string };
    if (!body.email || typeof body.email !== "string") {
      return Response.json({ eligible: false }, { headers: CORS });
    }
    email = body.email.trim().toLowerCase();
  } catch {
    return Response.json({ eligible: false }, { headers: CORS });
  }

  const records = await fetchAirtableRecords(email);

  // No records → user unknown → don't show widget
  if (records.length === 0) {
    return Response.json({ eligible: false }, { headers: CORS });
  }

  // All records must have Products = "Cloud Starter"
  const allStarter = records.every((rec) => {
    const products = rec.fields["Products"];
    if (Array.isArray(products)) {
      return products.length === 1 && products[0] === STARTER_PRODUCT;
    }
    return products === STARTER_PRODUCT;
  });

  return Response.json({ eligible: allStarter }, { headers: CORS });
});
