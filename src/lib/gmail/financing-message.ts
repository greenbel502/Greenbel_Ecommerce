import "server-only";
import { z } from "zod";
import { buildBrandedMime } from "./mime";
import { financingBrandImages } from "./financing-assets";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const date = (value: string) =>
  new Date(value).toLocaleString("es-GT", {
    timeZone: "America/Guatemala",
    dateStyle: "medium",
    timeStyle: "short",
  });
export type FinancingNotification = {
  id: string;
  applicantName: string;
  email: string;
  phone: string | null;
  message: string | null;
  quoteReference: string;
  createdAt: string;
  authenticatedAt: string;
};
function frame(title: string, body: string, footer: string) {
  const logos = financingBrandImages();
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media screen and (max-width:520px){.mail-pad{padding-left:24px!important;padding-right:24px!important}.mail-title{font-size:30px!important}}</style></head><body style="margin:0;background:#f3f3eb;font-family:Arial,Helvetica,sans-serif;color:#1e3a1f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f3f3eb"><tr><td align="center" style="padding:24px 8px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;table-layout:fixed;background:#fff;border-collapse:collapse"><tr><td class="mail-pad" bgcolor="#e7e7cf" style="padding:32px 40px;background:#e7e7cf;border-bottom:5px solid #80ba01"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="48%" style="vertical-align:middle;padding:0 16px 0 0"><img src="${logos.greenbel}" width="184" height="35" alt="GreenBel" style="display:block;max-width:100%;height:auto;border:0"></td><td width="52%" bgcolor="#ffffff" style="background:#ffffff;padding:14px;border:1px solid #e7e7cf;border-radius:10px;vertical-align:middle"><img src="${logos.cooperative}" width="196" height="70" alt="Cooperativa Concepción R.L." style="display:block;width:100%;max-width:196px;height:auto;border:0"></td></tr></table><p style="margin:30px 0 12px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#3a4813">FINANCIAMIENTO GREENBEL</p><h1 class="mail-title" style="margin:0;font-size:36px;line-height:1.15;letter-spacing:-.8px;color:#1e3a1f">${title}</h1></td></tr><tr><td class="mail-pad" style="padding:32px 40px;font-size:15px;line-height:1.75;word-break:break-word;overflow-wrap:anywhere">${body}</td></tr><tr><td class="mail-pad" bgcolor="#1e3a1f" style="padding:24px 40px;background:#1e3a1f;color:#e7e7cf;font-size:12px;line-height:1.7">${footer}</td></tr></table></td></tr></table></body></html>`;
}
export function renderFinancingContent(application: FinancingNotification) {
  z.uuid().parse(application.id);
  z.email().parse(application.email);
  if (
    !application.authenticatedAt ||
    !Number.isFinite(Date.parse(application.authenticatedAt))
  )
    throw Error("financing_account_required");
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(application.quoteReference))
    throw Error("financing_quote_reference_invalid");
  const fields = [
    ["Nombre", application.applicantName],
    ["Correo de su cuenta", application.email],
    ["Teléfono", application.phone || "No proporcionado"],
    ["Cotización PDF adjunta", application.quoteReference],
  ];
  const intro = `Desde GreenBel les compartimos la información de ${application.applicantName}, quien completó nuestro formulario y solicita información sobre un posible financiamiento para los productos seleccionados en la cotización PDF adjunta.`;
  const text = [
    "Estimado equipo de Cooperativa Concepción R.L.:",
    "",
    intro,
    "",
    ...fields.map(([k, v]) => `${k}: ${v}`),
    "",
    "Mensaje del cliente:",
    application.message || "No agregó un mensaje adicional.",
    "",
    `Fecha: ${date(application.createdAt)} (Guatemala)`,
    `Referencia de solicitud: ${application.id}`,
    "",
    "El cliente ingresó con su cuenta de GreenBel y autorizó compartir estos datos. Pueden responder directamente a este mensaje para comunicarse con él.",
    "Esta es una solicitud de información. La evaluación, los requisitos y las condiciones corresponden a la cooperativa; no implica aprobación de crédito.",
  ].join("\n");
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr><th scope="row" style="padding:13px 14px 13px 0;border-bottom:1px solid #e7e7cf;text-align:left;vertical-align:top;font-size:12px;color:#595959;width:36%;font-weight:400">${escape(label)}</th><td style="padding:13px 0;border-bottom:1px solid #e7e7cf;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere">${escape(value)}</td></tr>`,
    )
    .join("");
  const html = frame(
    "Una nueva solicitud<br>para su equipo.",
    `<p style="margin:0 0 18px"><strong>Estimado equipo de Cooperativa Concepción R.L.:</strong></p><p style="margin:0 0 24px">${escape(intro)}</p><h2 style="font-size:21px;margin:28px 0 8px">Información del cliente</h2><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;width:100%">${rows}</table><h2 style="font-size:21px;margin:28px 0 12px">Mensaje del cliente</h2><div style="padding:20px;background:#f8f8f2;border-left:4px solid #80ba01">${escape(application.message || "No agregó un mensaje adicional.").replace(/\r\n|\r|\n/g, "<br>")}</div><p style="margin:24px 0 0;color:#595959;font-size:13px">El PDF adjunto contiene los productos, cantidades e importes de la selección. El cliente ingresó con su cuenta de GreenBel y autorizó compartir estos datos.</p><p style="margin:16px 0 0;font-size:13px"><strong>Para contactar al cliente, respondan directamente a este correo.</strong></p><p style="margin:24px 0 0;font-size:11px;color:#595959">${escape(date(application.createdAt))} · Guatemala<br>Solicitud: <span style="word-break:break-all">${escape(application.id)}</span></p>`,
    "Solicitud de información remitida por GreenBel. La evaluación, los requisitos, las tasas y las condiciones corresponden exclusivamente a la cooperativa. Este mensaje no implica aprobación de crédito.",
  );
  return { text, html };
}
export function buildFinancingMime(
  application: FinancingNotification,
  sender: string,
  recipient: string,
  pdf: Uint8Array,
) {
  const content = renderFinancingContent(application);
  return buildBrandedMime({
    kind: "financing",
    id: application.id,
    createdAt: application.createdAt,
    sender,
    recipient,
    replyTo: application.email,
    subject: `GreenBel | Información de financiamiento | ${application.quoteReference}`,
    ...content,
    externalBrandImages: true,
    attachment: {
      filename: `Cotizacion-${application.quoteReference}.pdf`,
      bytes: pdf,
    },
  });
}
