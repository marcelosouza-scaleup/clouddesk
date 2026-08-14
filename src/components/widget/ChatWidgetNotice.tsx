import { X } from "lucide-react";
import { useWidgetStore } from "./useWidgetStore";

// Aviso flutuante acima da bolha: aparece quando chega resposta da equipe com o
// widget FECHADO. Sem isso, a única pista de que o operador respondeu é o badge
// — que o cliente só vê se estiver olhando para o canto da tela. Clicar no aviso
// abre direto o chamado que recebeu a resposta.

interface Props {
  /** Abre o chamado referenciado no aviso. */
  onOpen: (conversationId: string) => void;
}

export function ChatWidgetNotice({ onOpen }: Props) {
  const { notice, isOpen, setNotice } = useWidgetStore();

  if (!notice || isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 z-[9998] w-[300px] max-w-[calc(100vw-3rem)] animate-in slide-in-from-bottom-2 fade-in-0 duration-300">
      <div className="relative rounded-xl border border-border bg-card shadow-2xl">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setNotice(null);
          }}
          className="absolute top-1.5 right-1.5 h-6 w-6 rounded-md text-muted-foreground hover:bg-accent/20 hover:text-foreground flex items-center justify-center transition-colors"
          aria-label="Dispensar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => onOpen(notice.conversationId)}
          className="w-full text-left p-3 pr-8"
        >
          <p className="text-sm font-semibold text-foreground">{notice.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notice.preview}</p>
          <span className="text-[11px] text-primary font-medium mt-1.5 block">
            Toque para ver
          </span>
        </button>
      </div>
    </div>
  );
}
