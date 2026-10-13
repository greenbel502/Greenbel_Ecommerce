import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { readLimitedMultipart } from "@/lib/http/read-limited-multipart";
import { isTrustedAppOrigin } from "@/lib/http/trusted-app-origin";
import { getActiveEnvironment } from "@/lib/server/environment";
import { CustomerProfileError, requireCustomerProfile } from "@/lib/server/customer-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "profile-avatars";
const MAX_FILE = 2_000_000;
const MAX_BODY = MAX_FILE + 32_768;
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: object, status: number) => Response.json(body, { status, headers: HEADERS });
const authorizedPath = (path: string, userId: string) => new RegExp(`^${userId}/[0-9a-f-]{36}\\.webp$`).test(path);

export async function GET() {
  try {
    const { client, user, profile } = await requireCustomerProfile();
    if (!profile.avatar_path || !authorizedPath(profile.avatar_path, user.id)) return json({ error: "Foto no disponible." }, 404);
    const file = await client.storage.from(BUCKET).download(profile.avatar_path, { cacheNonce: profile.updated_at }, { cache: "no-store" });
    if (file.error || !file.data) return json({ error: "Foto no disponible." }, 404);
    return new Response(await file.data.arrayBuffer(), { headers: { ...HEADERS, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'" } });
  } catch (error) { return json({ error: "Foto no disponible." }, error instanceof CustomerProfileError ? error.status : 503); }
}

async function changeAvatar(request: Request, remove: boolean) {
  try {
    const environment = getActiveEnvironment();
    if (!isTrustedAppOrigin(request, environment.appUrl, environment.appEnvironment)) return json({ error: "Origen no permitido." }, 403);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BODY) return json({ error: "La foto excede 2 MB." }, 413);
    const { client, user, profile } = await requireCustomerProfile();
    let newPath: string | null = null;
    if (!remove) {
      let form: FormData | null;
      try { form = await readLimitedMultipart(request, MAX_BODY); } catch { return json({ error: "Archivo inválido." }, 400); }
      if (!form) return json({ error: "La foto excede 2 MB." }, 413);
      const image = form.get("image");
      if (!(image instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size < 1 || image.size > MAX_FILE) {
        return json({ error: "Elige una foto JPG, PNG o WebP de hasta 2 MB." }, image instanceof File && image.size > MAX_FILE ? 413 : 400);
      }
      let bytes: Buffer;
      try {
        const pipeline = sharp(Buffer.from(await image.arrayBuffer()), { limitInputPixels: 16_000_000, animated: false, failOn: "warning" });
        const metadata = await pipeline.metadata();
        if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) return json({ error: "Formato de foto no válido." }, 400);
        bytes = await pipeline.rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
      } catch { return json({ error: "No se pudo leer la imagen. Elige otra foto." }, 400); }
      newPath = `${user.id}/${randomUUID()}.webp`;
      const upload = await client.storage.from(BUCKET).upload(newPath, bytes, { contentType: "image/webp", cacheControl: "0", upsert: false });
      if (upload.error) return json({ error: "No pudimos guardar tu foto." }, 503);
    }
    if (remove && !profile.avatar_path) return json({ saved: true }, 200);
    const update = await client.from("profiles").update({ avatar_path: newPath })
      .eq("id", user.id).eq("updated_at", profile.updated_at).select("id");
    if (update.error || update.data.length !== 1) {
      if (newPath) await client.storage.from(BUCKET).remove([newPath]);
      return json({ error: "Tus datos cambiaron o no se pudo guardar la foto. Actualiza e inténtalo de nuevo." }, update.error ? 503 : 409);
    }
    let cleanupPending = false;
    if (profile.avatar_path && authorizedPath(profile.avatar_path, user.id)) {
      cleanupPending = Boolean((await client.storage.from(BUCKET).remove([profile.avatar_path])).error);
    }
    revalidatePath("/cuenta");
    return json({ saved: true, cleanupPending }, 200);
  } catch (error) {
    return json({ error: "No pudimos guardar la foto de esta cuenta." }, error instanceof CustomerProfileError ? error.status : 503);
  }
}

export async function POST(request: Request) { return changeAvatar(request, false); }
export async function DELETE(request: Request) { return changeAvatar(request, true); }
