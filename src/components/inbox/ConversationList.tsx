import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInboxStore, type ConversationStatus } from "@/stores/useInboxStore";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Mail, Bot, User, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { value: ConversationStatus; label: string }[] = [
  { value: "open",     label: "Abertas"   },
  { value: "pending",  label: "Pendentes" },
  { value: "snoozed",  label: "Adiadas"   },
  { value: "resolved", label: "Resolvidas"},
];

// ─── Priority dot ─────────────────────────────────────────────────────────────

const priorityDot: Record<string, string> = {
  urgent: "bg-priority-urgent",
  high:   "bg-priority-high",
  medium: "bg-priority-medium",
  low:    "bg-priority-low",
};

const channelIcon: Record<string, typeof MessageSquare> = {
  chat:  MessageSquare,
  email: Mail,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationList() {
  const {
    conversations,
    activeTab,
    activeConversationId,
    searchQuery,
    isLoading,
    setActiveTab,
    setActiveConversationId,
    setSearchQuery,
    loadConversations,
    upsertConversation,
  } = useInboxStore();

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadConversations(activeTab);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription (global — not per-tab) ────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("inbox-desk-conversations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "desk_conversations" },
        (payload) => {
          upsertConversation(payload.new as Record<string, unknown>);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "desk_conversations" },
        (payload) => {
          upsertConversation(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsertConversation]);

  // ── Derived: filter by search query ─────────────────────────────────────────
  const filtered = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.email?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q)
    );
  });

  // ── Count per tab (from loaded conversations, not DB — good enough for UX) ──
  const tabCounts: Partial<Record<ConversationStatus, number>> = {
    [activeTab]: conversations.length,
  };

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card h-full shrink-0">

      {/* ── Search ── */}
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

      {/* ── Tabs ── */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex-1 py-2.5 text-[11px] font-medium transition-colors relative",
              activeTab === tab.value
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {/* Count badge — only for non-resolved tabs */}
            {tab.value !== "resolved" && tabCounts[tab.value] !== undefined && tabCounts[tab.value]! > 0 && (
              <Badge className="ml-1 bg-primary/10 text-primary text-[9px] px-1 py-0 h-4">
                {tabCounts[tab.value]}
              </Badge>
            )}
            {/* Active underline */}
            {activeTab === tab.value && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          filtered.map((conv) => {
            const isActive   = conv.id === activeConversationId;
            const ChannelIcon = channelIcon[conv.channel] ?? MessageSquare;
            const name       = conv.contact?.name || conv.contact?.email || "Visitante";
            const preview    = conv.last_message?.content?.slice(0, 80) ?? "Sem mensagens";
            const isBot      = conv.last_message?.sender_type === "bot";
            const time       = conv.last_message?.created_at
              ? formatDistanceToNow(new Date(conv.last_message.created_at), {
                  addSuffix: false,
                  locale: ptBR,
                })
              : "";

            return (
              <button
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-border transition-colors",
                  isActive ? "bg-primary/10" : "hover:bg-surface-hover"
                )}
              >
                <div className="flex items-start gap-2.5">
                  {/* Avatar + priority dot */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                        priorityDot[conv.priority] ?? "bg-priority-low"
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate text-card-foreground">
                        {name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {isBot && <Bot className="h-3 w-3 text-primary shrink-0" />}
                      <ChannelIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{preview}</p>
                    </div>
                    {/* AI active badge */}
                    {conv.ai_active && conv.status !== "resolved" && (
                      <span className="inline-flex items-center gap-0.5 mt-1 text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        <Bot className="h-2.5 w-2.5" /> IA ativa
                      </span>
                    )}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

const emptyMessages: Record<ConversationStatus, string> = {
  open:     "Nenhuma conversa aberta",
  pending:  "Nenhuma conversa pendente",
  snoozed:  "Nenhuma conversa adiada",
  resolved: "Nenhuma conversa resolvida",
};

function EmptyState({ tab }: { tab: ConversationStatus }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
      <MessageSquare className="h-8 w-8 opacity-30" />
      <p>{emptyMessages[tab]}</p>
    </div>
  );
}
