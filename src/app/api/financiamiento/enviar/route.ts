import { z } from "zod";
import {
  accessSchema,
  deliverFinancing,
  requireFinancingAccount,
} from "@/lib/financing/workflow";
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
    const { user } = await requireFinancingAccount();
    const a = await financeInput(
      request,
      accessSchema.extend({ confirm: z.literal(true) }).strict(),
    );
    return financingJson({
      status: await deliverFinancing({ id: a.id, userId: user.id }),
    });
  } catch (e) {
    return financingFailure(e);
  }
}
