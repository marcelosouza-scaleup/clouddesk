import { useCallback, useEffect } from "react";
import { UserRoundX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWidgetStore } from "./useWidgetStore";
import { ChatWidgetHeader } from "./ChatWidgetHeader";
import { ChatWidgetWelcome } from "./ChatWidgetWelcome";
import { ChatWidgetThread } from "./ChatWidgetThread";
import { ChatWidgetComposer } from "./ChatWidgetComposer";
import { CSATFeedback } from "./CSATFeedback";
import type { CloudDeskSettings, WidgetMessage } from "./types";

// Fallback account_user_id for unauthenticated widget preview sessions
const PREVIEW_ACCOUNT_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Edge Function call ────────────────────────────────────────────────────────
// Uses supabase.functions.invoke() so the client handles auth headers correctly
// regardless of whether the key is a JWT (eyJ...) or publishable key (sb_publishable_...).

interface AIRespondResult {
  reply: string | null;
  should_handoff: boolean;
  blocked?: boolean;
}

async function callAiEdgeFunction(
  conversationId: string,
  message: string,
  accountName?: string | null,
): Promise<AIRespondResult> {
  const { data, error } = await supabase.functions.invoke<AIRespondResult>(
    "desk-ai-respond",
    {
      body: {
        conversation_id: conversationId,
        message,
        account_name: accountName ?? undefined,
      },
    },
  );

  if (error) throw new Error(`Edge Function error: ${error.message}`);
  if (!data) throw new Error("Edge Function returned no data");

  return data;
}

// ── Handoff: escalate conversation to human ───────────────────────────────────

const HANDOFF_MESSAGE = "Transferindo você para um de nossos especialistas da Cloudfy. Um momento, por favor... 🙏";

async function handleHandoff(conversationId: string): Promise<WidgetMessage | null> {
  // 1. Mark conversation as pending (waiting for human)
  const { error: updateError } = await supabase
    .from("desk_conversations")
    .update({
      status:    "pending",
      ai_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (updateError) {
    console.error("[Widget] Handoff UPDATE error:", updateError.message);
  }

  // 2. Insert visible system message for the client
  return insertMessage(conversationId, "system", HANDOFF_MESSAGE);
}

async function insertMessage(
  conversationId: string,
  senderType: "contact" | "bot" | "system",
  content: string,
  aiGenerated = false
): Promise<WidgetMessage | null> {
  const { data, error } = await supabase
    .from("desk_messages")
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      content,
      ai_generated: aiGenerated,
      content_type: "text",
      is_private_note: false,
    })
    .select("id, conversation_id, sender_type, content, created_at, ai_generated, is_private_note")
    .single();

  if (error) {
    console.error("[Widget] Erro ao inserir mensagem:", error.message);
    return null;
  }

  return data as WidgetMessage;
}

export interface EmbedUser {
  id: string;
  email: string;
  name: string;
}

interface Props {
  settings: CloudDeskSettings;
  /** Populated when running as embedded widget on cloudfy.space */
  embedUser?: EmbedUser;
}

