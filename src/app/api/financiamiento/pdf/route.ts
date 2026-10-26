import {
  accessSchema,
  financingState,
  requireFinancingAccount,
} from "@/lib/financing/workflow";
import { financeInput, financingFailure } from "@/lib/financing/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  privateQuotePdfResponse,
  readVerifiedQuotePdf,
} from "@/lib/server/private-quote-pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { user } = await requireFinancingAccount();
    const a = await financeInput(request, accessSchema.strict());
    await financingState(a.id, user.id);
    const { data, error } = await createSupabaseAdminClient()
      .from("financing_requests")
      .select("quote_id")
      .eq("id", a.id)
      .single();
    if (error || !data) throw Error("document_unavailable");
    const pdf = await readVerifiedQuotePdf(data.quote_id);
    return privateQuotePdfResponse(pdf.bytes, pdf.reference);
  } catch (e) {
    return financingFailure(e);
  }
}
