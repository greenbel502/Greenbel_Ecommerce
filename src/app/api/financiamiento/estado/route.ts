import {
  accessSchema,
  financingState,
  requireFinancingAccount,
} from "@/lib/financing/workflow";
import {
  financeInput,
  financingJson,
  financingFailure,
} from "@/lib/financing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { user } = await requireFinancingAccount();
    const a = await financeInput(request, accessSchema.strict());
    return financingJson(await financingState(a.id, user.id));
  } catch (e) {
    return financingFailure(e);
  }
}
