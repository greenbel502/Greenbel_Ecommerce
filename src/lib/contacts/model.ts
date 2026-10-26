import { z } from "zod";

export const companySchema = z.enum(["greenbel", "cooperative"]);
export const contactKindSchema = z.enum(["phone", "email"]);
export function normalizePhone(value: string): string | null {
  const cleaned = value.trim().replace(/[\s()+.-]/g, "");
  return /^[1-9]\d{7,14}$/.test(cleaned) && !/^0+$/.test(cleaned)
    ? cleaned
    : null;
}
export const contactEntrySchema = z
  .object({
    id: z.uuid(),
    company: companySchema,
    kind: contactKindSchema,
    label: z.string().trim().max(60),
    value: z.string().trim().min(1).max(254),
    primary: z.boolean(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.kind === "phone"
        ? normalizePhone(entry.value) !== entry.value
        : !z.email().safeParse(entry.value).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Revisa el teléfono internacional o el correo.",
        path: ["value"],
      });
  });
export type ContactEntry = z.infer<typeof contactEntrySchema>;
export const contactsPayloadSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(contactEntrySchema).max(40),
  })
  .strict()
  .superRefine(({ entries }, ctx) => {
    const ids = new Set<string>(),
      values = new Set<string>(),
      main = new Set<string>();
    for (const item of entries) {
      const scope = `${item.company}:${item.kind}`,
        key = `${scope}:${item.value.toLowerCase()}`;
      if (
        ids.has(item.id) ||
        values.has(key) ||
        (item.primary && main.has(scope))
      )
        ctx.addIssue({
          code: "custom",
          message: "Hay contactos o selecciones principales repetidos.",
        });
      ids.add(item.id);
      values.add(key);
      if (item.primary) main.add(scope);
    }
  });
export type ContactsPayload = z.infer<typeof contactsPayloadSchema>;
export const EMPTY_CONTACTS: ContactsPayload = { version: 1, entries: [] };
export type ContactSettings = {
  revision: string | null;
  contacts: ContactsPayload;
};
export function publicGreenbelContacts(contacts: ContactsPayload) {
  const primary = (kind: "phone" | "email") =>
    contacts.entries.find(
      (e) => e.company === "greenbel" && e.kind === kind && e.primary,
    );
  return {
    whatsappNumber: primary("phone")?.value ?? null,
    email: primary("email")?.value ?? null,
  };
}
