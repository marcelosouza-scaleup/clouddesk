// All imports MUST be at the top of the file — no imports after function definitions.
import { useState } from "react";
import { ClientInfoPanel } from "./ClientInfoPanel";
import { useInboxStore } from "@/stores/useInboxStore";
import { useConversationStore } from "@/stores/useConversationStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bot, Clock, Zap } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/stores/useInboxStore";

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "client" | "conversation";

const TABS: { value: Tab; label: string }[] = [
  { value: "client",       label: "Cliente"  },
  { value: "conversation", label: "Conversa" },
];

// ─── Container ────────────────────────────────────────────────────────────────

export function ConversationDetails() {
  const activeConversationId = useInboxStore((s) => s.activeConversationId);
  const [activeTab, setActiveTab] = useState<Tab>("client");

  if (!activeConversationId) return null;

  return (
    <aside className="w-72 border-l border-border bg-card h-full flex flex-col shrink-0">

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex-1 py-3 text-xs font-medium transition-colors relative",
              activeTab === tab.value
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.value && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === "client" ? (
          <ClientInfoPanel />
        ) : (
          <ConversationTab />
        )}
      </ScrollArea>
    </aside>
  );
}

// ─── Conversation tab ─────────────────────────────────────────────────────────

function ConversationTab() {
  const { activeConversationId, conversations } = useInboxStore();
  const messages = useConversationStore((s) => s.messages);
  const conversation = conversations.find((c) => c.id === activeConversationId);

  if (!conversation) return null;

  const contactMessages = messages.filter((m) => m.sender_type === "contact").length;
  const agentMessages   = messages.filter((m) => m.sender_type === "agent").length;
  const botMessages     = messages.filter((m) => m.sender_type === "bot" || m.ai_generated).length;

  return (
    <div className="p-4 space-y-5">

      {/* Status & priority */}
      <Section title="Status">
        <div className="flex gap-1.5 flex-wrap">
          <StatusBadge conversation={conversation} />
          <PriorityBadge priority={conversation.priority} />
          {conversation.ai_active && (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 text-primary border-primary/30">
              <Bot className="h-2.5 w-2.5" /> IA ativa
            </Badge>
          )}
        </div>
      </Section>

      <Separator />

      {/* Timeline */}
      <Section title="Linha do tempo">
        <div className="space-y-1.5 text-xs">
          <TimelineRow
            icon={Clock}
            label="Criada"
            value={format(new Date(conversation.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          />
          {conversation.first_response_at && (
            <TimelineRow
              icon={Zap}
              label="1ª resposta"
              value={format(new Date(conversation.first_response_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            />
          )}
          {conversation.resolved_at && (
            <TimelineRow
              icon={Clock}
              label="Resolvida"
              value={format(new Date(conversation.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            />
          )}
          {conversation.sla_deadline && (
            <TimelineRow
              icon={Clock}
              label="Prazo SLA"
              value={formatDistanceToNow(new Date(conversation.sla_deadline), {
                addSuffix: true,
                locale: ptBR,
              })}
              highlight={new Date(conversation.sla_deadline) < new Date()}
            />
          )}
        </div>
      </Section>

      <Separator />

      {/* Message stats */}
      <Section title="Mensagens">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Cliente" value={contactMessages} />
          <StatCard label="Equipe"  value={agentMessages}   />
          <StatCard label="IA"      value={botMessages}     />
        </div>
      </Section>

      <Separator />

      {/* Conversation ID */}
      <Section title="Identificador">
        <p className="text-[10px] font-mono text-muted-foreground break-all">
          {conversation.id}
        </p>
      </Section>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex flex-col">
        <span className="text-muted-foreground text-[10px]">{label}</span>
        <span className={cn("text-xs", highlight ? "text-amber-500 font-medium" : "text-card-foreground")}>
          {value}
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-surface border border-border py-2 px-1">
      <span className="text-base font-bold text-card-foreground">{value}</span>
      <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  open:     { label: "Aberta",    cls: "border-emerald-500/40 text-emerald-500" },
  pending:  { label: "Pendente",  cls: "border-amber-500/40 text-amber-500"     },
  snoozed:  { label: "Adiada",    cls: "border-blue-500/40 text-blue-400"       },
  resolved: { label: "Resolvida", cls: "border-muted text-muted-foreground"     },
};

function StatusBadge({ conversation }: { conversation: Conversation }) {
  const cfg = statusConfig[conversation.status] ?? statusConfig.open;
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5", cfg.cls)}>
      {cfg.label}
    </Badge>
  );
}

const priorityConfig: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgente", cls: "bg-priority-urgent text-primary-foreground border-transparent" },
  high:   { label: "Alta",    cls: "bg-priority-high text-primary-foreground border-transparent"   },
  medium: { label: "Média",   cls: "bg-priority-medium text-primary-foreground border-transparent" },
  low:    { label: "Baixa",   cls: "bg-priority-low text-primary-foreground border-transparent"    },
};

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = priorityConfig[priority] ?? priorityConfig.medium;
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5", cfg.cls)}>
      {cfg.label}
    </Badge>
  );
}
