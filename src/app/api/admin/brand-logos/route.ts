import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_INPUT,
  BRAND_LOGO_MAX_STORED,
  isBrandLogoPath,
} from "@/lib/brand-logo";
import { readLimitedMultipart } from "@/lib/http/read-limited-multipart";
import { getActiveEnvironment } from "@/lib/server/environment";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = BRAND_LOGO_MAX_INPUT + 32_768;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers });
function originAllowed(request: Request): boolean {
  const value = request.headers.get("origin");
  if (!value) return false;
  try {
    const origin = new URL(value);
    if (origin.origin !== value || origin.username || origin.password)
      return false;
    const configured = getActiveEnvironment().appUrl;
    if (configured && new URL(configured).origin === value) return true;
    const requested = new URL(request.url);
    return (
      ["localhost", "127.0.0.1", "::1"].includes(requested.hostname) &&
      requested.origin === value
    );
  } catch {
    return false;
  }
}
function refresh() {
  for (const path of ["/admin/catalogo", "/", "/nosotros", "/productos"])
    revalidatePath(path);
}

export async function POST(request: Request) {
  if (!originAllowed(request))
    return json({ error: "Origen no permitido." }, 403);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > MAX_BODY)
    return json({ error: "La imagen supera el límite de 5 MB." }, 413);
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    return json(
      { error: "No se pudo verificar el permiso para editar marcas." },
      error instanceof StaffAuthorizationError && error.reason === "unavailable"
        ? 503
        : 403,
    );
  }
  let data: FormData | null;
  try {
    data = await readLimitedMultipart(request, MAX_BODY);
  } catch {
    return json(
      { error: "No se pudo leer el archivo. Selecciónalo de nuevo." },
      400,
    );
  }
  if (!data) return json({ error: "La imagen supera el límite de 5 MB." }, 413);
  const rawId = data.get("brandId"),
    expected = data.get("expectedLogoPath"),
    operation = data.get("operation");
  if (
    typeof rawId !== "string" ||
    !z.uuid().safeParse(rawId).success ||
    typeof expected !== "string" ||
    !["upload", "remove"].includes(String(operation))
  )
    return json({ error: "Revisa la marca y la operación solicitada." }, 400);
  const id = rawId.toLowerCase();
  if (expected && !isBrandLogoPath(id, expected))
    return json(
      { error: "Recarga la marca para revisar su logotipo vigente." },
      409,
    );
  const admin = createSupabaseAdminClient();
  async function removeFile(path: string): Promise<boolean> {
    try {
      const deleted = await admin.storage
        .from(BRAND_LOGO_BUCKET)
        .remove([path]);
      if (!deleted.error) return true;
    } catch {
      /* The metadata operation is reported separately below. */
    }
    console.warn("BRAND_LOGO_CLEANUP_PENDING", { brandId: id, path });
    return false;
  }
  try {
    const record = await admin
      .from("brands")
      .select("id,logo_path")
      .eq("id", id)
      .maybeSingle();
    if (record.error)
      return json({ error: "No se pudo cargar la marca." }, 503);
    if (!record.data) return json({ error: "La marca no existe." }, 404);
    const previous = record.data.logo_path as string | null;
    if (operation === "remove" && previous === null)
      return json({ status: "recorded", logoPath: null });
    if (
      (previous ?? "") !== expected ||
      (previous && !isBrandLogoPath(id, previous))
    )
      return json(
        {
          error:
            "El logotipo cambió desde que abriste la marca. Recarga para ver la versión vigente.",
        },
        409,
      );
    let path: string | null = null;
    if (operation === "upload") {
      const file = data.get("image");
      if (
        !(file instanceof File) ||
        file.size < 1 ||
        file.size > BRAND_LOGO_MAX_INPUT
      )
        return json({ error: "Selecciona una imagen de hasta 5 MB." }, 400);
      const formats: Record<string, string> = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "heif",
      };
      if (!formats[file.type])
        return json({ error: "Usa una imagen PNG, JPG, WebP o AVIF." }, 400);
      let bytes: Buffer;
      try {
        const input = Buffer.from(await file.arrayBuffer());
        const decoder = sharp(input, {
          limitInputPixels: 16_000_000,
          failOn: "warning",
          animated: false,
        });
        const metadata = await decoder.metadata();
        if (
          metadata.format !== formats[file.type] ||
          !metadata.width ||
          !metadata.height ||
          metadata.width < 8 ||
          metadata.height < 8 ||
          (metadata.pages ?? 1) > 1
        )
          return json(
            {
              error:
                "La imagen no tiene un formato válido. Elige un logotipo estático.",
            },
            400,
          );
        bytes = await decoder
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ lossless: true })
          .toBuffer();
      } catch {
        return json(
          {
            error:
              "No se pudo procesar la imagen. Revisa el formato y las dimensiones.",
          },
          400,
        );
      }
      if (bytes.length > BRAND_LOGO_MAX_STORED)
        return json(
          {
            error:
              "El resultado supera 2 MB. Reduce las dimensiones del logotipo y vuelve a intentarlo.",
          },
          413,
        );
      const bucket = await admin.storage.getBucket(BRAND_LOGO_BUCKET);
      if (
        bucket.error ||
        !bucket.data ||
        bucket.data.public ||
        Number(bucket.data.file_size_limit) !== BRAND_LOGO_MAX_STORED ||
        bucket.data.allowed_mime_types?.length !== 1 ||
        bucket.data.allowed_mime_types[0] !== "image/webp"
      )
        return json(
          { error: "La carga de logotipos aún no está disponible." },
          503,
        );
      path = `${id}/${randomUUID()}.webp`;
      const uploaded = await admin.storage
        .from(BRAND_LOGO_BUCKET)
        .upload(path, bytes, { contentType: "image/webp", upsert: false });
      if (uploaded.error)
        return json(
          {
            error:
              "No se pudo guardar el logotipo. La imagen anterior se conserva.",
          },
          503,
        );
    }
    let update = admin.from("brands").update({ logo_path: path }).eq("id", id);
    update = previous
      ? update.eq("logo_path", previous)
      : update.is("logo_path", null);
    const saved = await update.select("id").maybeSingle();
    let confirmed = !saved.error && !!saved.data;
    if (saved.error) {
      // A lost response can follow a committed UPDATE. Never delete its image blindly.
      const current = await admin
        .from("brands")
        .select("logo_path")
        .eq("id", id)
        .maybeSingle();
      if (current.error || !current.data) {
        console.warn("BRAND_LOGO_RESULT_UNCONFIRMED", { brandId: id, path });
        return json(
          {
            error:
              "No se pudo confirmar el cambio. Recarga la marca antes de reintentar.",
            cleanupPending: !!path,
          },
          503,
        );
      }
      confirmed = current.data.logo_path === path;
    }
    if (!confirmed) {
      const cleaned = !path || (await removeFile(path));
      return json(
        {
          error: saved.error
            ? "No se pudo asociar el logotipo. Recarga la marca para revisar su estado."
            : "Otro cambio actualizó el logotipo. Recarga la marca antes de reintentar.",
          cleanupPending: !cleaned,
        },
        saved.error ? 503 : 409,
      );
    }
    const cleaned = !previous || (await removeFile(previous));
    refresh();
    return json(
      { status: "recorded", logoPath: path, cleanupPending: !cleaned },
      operation === "upload" ? 201 : 200,
    );
  } catch {
    return json(
      {
        error:
          "No se pudo guardar el cambio. Recarga la marca para comprobar su estado antes de reintentar.",
      },
      503,
    );
  }
}
