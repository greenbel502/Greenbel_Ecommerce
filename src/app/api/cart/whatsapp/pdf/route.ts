import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { issueWhatsAppReviewInvitation } from "@/lib/server/whatsapp-reviews";
import {
  CustomerProfileError,
  requireCustomerProfile,
} from "@/lib/server/customer-profile";
import { parseWhatsAppPreferences } from "@/domain/cart/whatsapp-preferences";
import { loadDocumentVisuals } from "@/lib/pdf/load-document-visuals";
import { getProducts } from "@/application/use-cases/getProducts";
import { parseCartSelection } from "@/domain/cart/cartSelection";
import {
  buildWhatsAppSelection,
  whatsAppSelectionUrl,
} from "@/domain/cart/whatsapp-selection";
import { renderWhatsAppSelectionPdf } from "@/lib/pdf/whatsapp-selection-pdf";
import { readPublicGreenbelContacts } from "@/lib/server/contact-settings";
import {
  isAllowedSubmissionOrigin,
  readLimitedBody,
} from "@/lib/server/public-submission";
export const runtime = "nodejs",
  dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: HEADERS });
export async function POST(request: Request) {
  if (!isAllowedSubmissionOrigin(request))
    return json("Origen no permitido.", 403);
  let customerId: string;
  try {
    customerId = (await requireCustomerProfile()).user.id;
  } catch (error) {
    if (error instanceof CustomerProfileError && error.status === 401)
      return json(
        "Inicia sesión para continuar con tu compra por WhatsApp.",
        401,
      );
    if (error instanceof CustomerProfileError && error.status === 403)
      return json("Esta cuenta no puede comprar.", 403);
    return json("No pudimos verificar tu cuenta. Inténtalo de nuevo.", 503);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return json("Envía la selección en formato JSON.", 415);
  let data: unknown;
  try {
    const raw = await readLimitedBody(request, 16384);
    if (raw === null)
      return json("La selección excede el tamaño permitido.", 413);
    data = JSON.parse(raw);
  } catch {
    return json("No se pudo leer la selección.", 400);
  }
  if (
    !data ||
    typeof data !== "object" ||
    Object.keys(data).some((key) => !["lines", "preferences"].includes(key))
  )
    return json("Selección inválida.", 400);
  const preferences = parseWhatsAppPreferences(
    "preferences" in data ? data.preferences : undefined,
  );
  if (!preferences)
    return json("Selecciona la forma de pago y el método de entrega.", 400);
  const selection = parseCartSelection(
    "lines" in data ? data.lines : undefined,
  );
  if (
    !selection?.length ||
    selection.some((l) => !/^[0-9a-f-]{36}$/i.test(l.productId))
  )
    return json("Selecciona entre 1 y 50 productos del catálogo.", 400);
  try {
    const contact = await readPublicGreenbelContacts();
    if (!contact.available)
      return json(
        "No pudimos consultar el canal de WhatsApp. Inténtalo de nuevo.",
        503,
      );
    if (!contact.whatsappNumber)
      return json(
        "El canal de compras por WhatsApp no está disponible por el momento. Consulta los canales de contacto de GreenBel.",
        503,
      );
    let snapshot;
    try {
      snapshot = buildWhatsAppSelection(
        selection,
        await getProducts(),
        `GB-${randomUUID().slice(0, 8).toUpperCase()}`,
        new Date().toISOString(),
        preferences,
      );
    } catch (error) {
      return json(
        error instanceof Error
          ? error.message
          : "Actualiza el carrito antes de continuar.",
        409,
      );
    }
    const filename = `Seleccion-GreenBel-${snapshot.reference}.pdf`;
    const url = whatsAppSelectionUrl(
      contact.whatsappNumber,
      snapshot.reference,
      selection.reduce((s, l) => s + l.quantity, 0),
      filename,
      preferences,
      snapshot.subtotalCents,
    );
    const visuals = await loadDocumentVisuals(
      snapshot.lines.map((line, index) => ({
        productId: selection[index].productId,
        sku: line.sku,
      })),
    );
    const bytes = renderWhatsAppSelectionPdf(snapshot, visuals);
    const invitationId = await issueWhatsAppReviewInvitation(
      customerId,
      snapshot.reference,
    );
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Greenbel-WhatsApp-Url": url,
        ...(invitationId
          ? {
              "X-Greenbel-Review-Invitation": invitationId,
              "X-Greenbel-Selection-Reference": snapshot.reference,
            }
          : {}),
      },
    });
  } catch {
    return json(
      "No pudimos preparar el PDF. Tu selección sigue en el carrito; vuelve a intentarlo.",
      503,
    );
  }
}
