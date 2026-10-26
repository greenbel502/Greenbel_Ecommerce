import { jsPDF } from "jspdf";
import {
  applyDocumentFonts,
  drawContainedImage,
  type PdfDocumentVisuals,
} from "./document-visuals.ts";
import type { WhatsAppSelectionDocument } from "../../domain/cart/whatsapp-selection";
import { whatsAppPreferenceLabels } from "../../domain/cart/whatsapp-preferences.ts";
const GREEN = [30, 58, 31] as const,
  LIME = [128, 186, 1] as const,
  BEIGE = [231, 231, 207] as const;
const money = (cents: number) =>
  `Q ${(cents / 100).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Read-only selection document, not a persisted quote, payment receipt or confirmed order. */
export function renderWhatsAppSelectionPdf(
  snapshot: WhatsAppSelectionDocument,
  visuals: PdfDocumentVisuals,
): Uint8Array {
  if (
    !snapshot.lines.length ||
    snapshot.lines.length > 50 ||
    !Number.isFinite(Date.parse(snapshot.issuedAt)) ||
    !/^[A-Za-z0-9-]{1,48}$/.test(snapshot.reference)
  )
    throw Error("Documento de selección inválido.");
  const doc = new jsPDF({
    format: "a4",
    unit: "pt",
    compress: true,
    putOnlyUsedFonts: true,
  });
  applyDocumentFonts(doc, visuals);
  doc.setProperties({
    title: "Solicitud de productos GreenBel",
    subject: "Selección para compra por WhatsApp",
    author: "GreenBel",
  });
  const width = doc.internal.pageSize.getWidth(),
    height = doc.internal.pageSize.getHeight(),
    margin = 40,
    content = width - margin * 2,
    bottom = height - 86;
  let page = 1,
    y = 0;
  function header() {
    doc.setFillColor(...BEIGE);
    doc.rect(0, 0, width, 198, "F");
    drawContainedImage(
      doc,
      visuals.logo,
      (width - 340.16) / 2,
      64,
      340.16,
      64.1,
      "greenbel-brand",
    );
    doc.setFillColor(...LIME);
    doc.rect(0, 194, width, 4, "F");
    doc.setFont("Poppins", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREEN);
    doc.text(snapshot.reference, width - margin, 218, { align: "right" });
    y = 244;
  }
  function footer() {
    doc.setDrawColor(...BEIGE);
    doc.line(margin, height - 65, width - margin, height - 65);
    doc.setTextColor(80, 88, 79);
    doc.setFont("Poppins", "normal");
    doc.setFontSize(7.5);
    doc.text(
      "Solicitud por WhatsApp. No es factura ni confirmación de compra. No reserva inventario.",
      margin,
      height - 48,
    );
    doc.text(
      `Precios y disponibilidad por confirmar con GreenBel.`,
      margin,
      height - 36,
    );
    doc.text(`Página ${page}`, width - margin, height - 36, { align: "right" });
  }
  function nextPage() {
    footer();
    doc.addPage();
    page++;
    header();
  }
  const qtyX = width - margin - 183,
    priceX = width - margin - 94,
    totalX = width - margin - 10;
  function tableHeader() {
    doc.setFillColor(...BEIGE);
    doc.roundedRect(margin, y, content, 28, 4, 4, "F");
    doc.setTextColor(...GREEN);
    doc.setFont("Poppins", "bold");
    doc.setFontSize(8.5);
    doc.text("Foto", margin + 9, y + 18);
    doc.text("Producto / código", margin + 79, y + 18);
    doc.text("Cant.", qtyX, y + 18, { align: "right" });
    doc.text("Precio unit.", priceX, y + 18, { align: "right" });
    doc.text("Importe", totalX, y + 18, { align: "right" });
    y += 38;
  }
  header();
  const preferences = whatsAppPreferenceLabels(snapshot.preferences);
  doc.setFont("Poppins", "bold");
  doc.setFontSize(19);
  doc.text("Tu selección GreenBel", margin, y);
  y += 21;
  doc.setFont("Poppins", "normal");
  doc.setFontSize(9);
  doc.text(
    `Preparada: ${new Date(snapshot.issuedAt).toLocaleString("es-GT", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
    margin,
    y,
  );
  y += 17;
  doc.text(
    `${snapshot.lines.length} referencias · ${snapshot.lines.reduce((s, l) => s + l.quantity, 0)} unidades seleccionadas`,
    margin,
    y,
  );
  y += 25;
  doc.text(`Forma de pago: ${preferences.payment}`, margin, y);
  y += 16;
  doc.text(`Método de entrega: ${preferences.delivery}`, margin, y);
  y += 25;
  tableHeader();
  for (const line of snapshot.lines) {
    doc.setFont("Poppins", "bold");
    doc.setFontSize(9);
    const title = doc.splitTextToSize(
      line.name,
      qtyX - margin - 100,
    ) as string[];
    const sku = doc.splitTextToSize(
      `Código: ${line.sku}`,
      qtyX - margin - 100,
    ) as string[];
    const rowHeight = Math.max(
      80,
      title.length * 12 +
        sku.length * 11 +
        17 +
        (line.availabilityPending ? 12 : 0),
    );
    if (rowHeight > bottom - 150)
      throw Error("El nombre del producto excede el tamaño permitido.");
    if (y + rowHeight > bottom) {
      nextPage();
      tableHeader();
    }
    doc.setTextColor(...GREEN);
    const photo = visuals.products.get(line.sku);
    doc.setDrawColor(...BEIGE);
    doc.roundedRect(margin + 8, y + 2, 58, 62, 5, 5);
    drawContainedImage(
      doc,
      photo ?? visuals.placeholder,
      margin + 11,
      y + 5,
      52,
      50,
      `product-${line.sku}`,
    );
    if (!photo) {
      doc.setFontSize(6);
      doc.text("Sin imagen", margin + 37, y + 60, { align: "center" });
    }
    doc.setFont("Poppins", "bold");
    doc.setFontSize(9);
    doc.text(title, margin + 79, y + 11);
    doc.setFont("Poppins", "normal");
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 72);
    doc.text(sku, margin + 79, y + 13 + title.length * 12);
    if (line.availabilityPending)
      doc.text(
        "Existencia por confirmar",
        margin + 79,
        y + 13 + title.length * 12 + sku.length * 11,
      );
    doc.setFontSize(8.5);
    doc.setTextColor(...GREEN);
    doc.text(String(line.quantity), qtyX, y + 11, { align: "right" });
    doc.text(money(line.unitCents), priceX, y + 11, { align: "right" });
    doc.setFont("Poppins", "bold");
    doc.text(money(line.totalCents), totalX, y + 11, { align: "right" });
    doc.setDrawColor(...BEIGE);
    doc.line(margin, y + rowHeight - 5, width - margin, y + rowHeight - 5);
    y += rowHeight;
  }
  if (y + 142 > bottom) nextPage();
  y += 14;
  doc.setFillColor(...GREEN);
  doc.roundedRect(margin, y, content, 43, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("Poppins", "bold");
  doc.setFontSize(11);
  doc.text("Total de productos", margin + 14, y + 26);
  doc.text(money(snapshot.subtotalCents), width - margin - 14, y + 26, {
    align: "right",
  });
  y += 64;
  doc.setTextColor(...GREEN);
  doc.setFont("Poppins", "normal");
  doc.setFontSize(9);
  const note = doc.splitTextToSize(
    "Adjunta este PDF al mensaje de WhatsApp. Un asesor de GreenBel confirmará los precios, la disponibilidad, el costo de entrega y la forma de pago antes de completar tu compra.",
    content,
  ) as string[];
  doc.text(note, margin, y);
  footer();
  return new Uint8Array(doc.output("arraybuffer"));
}
