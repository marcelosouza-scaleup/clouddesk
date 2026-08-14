import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWidgetStore } from "./useWidgetStore";
import { widgetApi } from "@/lib/widget-api";
import type { WidgetMessage } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Realtime do widget — dono ÚNICO do canal `conv-live:{id}`.
//
// Antes a subscription vivia dentro do ChatWidget, que só é montado quando o
// widget está aberto: se o operador respondesse com a bolha minimizada, nada
// chegava até o cliente reabrir. Como o objetivo é justamente avisar o cliente
// que voltou depois de horas, o canal precisa estar de pé o tempo todo.
//
// IMPORTANTE: só pode existir UMA assinatura por tópico. Dois
// supabase.channel('conv-live:x') colidem e o segundo subscribe falha, matando
// os eventos. Por isso o ChatWidget não abre canal próprio — tudo passa aqui:
//   • injeta a mensagem na thread, se ela estiver aberta;
//   • atualiza prévia/não lidas na lista de chamados;
//   • levanta o aviso flutuante quando o widget está fechado;
//   • trata conv_updated (resolvido → CSAT, pending → aguardando atendente).
// ─────────────────────────────────────────────────────────────────────────────

/** Quantos canais manter abertos ao mesmo tempo. Os chamados são ordenados por
 *  atividade, então os mais recentes — os que podem receber resposta — entram
 *  primeiro. Um teto evita abrir dezenas de websockets num cliente antigo. */
const MAX_LIVE_CHANNELS = 5;

function titleForSender(senderType: string): string {
  if (senderType === "agent") return "Suporte respondeu seu chamado";
  if (senderType === "bot") return "Você tem uma nova resposta";
  return "Atualização no seu chamado";
}

function mergeMessages(current: WidgetMessage[], incoming: WidgetMessage[]): WidgetMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const merged = [...current];
  for (const msg of incoming) {
    if (!seen.has(msg.id)) {
      merged.push(msg);
      seen.add(msg.id);
    }
  }
  return merged.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function useWidgetLiveUpdates(enabled: boolean) {
  // Assina os chamados que ainda podem receber resposta. Resolvidos ficam de
  // fora da varredura geral, MAS a conversa aberta na tela entra sempre — um
  // chamado resolvido que o cliente está lendo ainda recebe mensagem (ele pode
  // responder e reabrir).
  const openConversationId = useWidgetStore((s) => s.conversation?.id ?? "");
  const liveIds = useWidgetStore((s) => {
    const ids = s.conversations
      .filter((c) => c.status !== "resolved")
      .slice(0, MAX_LIVE_CHANNELS)
      .map((c) => c.id);
    const active = s.conversation?.id;
    if (active && !ids.includes(active)) ids.push(active);
    return ids.join(",");
  });

  useEffect(() => {
    if (!enabled || !liveIds) return;

    const ids = liveIds.split(",").filter(Boolean);

    const handleNewMessage = (convId: string, raw: Record<string, unknown>) => {
      if (!raw.id || !raw.created_at) return;
      if (raw.is_private_note === true) return;

      const senderType = String(raw.sender_type ?? "system") as WidgetMessage["sender_type"];
      const content = String(raw.content ?? "");
      const createdAt = String(raw.created_at);

      const store = useWidgetStore.getState();
      const isThreadOpen = store.isOpen && store.conversation?.id === convId;

      // ── Thread aberta na tela: injeta a mensagem e marca como lida ───────────
      if (isThreadOpen) {
        const newMsg: WidgetMessage = {
          id: String(raw.id),
          conversation_id: String(raw.conversation_id ?? convId),
          sender_type: senderType,
          content,
          created_at: createdAt,
          ai_generated: raw.ai_generated === true,
          is_private_note: false,
          metadata: (raw.metadata ?? null) as WidgetMessage["metadata"],
        };

        const current = Array.isArray(store.messages) ? store.messages : [];
        if (!current.some((m) => m.id === newMsg.id)) {
          store.setMessages(mergeMessages(current, [newMsg]));

          // Destrava o composer assim que um operador humano responde.
          if (senderType === "agent" && store.isWaitingForHuman) {
            store.setIsWaitingForHuman(false);
            store.setAgentConnected(true);
          }

          store.markConversationRead(convId);
          void widgetApi.markRead(convId).catch(() => {});
        }
      }

      // Eco da própria mensagem do cliente não vira prévia nem aviso.
      if (senderType === "contact") return;

      store.applyIncomingToList(
        convId,
        { sender_type: senderType, content, created_at: createdAt },
        !isThreadOpen,
      );

      // Aviso flutuante: só com o widget fechado e para mensagens de gente/IA
      // (mensagens de sistema não merecem interromper o cliente).
      if (!store.isOpen && (senderType === "agent" || senderType === "bot")) {
        store.setNotice({
          conversationId: convId,
          title: titleForSender(senderType),
          preview: content.replace(/\s+/g, " ").trim().slice(0, 140),
        });
      }
    };

    const handleConvUpdated = (convId: string, payload: Record<string, unknown>) => {
      const store = useWidgetStore.getState();
      const status = typeof payload.status === "string" ? payload.status : null;
      const assigned = payload.assigned_agent_id;

      if (status) {
        // Lista sempre reflete o status novo (o badge/etiqueta do chamado).
        store.setConversations(
          store.conversations.map((c) => (c.id === convId ? { ...c, status } : c)),
        );

        // O resto só vale para a conversa que está aberta na tela.
        if (store.conversation?.id === convId) {
          store.setConversation({ ...store.conversation, status });

          if (status === "resolved") {
            store.setIsWaitingForHuman(false);
            if (!store.csatSubmitted) store.setShowCsat(true);
          } else if (status === "pending") {
            if (!store.agentConnected) store.setIsWaitingForHuman(true);
          } else if (status === "open") {
            store.setShowCsat(false);
          }
        }
      }

      if (assigned !== null && assigned !== undefined && assigned !== "") {
        if (store.conversation?.id === convId) {
          store.setAgentConnected(true);
          store.setIsWaitingForHuman(false);
        }
      }
    };

    const channels = ids.map((convId) =>
      supabase
        .channel(`conv-live:${convId}`)
        .on("broadcast", { event: "new_message" }, ({ payload }) => {
          if (payload?.id) handleNewMessage(convId, payload as Record<string, unknown>);
        })
        .on("broadcast", { event: "conv_updated" }, ({ payload }) => {
          if (payload) handleConvUpdated(convId, payload as Record<string, unknown>);
        })
        .subscribe((status) => {
          console.log(`[Widget] broadcast conv-live:${convId} → ${status}`);
        }),
    );

    return () => {
      for (const channel of channels) supabase.removeChannel(channel);
    };
  }, [enabled, liveIds, openConversationId]);

  // Re-sync ao voltar o foco: broadcast é best-effort (aba dormindo, rede caída),
  // então a lista é recarregada sempre que o cliente volta para a página.
  useEffect(() => {
    if (!enabled) return;

    let syncing = false;
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || syncing) return;
      syncing = true;
      try {
        const { conversations } = await widgetApi.conversations();
        useWidgetStore.getState().setConversations(conversations);
      } catch {
        // silencioso — próximo foco tenta de novo
      } finally {
        syncing = false;
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
}
