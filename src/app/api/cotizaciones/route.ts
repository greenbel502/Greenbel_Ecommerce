import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildPendingDeliveryQuote } from "@/domain/quotes/build-pending-quote";
import type { OfferInput } from "@/domain/pricing/offer";
import { loadDocumentVisuals } from "@/lib/pdf/load-document-visuals";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { abuseSourceHash, isAllowedSubmissionOrigin, readLimitedBody } from "@/lib/server/public-submission";
import { getActiveSupabaseSecretKey } from "@/lib/server/environment";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireFinancingAccount } from "@/lib/financing/workflow";
import { financingFailure } from "@/lib/financing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const MAX_BODY_BYTES = 16_384;
const MAX_LINES = 50;
const MAX_QUANTITY = 999;
const schema = z.object({
  purpose: z.literal("financing").optional(),
  idempotencyKey: z.uuid(),
  customerName: z.string().trim().min(2).max(160)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  customerEmail: z.email().max(254).transform((value) => value.trim().toLowerCase()).nullable(),
  lines: z.array(z.object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_QUANTITY)
  }).strict()).min(1).max(MAX_LINES)
}).strict();

type CatalogRow = {
  id: string;
  sku: string;
  name: string;
  regular_price: string | number | null;
  effective_price: string | number | null;
  currency: string | null;
  offer_kind: string | null;
  offer_value: string | number | null;
  warranty_months: number | null;
  warranty_terms: string | null;
};
type BalanceRow = { product_id: string; stock_balance: string | number; reserved: string | number };
type QuoteStart = { quote_id: string; quote_reference: string; quote_stage: string; repeated: boolean };

function json(body: object, status: number, moreHeaders?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...moreHeaders } });
}

function decimal(value: string | number | null, field: string): string {
  if (value === null) throw new Error(`${field} no disponible.`);
  const rendered = typeof value === "number" ? value.toFixed(2) : value;
  if (!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(rendered)) {
    throw new Error(`${field} inválido.`);
  }
  const [whole, cents = ""] = rendered.split(".");
  return `${whole}.${cents.padEnd(2, "0")}`;
}

function cents(value: string): bigint {
  const [whole, decimalPart] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(decimalPart);
}

