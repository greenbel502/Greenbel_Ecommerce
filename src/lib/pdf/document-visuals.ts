import type { jsPDF } from "jspdf";

export type PdfImage = Readonly<{
  dataUrl: string;
  width: number;
  height: number;
}>;
export type PdfDocumentVisuals = Readonly<{
  logo: PdfImage;
  placeholder: PdfImage;
  products: ReadonlyMap<string, PdfImage>;
  fonts: Readonly<{ regular: string; semibold: string; display: string }>;
}>;

export function applyDocumentFonts(doc: jsPDF, visuals: PdfDocumentVisuals) {
  doc.addFileToVFS("Poppins-Regular.ttf", visuals.fonts.regular);
  doc.addFont("Poppins-Regular.ttf", "Poppins", "normal");
  doc.addFileToVFS("Poppins-Semibold.ttf", visuals.fonts.semibold);
  doc.addFont("Poppins-Semibold.ttf", "Poppins", "bold");
  doc.addFileToVFS("Manrope-Heavy.ttf", visuals.fonts.display);
  doc.addFont("Manrope-Heavy.ttf", "GreenBelDisplay", "bold");
}

/** Contain, never crop or stretch an official logo or a product photograph. */
export function drawContainedImage(
  doc: jsPDF,
  image: PdfImage,
  x: number,
  y: number,
  width: number,
  height: number,
  alias?: string,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale,
    h = image.height * scale;
  doc.addImage(
    image.dataUrl,
    image.dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
    x + (width - w) / 2,
    y + (height - h) / 2,
    w,
    h,
    alias,
    "FAST",
  );
}
