import { create } from "zustand";
import type { WidgetConversation, WidgetMessage, WidgetAccount } from "./types";

interface WidgetState {
  isOpen: boolean;
  account: WidgetAccount | null;
  conversation: WidgetConversation | null;
  messages: WidgetMessage[];
  isTyping: boolean;
  isAiResponding: boolean;
  showCsat: boolean;
  csatSubmitted: boolean;
  unreadCount: number;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setAccount: (account: WidgetAccount | null) => void;
  setConversation: (conv: WidgetConversation | null) => void;
  setMessages: (msgs: WidgetMessage[]) => void;
  addMessage: (msg: WidgetMessage) => void;
  setIsTyping: (v: boolean) => void;
  setIsAiResponding: (v: boolean) => void;
  setShowCsat: (v: boolean) => void;
  setCsatSubmitted: (v: boolean) => void;
  setUnreadCount: (n: number) => void;
}

// Persist open/closed state
const getPersistedOpen = () => {
  try {
    return localStorage.getItem("clouddesk-widget-open") === "true";
  } catch {
    return false;
  }
};

export const useWidgetStore = create<WidgetState>((set) => ({
  isOpen: getPersistedOpen(),
  account: null,
  conversation: null,
  messages: [],
  isTyping: false,
  isAiResponding: false,
  showCsat: false,
  csatSubmitted: false,
  unreadCount: 0,
  setOpen: (open) => {
    try { localStorage.setItem("clouddesk-widget-open", String(open)); } catch {}
    set({ isOpen: open });
  },
  toggleOpen: () => set((s) => {
    const next = !s.isOpen;
    try { localStorage.setItem("clouddesk-widget-open", String(next)); } catch {}
    return { isOpen: next };
  }),
  setAccount: (account) => set({ account }),
  setConversation: (conversation) => set({ conversation }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setIsTyping: (isTyping) => set({ isTyping }),
  setIsAiResponding: (isAiResponding) => set({ isAiResponding }),
  setShowCsat: (showCsat) => set({ showCsat }),
  setCsatSubmitted: (csatSubmitted) => set({ csatSubmitted }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
}));
