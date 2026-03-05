import { create } from "zustand";

export interface Conversation {
  id: string;
  account_user_id: string;
  assigned_agent_id: string | null;
  channel: string;
  status: string;
  priority: string;
  subject: string | null;
  ai_active: boolean;
  sla_deadline: string | null;
  created_at: string;
  updated_at: string;
  // Joined from account table
  contact?: { user_id: string; name: string | null; email: string | null; phone: string | null };
  last_message?: { content: string; created_at: string; sender_type: string };
  unread_count?: number;
  tags?: { id: string; name: string; color: string }[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  content_type: string;
  is_private_note: boolean;
  ai_generated: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
  attachments: unknown[];
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  filter: string;
  statusTab: string;
  searchQuery: string;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setFilter: (filter: string) => void;
  setStatusTab: (tab: string) => void;
  setSearchQuery: (query: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  filter: "all",
  statusTab: "open",
  searchQuery: "",
  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setFilter: (filter) => set({ filter }),
  setStatusTab: (tab) => set({ statusTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
