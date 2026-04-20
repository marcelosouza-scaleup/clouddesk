import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search,
  Users,
  Mail,
  Phone,
  Building2,
  TrendingUp,
  FileText,
  MessageSquare,
  Copy,
  AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AirtableContact {
  airtable_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  plan: string | null;
  status: string | null;
  mrr: number | null;
  company: string | null;
  notes: string | null;
  stripe_customer_id: string | null;
  created_at: string | null;
  raw: Record<string, unknown>;
}

interface ConversationRecord {
  id: string;
  status: string;
  subject: string | null;
  created_at: string;
  resolved_at: string | null;
  channel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado`));
}

const statusColors: Record<string, string> = {
  ativo:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inativo:   "bg-rose-500/15 text-rose-400 border-rose-500/30",
  inactive:  "bg-rose-500/15 text-rose-400 border-rose-500/30",
  pendente:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function statusBadgeCls(status: string | null): string {
  if (!status) return "bg-muted text-muted-foreground border-border";
  return statusColors[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Contacts() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AirtableContact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AirtableContact | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 3) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchAirtable(query.trim());
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function searchAirtable(email: string) {
    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    const { data, error: fnError } = await supabase.functions.invoke("get-contact-info", {
      body: { email },
    });

    setIsSearching(false);

    if (fnError) {
      setError("Erro ao conectar com o CRM. Tente novamente.");
      setResults([]);
      return;
    }

    if (data?.contact) {
      setResults([data.contact as AirtableContact]);
    } else {
      setResults([]);
    }
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5" /> Contatos
        </h1>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por e-mail (mín. 3 caracteres)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-9"
            autoFocus
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {/* Loading */}
        {isSearching && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}

        {/* Error */}
        {!isSearching && error && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 text-rose-500 opacity-60" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Empty state — not yet searched */}
        {!isSearching && !error && !hasSearched && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Search className="h-10 w-10 opacity-20" />
            <p className="text-sm">Digite um e-mail para buscar no CRM</p>
            <p className="text-xs opacity-60">Mínimo de 3 caracteres</p>
          </div>
        )}

        {/* No results */}
        {!isSearching && !error && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-20" />
            <p className="text-sm">Nenhum contato encontrado para este e-mail</p>
          </div>
        )}

        {/* Results */}
        {!isSearching && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((contact) => (
              <ContactCard
                key={contact.airtable_id}
                contact={contact}
                onClick={() => setSelected(contact)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <ContactDrawer
        contact={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ─── Contact card ─────────────────────────────────────────────────────────────

function ContactCard({
  contact,
  onClick,
}: {
  contact: AirtableContact;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card p-4 space-y-3 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors"
    >
      {/* Name + status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-card-foreground leading-tight">
            {contact.name ?? "—"}
          </p>
          {contact.company && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{contact.company}</p>
          )}
        </div>
        {contact.status && (
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0 border", statusBadgeCls(contact.status))}
          >
            {contact.status}
          </Badge>
        )}
      </div>

      {/* Email */}
      {contact.email && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </div>
      )}

      {/* Plan + MRR */}
      <div className="flex items-center justify-between text-xs">
        {contact.plan ? (
          <span className="text-indigo-400 font-medium">{contact.plan}</span>
        ) : (
          <span className="text-muted-foreground">Sem plano</span>
        )}
        {contact.mrr != null && (
          <span className="text-emerald-400 font-semibold">
            {formatCurrency(contact.mrr)}
          </span>
        )}
      </div>

      {/* Phone */}
      {contact.phone && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{contact.phone}</span>
        </div>
      )}
    </button>
  );
}

// ─── Contact drawer ───────────────────────────────────────────────────────────

function ContactDrawer({
  contact,
  onClose,
}: {
  contact: AirtableContact | null;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);

  useEffect(() => {
    if (!contact?.email) {
      setConversations([]);
      return;
    }

    // Look up the account_user_id for this email, then load conversations
    setIsLoadingConvs(true);
    supabase
      .from("account")
      .select("user_id")
      .eq("email", contact.email)
      .maybeSingle()
      .then(({ data: acc }) => {
        if (!acc?.user_id) {
          setConversations([]);
          setIsLoadingConvs(false);
          return;
        }
        return supabase
          .from("desk_conversations")
          .select("id, status, subject, created_at, resolved_at, channel")
          .eq("account_user_id", acc.user_id)
          .order("created_at", { ascending: false })
          .limit(20)
          .then(({ data }) => {
            setConversations((data as ConversationRecord[]) ?? []);
            setIsLoadingConvs(false);
          });
      })
      .catch(() => setIsLoadingConvs(false));
  }, [contact?.email]);

  if (!contact) return null;

  return (
    <Sheet open={!!contact} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto bg-card border-border">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base">{contact.name ?? contact.email ?? "Contato"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Identity */}
          <Section icon={Users} title="Dados do contato">
            <InfoRow label="Nome" value={contact.name} />
            <InfoRow label="E-mail" value={contact.email} copyable />
            <InfoRow label="Telefone" value={contact.phone} />
            <InfoRow label="Empresa" value={contact.company} />
          </Section>

          <Separator />

          {/* Plan / commercial */}
          <Section icon={TrendingUp} title="Plano & financeiro">
            <InfoRow label="Plano" value={contact.plan} />
            <InfoRow label="Status" value={contact.status} />
            <InfoRow
              label="MRR"
              value={contact.mrr != null ? formatCurrency(contact.mrr) : null}
              highlight
            />
            {contact.stripe_customer_id && (
              <InfoRow label="Stripe ID" value={contact.stripe_customer_id} mono copyable />
            )}
          </Section>

          {/* Notes */}
          {contact.notes && (
            <>
              <Separator />
              <Section icon={FileText} title="Notas">
                <p className="text-xs text-card-foreground leading-relaxed whitespace-pre-wrap">
                  {contact.notes}
                </p>
              </Section>
            </>
          )}

          <Separator />

          {/* Conversations */}
          <Section icon={MessageSquare} title={`Conversas (${conversations.length})`}>
            {isLoadingConvs ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma conversa encontrada</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <ConversationRow key={conv.id} conv={conv} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Drawer sub-components ────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {title}
      </h4>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  copyable = false,
  highlight = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  copyable?: boolean;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 group">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span
          className={cn(
            "text-xs truncate",
            mono ? "font-mono text-[10px]" : "",
            highlight ? "text-emerald-400 font-semibold" : "text-card-foreground",
          )}
        >
          {value}
        </span>
        {copyable && (
          <button
            onClick={() => copyToClipboard(value, label)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted shrink-0"
          >
            <Copy className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

const convStatusLabels: Record<string, string> = {
  open: "Aberta",
  pending: "Pendente",
  resolved: "Resolvida",
  snoozed: "Adiada",
};

const convStatusCls: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  snoozed: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
};

function ConversationRow({ conv }: { conv: ConversationRecord }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-card-foreground truncate">
          {conv.subject ?? "Sem assunto"}
        </p>
        <Badge
          variant="outline"
          className={cn("text-[9px] px-1.5 py-0 h-4 shrink-0 border", convStatusCls[conv.status] ?? "")}
        >
          {convStatusLabels[conv.status] ?? conv.status}
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {formatDistanceToNow(new Date(conv.created_at), { addSuffix: true, locale: ptBR })}
        {conv.resolved_at && (
          <> · Resolvida {format(new Date(conv.resolved_at), "dd/MM/yyyy", { locale: ptBR })}</>
        )}
      </p>
    </div>
  );
}
