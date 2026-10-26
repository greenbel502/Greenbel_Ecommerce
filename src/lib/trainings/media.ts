export const TRAINING_VIDEO_BUCKET = "training-videos";
export const MAX_TRAINING_VIDEO_BYTES = 50_000_000;
export const VIDEO_MIME = { mp4: "video/mp4", webm: "video/webm" } as const;
export function validTrainingVideoPath(id: string, path: string): boolean {
  return (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(mp4|webm)$/.test(
      path,
    ) && path.startsWith(id.toLowerCase() + "/")
  );
}
export function videoSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "video/webm")
    return [0x1a, 0x45, 0xdf, 0xa3].every((b, i) => bytes[i] === b);
  return (
    mime === "video/mp4" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
  );
}
export type VideoSource = { kind: "file" | "embed" | "external"; url: string };
export function trainingVideoSource(value: string): VideoSource {
  if (/^\/api\/training-videos\/[a-f0-9-]{36}$/.test(value))
    return { kind: "file", url: value };
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Invalid video URL");
  const host = url.hostname.toLowerCase();
  if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ].includes(host)
  ) {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v") ||
          url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id))
      return {
        kind: "embed",
        url: "https://www.youtube-nocookie.com/embed/" + id,
      };
  }
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const id = url.pathname.match(/^\/(?:video\/)?(\d+)$/)?.[1];
    if (id)
      return { kind: "embed", url: "https://player.vimeo.com/video/" + id };
  }
  return {
    kind: /\.(mp4|webm|ogg)$/i.test(url.pathname) ? "file" : "external",
    url: url.toString(),
  };
}
