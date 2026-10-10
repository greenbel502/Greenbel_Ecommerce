import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readLimitedMultipart } from "@/lib/http/read-limited-multipart";
import { getActiveEnvironment } from "@/lib/server/environment";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "training-covers";
const MAX_FILE_BYTES = 8_000_000;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 32_768;
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: HEADERS });
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
  if (!trustedOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (!Number.isFinite(length) || length > MAX_BODY_BYTES) {
      return json({ error: "La portada excede el tamaño permitido." }, 413);
    }
  }
  try {
    await requireStaffActor(["admin"]);
  } catch {
    return json({ error: "No se pudo verificar el permiso de capacitaciones." }, 403);
  }

  let formData: FormData | null;
  try {
    formData = await readLimitedMultipart(request, MAX_BODY_BYTES);
  } catch {
    return json({ error: "Archivo inválido." }, 400);
  }
  if (formData === null) return json({ error: "La portada excede el tamaño permitido." }, 413);
  const trainingId = formData.get("trainingId");
  const file = formData.get("image");
  if (typeof trainingId !== "string" || !z.uuid().safeParse(trainingId).success
    || !(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) {
    return json({ error: "Selecciona una capacitación y una portada válida." }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = extensionForImage(bytes, file.type);
  if (!extension) return json({ error: "El formato de portada no es válido." }, 400);

  try {
    const admin = createSupabaseAdminClient();
    const id = trainingId.toLowerCase();
    const { data: training, error: readError } = await admin.from("trainings")
      .select("id,cover_path").eq("id", id).maybeSingle();
    if (readError) return json({ error: "Capacitaciones no disponibles." }, 503);
    if (!training) return json({ error: "Capacitación no encontrada." }, 404);

    const path = `${id}/${randomUUID()}.${extension}`;
    const uploaded = await admin.storage.from(BUCKET).upload(path, bytes,
      { contentType: file.type, upsert: false });
    if (uploaded.error) return json({ error: "No se pudo guardar la portada." }, 503);

    let update = admin.from("trainings").update({ cover_path: path }).eq("id", id);
    update = training.cover_path === null
      ? update.is("cover_path", null)
      : update.eq("cover_path", training.cover_path);
    const { data: saved, error: saveError } = await update.select("id").maybeSingle();
    if (saveError || !saved) {
      await admin.storage.from(BUCKET).remove([path]);
      return json({ error: saveError ? "No se pudo asociar la portada." : "La portada cambió. Actualiza la página." },
        saveError ? 503 : 409);
    }
    let cleanupPending = false;
    if (training.cover_path) {
      const removed = await admin.storage.from(BUCKET).remove([training.cover_path]);
      cleanupPending = Boolean(removed.error);
    }
    return json({ status: "recorded", trainingId: id, cleanupPending }, 201);
  } catch {
    return json({ error: "No se pudo guardar la portada." }, 503);
  }
}