export function ChatWidget({ settings, embedUser }: Props) {
  const {
    isOpen,
    account,
    conversation,
    messages,
    showCsat,
    isAiResponding,
    isWaitingForHuman,
    setConversation,
    addMessage,
    setIsAiResponding,
    setIsWaitingForHuman,
  } = useWidgetStore();
  // `messages` is used only for rendering — passed down to ChatWidgetThread

  const startConversation = useCallback(
    async (firstMessage: string) => {
      setIsAiResponding(true);

      try {
        // 1. Create conversation record in desk_conversations
        const accountUserId = embedUser?.id ?? account?.user_id ?? PREVIEW_ACCOUNT_USER_ID;
        const { data: convData, error: convError } = await supabase
          .from("desk_conversations")
          .insert({
            account_user_id: accountUserId,
            channel: "chat",
            status: "open",
            priority: "medium",
            subject: firstMessage.slice(0, 60),
            ai_active: true,
          })
          .select("id, status, created_at, subject")
          .single();

        if (convError || !convData) {
          throw new Error(`Erro ao criar conversa: ${convError?.message ?? "sem dados"}`);
        }

        setConversation({
          id: convData.id,
          status: convData.status,
          created_at: convData.created_at,
          subject: convData.subject,
        });

        // 2. Insert contact message
        const contactMsg = await insertMessage(convData.id, "contact", firstMessage);
        if (contactMsg) addMessage(contactMsg);

        // 3. Call Edge Function (server-side OpenAI — no CORS, no key in bundle)
        const aiResult = await callAiEdgeFunction(
          convData.id,
          firstMessage,
          embedUser?.name ?? account?.name,
        );

        if (aiResult.blocked) {
          // AI is disabled for this conversation — do nothing
        } else if (aiResult.should_handoff) {
          const handoffMsg = await handleHandoff(convData.id);
          if (handoffMsg) addMessage(handoffMsg);
        } else if (aiResult.reply) {
          const botMsg = await insertMessage(convData.id, "bot", aiResult.reply, true);
          if (botMsg) addMessage(botMsg);
        }
      } catch (err) {
        console.error("[Widget] Erro no fluxo de IA:", err);
        addMessage({
          id: crypto.randomUUID(),
          conversation_id: "error",
          sender_type: "bot",
          content: "Desculpe, tive um problema ao processar sua mensagem. Tente novamente.",
          created_at: new Date().toISOString(),
          ai_generated: false,
          is_private_note: false,
        });
      } finally {
        setIsAiResponding(false);
      }
    },
    [account, embedUser, addMessage, setConversation, setIsAiResponding]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!conversation) {
        await startConversation(text);
        return;
      }

      setIsAiResponding(true);

      try {
        // 1. Insert contact message
        const contactMsg = await insertMessage(conversation.id, "contact", text);
        if (contactMsg) addMessage(contactMsg);

        // 2. Call Edge Function (server-side OpenAI — no CORS, no key in bundle)
        const aiResult = await callAiEdgeFunction(
          conversation.id,
          text,
          embedUser?.name ?? account?.name,
        );

        if (aiResult.blocked) {
          // AI is disabled for this conversation — do nothing
        } else if (aiResult.should_handoff) {
          const handoffMsg = await handleHandoff(conversation.id);
          if (handoffMsg) addMessage(handoffMsg);
        } else if (aiResult.reply) {
          const botMsg = await insertMessage(conversation.id, "bot", aiResult.reply, true);
          if (botMsg) addMessage(botMsg);
        }
      } catch (err) {
        console.error("[Widget] Erro no fluxo de IA:", err);
        const fallback: WidgetMessage = {
          id: crypto.randomUUID(),
          conversation_id: conversation.id,
          sender_type: "bot",
          content: "Desculpe, tive um problema ao processar sua mensagem. Tente novamente.",
          created_at: new Date().toISOString(),
          ai_generated: false,
          is_private_note: false,
        };
        addMessage(fallback);
      } finally {
        setIsAiResponding(false);
      }
    },
    [account, embedUser, conversation, addMessage, setIsAiResponding, startConversation]
  );

  // ── Realtime: detect agent reply while waiting for human ────────────────────
  // When the conversation is in "pending/waiting for human" state and an agent
  // sends a message, we unlock the composer so the client can continue chatting.
  useEffect(() => {
    const convId = conversation?.id;
    if (!convId || !isWaitingForHuman) return;

    const channel = supabase
      .channel(`widget-agent-reply:${convId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "desk_messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const msg = payload.new as Record<string, unknown>;
          if (msg.sender_type === "agent") {
            // Agent responded — unlock the composer
            setIsWaitingForHuman(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation?.id, isWaitingForHuman, setIsWaitingForHuman]);

  // ── Realtime: subscribe at the ChatWidget level (NOT inside ChatWidgetThread)
  // This runs before any isOpen/conversation guard, so the subscription stays alive
  // even when the widget is minimised. Keyed on conversation.id so it re-subscribes
  // if the conversation ever changes.
  useEffect(() => {
    const convId = conversation?.id;
    if (!convId) return;

    // Helper: safely add a message to the store
    const addToStore = (raw: Record<string, unknown>) => {
      try {
        if (!raw.id || !raw.created_at) return;
        if (raw.is_private_note === true) return;

        const newMsg: WidgetMessage = {
          id:              String(raw.id),
          conversation_id: String(raw.conversation_id ?? convId),
          sender_type:     (raw.sender_type ?? "system") as WidgetMessage["sender_type"],
          content:         String(raw.content ?? ""),
          created_at:      String(raw.created_at),
          ai_generated:    raw.ai_generated === true,
          is_private_note: false,
        };

        const store = useWidgetStore.getState();
        const current = Array.isArray(store.messages) ? store.messages : [];
        if (current.some((m) => m.id === newMsg.id)) return;

        console.log(`[Widget] new message — sender: ${newMsg.sender_type}`);
        store.setMessages([...current, newMsg]);
      } catch (err) {
        console.error("[Widget] addToStore error:", err);
      }
    };

    // Channel 1: postgres_changes (fires when Realtime is enabled on the table)
    const pgChannel = supabase
      .channel(`widget-conv:${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "desk_messages" },
        (payload) => {
          try {
            if (!payload?.new || typeof payload.new !== "object") return;
            console.log("PAYLOAD RECEBIDO NO WIDGET (postgres):", payload.new);
            const raw = payload.new as Record<string, unknown>;
            if (raw.conversation_id !== convId) return;
            addToStore(raw);
          } catch (err) {
            console.error("[Widget] postgres_changes callback error:", err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Widget] postgres_changes → ${status}`);
      });

    // Channel 2: broadcast (sent by ConversationThread after agent INSERT)
    // This is the reliable fallback path that doesn't depend on publication settings.
    const broadcastChannel = supabase
      .channel(`conv-live:${convId}`)
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        try {
          if (!payload || !payload.id) return;
          console.log("PAYLOAD RECEBIDO NO WIDGET (broadcast):", payload);
          addToStore(payload as Record<string, unknown>);
        } catch (err) {
          console.error("[Widget] broadcast callback error:", err);
        }
      })
      .subscribe((status) => {
        console.log(`[Widget] broadcast channel conv-live:${convId} → ${status}`);
      });

    return () => {
      supabase.removeChannel(pgChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 z-[9998] w-[380px] max-w-[calc(100vw-2rem)] h-[550px] max-h-[calc(100vh-8rem)] rounded-xl shadow-2xl border border-border bg-card flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in-0 duration-300 sm:w-[380px]">
      <ChatWidgetHeader
        widgetName={settings.widget_name}
        onlineAgents={2}
      />

      {!conversation ? (
        <>
          <ChatWidgetWelcome
            greeting={settings.greeting}
            accountName={embedUser?.name ?? account?.name ?? null}
            quickActions={settings.quick_actions}
            onQuickAction={startConversation}
            onSendMessage={startConversation}
          />
          <ChatWidgetComposer onSend={startConversation} disabled={isAiResponding} />
        </>
      ) : (
        <>
          <ChatWidgetThread messages={messages} conversationId={conversation.id} />
          {showCsat ? (
            <CSATFeedback />
          ) : (
            <>
              {/* "Falar com humano" — only shown when AI is active and not already waiting */}
              {!isWaitingForHuman && (
                <div className="px-4 pb-1">
                  <button
                    onClick={async () => {
                      if (!conversation?.id) return;
                      setIsWaitingForHuman(true);
                      setIsAiResponding(false);

                      // 1. Update conversation status
                      await supabase
                        .from("desk_conversations")
                        .update({
                          status: "pending",
                          ai_active: false,
                          updated_at: new Date().toISOString(),
                        })
                        .eq("id", conversation.id);

                      // 2. Insert visible system message
                      const { data: sysRow } = await supabase
                        .from("desk_messages")
                        .insert({
                          conversation_id: conversation.id,
                          sender_type: "system",
                          content: "🙋 Cliente solicitou atendimento humano",
                          is_private_note: false,
                          content_type: "text",
                          ai_generated: false,
                        })
                        .select("id, conversation_id, sender_type, content, created_at, ai_generated, is_private_note")
                        .single();

                      if (sysRow) addMessage(sysRow as WidgetMessage);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                  >
                    <UserRoundX className="h-3 w-3" />
                    Falar com humano
                  </button>
                </div>
              )}

              {/* Waiting state banner */}
              {isWaitingForHuman && (
                <div className="px-4 pb-2">
                  <p className="text-[11px] text-amber-500 flex items-center gap-1.5">
                    <span className="animate-pulse">●</span>
                    Aguardando atendente disponível...
                  </p>
                </div>
              )}

              <ChatWidgetComposer
                onSend={handleSend}
                disabled={isAiResponding || isWaitingForHuman}
                placeholder={isWaitingForHuman ? "Aguardando atendente..." : undefined}
              />
            </>
          )}
        </>
      )}

      <div className="px-3 py-1.5 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground text-center">
          Powered by <span className="font-semibold">CloudDesk</span>
        </p>
      </div>
    </div>
  );
}
