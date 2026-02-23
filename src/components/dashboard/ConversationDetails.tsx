import { useChatStore } from "@/stores/chatStore";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Globe, Clock, Tag, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ConversationDetails() {
  const { activeConversationId, conversations } = useChatStore();
  const conversation = conversations.find((c) => c.id === activeConversationId);

  if (!conversation) return null;

  const contact = conversation.contact;
  const contactName = contact?.name || "Visitante";

  return (
    <aside className="w-72 border-l border-border bg-card h-full overflow-y-auto scrollbar-thin shrink-0 animate-slide-in-right">
      {/* Contact info */}
      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-2">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-card-foreground">{contactName}</h3>
          {contact?.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Mail className="h-3 w-3" /> {contact.email}
            </p>
          )}
        </div>

        <Separator />

        {/* Conversation info */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversa</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Canal</span>
              <span className="text-card-foreground capitalize">{conversation.channel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="text-[10px] h-5">{conversation.status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prioridade</span>
              <span className="text-card-foreground capitalize">{conversation.priority}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criada</span>
              <span className="text-card-foreground">
                {format(new Date(conversation.created_at), "dd MMM, HH:mm", { locale: ptBR })}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Tags placeholder */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Tag className="h-3 w-3" /> Tags
          </h4>
          <p className="text-xs text-muted-foreground">Nenhuma tag adicionada</p>
        </div>
      </div>
    </aside>
  );
}
