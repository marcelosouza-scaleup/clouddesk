// Tipos e helpers para a resposta da Edge Function get-contact-info.
// Fonte única consumida por ClientInfoPanel, Contacts e ChatWidget.

export interface AirtableCustomer {
  name: string;
  email: string;
  customer_id: string;
  referral: string;
}

export interface AirtableSubscription {
  subscription_id: string;
  status: string;
  product: string;
  mrr: number;
  interval: string;   // month | year
  promocode: string;
  created_at: string; // ISO 8601 from Airtable "Created At" field
}

export interface AirtableInfra {
  subscription_id: string; // links back to the subscription
  infra_id: string;
  status: string;
  purchase_code: string;
  requests_24h: number;
  requests_7d: number;
  requests_30d: number;
}

export interface ContactInfo {
  customer: AirtableCustomer | null;
  subscriptions: AirtableSubscription[];
  infras: AirtableInfra[];
  airtable_limited?: boolean;
}

export const intervalLabels: Record<string, string> = {
  month: "Mensal",
  year:  "Anual",
};

/** Combina product + interval num rótulo de plano, ex: "Cloud Advanced · Mensal" */
export function planLabel(sub: AirtableSubscription | null): string | null {
  if (!sub?.product) return null;
  const interval = sub.interval ? intervalLabels[sub.interval] ?? sub.interval : null;
  return interval ? `${sub.product} · ${interval}` : sub.product;
}
