import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Agent {
  id: string;
  org_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  status: string;
}

interface AuthState {
  user: User | null;
  agent: Agent | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setAgent: (agent: Agent | null) => void;
  setLoading: (loading: boolean) => void;
  fetchAgent: () => Promise<void>;
  signOut: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
}

const MOCK_AGENT: Agent = {
  id: "00000000-0000-0000-0000-000000000002",
  org_id: "cloudfy",
  name: "Admin",
  email: "admin@cloudfy.host",
  avatar_url: null,
  role: "admin",
  status: "online",
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: { id: "00000000-0000-0000-0000-000000000002", email: "admin@cloudfy.host" } as User,
  agent: MOCK_AGENT,
  loading: false,
  setUser: (user) => set({ user }),
  setAgent: (agent) => set({ agent }),
  setLoading: (loading) => set({ loading }),
  fetchAgent: async () => {
    // No-op during dev mode — agent is mocked
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, agent: null });
  },
  updateStatus: async (status) => {
    set((s) => ({ agent: s.agent ? { ...s.agent, status } : null }));
  },
}));
