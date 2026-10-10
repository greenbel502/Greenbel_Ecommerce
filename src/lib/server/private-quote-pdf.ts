import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Caller must prove guest grant or admin role before invoking this privileged read. */
export async function readVerifiedQuotePdf(quoteId: string): Promise<{ bytes: Uint8Array; reference: string }> {
  const client = createSupabaseAdminClient();
  const { data: quote, error: quoteError } = await client.from("quotes")
    .select("reference,stage,pdf_storage_bucket,pdf_storage_path,pdf_sha256,pdf_bytes")
    .eq("id", quoteId).maybeSingle();
  if (quoteError || !quote || quote.stage !== "issued" || quote.pdf_storage_bucket !== "quote-pdfs"
    || typeof quote.pdf_storage_path !== "string" || !quote.pdf_storage_path.startsWith(`${quoteId}/`)
    || typeof quote.pdf_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(quote.pdf_sha256)
    || typeof quote.reference !== "string") {
    throw new Error("Private quote unavailable");
  }
  const expectedBytes = Number(quote.pdf_bytes);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1) {
    throw new Error("Private quote metadata invalid");
  }
  const { data: pdf, error: pdfError } = await client.storage.from("quote-pdfs").download(quote.pdf_storage_path);
  if (pdfError || !pdf) throw new Error("Private quote object unavailable");
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  if (bytes.byteLength !== expectedBytes
    || createHash("sha256").update(bytes).digest("hex") !== quote.pdf_sha256
    || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("Private quote content mismatch");
  }
  return { bytes, reference: quote.reference };
}

export function privateQuotePdfResponse(bytes: Uint8Array, reference: string): Response {
  const safeReference = reference.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || "GreenBel";
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body, { status: 200, headers: {
    ...NO_STORE,
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="Cotizacion-${safeReference}.pdf"`,
    "Content-Length": String(bytes.byteLength)
  } });
}
