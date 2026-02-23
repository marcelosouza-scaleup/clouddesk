import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChatStore, type Conversation } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, MessageSquare, Mail, Bot, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const priorityDot: Record<string, string> = {
  urgent: "bg-priority-urgent",
  high: "bg-priority-high",
  medium: "bg-priority-medium",
  low: "bg-priority-low",
};

const channelIcon: Record<string, typeof MessageSquare> = {
  chat: MessageSquare,
  email: Mail,
};

export function ConversationList() {
  const { conversations, setConversations, activeConversationId, setActiveConversationId, statusTab, setStatusTab, searchQuery, setSearchQuery } = useChatStore();
  const agent = useAuthStore((s) => s.agent);

  useEffect(() => {
    if (!agent) return;
    loadConversations();

    const channel = supabase
      .channel("conversations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        loadConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [agent, statusTab]);

  const loadConversations = async () => {
    if (!agent) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(id, name, email, avatar_url)")
      .eq("status", statusTab)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (data) {
      // Fetch last message for each conversation
      const convosWithMessages = await Promise.all(
        data.map(async (conv: any) => {
          const { data: msgs } = await supabase
            .from("messages")
            .select("content, created_at, sender_type")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1);

          return {
            ...conv,
            contact: conv.contacts,
            last_message: msgs?.[0] || null,
          } as Conversation;
        })
      );
      setConversations(convosWithMessages);
    }
  };

  const filtered = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.email?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card h-full shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-surface border-none text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="w-full h-8 bg-surface">
            <TabsTrigger value="open" className="text-xs flex-1">Abertas</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs flex-1">Pendentes</TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs flex-1">Resolvidas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
            <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
            <p>Nenhuma conversa</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const ChannelIcon = channelIcon[conv.channel] || MessageSquare;
            const contactName = conv.contact?.name || conv.contact?.email || "Visitante";
            const preview = conv.last_message?.content?.slice(0, 80) || "Sem mensagens";
            const time = conv.last_message?.created_at
              ? formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false, locale: ptBR })
              : "";
            const isBot = conv.last_message?.sender_type === "bot";

            return (
              <button
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`w-full text-left px-3 py-3 border-b border-border transition-colors ${
                  isActive ? "bg-primary/10" : "hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0 mt-0.5">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${priorityDot[conv.priority]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate text-card-foreground">{contactName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {isBot && <Bot className="h-3 w-3 text-primary shrink-0" />}
                      <ChannelIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{preview}</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
