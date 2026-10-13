"use server";

import { revalidatePath } from "next/cache";
import { customerProfileSchema } from "@/domain/account/profile";
import { CustomerProfileError, requireCustomerProfile } from "@/lib/server/customer-profile";

export type ProfileActionState = { status: "idle" | "error" | "success"; message: string };

export async function saveCustomerProfile(_previous: ProfileActionState, data: FormData): Promise<ProfileActionState> {
  const parsed = customerProfileSchema.safeParse({ displayName: data.get("displayName"), phone: data.get("phone"), addressLine: data.get("addressLine") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Revisa tus datos." };
  try {
    const { client, user, profile } = await requireCustomerProfile();
    if (data.get("version") !== profile.updated_at) return { status: "error", message: "Tus datos cambiaron en otra pestaña. Actualiza la página antes de guardar." };
    const result = await client.from("profiles").update({ display_name: parsed.data.displayName,
      phone: parsed.data.phone || null, address_line: parsed.data.addressLine || null })
      .eq("id", user.id).eq("updated_at", profile.updated_at).select("id");
    if (result.error) return { status: "error", message: "No se guardaron tus datos. Inténtalo de nuevo." };
    if (result.data.length !== 1) return { status: "error", message: "Tus datos cambiaron. Actualiza la página antes de guardar." };
    revalidatePath("/cuenta");
    return { status: "success", message: "Datos guardados. Puedes usarlos al revisar tu próxima compra." };
  } catch (error) {
    return { status: "error", message: error instanceof CustomerProfileError && error.status === 403
      ? "Esta cuenta no está habilitada para modificar sus datos." : "No pudimos comprobar tu sesión. Vuelve a ingresar e inténtalo de nuevo." };
  }
}
