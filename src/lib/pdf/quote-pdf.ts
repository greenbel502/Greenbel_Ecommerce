import { jsPDF } from "jspdf";
import { validateQuoteDocument, type QuoteDocumentSnapshot } from "../../domain/quotes/quote-document.ts";

const GREEN = [12, 47, 28] as const;
const LIME = [136, 214, 0] as const;
const PAGE_MARGIN = 42;

function money(value: string, currency: "GTQ"): string {
  return `${currency === "GTQ" ? "Q" : currency} ${Number(value).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Render a persisted quote snapshot. Authorization and private storage belong to the caller. */
export function renderQuotePdf(snapshot: QuoteDocumentSnapshot): Uint8Array {
  validateQuoteDocument(snapshot);
  const doc = new jsPDF({ format: "a4", unit: "pt", compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentWidth = width - PAGE_MARGIN * 2;
  const bottom = height - 82;
  let page = 1;

  const header = () => {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, width, 94, "F");
    doc.setFillColor(...LIME);
    doc.rect(0, 90, width, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(23);
    doc.text("GreenBel", PAGE_MARGIN, 49);
    doc.setFontSize(11);
    doc.text("COTIZACIÓN", width - PAGE_MARGIN, 39, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(snapshot.reference, width - PAGE_MARGIN, 56, { align: "right" });
  };
  const footer = () => {
    doc.setDrawColor(214, 224, 213);
    doc.line(PAGE_MARGIN, height - 66, width - PAGE_MARGIN, height - 66);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 94, 84);
    doc.text("Cotización, no factura. Precios de producto con IVA incluido. No reserva inventario.", PAGE_MARGIN, height - 49);
    doc.text(`Página ${page}`, width - PAGE_MARGIN, height - 49, { align: "right" });
  };
  const nextPage = () => {
    footer();
    doc.addPage();
    page += 1;
    header();
    return 121;
  };

  header();
  let y = 125;
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Detalle de cotización", PAGE_MARGIN, y);
  y += 23;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Emitida: ${new Date(snapshot.issuedAt).toLocaleDateString("es-GT", { timeZone: "America/Guatemala" })}`, PAGE_MARGIN, y);
  y += 18;
  const customerLines = doc.splitTextToSize(`A nombre de: ${snapshot.customerName}`, contentWidth) as string[];
  doc.text(customerLines, PAGE_MARGIN, y);
  y += customerLines.length * 13 + 5;
  if (snapshot.customerEmail) {
    const emailLines = doc.splitTextToSize(`Correo: ${snapshot.customerEmail}`, contentWidth) as string[];
    doc.text(emailLines, PAGE_MARGIN, y);
    y += emailLines.length * 13 + 5;
  }
  y += 17;

  const itemColumn = PAGE_MARGIN + 11;
  const qtyColumn = width - PAGE_MARGIN - 175;
  const priceColumn = width - PAGE_MARGIN - 90;
  const totalColumn = width - PAGE_MARGIN - 9;
  const tableHeading = () => {
    doc.setFillColor(234, 242, 225);
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, 29, 5, 5, "F");
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Producto", itemColumn, y + 18);
    doc.text("Cant.", qtyColumn, y + 18, { align: "right" });
    doc.text("Precio", priceColumn, y + 18, { align: "right" });
    doc.text("Total", totalColumn, y + 18, { align: "right" });
    y += 38;
  };
  tableHeading();

  for (const line of snapshot.lines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(line.name, qtyColumn - itemColumn - 23) as string[];
    const rowHeight = Math.max(42, nameLines.length * 12 + 25);
    if (y + rowHeight > bottom) {
      y = nextPage();
      tableHeading();
    }
    doc.setTextColor(...GREEN);
    doc.text(nameLines, itemColumn, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(91, 105, 94);
    doc.text(line.sku, itemColumn, y + 13 + nameLines.length * 12);
    doc.setFontSize(9);
    doc.text(String(line.quantity), qtyColumn, y + 12, { align: "right" });
    doc.text(money(line.finalUnitPrice, snapshot.currency), priceColumn, y + 12, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(line.lineTotal, snapshot.currency), totalColumn, y + 12, { align: "right" });
    if (line.discountPerUnit !== "0.00") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(`Descuento por unidad: ${money(line.discountPerUnit, snapshot.currency)}`, priceColumn, y + 27, { align: "right" });
    }
    doc.setDrawColor(226, 232, 225);
    doc.line(PAGE_MARGIN, y + rowHeight - 5, width - PAGE_MARGIN, y + rowHeight - 5);
    y += rowHeight;
  }

  if (y + 150 > bottom) y = nextPage();
  y += 13;
  const summaryX = width - PAGE_MARGIN - 247;
  const summary = (label: string, value: string, emphasis = false) => {
    doc.setFont("helvetica", emphasis ? "bold" : "normal");
    doc.setFontSize(emphasis ? 11 : 9.5);
    doc.setTextColor(...GREEN);
    doc.text(label, summaryX, y);
    doc.text(value, width - PAGE_MARGIN, y, { align: "right" });
    y += emphasis ? 26 : 20;
  };
  summary("Productos", money(snapshot.merchandiseTotal, snapshot.currency));
  summary("IVA incluido", snapshot.includedVatAmount === null ? "Desglose pendiente" : money(snapshot.includedVatAmount, snapshot.currency));
  const deliveryLabel = snapshot.delivery.status === "included" ? "Entrega en total" : snapshot.delivery.status === "excluded" ? "Entrega por separado" : "Entrega por cotizar";
  const deliveryValue = snapshot.delivery.status === "excluded" ? "No incluida" : snapshot.delivery.amount === null ? "Pendiente" : money(snapshot.delivery.amount, snapshot.currency);
  summary(deliveryLabel, deliveryValue);
  summary("Total final", snapshot.customerTotal === null ? "Pendiente de confirmar" : money(snapshot.customerTotal, snapshot.currency), true);
  if (snapshot.delivery.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 94, 84);
    const note = doc.splitTextToSize(snapshot.delivery.description, contentWidth) as string[];
    if (y + note.length * 11 > bottom) y = nextPage();
    doc.text(note, PAGE_MARGIN, y);
  }
  footer();
  return new Uint8Array(doc.output("arraybuffer"));
}
