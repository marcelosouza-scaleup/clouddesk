import { Zap } from "lucide-react";

export default function MacrosPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
      <Zap className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">Macros em breve</p>
    </div>
  );
}
