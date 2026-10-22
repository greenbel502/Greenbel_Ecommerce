"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["customer", "operator", "admin"]),
  active: z.enum(["true", "false"]),
  expectedRole: z.enum(["customer", "operator", "admin"]),
  expectedActive: z.enum(["true", "false"]),
});

function value(formData: FormData, name: string): string {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

export type UserActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export async function saveUserAccess(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const parsed = inputSchema.safeParse({
    userId: value(formData, "userId"),
    role: value(formData, "role"),
    active: value(formData, "active"),
    expectedRole: value(formData, "expectedRole"),
    expectedActive: value(formData, "expectedActive"),
  });
  let result = "invalid";
  if (parsed.success) {
    try {
      await requireStaffActor(["admin"]);
      const client = await createSupabaseActionClient();
      const response = await client.rpc("set_user_access", {
        p_user_id: parsed.data.userId,
        p_role: parsed.data.role,
        p_active: parsed.data.active === "true",
        p_expected_role: parsed.data.expectedRole,
        p_expected_active: parsed.data.expectedActive === "true",
      });
      if (!response.error) {
        result = response.data?.changed === false ? "unchanged" : "saved";
        revalidatePath("/admin/usuarios");
      } else if (response.error.message.includes("reload before saving")) {
        result = "stale";
      } else if (response.error.code === "42501") {
        result = "forbidden";
      } else {
        result = "failed";
      }
    } catch (error) {
      result =
        error instanceof StaffAuthorizationError &&
        error.reason !== "unavailable"
          ? "forbidden"
          : "failed";
    }
  }
  const messages: Record<string, string> = {
    saved: "Los cambios se guardaron correctamente.",
    unchanged: "No había cambios que guardar.",
    stale:
      "Otra operación cambió este acceso. Cierra el diálogo y revisa la información actual antes de guardar.",
    forbidden:
      "No se autorizó el cambio. Debes conservar tu propio acceso de administrador.",
    invalid: "Revisa el rol y el estado seleccionados.",
    failed:
      "No se pudo guardar el acceso. Tus cambios siguen aquí para reintentar.",
  };
  return {
    status: result === "saved" || result === "unchanged" ? "success" : "error",
    message: messages[result],
  };
}
