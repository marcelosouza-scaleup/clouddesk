import { Minus } from "lucide-react";
import { useWidgetStore } from "./useWidgetStore";

interface Props {
  widgetName: string;
  onlineAgents: number;
}

export function ChatWidgetHeader({ widgetName, onlineAgents }: Props) {
  const { setOpen } = useWidgetStore();

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground rounded-t-xl">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold">
          CD
        </div>
        <div>
          <h3 className="text-sm font-semibold">{widgetName}</h3>
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
        className="h-7 w-7 rounded-md hover:bg-primary-foreground/20 flex items-center justify-center transition-colors"
        aria-label="Minimizar chat"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
}
