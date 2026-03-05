import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WidgetMessage } from "./types";
import { useWidgetStore } from "./useWidgetStore";

interface Props {
  messages: WidgetMessage[];
  conversationId: string;
}

export function ChatWidgetThread({ messages, conversationId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isTyping, isAiResponding } = useWidgetStore();

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isTyping, isAiResponding]);

  // ── Effect 1: initial load ───────────────────────────────────────────────────
  // Runs once per conversationId. Merges DB results with any messages already in
  // the store (e.g. optimistic inserts that arrived before this effect ran).
  useEffect(() => {
    if (!conversationId) return;

    supabase
      .from("desk_messages")
      .select("id, conversation_id, sender_type, content, created_at, ai_generated, is_private_note")
      .eq("conversation_id", conversationId)
      .eq("is_private_note", false)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("[Widget] loadMessages error:", error.message);
          return;
        }
        if (!data) return;

        // Merge: keep any messages already in store that aren't in the DB result
        // (shouldn't happen, but guards against race conditions).
        const dbMessages = data as WidgetMessage[];
        const { messages: inStore, setMessages } = useWidgetStore.getState();
        const dbIds = new Set(dbMessages.map((m) => m.id));
        const onlyInStore = inStore.filter((m) => !dbIds.has(m.id));
        const merged = [...dbMessages, ...onlyInStore].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(merged);
      });
  }, [conversationId]);

  // Realtime subscription lives in ChatWidget.tsx (parent) — not here.
  // This component is only responsible for rendering messages and the initial load.

  // ── Render ───────────────────────────────────────────────────────────────────

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
      {messages
        .filter((m) => !m.is_private_note)
        .map((msg) => {
          const isContact = msg.sender_type === "contact";
          const isBot     = msg.sender_type === "bot" || msg.ai_generated;
          const isAgent   = msg.sender_type === "agent";
          const isSystem  = msg.sender_type === "system";

          // System messages — centered pill
          if (isSystem) {
            return (
              <div key={msg.id} className="text-center">
                <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  {msg.content}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isContact ? "justify-end" : "justify-start"} gap-2`}
            >
              {/* Avatar — shown for bot and agent (left side) */}
              {!isContact && (
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isBot ? "bg-[hsl(var(--bubble-bot))]/20" : "bg-primary/15"
                }`}>
                  {isBot
                    ? <Bot  className="h-3.5 w-3.5 text-[hsl(var(--bubble-bot))]" />
                    : <User className="h-3.5 w-3.5 text-primary" />
                  }
                </div>
              )}

              <div className="max-w-[75%]">
                <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  isContact
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : isBot
                    ? "bg-[hsl(var(--bubble-bot))]/15 text-foreground rounded-bl-sm border border-[hsl(var(--bubble-bot))]/20"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}>
                  {/* IA label */}
                  {isBot && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--bubble-bot))] mb-1 block">
                      <Bot className="h-3 w-3" /> IA
                    </span>
                  )}
                  {/* Human agent label */}
                  {isAgent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary mb-1 block">
                      <User className="h-3 w-3" /> Suporte
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block px-1">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}

      {/* Typing / AI responding indicator */}
      {(isTyping || isAiResponding) && (
        <div className="flex justify-start gap-2">
          <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
            isAiResponding ? "bg-[hsl(var(--bubble-bot))]/20" : "bg-primary/15"
          }`}>
            {isAiResponding
              ? <Bot  className="h-3.5 w-3.5 text-[hsl(var(--bubble-bot))]" />
              : <User className="h-3.5 w-3.5 text-primary" />
            }
          </div>
          <div className="px-3 py-2.5 rounded-xl bg-muted rounded-bl-sm">
            <div className="flex gap-1 items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
