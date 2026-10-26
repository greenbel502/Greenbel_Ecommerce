/** Preferences for a WhatsApp conversation, not a payment or a delivery booking. */
export const WHATSAPP_PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
] as const;
export const WHATSAPP_DELIVERY_METHODS = [
  { value: "pickup", label: "Retiro" },
  { value: "home_delivery", label: "Envío a domicilio" },
] as const;
export type WhatsAppPreferences = {
  paymentMethod: (typeof WHATSAPP_PAYMENT_METHODS)[number]["value"];
  deliveryMethod: (typeof WHATSAPP_DELIVERY_METHODS)[number]["value"];
};
export function parseWhatsAppPreferences(
  value: unknown,
): WhatsAppPreferences | null {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== 2 ||
    !("paymentMethod" in value) ||
    !("deliveryMethod" in value) ||
    !WHATSAPP_PAYMENT_METHODS.some((o) => o.value === value.paymentMethod) ||
    !WHATSAPP_DELIVERY_METHODS.some((o) => o.value === value.deliveryMethod)
  )
    return null;
  return {
    paymentMethod: value.paymentMethod,
    deliveryMethod: value.deliveryMethod,
  } as WhatsAppPreferences;
}
export function whatsAppPreferenceLabels(preferences: WhatsAppPreferences) {
  if (!parseWhatsAppPreferences(preferences))
    throw Error("Selecciona la forma de pago y entrega.");
  return {
    payment: WHATSAPP_PAYMENT_METHODS.find(
      (o) => o.value === preferences.paymentMethod,
    )!.label,
    delivery: WHATSAPP_DELIVERY_METHODS.find(
      (o) => o.value === preferences.deliveryMethod,
    )!.label,
  };
}
