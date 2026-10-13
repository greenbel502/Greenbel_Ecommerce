import { NextResponse } from "next/server";
import { getActiveEnvironment } from "@/lib/server/environment";
import { createSupabaseActionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store" };

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

/** These are choices only. review_checkout rechecks every option and price in PostgreSQL. */
export async function GET() {
  try {
    const client = await createSupabaseActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError?.name === "AuthSessionMissingError") {
      return json({ error: "Inicia sesión para revisar la compra." }, 401);
    }
    if (authError) return json({ error: "No pudimos comprobar tu sesión." }, 503);
    if (!auth.user) return json({ error: "Inicia sesión para revisar la compra." }, 401);

    const { data: profile, error: profileError } = await client.from("profiles")
      .select("active,display_name,phone,address_line").eq("id", auth.user.id).maybeSingle();
    if (profileError) return json({ error: "No pudimos verificar tu cuenta." }, 503);
    if (profile?.active !== true) return json({ error: "Esta cuenta no puede comprar." }, 403);

    const [services, zones, rates, payments] = await Promise.all([
      client.from("delivery_services").select("id,name,kind,carrier_name,pickup_details").eq("active", true).order("name"),
      client.from("delivery_zones").select("id,name,department,municipality,zone_detail").eq("active", true).order("name"),
      client.from("service_zone_rates")
        .select("service_id,zone_id,pricing_mode,shipping_fee,shipping_charge_mode")
        .eq("active", true),
      client.from("service_payment_options")
        .select("id,service_id,method,timing").eq("active", true)
    ]);
    if (services.error || zones.error || rates.error || payments.error) {
      return json({ error: "No pudimos consultar las opciones de entrega y pago." }, 503);
    }
    return json({
      environment: getActiveEnvironment().appEnvironment,
      profile: { displayName: profile.display_name ?? "", phone: profile.phone ?? "", addressLine: profile.address_line ?? "", email: auth.user.email ?? "" },
      services: services.data ?? [],
      zones: zones.data ?? [],
      rates: rates.data ?? [],
      paymentOptions: payments.data ?? []
    }, 200);
  } catch {
    return json({ error: "La revisión de compra no está disponible ahora." }, 503);
  }
}
