import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readLimitedMultipart } from "@/lib/http/read-limited-multipart";
import { getActiveEnvironment } from "@/lib/server/environment";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 8_000_000;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 32_768;
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function response(body: object, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function trustedOrigin(request: Request): boolean {
  const originValue = request.headers.get("origin");
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    if (origin.origin !== originValue || origin.username || origin.password) return false;
    const configured = getActiveEnvironment().appUrl;
    if (configured && origin.origin === new URL(configured).origin) return true;
    const requested = new URL(request.url);
    return LOOPBACK.has(requested.hostname) && origin.origin === requested.origin;
  } catch {
    return false;
  }
}

function extensionForImage(bytes: Uint8Array, declaredType: string): string | null {
  if (declaredType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (declaredType === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "png";
  if (declaredType === "image/webp"
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  if (declaredType === "image/avif"
    && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))) return "avif";
  return null;
}

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return response({ error: "Origen no permitido." }, 403);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
    return response({ error: "La imagen excede el tamaño permitido." }, 413);
  }
  try {
    await requireStaffActor(["admin"]);
  } catch {
    return response({ error: "No se pudo verificar el permiso de catálogo." }, 403);
  }

  let formData: FormData | null;
  try {
    formData = await readLimitedMultipart(request, MAX_BODY_BYTES);
  } catch {
    return response({ error: "Archivo inválido." }, 400);
  }
  if (formData === null) return response({ error: "La imagen excede el tamaño permitido." }, 413);
  const productId = formData.get("productId");
  const altText = formData.get("altText");
  const file = formData.get("image");
  if (typeof productId !== "string" || !z.uuid().safeParse(productId).success
    || typeof altText !== "string" || altText.trim().length < 1 || altText.trim().length > 300
    || !(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) {
    return response({ error: "Revisa producto, descripción y tamaño de imagen." }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = extensionForImage(bytes, file.type);
  if (!extension) return response({ error: "El formato de imagen no es válido." }, 400);

  try {
    const admin = createSupabaseAdminClient();
    const canonicalProductId = productId.toLowerCase();
    const { data: product, error: productError } = await admin.from("products")
      .select("id").eq("id", canonicalProductId).maybeSingle();
    if (productError) return response({ error: "Catálogo no disponible." }, 503);
    if (!product) return response({ error: "Producto no encontrado." }, 404);

    const storagePath = `${canonicalProductId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("product-images")
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) return response({ error: "No se pudo guardar la imagen." }, 503);

    const { data: image, error: recordError } = await admin.from("product_images")
      .insert({ product_id: canonicalProductId, storage_path: storagePath, alt_text: altText.trim(), is_primary: false })
      .select("id").single();
    if (recordError || !image) {
      await admin.storage.from("product-images").remove([storagePath]);
      return response({ error: "No se pudo asociar la imagen al producto." }, 503);
    }
    return response({ id: image.id, status: "recorded" }, 201);
  } catch {
    return response({ error: "No se pudo guardar la imagen." }, 503);
  }
}
