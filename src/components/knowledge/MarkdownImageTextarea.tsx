/**
 * Textarea de markdown que aceita imagem colada (Ctrl+V), arrastada ou pelo
 * botão "Anexar imagem".
 *
 * O print vai pro bucket desk-kb-images e o ![alt](url) é inserido na posição do
 * cursor. Enquanto sobe, deixa um placeholder no texto — assim o operador não
 * perde a referência de onde a imagem vai cair se continuar digitando.
 */

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_MIMES,
  altTextFor,
  isSupportedImage,
  uploadKbImage,
} from "@/lib/kb-images";

export function MarkdownImageTextarea({
  value,
  onChange,
  articleId,
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Agrupa as imagens por artigo no Storage. Vazio em artigo novo. */
  articleId?: string | null;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Espelha o value: dentro do loop de upload (await entre as trocas) a prop
  // ainda é a da renderização antiga, então lemos/escrevemos o texto por aqui.
  const valueRef = useRef(value);
  valueRef.current = value;

  function commit(next: string) {
    valueRef.current = next;
    onChange(next);
  }

  async function handleFiles(files: File[]) {
    const images = files.filter(isSupportedImage);
    if (images.length === 0) return;

    const el = ref.current;
    // Sem foco no textarea, anexa no fim do conteúdo.
    let start = el ? el.selectionStart : valueRef.current.length;
    let end = el ? el.selectionEnd : valueRef.current.length;

    for (const file of images) {
      // Placeholder entra na hora para marcar o lugar — o operador pode seguir
      // digitando enquanto o upload roda.
      const token = `![enviando ${altTextFor(file)}...]()`;
      const withToken =
        valueRef.current.slice(0, start) + token + valueRef.current.slice(end);
      commit(withToken);

      setUploading((n) => n + 1);
      const result = await uploadKbImage(file, articleId);
      setUploading((n) => n - 1);

      if (!result.ok) toast.error(`Falha ao enviar imagem: ${result.error}`);
      const markdown = result.ok ? `![${altTextFor(file)}](${result.url})` : "";

      // Localiza o token na hora da troca: o texto pode ter mudado durante o
      // upload (digitação ou outro placeholder inserido).
      const at = valueRef.current.indexOf(token);
      if (at === -1) {
        // Placeholder sumiu (operador apagou). Não reinsere nada.
        if (markdown) toast.info("Imagem enviada, mas o ponto de inserção sumiu");
        continue;
      }
      commit(
        valueRef.current.slice(0, at) + markdown + valueRef.current.slice(at + token.length),
      );
      start = end = at + markdown.length; // próxima imagem entra depois desta
    }

    // Devolve o foco pro editor com o cursor após a última imagem.
    const caret = start;
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files];
    // Print da tela vem como file no clipboard; se não há imagem, deixa o paste
    // normal de texto acontecer.
    if (files.some(isSupportedImage)) {
      e.preventDefault();
      void handleFiles(files);
    }
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = [...e.dataTransfer.files];
    if (files.some(isSupportedImage)) {
      e.preventDefault();
      setDragging(false);
      void handleFiles(files);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          placeholder={placeholder}
          className={cn(
            className,
            dragging && "border-primary ring-1 ring-primary",
          )}
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
            Solte a imagem para anexar
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_MIMES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles([...(e.target.files ?? [])]);
              e.target.value = ""; // permite reenviar o mesmo arquivo
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => fileRef.current?.click()}
            disabled={uploading > 0}
          >
            {uploading > 0 ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
            ) : (
              <><ImagePlus className="h-3.5 w-3.5" /> Anexar imagem</>
            )}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            ou cole (Ctrl+V) / arraste o print
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">{value.length} caracteres</p>
      </div>
    </div>
  );
}
