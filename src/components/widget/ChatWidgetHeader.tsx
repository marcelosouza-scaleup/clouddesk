import { ArrowLeft, Minus } from "lucide-react";
import { useWidgetStore } from "./useWidgetStore";

interface Props {
  widgetName: string;
  onlineAgents: number;
  /** Exibe a seta de voltar para a lista de chamados (dentro de uma thread). */
  showBack?: boolean;
  onBack?: () => void;
  /** Substitui o nome do widget pelo assunto do chamado aberto. */
  title?: string | null;
}

export function ChatWidgetHeader({ widgetName, onlineAgents, showBack, onBack, title }: Props) {
  const { setOpen } = useWidgetStore();

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-t-xl">
      <div className="flex items-center gap-2 min-w-0">
        {showBack ? (
          <button
            onClick={onBack}
            className="h-7 w-7 shrink-0 rounded-md hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
            aria-label="Voltar para meus chamados"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold">
            CD
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{title || widgetName}</h3>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                onlineAgents > 0 ? "bg-emerald-400" : "bg-muted-foreground/50"
              }`}
            />
            <span className="text-[11px] opacity-80">
              {onlineAgents > 0
                ? `${onlineAgents} atendente${onlineAgents > 1 ? "s" : ""} online`
                : "Fora do horário"}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={() => setOpen(false)}
        className="h-7 w-7 shrink-0 rounded-md hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
        aria-label="Minimizar chat"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
}
