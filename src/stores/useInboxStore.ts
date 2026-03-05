import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConversationStatus = "open" | "pending" | "snoozed" | "resolved";
export type ConversationPriority = "low" | "medium" | "high" | "urgent";
export type ConversationChannel = "chat" | "email";

export interface ConversationContact {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ConversationLastMessage {
  content: string;
  created_at: string;
  sender_type: string;
}

export interface Conversation {
  id: string;
  account_user_id: string;
  assigned_agent_id: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  priority: ConversationPriority;
  subject: string | null;
  ai_active: boolean;
  sla_deadline: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched client-side
  contact?: ConversationContact;
  last_message?: ConversationLastMessage;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface InboxState {
  conversations: Conversation[];
  activeTab: ConversationStatus;
  activeConversationId: string | null;
  searchQuery: string;
  isLoading: boolean;

  // Actions
  setActiveTab: (tab: ConversationStatus) => void;
  setActiveConversationId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  loadConversations: (status: ConversationStatus) => Promise<void>;
  upsertConversation: (raw: Record<string, unknown>) => Promise<void>;
  removeConversation: (id: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Batch-enrich raw desk_conversations rows with account names and last messages.
 * Uses 2 extra queries regardless of conversation count (no N+1).
 */
async function enrichConversations(
  rows: Record<string, unknown>[]
): Promise<Conversation[]> {
  if (rows.length === 0) return [];

  const accountIds = [...new Set(rows.map((r) => r.account_user_id as string))];
  const convIds = rows.map((r) => r.id as string);

  const [accountsRes, msgsRes] = await Promise.all([
    supabase
      .from("account")
      .select("user_id, name, email, phone")
      .in("user_id", accountIds),
    supabase
      .from("desk_messages")
      .select("conversation_id, content, created_at, sender_type")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
  ]);

  // Build lookup maps
  const accountMap: Record<string, ConversationContact> = {};
  for (const acc of accountsRes.data ?? []) {
    accountMap[acc.user_id] = acc as ConversationContact;
  }

  const lastMsgMap: Record<string, ConversationLastMessage> = {};
  for (const msg of msgsRes.data ?? []) {
    if (!lastMsgMap[msg.conversation_id]) {
      lastMsgMap[msg.conversation_id] = {
        content: msg.content,
        created_at: msg.created_at,
        sender_type: msg.sender_type,
      };
    }
  }

  return rows.map((row) => ({
    ...(row as unknown as Conversation),
    contact: accountMap[row.account_user_id as string],
    last_message: lastMsgMap[row.id as string],
  }));
}

/**
 * Enrich a single conversation row (used for Realtime events).
 */
async function enrichOne(raw: Record<string, unknown>): Promise<Conversation> {
  const [accRes, msgRes] = await Promise.all([
    supabase
      .from("account")
      .select("user_id, name, email, phone")
      .eq("user_id", raw.account_user_id as string)
      .maybeSingle(),
    supabase
      .from("desk_messages")
      .select("content, created_at, sender_type")
      .eq("conversation_id", raw.id as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    ...(raw as unknown as Conversation),
    contact: accRes.data ?? undefined,
    last_message: msgRes.data ?? undefined,
  };
}

// ─── Store definition ─────────────────────────────────────────────────────────

export const useInboxStore = create<InboxState>((set, get) => ({
  conversations: [],
  activeTab: "open",
  activeConversationId: null,
  searchQuery: "",
  isLoading: false,

  setActiveTab: (tab) => {
    set({ activeTab: tab, activeConversationId: null });
    get().loadConversations(tab);
  },

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  loadConversations: async (status) => {
    set({ isLoading: true });

    const { data, error } = await supabase
      .from("desk_conversations")
      .select("*")
      .eq("status", status)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error || !data) {
      set({ isLoading: false });
      console.error("[useInboxStore] loadConversations error:", error);
      return;
    }

    const enriched = await enrichConversations(data as Record<string, unknown>[]);
    set({ conversations: enriched, isLoading: false });
  },

  /**
   * Called by Realtime INSERT/UPDATE handlers.
   * Fetches account + last_message for the single row, then:
   * - If its status matches the current tab → add/update in list
   * - If status doesn't match → remove from list (status change moved it to another tab)
   */
  upsertConversation: async (raw) => {
    const { activeTab, activeConversationId, conversations } = get();
    const enriched = await enrichOne(raw);

    if (enriched.status !== activeTab) {
      // If the agent is currently viewing this conversation (e.g. they just replied
      // and it moved from "pending" → "open"), keep it visible so they aren't
      // interrupted mid-reply. Just update the data in-place.
      if (enriched.id === activeConversationId) {
        set({
          conversations: conversations.map((c) => (c.id === enriched.id ? enriched : c)),
        });
        return;
      }
      // Not the active conversation — remove from list normally
      set({ conversations: conversations.filter((c) => c.id !== enriched.id) });
      return;
    }

    const exists = conversations.some((c) => c.id === enriched.id);
    if (exists) {
      // UPDATE: replace in place and bubble to top if updated_at changed
      set({
        conversations: conversations
          .map((c) => (c.id === enriched.id ? enriched : c))
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          ),
      });
    } else {
      // INSERT: prepend
      set({ conversations: [enriched, ...conversations] });
    }
  },

  removeConversation: (id) =>
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),
}));
