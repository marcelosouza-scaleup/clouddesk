import { useCallback } from "react";
import { UserRoundX } from "lucide-react";
import { useWidgetStore } from "./useWidgetStore";
import { ChatWidgetHeader } from "./ChatWidgetHeader";
import { ChatWidgetWelcome } from "./ChatWidgetWelcome";
import { ChatWidgetThread } from "./ChatWidgetThread";
import { ChatWidgetComposer } from "./ChatWidgetComposer";
import { CSATFeedback } from "./CSATFeedback";
import type { CloudDeskSettings, WidgetMessage } from "./types";

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

  const createConversation = useCallback(
    (firstMessage: string) => {
      // Create a mock conversation
      const convId = crypto.randomUUID();
      const conv = {
        id: convId,
        status: "open",
        created_at: new Date().toISOString(),
        subject: firstMessage.slice(0, 60),
      };
      setConversation(conv);

      // Add contact message
      const msg: WidgetMessage = {
        id: crypto.randomUUID(),
        conversation_id: convId,
        sender_type: "contact",
        content: firstMessage,
        created_at: new Date().toISOString(),
        ai_generated: false,
        is_private_note: false,
      };
      addMessage(msg);

      // Simulate AI response
      setIsAiResponding(true);
      setTimeout(() => {
        const botMsg: WidgetMessage = {
          id: crypto.randomUUID(),
          conversation_id: convId,
          sender_type: "bot",
          content: `Olá${account?.name ? `, ${account.name}` : ""}! Recebi sua mensagem sobre "${firstMessage}". Um momento enquanto busco as informações para te ajudar.`,
          created_at: new Date().toISOString(),
          ai_generated: true,
          is_private_note: false,
        };
        addMessage(botMsg);
        setIsAiResponding(false);
      }, 2000);
    },
    [account, addMessage, setConversation, setIsAiResponding]
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!conversation) {
        createConversation(text);
        return;
      }

      const msg: WidgetMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        sender_type: "contact",
        content: text,
        created_at: new Date().toISOString(),
        ai_generated: false,
        is_private_note: false,
      };
      addMessage(msg);

      // Simulate bot response
      setIsAiResponding(true);
      setTimeout(() => {
        const botMsg: WidgetMessage = {
          id: crypto.randomUUID(),
          conversation_id: conversation.id,
          sender_type: "bot",
          content: "Estou verificando isso para você. Se preferir, posso transferir para um atendente humano.",
          created_at: new Date().toISOString(),
          ai_generated: true,
          is_private_note: false,
        };
        addMessage(botMsg);
        setIsAiResponding(false);
      }, 1500);
    },
    [conversation, addMessage, setIsAiResponding, createConversation]
  );

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
            onQuickAction={createConversation}
            onSendMessage={createConversation}
          />
          <ChatWidgetComposer onSend={createConversation} />
        </>
      ) : (
        <>
          <ChatWidgetThread messages={messages} />
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
              <ChatWidgetComposer onSend={handleSend} />
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
