/**
 * Upload de imagens da Base de Conhecimento.
 *
 * Usado pelo editor de artigos para aceitar print colado (Ctrl+V) ou arrastado
 * direto no markdown. Sobe no bucket público desk-kb-images — o mesmo onde vivem
 * as imagens migradas do Intercom — e devolve a URL pública pra montar o
 * ![](url) no conteúdo.
 *
 * O nome do arquivo é o hash do conteúdo (igual scripts/migrate-kb-images.mjs),
 * então colar o mesmo print duas vezes reaproveita o arquivo em vez de duplicar.
 */

import { supabase } from "@/lib/supabase";

const BUCKET = "desk-kb-images";

/** Espelha allowed_mime_types do bucket (ver migration do bucket). */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** 15 MB — igual ao file_size_limit do bucket. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_IMAGE_MIMES = Object.keys(EXT_BY_MIME);

export function isSupportedImage(file: File | Blob): boolean {
  return ACCEPTED_IMAGE_MIMES.includes(file.type);
}

async function hashName(bytes: Uint8Array, ext: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hash}.${ext}`;
}

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Sobe uma imagem e devolve a URL pública.
 *
 * `articleId` agrupa os arquivos por artigo. Artigo novo (ainda sem id) cai em
 * "inbox/" — a imagem já fica válida e o markdown aponta pra ela mesmo que o
 * artigo nunca seja salvo.
 */
export async function uploadKbImage(
  file: File | Blob,
  articleId?: string | null,
): Promise<UploadResult> {
  if (!isSupportedImage(file)) {
    return { ok: false, error: "Formato não suportado (use PNG, JPG, GIF ou WebP)" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Imagem maior que 15 MB" };
  }

  const ext = EXT_BY_MIME[file.type];
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `${articleId || "inbox"}/${await hashName(bytes, ext)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("[kb-images] upload falhou", error);
    return { ok: false, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    return { ok: false, error: "Não foi possível obter a URL da imagem" };
  }
  return { ok: true, url: data.publicUrl };
}

/** Nome curto e legível pro alt text, a partir do arquivo. */
export function altTextFor(file: File | Blob): string {
  const name = "name" in file && file.name ? file.name.replace(/\.[^.]+$/, "") : "";
  return name.trim() || "imagem";
}
