import "server-only";

import { createSupabaseReadClient } from "@/lib/supabase/server";

type CustomerClient = Awaited<ReturnType<typeof createSupabaseReadClient>>;

export type OrderRow = {
  id: string;
  reference: string;
  stage: string;
  currency: string | null;
  customer_total: number | string | null;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  line_no: number;
  sku_snapshot: string | null;
  name_snapshot: string | null;
  quantity: number | string;
  final_unit_price: number | string | null;
  line_total: number | string | null;
};

export type ShipmentRow = {
  id: string;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  received_back_at: string | null;
};

export type PaymentRow = {
  id: string;
  method: string;
  status: string;
  test_mode: boolean;
  amount: number | string;
  currency: string;
  created_at: string;
  paid_at: string | null;
};

export type ServiceCaseRow = {
  id: string;
  kind: string;
  status: string;
  intake_path: string;
  reason: string;
  created_at: string;
};

export type CustomerSession =
  | { status: "ready"; client: CustomerClient; userId: string }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export async function customerSession(): Promise<CustomerSession> {
  try {
    const client = await createSupabaseReadClient();
    const { data, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") return { status: "unavailable" };
    if (!data.user) return { status: "unauthenticated" };
    return { status: "ready", client, userId: data.user.id };
  } catch {
    return { status: "unavailable" };
  }
}

export function orderStatus(status: string): string {
  switch (status) {
    case "draft": return "Borrador";
    case "pending_shipping": return "Pendiente de costo de envío";
    case "confirmed": return "Confirmado";
    case "cancelled": return "Cancelado";
    case "completed": return "Completado";
    default: return "Estado en revisión";
  }
}

export function deliveryStatus(status: string | null, orderStage: string): string {
  if (!status) return orderStage === "pending_shipping" ? "Entrega por definir" : "Sin entrega registrada";
  switch (status) {
    case "preparing": return "En preparación";
    case "ready_for_pickup": return "Listo para retiro";
    case "dispatched": return "Despachado";
    case "delivered": return "Entregado";
    case "returned": return "Devuelto";
    case "cancelled": return "Entrega cancelada";
    default: return "Estado en revisión";
  }
}

export function paymentStatus(status: string | null): string {
  if (!status) return "Sin intento registrado";
  switch (status) {
    case "test_created": return "Intento de prueba creado";
    case "test_succeeded": return "Prueba aprobada";
    case "test_failed": return "Prueba fallida";
    case "test_cancelled": return "Prueba cancelada";
    case "test_review_required": return "Prueba requiere revisión";
    default: return "Estado en revisión";
  }
}

export function paymentMethod(method: string): string {
  switch (method) {
    case "online_gateway": return "Pasarela en pruebas";
    case "cash": return "Efectivo";
    case "terminal": return "Terminal";
    case "carrier_cod": return "Cobro por transportadora";
    default: return "Medio en revisión";
  }
}

export function caseStatus(status: string): string {
  switch (status) {
    case "requested": return "Solicitud registrada";
    case "in_review": return "En revisión";
    case "resolved": return "Resuelta";
    case "rejected": return "Rechazada";
    case "closed": return "Cerrada";
    default: return "Estado en revisión";
  }
}

export function quetzales(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount);
}

export function localDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala"
  }).format(date);
}
