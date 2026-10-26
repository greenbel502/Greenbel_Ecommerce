"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";
import { knowledgeInput } from "@/lib/chatbot/validation";
export type ChatAdminState = {
  status: "idle" | "success" | "error";
  message: string;
};
export async function saveKnowledge(
  _previous: ChatAdminState,
  form: FormData,
): Promise<ChatAdminState> {
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const parsed = knowledgeInput.safeParse({
    id: field("id") || undefined,
    question: field("question"),
    answer: field("answer"),
    category: field("category"),
    keywords: field("keywords"),
    sourcePath: field("sourcePath"),
    sourceNote: field("sourceNote"),
    active: form.get("active") === "on",
    verified: form.get("verified") === "on",
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Revisa los campos obligatorios y sus límites antes de guardar.",
    };
  const expected = field("expected");
  if (
    parsed.data.id &&
    !z.iso.datetime({ offset: true }).safeParse(expected).success
  )
    return {
      status: "error",
      message: "Actualiza la respuesta antes de editarla.",
    };
  try {
    await requireStaffActor(["admin"]);
    const client = await createSupabaseActionClient();
    const { error, data } = await client.rpc("chatbot_admin_save", {
      p_id: parsed.data.id ?? null,
      p_expected: expected || null,
      p_data: parsed.data,
    });
    if (error || !data)
      return {
        status: "error",
        message:
          error?.code === "P4090"
            ? "Otra persona modificó esta respuesta. Cierra y actualiza la vista."
            : "No se pudo guardar la respuesta.",
      };
    revalidatePath("/admin/chatbot");
    return {
      status: "success",
      message:
        "Respuesta guardada. Bell solo utiliza las respuestas activas y verificadas.",
    };
  } catch {
    return {
      status: "error",
      message: "No se pudo comprobar tu permiso para guardar.",
    };
  }
}
export async function chatbotAdminCommand(
  command: "archive" | "reindex" | "prune",
  id?: string,
): Promise<ChatAdminState> {
  if (
    !["archive", "reindex", "prune"].includes(command) ||
    (id && !z.uuid().safeParse(id).success) ||
    (command === "archive" && !id)
  )
    return { status: "error", message: "Acción inválida." };
  try {
    await requireStaffActor(["admin"]);
    const client = await createSupabaseActionClient();
    const name = {
      archive: "chatbot_admin_archive",
      reindex: "chatbot_admin_reindex",
      prune: "chatbot_admin_prune",
    }[command];
    const { data, error } = await client.rpc(
      name,
      command === "prune" ? {} : { p_id: id ?? null },
    );
    if (error || data === false)
      return {
        status: "error",
        message: "No se pudo completar la acción. Actualiza la vista.",
      };
    revalidatePath("/admin/chatbot");
    return {
      status: "success",
      message:
        command === "archive"
          ? "Respuesta retirada de Bell."
          : command === "prune"
            ? `Se eliminaron ${data} conversaciones vencidas.`
            : "Reindexación en cola. Se procesará cuando exista un motor de embeddings configurado; la búsqueda textual sigue disponible.",
    };
  } catch {
    return {
      status: "error",
      message: "No se pudo comprobar tu permiso para esta acción.",
    };
  }
}
