import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Lock, Smile } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  conversationId: string;
}

export function MessageComposer({ conversationId }: Props) {
  const [content, setContent] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const agent = useAuthStore((s) => s.agent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  const handleSend = async () => {
    if (!content.trim() || !agent) return;
    setSending(true);

    try {
      const { error } = await supabase.from("desk_messages").insert({
        conversation_id: conversationId,
        sender_type: "agent",
        sender_id: agent.id,
        content: content.trim(),
        is_private_note: isNote,
        content_type: isNote ? "note" : "text",
      });

      if (error) throw error;

      // Update conversation timestamp
      await supabase.from("desk_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

      setContent("");
      setIsNote(false);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`border-t border-border p-3 shrink-0 transition-colors ${isNote ? "bg-bubble-note/30" : "bg-card"}`}>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isNote ? "Escreva uma nota interna..." : "Digite sua mensagem..."}
            className="min-h-[40px] max-h-32 resize-none border-none bg-transparent p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground"
            rows={1}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${isNote ? "text-bubble-note-foreground" : "text-muted-foreground"}`}
            onClick={() => setIsNote(!isNote)}
            title="Nota interna"
          >
            <Lock className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-8 w-8"
            onClick={handleSend}
            disabled={!content.trim() || sending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {isNote && (
        <p className="text-[10px] text-bubble-note-foreground mt-1 flex items-center gap-1">
          <Lock className="h-2.5 w-2.5" /> Nota interna — visível apenas para operadores
        </p>
      )}
    </div>
  );
}
