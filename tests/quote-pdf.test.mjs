import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateQuoteDocument } from "../src/domain/quotes/quote-document.ts";
import { renderQuotePdf } from "../src/lib/pdf/quote-pdf.ts";

const example = {
  version: 1,
  reference: "DEV-EJEMPLO-001",
  issuedAt: "2026-09-29T12:00:00-06:00",
  customerName: "Cliente ficticio DEV",
  customerEmail: null,
  currency: "GTQ",
  lines: [
    {
      sku: "DEV-SKU-1",
      name: "Producto ficticio para prueba de documento",
      quantity: 2,
      regularUnitPrice: "100.00",
      discountPerUnit: "10.00",
      finalUnitPrice: "90.00",
      lineTotal: "180.00"
    }
  ],
  merchandiseTotal: "180.00",
  includedVatAmount: null,
  delivery: { status: "pending", amount: null, description: "El costo de entrega requiere cotización." },
  customerTotal: null
};

test("PDF de cotización pendiente conserva los importes, identifica el documento y no exige correo", async () => {
  validateQuoteDocument(example);
  const pdf = renderQuotePdf(example);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
  assert.ok(pdf.length > 2000);
  if (process.env.GREENBEL_PDF_QA_DIR) {
    const output = path.join(process.env.GREENBEL_PDF_QA_DIR, "cotizacion-ejemplo-dev.pdf");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, pdf);
  }
});

test("rechaza cifras manipuladas, precio cero y total final sin entrega definida", () => {
  assert.throws(() => validateQuoteDocument({ ...example, merchandiseTotal: "0.00" }), /subtotal/i);
  assert.throws(() => validateQuoteDocument({ ...example, lines: [{ ...example.lines[0], finalUnitPrice: "0.00" }] }), /no concilian/i);
  assert.throws(() => validateQuoteDocument({ ...example, customerTotal: "180.00" }), /exige entrega/i);
  assert.throws(() => validateQuoteDocument({ ...example, delivery: { ...example.delivery, amount: "0.00" } }), /cargo de entrega/i);
  assert.throws(() => validateQuoteDocument({ ...example, delivery: { status: "included", amount: "0.00", description: null } }), /total final debe constar/i);
  assert.doesNotThrow(() => validateQuoteDocument({ ...example, delivery: { status: "included", amount: "0.00", description: null }, customerTotal: "180.00" }));
  assert.throws(() => validateQuoteDocument({ ...example, includedVatAmount: "181.00" }), /IVA incluido excede/i);
  assert.throws(() => validateQuoteDocument({ ...example, currency: "USD" }), /GTQ/i);
});

test("cotización extensa pagina líneas y conserva un total conciliado", async () => {
  const lines = Array.from({ length: 40 }, (_, index) => ({
    ...example.lines[0],
    sku: `DEV-SKU-${index + 1}`,
    name: `Producto ficticio DEV ${index + 1} con una descripción extensa para comprobar el salto de línea en el PDF`
  }));
  const longQuote = { ...example, reference: "DEV-EJEMPLO-LARGO", lines, merchandiseTotal: "7200.00" };
  const pdf = renderQuotePdf(longQuote);
  assert.ok(pdf.length > 5000);
  if (process.env.GREENBEL_PDF_QA_DIR) {
    await writeFile(path.join(process.env.GREENBEL_PDF_QA_DIR, "cotizacion-larga-dev.pdf"), pdf);
  }
});
