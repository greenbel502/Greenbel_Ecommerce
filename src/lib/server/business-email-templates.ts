import "server-only";

/** Plain-text content for the future Resend integration. No route calls these templates during the pause. */
export type BusinessEmailTemplate = Readonly<{ subject: string; text: string }>;

function line(value: string | null | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

function reference(value: string): string {
  const safe = line(value).replace(/[^A-Za-z0-9-]/g, "").slice(0, 80);
  if (!safe) throw new Error("Referencia inválida para plantilla de correo.");
  return safe;
}

export function contactNotificationTemplate(input: Readonly<{
  reference: string;
  name: string;
  email: string;
  phone: string | null;
  inquiryType: string | null;
  product: string | null;
  message: string;
}>): BusinessEmailTemplate {
  const id = reference(input.reference);
  return {
    subject: `Consulta GreenBel ${id}`,
    text: [
      `Consulta registrada: ${id}`,
      `Nombre: ${line(input.name)}`,
      `Correo: ${line(input.email)}`,
      `Teléfono: ${line(input.phone) || "No indicado"}`,
      `Tipo: ${line(input.inquiryType) || "No indicado"}`,
      `Producto: ${line(input.product) || "No indicado"}`,
      "",
      "Mensaje:",
      input.message.trim()
    ].join("\n")
  };
}

export function financingApplicationTemplate(input: Readonly<{
  reference: string;
  quoteReference: string;
  applicantName: string;
  verifiedEmail: string;
  phone: string | null;
  message: string | null;
}>): BusinessEmailTemplate {
  const id = reference(input.reference);
  const quote = reference(input.quoteReference);
  return {
    subject: `Solicitud de financiamiento GreenBel ${id}`,
    text: [
      `Solicitud: ${id}`,
      `Cotización PDF adjunta: ${quote}`,
      `Solicitante: ${line(input.applicantName)}`,
      `Correo verificado: ${line(input.verifiedEmail)}`,
      `Teléfono: ${line(input.phone) || "No indicado"}`,
      "",
      "Mensaje del solicitante:",
      input.message?.trim() || "No indicado",
      "",
      "La cooperativa evalúa la solicitud según sus propias condiciones. Este mensaje no acredita aprobación."
    ].join("\n")
  };
}

export function financingVerificationTemplate(input: Readonly<{
  code: string;
}>): BusinessEmailTemplate {
  if (!/^\d{6}$/.test(input.code)) throw new Error("Código de verificación inválido.");
  return {
    subject: "Código de verificación de financiamiento GreenBel",
    text: [
      `Tu código es: ${input.code}`,
      "El código vence diez minutos después de su emisión. No lo compartas con terceros.",
      "Verificar tu correo no constituye aprobación de crédito."
    ].join("\n")
  };
}
