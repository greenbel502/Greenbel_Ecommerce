"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readContactSettings } from "@/lib/server/contact-settings";
import {
  companySchema,
  contactKindSchema,
  contactsPayloadSchema,
  normalizePhone,
  type ContactSettings,
} from "@/lib/contacts/model";
import { saveLocationSchema } from "@/lib/contacts/locations";
export type ContactActionResult = {
  status: "success" | "error";
  message: string;
  settings?: ContactSettings;
};
const schema = z
  .object({
    id: z.uuid().optional(),
    company: companySchema,
    kind: contactKindSchema,
    label: z.string().trim().max(60),
    value: z.string().trim().min(1).max(254),
    primary: z.boolean(),
    revision: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
async function writeSettings(
  current: ContactSettings,
  contacts: ContactSettings["contacts"],
  actor: string,
): Promise<ContactActionResult> {
  const admin = createSupabaseAdminClient();
  const payload = {
    payload: contacts,
    title: "Contactos de GreenBel y cooperativa",
    schema_version: 1,
    publication_status: "draft",
    edited_by: actor,
  };
  const query =
    current.revision === null
      ? admin.from("site_content").insert({ key: "contact", ...payload })
      : admin
          .from("site_content")
          .update(payload)
          .eq("key", "contact")
          .eq("updated_at", current.revision);
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error || !data)
    return {
      status: "error",
      message:
        "Los contactos cambiaron en otra sesión. Actualiza la página antes de guardar.",
    };
  revalidatePath("/admin/contacto");
  revalidatePath("/contacto");
  revalidatePath("/financiamiento");
  revalidatePath("/carrito");
  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "Contacto guardado.",
    settings: { revision: data.updated_at, contacts },
  };
}
export async function saveContactAction(
  input: unknown,
): Promise<ContactActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: "Revisa los datos del contacto." };
  try {
    const actor = await requireStaffActor(["admin"]),
      current = await readContactSettings(),
      data = parsed.data;
    if (current.revision !== data.revision)
      return {
        status: "error",
        message:
          "Los contactos cambiaron. Actualiza la página antes de guardar.",
      };
    const previous = data.id
      ? current.contacts.entries.find((e) => e.id === data.id)
      : null;
    if (
      data.id &&
      (!previous ||
        previous.company !== data.company ||
        previous.kind !== data.kind)
    )
      return {
        status: "error",
        message: "El contacto ya no está disponible. Actualiza la página.",
      };
    const value =
      data.kind === "phone"
        ? normalizePhone(data.value)
        : data.value.toLowerCase();
    if (!value)
      return {
        status: "error",
        message:
          "Escribe el número con código de país, por ejemplo +502 y ocho dígitos.",
      };
    const entry = {
      id: data.id ?? randomUUID(),
      company: data.company,
      kind: data.kind,
      label: data.label,
      value,
      primary: data.primary,
    };
    const entries = current.contacts.entries
      .filter((e) => e.id !== entry.id)
      .map((e) =>
        entry.primary && e.company === entry.company && e.kind === entry.kind
          ? { ...e, primary: false }
          : e,
      );
    entries.push(entry);
    const valid = contactsPayloadSchema.safeParse({
      ...current.contacts,
      entries,
    });
    if (!valid.success)
      return {
        status: "error",
        message:
          "Revisa el correo o el teléfono. El contacto no debe estar repetido.",
      };
    return await writeSettings(current, valid.data, actor.userId);
  } catch {
    return {
      status: "error",
      message: "No se pudo comprobar el permiso o guardar el contacto.",
    };
  }
}
export async function deleteContactAction(
  input: unknown,
): Promise<ContactActionResult> {
  const parsed = z
    .object({
      id: z.uuid(),
      revision: z.string().datetime({ offset: true }),
      confirmation: z.literal("delete"),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      message: "Confirma el contacto que deseas eliminar.",
    };
  try {
    const actor = await requireStaffActor(["admin"]),
      current = await readContactSettings();
    if (
      current.revision !== parsed.data.revision ||
      !current.contacts.entries.some((e) => e.id === parsed.data.id)
    )
      return {
        status: "error",
        message: "El contacto cambió o ya no existe. Actualiza la página.",
      };
    const result = await writeSettings(
      current,
      {
        ...current.contacts,
        entries: current.contacts.entries.filter(
          (e) => e.id !== parsed.data.id,
        ),
      },
      actor.userId,
    );
    return result.status === "success"
      ? { ...result, message: "Contacto eliminado." }
      : result;
  } catch {
    return {
      status: "error",
      message: "No se pudo comprobar el permiso o eliminar el contacto.",
    };
  }
}

export async function saveLocationAction(
  input: unknown,
): Promise<ContactActionResult> {
  const parsed = saveLocationSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      message:
        "Revisa nombre, departamento, dirección, enlace de Google Maps y coordenadas de Guatemala.",
    };
  try {
    const actor = await requireStaffActor(["admin"]);
    const current = await readContactSettings();
    const { revision, id, ...fields } = parsed.data;
    if (current.revision !== revision)
      return {
        status: "error",
        message:
          "La configuración cambió en otra sesión. Actualiza la página antes de guardar.",
      };
    const previous = id
      ? current.contacts.locations.find((item) => item.id === id)
      : null;
    if (id && (!previous || previous.company !== fields.company))
      return {
        status: "error",
        message: "La ubicación cambió o ya no existe. Actualiza la página.",
      };
    const locations = current.contacts.locations.filter(
      (item) => item.id !== id,
    );
    locations.push({ id: id ?? randomUUID(), ...fields });
    const valid = contactsPayloadSchema.safeParse({
      ...current.contacts,
      locations,
    });
    if (!valid.success)
      return {
        status: "error",
        message:
          "La ubicación ya existe o se alcanzó el límite de 100 ubicaciones.",
      };
    const result = await writeSettings(current, valid.data, actor.userId);
    return result.status === "success"
      ? { ...result, message: "Ubicación guardada." }
      : result;
  } catch {
    return {
      status: "error",
      message: "No se pudo comprobar el permiso o guardar la ubicación.",
    };
  }
}

export async function deleteLocationAction(
  input: unknown,
): Promise<ContactActionResult> {
  const parsed = z
    .object({
      id: z.uuid(),
      revision: z.string().datetime({ offset: true }).nullable(),
      confirmation: z.literal("delete"),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      message: "Confirma la ubicación que deseas eliminar.",
    };
  try {
    const actor = await requireStaffActor(["admin"]);
    const current = await readContactSettings();
    if (
      current.revision !== parsed.data.revision ||
      !current.contacts.locations.some((item) => item.id === parsed.data.id)
    )
      return {
        status: "error",
        message: "La ubicación cambió o ya no existe. Actualiza la página.",
      };
    const result = await writeSettings(
      current,
      {
        ...current.contacts,
        locations: current.contacts.locations.filter(
          (item) => item.id !== parsed.data.id,
        ),
      },
      actor.userId,
    );
    return result.status === "success"
      ? { ...result, message: "Ubicación eliminada." }
      : result;
  } catch {
    return {
      status: "error",
      message: "No se pudo comprobar el permiso o eliminar la ubicación.",
    };
  }
}
