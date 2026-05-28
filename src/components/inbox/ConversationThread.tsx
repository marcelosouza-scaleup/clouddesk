import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInboxStore } from "@/stores/useInboxStore";
import { useConversationStore, type Message } from "@/stores/useConversationStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bot, Lock, Info, CheckCircle, Send, MessageSquare, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Priority config ──────────────────────────────────────────────────────────

const priorityLabels: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgente", cls: "bg-priority-urgent text-primary-foreground" },
  high:   { label: "Alta",    cls: "bg-priority-high text-primary-foreground"   },
  medium: { label: "Média",   cls: "bg-priority-medium text-primary-foreground" },
  low:    { label: "Baixa",   cls: "bg-priority-low text-primary-foreground"    },
};

// ─── Component ────────────────────────────────────────────────────────────────

// Shared broadcast channel name — both operator and widget subscribe to this.
// Format must match exactly what ChatWidgetThread.tsx expects.
export const convLiveChannelName = (id: string) => `conv-live:${id}`;

export function ConversationThread() {
  const { activeConversationId, conversations } = useInboxStore();
  const { messages, isLoadingMessages, loadMessages, addMessage, clearMessages, applySlaPolicy, airtableInfo } = useConversationStore();
  const agent = useAuthStore((s) => s.agent);

  const scrollRef  = useRef<HTMLDivElement>(null);
  // Ref to the broadcast channel so handleSend can call .send() without closure issues
  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [content, setContent]   = useState("");
  const [isNote, setIsNote]     = useState(false);
  const [sending, setSending]   = useState(false);

  const conversation = conversations.find((c) => c.id === activeConversationId);

  // ── Broadcast channel: keep open while a conversation is active ─────────────
  // The operator uses this channel to push new messages to the widget instantly,
  // bypassing postgres_changes (which requires the table to be in the Realtime
  // publication — a backend config that may not be set up yet).
  useEffect(() => {
    if (!activeConversationId) {
      if (broadcastRef.current) {
        supabase.removeChannel(broadcastRef.current);
        broadcastRef.current = null;
      }
      return;
    }

    const ch = supabase.channel(convLiveChannelName(activeConversationId));
    ch.subscribe((status) => {
      console.log(`[Operator broadcast] channel ${convLiveChannelName(activeConversationId)} → ${status}`);
    });
    broadcastRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      broadcastRef.current = null;
    };
  }, [activeConversationId]);

  // ── Load messages when active conversation changes ──────────────────────────
  useEffect(() => {
    if (!activeConversationId) {
      clearMessages();
      return;
    }
    loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages, clearMessages]);

  // ── Mark conversation as first seen by agent ────────────────────────────────
  useEffect(() => {
    if (!activeConversationId || !conversation) return;

    // first_seen_by_agent_at may not exist on the type yet — cast to access safely
    const conv = conversation as typeof conversation & { first_seen_by_agent_at?: string | null };
    if (conv.first_seen_by_agent_at) return; // already seen

    supabase
      .from("desk_conversations")
      .update({ first_seen_by_agent_at: new Date().toISOString() })
      .eq("id", activeConversationId)
      .then(({ error }) => {
        if (error) console.warn("[ConversationThread] first_seen update failed:", error.message);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // ── Realtime: subscribe to new messages in this conversation ────────────────
  useEffect(() => {
    if (!activeConversationId) return;

    const channel = supabase
      .channel(`thread-messages:${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "desk_messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          addMessage(payload.new as Message);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, addMessage]);

  // ── Auto-scroll to bottom on new messages ──────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!activeConversationId || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Selecione uma conversa</p>
          <p className="text-xs mt-1 opacity-70">Escolha uma conversa na lista para começar</p>
        </div>
      </div>
    );
  }

  const contactName = conversation.contact?.name || conversation.contact?.email || "Visitante";
  const prio = priorityLabels[conversation.priority] ?? priorityLabels.medium;

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAssignToMe = async () => {
    if (!agent) return;
    const { error } = await supabase
      .from("desk_conversations")
      .update({ assigned_agent_id: agent.id, updated_at: new Date().toISOString() })
      .eq("id", activeConversationId!);

    if (error) { toast.error("Erro ao atribuir conversa"); return; }

    await supabase.from("desk_messages").insert({
      conversation_id: activeConversationId,
      sender_type: "system",
      content: `Conversa atribuída para ${agent.name}`,
    });
  };

  const handleResolve = async () => {
    const { error } = await supabase
      .from("desk_conversations")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", activeConversationId);

    if (error) toast.error("Erro ao resolver conversa");
  };

  const handleChangePriority = async (priority: string) => {
    const { error } = await supabase
      .from("desk_conversations")
      .update({ priority })
      .eq("id", activeConversationId!);

    if (error) {
      toast.error("Erro ao alterar prioridade");
      return;
    }

    // Apply SLA policy: use Airtable product (plan name) if available, else fall back to null (global policy)
    await applySlaPolicy(activeConversationId!, priority, airtableInfo?.product ?? null);
  };

  const handleSend = async () => {
    if (!content.trim() || !agent) return;
    setSending(true);

    try {
      // Use .select().single() to get the inserted row back with DB-generated
      // id and created_at — needed to broadcast the complete message to the widget.
      const { data: insertedMsg, error } = await supabase
        .from("desk_messages")
        .insert({
          conversation_id: activeConversationId,
          sender_type: "agent",
          sender_id: agent.id,
          content: content.trim(),
          is_private_note: isNote,
          content_type: isNote ? "note" : "text",
          ai_generated: false,
        })
        .select("id, conversation_id, sender_type, content, created_at, ai_generated, is_private_note")
        .single();

      if (error) throw error;

      // Broadcast to widget via shared channel.
      // This is the reliable path — works even if postgres_changes isn't configured.
      if (insertedMsg && broadcastRef.current) {
        broadcastRef.current.send({
          type: "broadcast",
          event: "new_message",
          payload: insertedMsg,
        });
        console.log("[Operator broadcast] sent message to widget:", insertedMsg.id);
      }

      // When an agent replies to a pending conversation, move it back to open.
      // Also bump updated_at so the Realtime event propagates to ConversationList.
      const statusUpdate =
        !isNote && conversation.status === "pending"
          ? { status: "open", updated_at: new Date().toISOString() }
          : { updated_at: new Date().toISOString() };

      await supabase
        .from("desk_conversations")
        .update(statusUpdate)
        .eq("id", activeConversationId);

      setContent("");
      setIsNote(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro ao enviar mensagem", { description: msg });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">

      {/* ── Header ── */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-muted-foreground">
              {contactName[0]?.toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-card-foreground truncate">{contactName}</h2>
            <p className="text-[10px] text-muted-foreground capitalize">
              {conversation.channel} · {conversation.status}
              {conversation.ai_active && (
                <span className="ml-1 text-primary">· IA ativa</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Priority badge */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Badge className={cn("cursor-pointer text-[10px] select-none", prio.cls)}>
                {prio.label}
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(priorityLabels).map(([k, v]) => (
                <DropdownMenuItem key={k} onClick={() => handleChangePriority(k)}>
                  {v.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign to me / assigned badge */}
          {conversation.status !== "resolved" && (
            conversation.assigned_agent_id === agent?.id ? (
              <Badge variant="outline" className="text-[10px] h-7 px-2 border-primary/40 text-primary">
                Você
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleAssignToMe}
                className="text-xs h-7 gap-1"
              >
                <UserPlus className="h-3 w-3" />
                Atribuir a mim
              </Button>
            )
          )}

          {/* Resolve button */}
          {conversation.status !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResolve}
              className="text-xs h-7 gap-1"
            >
              <CheckCircle className="h-3 w-3" />
              Resolver
            </Button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3"
      >
        {isLoadingMessages ? (
          <MessagesSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
            <Info className="h-6 w-6 opacity-30" />
            <p>Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} agentId={agent?.id} />
          ))
        )}
      </div>

      {/* ── Composer ── */}
      {conversation.status !== "resolved" && (
        <div
          className={cn(
            "border-t border-border p-3 shrink-0 transition-colors",
            isNote ? "bg-bubble-note/30" : "bg-card"
          )}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isNote ? "Escreva uma nota interna..." : "Digite sua mensagem... (Enter para enviar)"}
              className="min-h-[40px] max-h-32 resize-none border-none bg-transparent p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground"
              rows={1}
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsNote((v) => !v)}
                title="Nota interna (visível só para operadores)"
                className={cn("h-8 w-8", isNote ? "text-amber-500" : "text-muted-foreground")}
              >
                <Lock className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={handleSend}
                disabled={!content.trim() || sending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {isNote && (
            <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" />
              Nota interna — visível apenas para operadores
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  agentId,
}: {
  message: Message;
  agentId?: string;
}) {
  const time = format(new Date(message.created_at), "HH:mm", { locale: ptBR });

  // System message — centered pill
  if (message.sender_type === "system") {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] bg-bubble-system text-bubble-system-foreground px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  // Private note — amber full-width
  if (message.is_private_note) {
    return (
      <div className="max-w-[75%] ml-auto animate-fade-in">
        <div className="bg-bubble-note text-bubble-note-foreground rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <Lock className="h-3 w-3" />
            <span className="text-[10px] font-medium">Nota interna</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          <span className="text-[10px] opacity-60 mt-1 block">{time}</span>
        </div>
      </div>
    );
  }

  const isContact = message.sender_type === "contact";
  const isBot = message.sender_type === "bot" || message.ai_generated;

  return (
    <div className={cn("flex animate-fade-in", isContact ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2",
          isContact
            ? "bg-bubble-contact text-bubble-contact-foreground"
            : isBot
            ? "bg-bubble-bot text-bubble-bot-foreground"
            : "bg-bubble-agent text-bubble-agent-foreground"
        )}
      >
        {isBot && (
          <div className="flex items-center gap-1 mb-1 opacity-80">
            <Bot className="h-3 w-3" />
            <span className="text-[10px] font-medium">IA</span>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <span className="text-[10px] opacity-60 mt-1 block">{time}</span>
      </div>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function MessagesSkeleton() {
  return (
    <div className="space-y-4">
      {[false, true, false, false, true].map((right, i) => (
        <div key={i} className={cn("flex", right ? "justify-end" : "justify-start")}>
          <Skeleton className={cn("h-10 rounded-lg", right ? "w-48" : "w-56")} />
        </div>
      ))}
    </div>
  );
}
