import { useEffect } from "react";
import { ChatBubbleButton } from "@/components/widget/ChatBubbleButton";
import { ChatWidget } from "@/components/widget/ChatWidget";
import { useWidgetStore } from "@/components/widget/useWidgetStore";
import { DEFAULT_SETTINGS } from "@/components/widget/types";

const mockSettings = {
  ...DEFAULT_SETTINGS,
  greeting: "Como podemos ajudar?",
  widget_name: "CloudDesk",
  quick_actions: ["Problema técnico", "Dúvida sobre plano", "Minha infraestrutura"],
};

export default function WidgetPreview() {
  const { setAccount } = useWidgetStore();

  useEffect(() => {
    // Simulate authenticated client from account table
    setAccount({
      id: "446752fc-51fa-46fc-a982-5fb69a986a2c",
      user_id: "33c213ba-7b98-4019-82c2-54c39a000001",
      name: "Caio Maciel Martens",
      email: "nexamarketingdigital@gmail.com",
      phone: null,
      stripe_customer_id: "cus_U22qgKOnfsRl5E",
    });
  }, [setAccount]);

  return (
    <div className="min-h-screen bg-background">
      {/* Simulated host site */}
      <div className="max-w-4xl mx-auto py-16 px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Preview do Widget — CloudDesk</h1>
          <p className="text-sm text-muted-foreground">
            Esta página simula o site da Cloudfy onde o cliente está logado. O widget aparece no canto inferior direito.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Área logada do cliente</h2>
            <p className="text-sm text-muted-foreground mb-4">
              O cliente autenticado é <strong>Caio Maciel Martens</strong> (nexamarketingdigital@gmail.com).
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <span className="text-muted-foreground">Stripe ID</span>
                <p className="font-mono text-foreground text-xs mt-1">cus_U22qgKOnfsRl5E</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <span className="text-muted-foreground">Status</span>
                <p className="text-foreground mt-1">Autenticado ✓</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Comportamento esperado</h2>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Clique no ícone 💬 no canto inferior direito para abrir o widget</li>
              <li>O widget detecta automaticamente o nome do cliente (Caio)</li>
              <li>Quick actions iniciam uma conversa imediatamente</li>
              <li>A IA responde automaticamente (simulado)</li>
              <li>Botão "Falar com humano" aparece durante resposta da IA</li>
              <li>Estado aberto/fechado persiste no localStorage</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Widget overlay */}
      <ChatWidget settings={mockSettings} />
      <ChatBubbleButton />
    </div>
  );
}
