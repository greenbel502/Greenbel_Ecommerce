import { z } from "zod";

export const customerProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1, "Escribe tu nombre completo.").max(160),
  phone: z.string().trim().max(40).refine(value => value === "" || (/^[+0-9 ()-]+$/.test(value)
    && value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15), "Ingresa un teléfono válido."),
  addressLine: z.string().trim().max(500).refine(value => value === "" || value.length >= 5, "La dirección necesita al menos 5 caracteres.")
});
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
export type CustomerPurchaseProfile = { displayName: string; phone: string; addressLine: string; email: string };

/** External avatar images are limited to Google's HTTPS image hosts; never fetch arbitrary metadata URLs. */
export function googleAvatarUrl(metadata: Record<string, unknown>): string | null {
  const value = metadata.avatar_url ?? metadata.picture;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password
      || !(url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))) return null;
    return url.toString();
  } catch { return null; }
}

export function googleDisplayName(metadata: Record<string, unknown>): string {
  const value = metadata.full_name ?? metadata.name;
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}
