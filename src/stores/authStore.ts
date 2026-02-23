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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  agent: null,
  loading: true,
  setUser: (user) => set({ user }),
  setAgent: (agent) => set({ agent }),
  setLoading: (loading) => set({ loading }),
  fetchAgent: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("id", user.id)
      .single();
    if (data) set({ agent: data as Agent });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, agent: null });
  },
  updateStatus: async (status) => {
    const { user } = get();
    if (!user) return;
    await supabase.from("agents").update({ status }).eq("id", user.id);
    set((s) => ({ agent: s.agent ? { ...s.agent, status } : null }));
  },
}));
