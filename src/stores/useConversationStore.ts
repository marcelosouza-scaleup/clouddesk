import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

// ─── Message types ────────────────────────────────────────────────────────────

export type MessageSenderType = "contact" | "agent" | "bot" | "system";
export type MessageContentType = "text" | "html" | "image" | "file" | "note";

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: MessageSenderType;
  sender_id: string | null;
  content: string;
  content_type: MessageContentType;
  is_private_note: boolean;
  ai_generated: boolean;
  attachments: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Client profile types (read-only — Cloudfy production tables) ─────────────

export interface ClientAccount {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
  has_purchase: boolean | null;
  created_at: string | null;
}

export type PurchaseStatus = "PAID" | "PENDING" | "CANCELLED";

export interface ClientPurchase {
  id: string;
  purchase_code: string | null;
  purchase_date: string | null;
  status: PurchaseStatus;
  amount: number | null;
  currency: string | null;
  pending_deployment: boolean | null;
  deployment_failure_reason: string | null;
  deployment_retry_count: number | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  product_name: string | null; // joined from products.name
}

export interface ClientProfile {
  account: ClientAccount;
  purchases: ClientPurchase[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ConversationState {
  // Messages
  messages: Message[];
  isLoadingMessages: boolean;

  // Client profile (fetched from Cloudfy production tables — SELECT only)
  clientProfile: ClientProfile | null;
  isLoadingProfile: boolean;

  // Actions
  loadMessages: (conversationId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  clearMessages: () => void;

  loadClientProfile: (accountUserId: string) => Promise<void>;
  clearClientProfile: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  isLoadingMessages: false,
  clientProfile: null,
  isLoadingProfile: false,

  // ── Messages ────────────────────────────────────────────────────────────────

  loadMessages: async (conversationId) => {
    set({ isLoadingMessages: true, messages: [] });

    const { data, error } = await supabase
      .from("desk_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useConversationStore] loadMessages:", error);
      set({ isLoadingMessages: false });
      return;
    }

    set({ messages: (data ?? []) as Message[], isLoadingMessages: false });
  },

  addMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return s;
      return { messages: [...s.messages, message] };
    }),

  clearMessages: () => set({ messages: [], isLoadingMessages: false }),

  // ── Client profile ──────────────────────────────────────────────────────────

  /**
   * Fetches client data from Cloudfy production tables.
   * RULE: SELECT only — never INSERT/UPDATE/DELETE on account or purchases.
   *
   * Step 1 — account (by user_id)
   * Step 2 — purchases + products (by client_email, last 5)
   */
  loadClientProfile: async (accountUserId) => {
    set({ isLoadingProfile: true, clientProfile: null });

    // Step 1: get account row
    const { data: account, error: accErr } = await supabase
      .from("account")
      .select("user_id, name, email, phone, stripe_customer_id, has_purchase, created_at")
      .eq("user_id", accountUserId)
      .maybeSingle();

    if (accErr || !account) {
      console.error("[useConversationStore] loadClientProfile / account:", accErr);
      set({ isLoadingProfile: false });
      return;
    }

    // Step 2: get purchases via client_email (+ products join for product name)
    const { data: purchasesRaw, error: purErr } = await supabase
      .from("purchases")
      .select(
        `id, purchase_code, purchase_date, status, amount, currency,
         pending_deployment, deployment_failure_reason, deployment_retry_count,
         stripe_subscription_id, stripe_invoice_id,
         products(name)`
      )
      .eq("client_email", account.email ?? "")
      .order("created_at", { ascending: false })
      .limit(5);

    if (purErr) {
      console.error("[useConversationStore] loadClientProfile / purchases:", purErr);
    }

    const purchases: ClientPurchase[] = (purchasesRaw ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      purchase_code: p.purchase_code as string | null,
      purchase_date: p.purchase_date as string | null,
      status: p.status as PurchaseStatus,
      amount: p.amount as number | null,
      currency: p.currency as string | null,
      pending_deployment: p.pending_deployment as boolean | null,
      deployment_failure_reason: p.deployment_failure_reason as string | null,
      deployment_retry_count: p.deployment_retry_count as number | null,
      stripe_subscription_id: p.stripe_subscription_id as string | null,
      stripe_invoice_id: p.stripe_invoice_id as string | null,
      product_name: (p.products as { name?: string } | null)?.name ?? null,
    }));

    set({
      clientProfile: { account: account as ClientAccount, purchases },
      isLoadingProfile: false,
    });
  },

  clearClientProfile: () => set({ clientProfile: null, isLoadingProfile: false }),
}));
