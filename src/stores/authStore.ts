import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Agent {
  id: string;
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
  fetchAgent: (authUserId: string) => Promise<Agent | null>;
  signOut: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  agent: null,
  loading: true,
  setUser: (user) => set({ user }),
  setAgent: (agent) => set({ agent }),
  setLoading: (loading) => set({ loading }),

  fetchAgent: async (authUserId: string) => {
    const { data, error } = await supabase
      .from("desk_agents")
      .select("id, name, email, avatar_url, role, status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error || !data) return null;

    const agent: Agent = {
      id: data.id,
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
      role: data.role,
      status: data.status,
    };
    set({ agent });
    return agent;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, agent: null });
  },

  updateStatus: async (status) => {
    const { agent } = get();
    if (!agent) return;
    set((s) => ({ agent: s.agent ? { ...s.agent, status } : null }));
    await supabase
      .from("desk_agents")
      .update({ status })
      .eq("id", agent.id);
  },
}));
