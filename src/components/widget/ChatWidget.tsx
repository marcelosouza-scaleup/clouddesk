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

// Fixed conversation ID for MVP testing
export const TEST_CONVERSATION_ID = "00000000-0000-0000-0000-000000000001";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;

const BASE_SYSTEM_PROMPT = `Você é Luna, assistente virtual de suporte da Cloudfy, uma empresa SaaS de infraestrutura.
Seja profissional, amigável e direta. Use linguagem simples e acessível.
Responda em português do Brasil. Respostas curtas e objetivas (máximo 3 parágrafos).
Ao final, pergunte se o cliente precisa de mais ajuda.`;

// ── Knowledge base cache (refreshes every 5 minutes) ──────────────────────────

interface KBArticle { title: string; content: string; }
let kbCache: { articles: KBArticle[]; fetchedAt: number } | null = null;
const KB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchKnowledgeBase(): Promise<KBArticle[]> {
  const now = Date.now();
  if (kbCache && now - kbCache.fetchedAt < KB_CACHE_TTL_MS) {
    return kbCache.articles;
  }

  const { data, error } = await supabase
    .from("desk_knowledge_base")
    .select("title, content")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Widget] Erro ao buscar base de conhecimento:", error.message);
    return kbCache?.articles ?? []; // return stale cache on error rather than nothing
  }

  const articles = (data ?? []) as KBArticle[];
  kbCache = { articles, fetchedAt: now };
  return articles;
}

// Keyword the AI must output (and only this) to trigger human handoff
const TRANSFER_KEYWORD = "[TRANSFERIR]";

function buildSystemPrompt(articles: KBArticle[]): string {
  const kbSection = articles.length === 0
    ? "Nenhum artigo disponível no momento."
    : articles.map((a) => `### ${a.title}\n${a.content}`).join("\n\n---\n\n");

  return `${BASE_SYSTEM_PROMPT}

---

[REGRA DE TRANSFERÊNCIA — OBRIGATÓRIA]
Se o cliente pedir explicitamente para falar com um humano, OU se a dúvida dele NÃO puder ser respondida usando EXCLUSIVAMENTE a Base de Conhecimento abaixo, você DEVE responder APENAS com a palavra-chave: ${TRANSFER_KEYWORD}
Não adicione nenhum texto antes ou depois. Não explique. Só retorne: ${TRANSFER_KEYWORD}

---

[BASE DE CONHECIMENTO]
Utilize SOMENTE os artigos abaixo para responder ao cliente. Não invente informações.

${kbSection}`;
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

// ── Response interceptor ──────────────────────────────────────────────────────

/**
 * Processes the raw AI response:
 * - If it contains [TRANSFERIR] → triggers handoff, never shows the keyword
 * - Otherwise → inserts normal bot message
 * Returns the message added to the thread (or null on DB error).
 */
async function processAiResponse(
  rawText: string,
  conversationId: string,
): Promise<{ message: WidgetMessage | null; didHandoff: boolean }> {
  if (rawText.includes(TRANSFER_KEYWORD)) {
    const message = await handleHandoff(conversationId);
    return { message, didHandoff: true };
  }

  const message = await insertMessage(conversationId, "bot", rawText, true);
  return { message, didHandoff: false };
}

async function callOpenAI(userMessage: string, history: WidgetMessage[]): Promise<string> {
  const kbArticles = await fetchKnowledgeBase();
  const systemPrompt = buildSystemPrompt(kbArticles);

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.sender_type === "contact" ? "user" : "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
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

interface Props {
  settings: CloudDeskSettings;
}

export function ChatWidget({ settings }: Props) {
  const {
    isOpen,
    account,
    conversation,
    messages,
    showCsat,
    isAiResponding,
    setConversation,
    addMessage,
    setIsAiResponding,
  } = useWidgetStore();

  const startConversation = useCallback(
    async (firstMessage: string) => {
      // Set conversation using fixed test ID
      const conv = {
        id: TEST_CONVERSATION_ID,
        status: "open",
        created_at: new Date().toISOString(),
        subject: firstMessage.slice(0, 60),
      };
      setConversation(conv);

      setIsAiResponding(true);

      try {
        // 1. Insert contact message
        const contactMsg = await insertMessage(TEST_CONVERSATION_ID, "contact", firstMessage);
        if (contactMsg) addMessage(contactMsg);

        // 2. Call OpenAI → intercept [TRANSFERIR] before any output
        const aiText = await callOpenAI(firstMessage, []);
        const { message: responseMsg } = await processAiResponse(aiText, TEST_CONVERSATION_ID);
        if (responseMsg) addMessage(responseMsg);
      } catch (err) {
        console.error("[Widget] Erro no fluxo de IA:", err);
        addMessage({
          id: crypto.randomUUID(),
          conversation_id: TEST_CONVERSATION_ID,
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
    [account, addMessage, setConversation, setIsAiResponding]
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

        // 2. Call OpenAI → intercept [TRANSFERIR] before any output
        const aiText = await callOpenAI(text, messages);
        const { message: responseMsg } = await processAiResponse(aiText, conversation.id);
        if (responseMsg) addMessage(responseMsg);
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
    [conversation, messages, addMessage, setIsAiResponding, startConversation]
  );

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
            accountName={account?.name ?? null}
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
              {isAiResponding && (
                <div className="px-4 pb-1">
                  <button
                    onClick={() => {
                      const sysMsg: WidgetMessage = {
                        id: crypto.randomUUID(),
                        conversation_id: conversation.id,
                        sender_type: "system",
                        content: "Você solicitou falar com um atendente humano",
                        created_at: new Date().toISOString(),
                        ai_generated: false,
                        is_private_note: false,
                      };
                      addMessage(sysMsg);
                      setIsAiResponding(false);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                  >
                    <UserRoundX className="h-3 w-3" />
                    Falar com humano
                  </button>
                </div>
              )}
              <ChatWidgetComposer onSend={handleSend} disabled={isAiResponding} />
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
