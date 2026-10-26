import { MAX_TRAINING_VIDEO_BYTES, TRAINING_VIDEO_BUCKET } from "./media.ts";
export type VideoUploadTicket = {
  endpoint: string;
  token: string;
  path: string;
};
/** TUS chunks resume from the server's confirmed offset after a connection failure. */
export async function uploadTrainingVideo(
  file: File,
  ticket: VideoUploadTicket,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) {
  if (
    file.size < 1 ||
    file.size > MAX_TRAINING_VIDEO_BYTES ||
    !["video/mp4", "video/webm"].includes(file.type)
  )
    throw Error("Selecciona un video MP4 o WebM de hasta 50 MB.");
  const endpoint = new URL(ticket.endpoint);
  if (
    endpoint.protocol !== "https:" ||
    !endpoint.pathname.endsWith("/storage/v1/upload/resumable/sign")
  )
    throw Error("Destino de carga inválido.");
  const common = { "Tus-Resumable": "1.0.0", "x-signature": ticket.token };
  const request = (url: string, init: RequestInit) =>
    fetch(url, {
      ...init,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
  const metadata = Object.entries({
    bucketName: TRAINING_VIDEO_BUCKET,
    objectName: ticket.path,
    contentType: file.type,
    cacheControl: "0",
  })
    .map(([k, v]) => k + " " + btoa(v))
    .join(",");
  const started = await request(endpoint.href, {
    method: "POST",
    headers: {
      ...common,
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata,
    },
  });
  const location = started.headers.get("location");
  if (started.status !== 201 || !location)
    throw Error("No se pudo iniciar la carga del video.");
  const target = new URL(location, endpoint);
  if (
    target.origin !== endpoint.origin ||
    !target.pathname.startsWith(endpoint.pathname + "/")
  )
    throw Error("Respuesta de carga inválida.");
  let offset = 0,
    failures = 0;
  const chunk = 6 * 1024 * 1024;
  while (offset < file.size) {
    signal?.throwIfAborted();
    try {
      const response = await request(target.href, {
        method: "PATCH",
        headers: {
          ...common,
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: file.slice(offset, Math.min(offset + chunk, file.size)),
      });
      const next = Number(response.headers.get("upload-offset"));
      if (
        response.status !== 204 ||
        !Number.isInteger(next) ||
        next <= offset ||
        next > file.size
      )
        throw Error("Upload interrupted");
      offset = next;
      failures = 0;
      onProgress(Math.round((offset / file.size) * 100));
    } catch {
      signal?.throwIfAborted();
      if (++failures > 3)
        throw Error(
          "La carga se interrumpió. Revisa tu conexión e inténtalo de nuevo.",
        );
      const head = await request(target.href, {
        method: "HEAD",
        headers: common,
      });
      const confirmed = Number(head.headers.get("upload-offset"));
      if (
        !head.ok ||
        !Number.isInteger(confirmed) ||
        confirmed < 0 ||
        confirmed > file.size
      )
        throw Error("No se pudo reanudar el video.");
      offset = confirmed;
      onProgress(Math.round((offset / file.size) * 100));
    }
  }
}
