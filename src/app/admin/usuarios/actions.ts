"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["customer", "operator", "admin"]),
  active: z.enum(["true", "false"]),
  expectedRole: z.enum(["customer", "operator", "admin"]),
  expectedActive: z.enum(["true", "false"]),
  page: z.coerce.number().int().min(1).max(10000)
});

function value(formData: FormData, name: string): string {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

export async function saveUserAccess(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    userId: value(formData, "userId"), role: value(formData, "role"),
    active: value(formData, "active"), expectedRole: value(formData, "expectedRole"),
    expectedActive: value(formData, "expectedActive"), page: value(formData, "page")
  });
  const page = parsed.success ? parsed.data.page : 1;
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
        p_expected_active: parsed.data.expectedActive === "true"
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
      result = error instanceof StaffAuthorizationError && error.reason !== "unavailable"
        ? "forbidden" : "failed";
    }
  }
  redirect(`/admin/usuarios?page=${page}&result=${result}`);
}
