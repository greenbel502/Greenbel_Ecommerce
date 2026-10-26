import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isTrustedAppOrigin } from "@/lib/http/trusted-app-origin";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveEnvironment } from "@/lib/server/environment";
import {
  TRAINING_VIDEO_BUCKET,
  MAX_TRAINING_VIDEO_BYTES,
  validTrainingVideoPath,
  videoSignature,
  VIDEO_MIME,
} from "@/lib/trainings/media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: object, status = 200) =>
  NextResponse.json(data, { status, headers });
const input = z.object({
  trainingId: z.uuid(),
  mime: z.enum(["video/mp4", "video/webm"]),
  size: z.number().int().positive().max(MAX_TRAINING_VIDEO_BYTES),
});
async function authorized(request: Request) {
  const env = getActiveEnvironment();
  if (!isTrustedAppOrigin(request, env.appUrl, env.appEnvironment))
    return false;
  try {
    await requireStaffActor(["admin"]);
    return true;
  } catch {
    return false;
  }
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw Error("Body too large");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    length += r.value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw Error("Body too large");
    }
    chunks.push(r.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function DELETE(request: Request) {
  if (!(await authorized(request)))
    return json({ error: "No se pudo verificar el permiso." }, 403);
  try {
    const p = z
      .object({ trainingId: z.uuid(), path: z.string().max(200) })
      .safeParse(await body(request));
    if (!p.success || !validTrainingVideoPath(p.data.trainingId, p.data.path))
      return json({ error: "Archivo no válido." }, 400);
    const admin = createSupabaseAdminClient();
    const row = await admin
      .from("trainings")
      .select("video_storage_path")
      .eq("id", p.data.trainingId)
      .maybeSingle();
    if (row.error)
      return json({ error: "No se pudo consultar el video." }, 503);
    if (row.data?.video_storage_path === p.data.path)
      return json({ error: "El video está vinculado a la capacitación." }, 409);
    const removed = await admin.storage
      .from(TRAINING_VIDEO_BUCKET)
      .remove([p.data.path]);
    return removed.error
      ? json({ error: "No se pudo retirar la carga pendiente." }, 503)
      : json({ status: "removed" });
  } catch {
    return json({ error: "No se pudo retirar la carga pendiente." }, 400);
  }
}
export async function POST(request: Request) {
  if (!(await authorized(request)))
    return json(
      { error: "No se pudo verificar el permiso para cargar videos." },
      403,
    );
  try {
    const p = input.safeParse(await body(request));
    if (!p.success)
      return json(
        { error: "Selecciona un video MP4 o WebM de hasta 50 MB." },
        400,
      );
    const admin = createSupabaseAdminClient();
    const row = await admin
      .from("trainings")
      .select("id")
      .eq("id", p.data.trainingId)
      .maybeSingle();
    if (row.error)
      return json({ error: "No se pudo consultar la capacitación." }, 503);
    if (!row.data) return json({ error: "Capacitación no encontrada." }, 404);
    const ext = p.data.mime === "video/mp4" ? "mp4" : "webm";
    const path = `${row.data.id}/${randomUUID()}.${ext}`;
    const signed = await admin.storage
      .from(TRAINING_VIDEO_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (signed.error)
      return json({ error: "No se pudo preparar la carga del video." }, 503);
    return json(
      {
        path,
        token: signed.data.token,
        endpoint:
          getActiveEnvironment().supabase.url +
          "/storage/v1/upload/resumable/sign",
      },
      201,
    );
  } catch {
    return json(
      { error: "No se pudo preparar el video. Inténtalo de nuevo." },
      400,
    );
  }
}
export async function PUT(request: Request) {
  if (!(await authorized(request)))
    return json(
      { error: "No se pudo verificar el permiso para guardar videos." },
      403,
    );
  try {
    const p = z
      .object({
        trainingId: z.uuid(),
        path: z.string().max(200),
        expectedPath: z.string().nullable(),
        expectedUrl: z.string().nullable(),
      })
      .safeParse(await body(request));
    if (!p.success || !validTrainingVideoPath(p.data.trainingId, p.data.path))
      return json(
        { error: "El video no corresponde a esta capacitación." },
        400,
      );
    const { trainingId, path, expectedPath, expectedUrl } = p.data;
    const admin = createSupabaseAdminClient();
    const row = await admin
      .from("trainings")
      .select("id,video_storage_path,video_url")
      .eq("id", trainingId)
      .maybeSingle();
    if (row.error)
      return json({ error: "No se pudo consultar la capacitación." }, 503);
    if (!row.data) return json({ error: "Capacitación no encontrada." }, 404);
    if (row.data.video_storage_path === path)
      return json({ status: "recorded", path });
    if (
      row.data.video_storage_path !== expectedPath ||
      row.data.video_url !== expectedUrl
    )
      return json(
        {
          error:
            "El video cambió en otra sesión. Recarga antes de reemplazarlo.",
        },
        409,
      );
    const info = await admin.storage.from(TRAINING_VIDEO_BUCKET).info(path);
    const mime = VIDEO_MIME[path.endsWith(".mp4") ? "mp4" : "webm"];
    if (
      info.error ||
      !info.data.size ||
      info.data.size > MAX_TRAINING_VIDEO_BYTES ||
      info.data.contentType !== mime
    )
      return json(
        { error: "La carga no está completa o su formato no es válido." },
        400,
      );
    const signed = await admin.storage
      .from(TRAINING_VIDEO_BUCKET)
      .createSignedUrl(path, 30);
    if (signed.error)
      return json({ error: "No se pudo verificar el archivo." }, 503);
    const sample = await fetch(signed.data.signedUrl, {
      headers: { Range: "bytes=0-63" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (sample.status !== 206) {
      await sample.body?.cancel();
      return json({ error: "No se pudo verificar el formato del video." }, 503);
    }
    if (!videoSignature(new Uint8Array(await sample.arrayBuffer()), mime)) {
      await admin.storage.from(TRAINING_VIDEO_BUCKET).remove([path]);
      return json(
        { error: "El archivo no contiene un video del formato indicado." },
        400,
      );
    }
    let update = admin
      .from("trainings")
      .update({ video_storage_path: path, video_url: null })
      .eq("id", trainingId);
    update =
      expectedPath === null
        ? update.is("video_storage_path", null)
        : update.eq("video_storage_path", expectedPath);
    update =
      expectedUrl === null
        ? update.is("video_url", null)
        : update.eq("video_url", expectedUrl);
    const saved = await update.select("id").maybeSingle();
    if (saved.error || !saved.data) {
      const current = await admin
        .from("trainings")
        .select("video_storage_path")
        .eq("id", trainingId)
        .maybeSingle();
      if (!current.error && current.data?.video_storage_path === path)
        return json({ status: "recorded", path });
      // An uncertain read must never delete a file that another confirmation may have linked.
      if (!current.error)
        await admin.storage.from(TRAINING_VIDEO_BUCKET).remove([path]);
      return json(
        {
          error:
            "No se pudo vincular el video. Actualiza e inténtalo de nuevo.",
        },
        409,
      );
    }
    const removed = expectedPath
      ? await admin.storage.from(TRAINING_VIDEO_BUCKET).remove([expectedPath])
      : null;
    revalidatePath("/capacitaciones");
    revalidatePath("/capacitaciones/[slug]", "page");
    revalidatePath("/admin/capacitaciones");
    return json({
      status: "recorded",
      path,
      cleanupPending: Boolean(removed?.error),
    });
  } catch {
    return json(
      { error: "No se pudo confirmar la carga del video. Puedes reintentar." },
      503,
    );
  }
}
