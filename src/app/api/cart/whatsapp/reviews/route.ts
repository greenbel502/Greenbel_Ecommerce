import { NextResponse } from "next/server";
import {
  CustomerProfileError,
  requireCustomerProfile,
} from "@/lib/server/customer-profile";
import {
  isAllowedSubmissionOrigin,
  readLimitedBody,
} from "@/lib/server/public-submission";
import { whatsAppReviewInput } from "@/lib/reviews/validation";

export const runtime = "nodejs",
  dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers });
export async function POST(request: Request) {
  if (!isAllowedSubmissionOrigin(request))
    return fail("Origen no permitido.", 403);
  try {
    const { client } = await requireCustomerProfile();
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return fail("Formato de solicitud inválido.", 415);
    let input: unknown;
    try {
      const raw = await readLimitedBody(request, 16384);
      if (raw === null)
        return fail("La reseña excede el tamaño permitido.", 413);
      input = JSON.parse(raw);
    } catch {
      return fail("No se pudo leer tu reseña.", 400);
    }
    const parsed = whatsAppReviewInput.safeParse(input);
    if (!parsed.success)
      return fail(
        "Selecciona de 1 a 5 estrellas y escribe un comentario de hasta 3,000 caracteres.",
        400,
      );
    const { data, error } = await client.rpc("submit_whatsapp_review", {
      p_invitation_id: parsed.data.invitationId,
      p_rating: parsed.data.rating,
      p_comment: parsed.data.comment,
    });
    if (error) {
      if (error.code === "42501")
        return fail("No se encontró esta selección en tu cuenta.", 403);
      if (error.code === "P4090")
        return fail("Esta selección ya tiene una reseña registrada.", 409);
      if (error.code === "P4290")
        return fail(
          "Has enviado varias reseñas. Espera unos minutos antes de continuar.",
          429,
        );
      return fail(
        "Las reseñas no están disponibles en este momento. Tu solicitud por WhatsApp no se ha modificado.",
        503,
      );
    }
    if (typeof data !== "string")
      return fail("No pudimos confirmar el guardado. Inténtalo de nuevo.", 503);
    return NextResponse.json({ status: "saved", id: data }, { headers });
  } catch (e) {
    if (e instanceof CustomerProfileError)
      return fail(
        e.status === 401
          ? "Inicia sesión para compartir tu reseña."
          : "No pudimos verificar tu cuenta.",
        e.status,
      );
    return fail("No pudimos guardar tu reseña. Inténtalo de nuevo.", 503);
  }
}
