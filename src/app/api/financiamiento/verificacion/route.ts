import { financingJson } from "@/lib/financing/http";
export const dynamic = "force-dynamic";
/** Retired: financing uses the existing Supabase account, never sends an OTP. */
export async function POST() {
  return financingJson(
    {
      error:
        "El código de financiamiento ya no se utiliza. Inicia sesión para continuar.",
    },
    410,
  );
}
