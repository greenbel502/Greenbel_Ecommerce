import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  contactsPayloadSchema,
  EMPTY_CONTACTS,
  publicGreenbelContacts,
  type ContactSettings,
} from "@/lib/contacts/model";
import { publicLocations, type LocationEntry } from "@/lib/contacts/locations";

/** Private CMS draft; public readers expose only selected contact fields and active locations. */
export async function readContactSettings(): Promise<ContactSettings> {
  noStore();
  const { data, error } = await createSupabaseAdminClient()
    .from("site_content")
    .select("payload,updated_at,publication_status")
    .eq("key", "contact")
    .maybeSingle();
  if (error) throw Error("No se pudieron consultar los contactos.");
  if (!data) return { revision: null, contacts: EMPTY_CONTACTS };
  if (data.publication_status !== "draft")
    throw Error(
      "La configuración de contacto requiere revisión administrativa.",
    );
  const parsed = contactsPayloadSchema.safeParse(data.payload);
  if (!parsed.success)
    throw Error("La configuración de contacto no tiene un formato compatible.");
  return { revision: data.updated_at, contacts: parsed.data };
}

export async function readPublicLocations(company: LocationEntry["company"]) {
  try {
    return {
      locations: publicLocations(
        (await readContactSettings()).contacts.locations,
        company,
      ),
      available: true,
    };
  } catch {
    return { locations: [], available: false };
  }
}
export async function readPublicGreenbelContacts() {
  try {
    return {
      ...publicGreenbelContacts((await readContactSettings()).contacts),
      available: true,
    };
  } catch {
    return { whatsappNumber: null, email: null, available: false };
  }
}
