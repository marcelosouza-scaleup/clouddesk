import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChatStore, type Message } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { Bot, Lock, Info, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { MessageComposer } from "./MessageComposer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const priorityLabels: Record<string, { label: string; class: string }> = {
  urgent: { label: "Urgente", class: "bg-priority-urgent text-primary-foreground" },
  high: { label: "Alta", class: "bg-priority-high text-primary-foreground" },
  medium: { label: "Média", class: "bg-priority-medium text-primary-foreground" },
  low: { label: "Baixa", class: "bg-priority-low text-primary-foreground" },
};

export function ChatThread() {
  const { activeConversationId, messages, setMessages, conversations } = useChatStore();
  const agent = useAuthStore((s) => s.agent);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);

  useEffect(() => {
    if (!activeConversationId) return;
    loadMessages();

    const channel = supabase
      .channel(`messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const msg = payload.new as Message;
          useChatStore.getState().addMessage(msg);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", activeConversationId!)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  };

  const handleResolve = async () => {
    if (!activeConversationId) return;
    await supabase.from("conversations").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", activeConversationId);
  };

  const handleChangePriority = async (priority: string) => {
    if (!activeConversationId) return;
    await supabase.from("conversations").update({ priority }).eq("id", activeConversationId);
  };

  if (!activeConversationId || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <Info className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecione uma conversa para começar</p>
        </div>
      </div>
    );
  }

  const contactName = conversation.contact?.name || conversation.contact?.email || "Visitante";
  const prio = priorityLabels[conversation.priority];

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {contactName[0]?.toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-card-foreground truncate">{contactName}</h2>
            <p className="text-[10px] text-muted-foreground">{conversation.channel} • {conversation.status}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Badge className={`cursor-pointer ${prio.class} text-[10px]`}>{prio.label}</Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.entries(priorityLabels).map(([k, v]) => (
                <DropdownMenuItem key={k} onClick={() => handleChangePriority(k)}>{v.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {conversation.status !== "resolved" && (
            <Button size="sm" variant="outline" onClick={handleResolve} className="text-xs h-7">
              <CheckCircle className="h-3 w-3 mr-1" /> Resolver
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} currentAgentId={agent?.id} />
        ))}
      </div>

      {/* Composer */}
      <MessageComposer conversationId={activeConversationId} />
    </div>
  );
}

function MessageBubble({ message, currentAgentId }: { message: Message; currentAgentId?: string }) {
  const time = format(new Date(message.created_at), "HH:mm");

  if (message.sender_type === "system") {
    return (
      <div className="flex justify-center animate-fade-in">
        <span className="text-[10px] bg-bubble-system text-bubble-system-foreground px-3 py-1 rounded-full">{message.content}</span>
      </div>
    );
  }

  if (message.is_private_note) {
    return (
      <div className="animate-fade-in max-w-[75%] ml-auto">
        <div className="bg-bubble-note text-bubble-note-foreground rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <Lock className="h-3 w-3" />
            <span className="text-[10px] font-medium">Nota interna</span>
          </div>
          <p className="text-sm">{message.content}</p>
          <span className="text-[10px] opacity-60 mt-1 block">{time}</span>
        </div>
      </div>
    );
  }

  const isContact = message.sender_type === "contact";
  const isBot = message.sender_type === "bot" || message.ai_generated;

  return (
    <div className={`flex animate-fade-in ${isContact ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
        isContact
          ? "bg-bubble-contact text-bubble-contact-foreground"
          : isBot
          ? "bg-bubble-bot text-bubble-bot-foreground"
          : "bg-bubble-agent text-bubble-agent-foreground"
      }`}>
        {isBot && (
          <div className="flex items-center gap-1 mb-1">
            <Bot className="h-3 w-3" />
            <span className="text-[10px] font-medium opacity-80">IA</span>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <span className="text-[10px] opacity-60 mt-1 block">{time}</span>
      </div>
    </div>
  );
}
