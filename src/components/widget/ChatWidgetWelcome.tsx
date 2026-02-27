import { Sparkles } from "lucide-react";

interface Props {
  greeting: string;
  accountName: string | null;
  quickActions: string[];
  onQuickAction: (action: string) => void;
  onSendMessage: (msg: string) => void;
}

export function ChatWidgetWelcome({
  greeting,
  accountName,
  quickActions,
  onQuickAction,
  onSendMessage,
}: Props) {
  const displayGreeting = accountName
    ? greeting.replace("{{account.name}}", accountName).replace("!", `, ${accountName}!`)
    : greeting;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-5">
      <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>

      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          {accountName ? `Olá, ${accountName}!` : "Olá!"}
        </h3>
        <p className="text-sm text-muted-foreground">{displayGreeting}</p>
      </div>

      {quickActions.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          {quickActions.map((action) => (
            <button
              key={action}
              onClick={() => onQuickAction(action)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-accent/10 hover:border-primary/30 transition-all duration-150 text-left"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-2">
        Geralmente respondemos em poucos minutos
      </p>
    </div>
  );
}