function thousandths(value: string | number): bigint {
  const rendered = typeof value === "number" ? value.toFixed(3) : value;
  if (!/^(0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(rendered)) {
    throw new Error("Invalid inventory balance");
  }
  const [whole, fraction = ""] = rendered.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
}

function money(value: bigint): string {
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}

function accessToken(quoteId: string, key: string): string {
  // The idempotency key is random; HMAC yields the same private token on an HTTP retry.
  return createHmac("sha256", getActiveSupabaseSecretKey())
    .update("greenbel-quote-access-v1\0")
    .update(quoteId)
    .update("\0")
    .update(key)
    .digest("base64url");
}

async function ensureGuestGrant(client: ReturnType<typeof createSupabaseAdminClient>,
  quoteId: string, key: string): Promise<string> {
  const token = accessToken(quoteId, key);
  const digest = createHash("sha256").update(token).digest("hex");
  const { data: existing, error: readError } = await client.from("guest_access_grants")
    .select("quote_id, expires_at, revoked_at, use_count, max_uses")
    .eq("token_sha256", digest).maybeSingle();
  if (readError) throw new Error("Grant lookup failed");
  if (existing) {
    if (existing.quote_id !== quoteId || existing.revoked_at
      || Date.parse(existing.expires_at) <= Date.now() || existing.use_count >= existing.max_uses) {
      throw new Error("Grant expired or exhausted");
    }
    return token;
  }
  const { error } = await client.from("guest_access_grants").insert({
    quote_id: quoteId,
    token_sha256: digest,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    max_uses: 3
  });
  if (error && error.code !== "23505") throw new Error("Grant creation failed");
  // A concurrent retry may have inserted the same hash first. Confirm its scope.
  const { data: confirmed, error: confirmError } = await client.from("guest_access_grants")
    .select("quote_id, expires_at, revoked_at, use_count, max_uses")
    .eq("token_sha256", digest).maybeSingle();
  if (confirmError || confirmed?.quote_id !== quoteId || confirmed.revoked_at
    || Date.parse(confirmed.expires_at) <= Date.now() || confirmed.use_count >= confirmed.max_uses) {
    throw new Error("Grant could not be confirmed");
  }
  return token;
}

export async function POST(request: Request) {
  if (!isAllowedSubmissionOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Envía la solicitud en formato JSON." }, 415);
  }
  let parsed: z.infer<typeof schema>;
  try {
    const raw = await readLimitedBody(request, MAX_BODY_BYTES);
    if (raw === null) return json({ error: "La solicitud excede el tamaño permitido." }, 413);
    const validated = schema.safeParse(JSON.parse(raw));
    if (!validated.success || new Set(validated.data.lines.map((line) => line.productId)).size !== validated.data.lines.length) {
      return json({ error: "Revisa los datos de la cotización." }, 400);
    }
    parsed = validated.data;
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  if (parsed.purpose === "financing") {
    try { const { user } = await requireFinancingAccount(); parsed.customerEmail = user.email!.toLowerCase(); }
    catch (error) { return financingFailure(error); }
  }

  let client: ReturnType<typeof createSupabaseAdminClient>;
  let started: QuoteStart;
  try {
    const sourceHash = abuseSourceHash(request, "quote");
    if (!sourceHash) return json({ error: "La cotización no está disponible ahora." }, 503);
    client = createSupabaseAdminClient();
    const fingerprint = createHash("sha256").update(JSON.stringify({
      customerName: parsed.customerName,
      customerEmail: parsed.customerEmail,
      lines: parsed.lines,
      ...(parsed.purpose ? { purpose: parsed.purpose } : {})
    })).digest("hex");
    const { data, error } = await client.rpc("begin_guest_quote", {
      p_idempotency_key: parsed.idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_source_hash: sourceHash,
      p_customer_name: parsed.customerName,
      p_customer_email: parsed.customerEmail
    }).single();
    if (error?.code === "P4090") return json({ error: "La clave de esta cotización ya se utilizó con otros datos." }, 409);
    if (error?.code === "P4290") return json({ error: "Se alcanzó el límite temporal de cotizaciones. Inténtalo más tarde." }, 429);
    if (error || !data || typeof data !== "object" || !("quote_id" in data)
      || typeof data.quote_id !== "string" || !("quote_reference" in data)
      || typeof data.quote_reference !== "string" || !("quote_stage" in data)
      || typeof data.quote_stage !== "string" || !("repeated" in data)
      || typeof data.repeated !== "boolean") {
      return json({ error: "La cotización no está disponible ahora." }, 503);
    }
    started = data as QuoteStart;
  } catch {
    return json({ error: "La cotización no está disponible ahora." }, 503);
  }

  if (started.repeated) {
    if (started.quote_stage === "generating") {
      return json({ status: "processing" }, 202, { "Retry-After": "2" });
    }
    if (started.quote_stage !== "issued") {
      return json({ error: "Esta cotización no pudo emitirse. Inicia una solicitud nueva." }, 503);
    }
    try {
      const token = await ensureGuestGrant(client, started.quote_id, parsed.idempotencyKey);
      return json({ status: "issued", quoteId: started.quote_id,
        reference: started.quote_reference, downloadToken: token }, 200);
    } catch {
      return json({ error: "El acceso al PDF no está disponible. Inténtalo más tarde." }, 503);
    }
  }

  let uploadedPath: string | null = null;
  let issued = false;
  let issueAttempted = false;
  let inputInvalid = false;
  try {
    const ids = parsed.lines.map((line) => line.productId);
    const [catalogResult, balanceResult] = await Promise.all([
      client.from("catalog_products")
        .select("id,sku,name,regular_price,effective_price,currency,offer_kind,offer_value,warranty_months,warranty_terms")
        .in("id", ids),
      client.from("inventory_balances").select("product_id,stock_balance,reserved").in("product_id", ids)
    ]);
    if (catalogResult.error || balanceResult.error) throw new Error("Catalog or inventory read failed");
    const rows = (catalogResult.data ?? []) as CatalogRow[];
    const balances = new Map(((balanceResult.data ?? []) as BalanceRow[]).map((row) => [row.product_id, row]));
    const rowById = new Map(rows.map((row) => [row.id, row]));
    if (rows.length !== ids.length) inputInvalid = true;
    const issuedAt = new Date().toISOString();
    const catalog = ids.map((id) => {
      const row = rowById.get(id);
      if (!row || row.currency !== "GTQ") { inputInvalid = true; throw new Error("Catalog product unavailable"); }
      const balance = balances.get(id);
      const available = balance
        ? (thousandths(balance.stock_balance) - thousandths(balance.reserved)) / BigInt(1000)
        : null;
      const offer: OfferInput | null = row.offer_kind === null ? null : row.offer_kind === "fixed_price" || row.offer_kind === "percentage"
        ? { kind: row.offer_kind, value: decimal(row.offer_value, "Oferta") }
        : null;
      if ((row.offer_kind !== null && !offer) || (row.offer_kind === null && row.offer_value !== null)) {
        inputInvalid = true;
        throw new Error("Offer unavailable");
      }
      return {
        id: row.id, sku: row.sku, name: row.name,
        regularPrice: row.regular_price === null ? null : decimal(row.regular_price, "Precio"),
        activeOffer: offer,
        availableQuantity: available !== null && available >= BigInt(0)
          && available <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(available) : null
      };
    });
    let snapshot;
    try {
      snapshot = buildPendingDeliveryQuote({
        purpose: parsed.purpose,
        reference: started.quote_reference,
        issuedAt,
        customerName: parsed.customerName,
        customerEmail: parsed.customerEmail,
        selection: parsed.lines,
        catalog
      });
    } catch {
      inputInvalid = true;
      throw new Error("Quote selection unavailable");
    }
    let regularTotal = BigInt(0);
    const items = snapshot.lines.map((line, index) => {
      const selected = parsed.lines[index];
      const row = rowById.get(selected.productId)!;
      if (line.finalUnitPrice !== decimal(row.effective_price, "Precio final")) {
        inputInvalid = true;
        throw new Error("Offer changed");
      }
      regularTotal += cents(line.regularUnitPrice) * BigInt(line.quantity);
      return {
        quote_id: started.quote_id, product_id: selected.productId, line_no: index + 1,
        sku_snapshot: line.sku, name_snapshot: line.name, quantity: line.quantity,
        regular_unit_price: line.regularUnitPrice, discount_unit: line.discountPerUnit,
        final_unit_price: line.finalUnitPrice, line_total: line.lineTotal,
        offer_kind_snapshot: row.offer_kind, offer_value_snapshot: row.offer_value,
        warranty_months_snapshot: row.warranty_months, warranty_terms_snapshot: row.warranty_terms
      };
    });
    const visuals = await loadDocumentVisuals(snapshot.lines.map((line, index) => ({ productId: parsed.lines[index].productId, sku: line.sku })));
    const pdf = renderQuotePdf(snapshot, visuals);
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    const path = `${started.quote_id}/${pdfHash}.pdf`;
    const { error: itemError } = await client.from("quote_items").insert(items);
    if (itemError) throw new Error("Quote line insert failed");
    uploadedPath = path;
    const { error: uploadError } = await client.storage.from("quote-pdfs")
      .upload(path, Buffer.from(pdf), { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error("Private PDF upload failed");
    const { data: downloaded, error: downloadError } = await client.storage.from("quote-pdfs").download(path);
    if (downloadError || !downloaded) throw new Error("Private PDF verification failed");
    const savedBytes = Buffer.from(await downloaded.arrayBuffer());
    if (savedBytes.byteLength !== pdf.byteLength
      || createHash("sha256").update(savedBytes).digest("hex") !== pdfHash) {
      throw new Error("Private PDF content mismatch");
    }
    issueAttempted = true;
    const { data: updated, error: issueError } = await client.from("quotes").update({
      stage: "issued", subtotal: money(regularTotal),
      discount_total: money(regularTotal - cents(snapshot.merchandiseTotal)),
      merchandise_total: snapshot.merchandiseTotal,
      included_iva_amount: null,
      shipping_status: "pending", shipping_fee: null,
      shipping_description: snapshot.delivery.description,
      customer_total: null,
      terms_snapshot: "Cotización, no factura. Precios de producto con IVA incluido. No reserva inventario.",
      pdf_storage_bucket: "quote-pdfs", pdf_storage_path: path,
      pdf_sha256: pdfHash, pdf_bytes: pdf.byteLength, issued_at: issuedAt
    }).eq("id", started.quote_id).eq("stage", "generating").select("id").single();
    if (issueError || updated?.id !== started.quote_id) throw new Error("Quote issue failed");
    issued = true;
    const token = await ensureGuestGrant(client, started.quote_id, parsed.idempotencyKey);
    return json({ status: "issued", quoteId: started.quote_id,
      reference: started.quote_reference, downloadToken: token }, 201);
  } catch {
    if (!issued) {
      try {
        const { data: current, error: readError } = issueAttempted
          ? await client.from("quotes").select("stage").eq("id", started.quote_id).maybeSingle()
          : { data: { stage: "generating" }, error: null };
        // Never delete a PDF that may already belong to an issued quote after a timeout.
        if (!readError && current?.stage === "generating") {
          if (uploadedPath) await client.storage.from("quote-pdfs").remove([uploadedPath]);
          await client.from("quotes").update({ stage: "failed" })
            .eq("id", started.quote_id).eq("stage", "generating");
        }
      } catch {
        // An uncertain issue result is left for an idempotent retry or manual audit.
      }
    }
    return json({ error: inputInvalid
      ? "No se puede emitir con la selección actual. Revisa precio y disponibilidad; la cotización no reserva inventario."
      : "No se pudo guardar y verificar el PDF privado. Inténtalo con una solicitud nueva." }, inputInvalid ? 422 : 503);
  }
}
