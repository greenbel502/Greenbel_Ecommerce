import { z } from "zod";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { deliverFinancing } from "@/lib/financing/workflow";
import {
  financeInput,
  financingJson,
  financingFailure,
} from "@/lib/financing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const actor = await requireStaffActor(["admin"]);
    const a = await financeInput(
      request,
      z.object({ id: z.uuid(), confirm: z.literal(true) }).strict(),
    );
    return financingJson({
      status: await deliverFinancing({ id: a.id, actorId: actor.userId }),
    });
  } catch (e) {
    if (e instanceof StaffAuthorizationError)
      return financingJson({ error: "Acceso administrativo requerido." }, 403);
    return financingFailure(e);
  }
}
