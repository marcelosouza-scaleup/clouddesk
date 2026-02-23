import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
      <SettingsIcon className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">Configurações em breve</p>
    </div>
  );
}
