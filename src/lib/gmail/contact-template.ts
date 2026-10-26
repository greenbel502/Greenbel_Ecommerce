import "server-only";
import type { ContactNotification } from "./message";

export const CONTACT_LOGO_CID = "greenbel-contact-logo";
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

/** Inline styles and presentation tables keep the layout usable without remote fonts or images. */
export function renderContactContent(contact: ContactNotification) {
  const date = new Date(contact.created_at).toLocaleString("es-GT", {
    timeZone: "America/Guatemala",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const fields: [string, string][] = [
    ["Nombre", contact.name],
    ["Correo", contact.email],
    ["Teléfono", contact.phone || "No proporcionado"],
  ];
  // Preserve information on old records while omitting empty product rows on the new form.
  if (contact.product) fields.push(["Producto", contact.product]);
  const type = contact.inquiry_type || "Consulta general";
  const text = [
    "GreenBel | Nueva consulta",
    `${contact.name} nos ha escrito desde el formulario de contacto.`,
    "",
    `Tipo de consulta: ${type}`,
    "",
    "Mensaje del cliente",
    contact.message,
    "",
    "Datos para responder",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Usa Responder en tu correo para contestarle directamente al cliente.",
    `Fecha: ${date} (Guatemala)`,
    `Identificador: ${contact.id}`,
    "",
    "Consulta registrada desde el formulario oficial de GreenBel.",
  ].join("\n");
  const rows = fields
    .map(([label, value]) => {
      const safeValue = escapeHtml(value);
      const content =
        label === "Correo"
          ? `<a href="mailto:${escapeHtml(contact.email)}" style="color:#1e3a1f;text-decoration:underline">${safeValue}</a>`
          : safeValue;
      return `<tr><th scope="row" class="contact-label" style="width:112px;padding:16px 16px 16px 0;border-bottom:1px solid #e7e7cf;text-align:left;vertical-align:top;color:#595959;font-size:13px;font-weight:400">${label}</th><td class="contact-value" style="padding:16px 0;border-bottom:1px solid #e7e7cf;vertical-align:top;color:#1e3a1f;font-size:15px;font-weight:600;line-height:1.5;word-break:break-word;overflow-wrap:anywhere">${content}</td></tr>`;
    })
    .join("");
  const replyUrl = `mailto:${contact.email}?subject=${encodeURIComponent("Re: Tu consulta a GreenBel")}`;
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nueva consulta | GreenBel</title>
<style>
@media screen and (max-width:520px){
  .email-outer{padding:12px 0!important}
  .email-pad{padding-left:24px!important;padding-right:24px!important}
  .email-title{font-size:34px!important;line-height:1.12!important}
  .email-date{display:block!important;text-align:left!important;padding-top:20px!important}
  .email-logo{display:block!important;width:100%!important}
  .contact-label,.contact-value{display:block!important;width:auto!important}
  .contact-label{padding:14px 0 4px!important;border-bottom:0!important}
  .contact-value{padding:0 0 14px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f3f3eb;color:#1e3a1f;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f3eb;font-size:1px;line-height:1px">Nueva consulta de ${escapeHtml(contact.name)} · ${escapeHtml(type)}. Responde directamente a este correo.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f3f3eb;border-collapse:collapse"><tr><td align="center" class="email-outer" style="padding:32px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border-collapse:collapse;table-layout:fixed">
<tr><td class="email-pad" bgcolor="#e7e7cf" style="padding:32px 40px 0;background-color:#e7e7cf">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>
<td class="email-logo" style="vertical-align:middle"><img src="cid:${CONTACT_LOGO_CID}" width="184" height="35" alt="GreenBel" style="display:block;width:184px;max-width:100%;height:auto;border:0;color:#1e3a1f;font-size:24px;font-weight:700"></td>
<td class="email-date" style="vertical-align:middle;text-align:right;color:#3a4813;font-size:12px;line-height:1.6">${escapeHtml(date)}<br>Hora de Guatemala</td>
</tr></table>
</td></tr>
<tr><td class="email-pad" bgcolor="#e7e7cf" style="padding:40px 40px 36px;background-color:#e7e7cf;border-bottom:5px solid #80ba01">
<p style="margin:0 0 16px;color:#3a4813;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Contacto GreenBel</p>
<h1 class="email-title" style="margin:0 0 20px;color:#1e3a1f;font-size:42px;line-height:1.08;letter-spacing:-1.2px;font-weight:700">Tienes una<br>nueva consulta.</h1>
<p style="margin:0;color:#3a4813;font-size:16px;line-height:1.65;word-break:break-word;overflow-wrap:anywhere"><strong>${escapeHtml(contact.name)}</strong> nos ha escrito. Estos son los detalles de su solicitud.</p>
</td></tr>
<tr><td class="email-pad" style="padding:32px 40px 0">
<p style="margin:0 0 8px;color:#595959;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Tipo de consulta</p>
<h2 style="margin:0 0 24px;color:#1e3a1f;font-size:23px;line-height:1.3;word-break:break-word;overflow-wrap:anywhere">${escapeHtml(type)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><tr><td bgcolor="#f8f8f2" style="padding:24px;background-color:#f8f8f2;border-left:4px solid #80ba01">
<p style="margin:0 0 12px;color:#3a4813;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:1px;text-transform:uppercase">Mensaje del cliente</p>
<div style="color:#1e3a1f;font-size:16px;line-height:1.75;word-break:break-word;overflow-wrap:anywhere">${escapeHtml(contact.message).replace(/\r\n|\r|\n/g, "<br>")}</div>
</td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:32px 40px">
<h2 style="margin:0 0 8px;color:#1e3a1f;font-size:21px;line-height:1.4">Datos para responder</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0" aria-label="Información del cliente" style="width:100%;border-collapse:collapse;table-layout:fixed">${rows}</table>
</td></tr>
<tr><td class="email-pad" bgcolor="#1e3a1f" style="padding:32px 40px;background-color:#1e3a1f">
<h2 style="margin:0 0 10px;color:#ffffff;font-size:23px;line-height:1.3">La conversación empieza aquí.</h2>
<p style="margin:0 0 22px;color:#e7e7cf;font-size:14px;line-height:1.7">Usa el botón de abajo o selecciona <strong>Responder</strong> en Gmail para contestarle directamente al cliente.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td bgcolor="#80ba01" style="background-color:#80ba01;border-radius:8px"><a href="${escapeHtml(replyUrl)}" style="display:inline-block;padding:15px 22px;color:#1e3a1f;font-size:14px;line-height:1.4;font-weight:700;text-decoration:none;border-radius:8px">Responder al cliente &#8594;</a></td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:24px 40px 28px">
<p style="margin:0 0 8px;color:#595959;font-size:11px;line-height:1.7">Consulta registrada desde el formulario oficial de GreenBel.</p>
<p style="margin:0;color:#595959;font-size:11px;line-height:1.7">Referencia de la consulta<br><span style="font-family:Consolas,monospace;word-break:break-all">${escapeHtml(contact.id)}</span></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { text, html };
}
