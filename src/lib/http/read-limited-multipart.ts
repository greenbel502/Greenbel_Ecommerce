/** Read the actual multipart stream before parsing it, including when Content-Length is absent. */
export async function readLimitedMultipart(request: Request, maxBytes: number): Promise<FormData | null> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new Error("Multipart body required");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !request.body) {
    throw new Error("Invalid multipart body limit");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* limit already exceeded */ }
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes.buffer, { headers: { "Content-Type": contentType } }).formData();
}
