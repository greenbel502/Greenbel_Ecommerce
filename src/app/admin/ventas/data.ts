export type SalesOrder = {
  id: string;
  reference: string;
  stage: string;
  customer_total: number | string | null;
  amount_due_greenbel?: number | string | null;
  delivery_snapshot?: Record<string, unknown> | null;
  payment_method_snapshot?: Record<string, unknown> | null;
  checkout_intent?: Record<string, unknown> | null;
  created_at: string;
};

export type SalesShipment = {
  id: string;
  order_id: string;
  status: string;
  carrier_snapshot: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  received_back_at: string | null;
};

export type SalesPayment = {
  id: string;
  order_id: string;
  method: string;
  test_mode: boolean;
  status: string;
  amount: number | string;
  currency: string;
  paid_at: string | null;
  created_at: string;
};

export type SalesCase = {
  id: string;
  order_id: string;
  kind: string;
  status: string;
  intake_path: string;
  reason: string;
  resolution: string | null;
  created_at: string;
};

export type SalesRefund = {
  id: string;
  case_id: string;
  payment_id: string | null;
  requested_amount: number | string | null;
  currency: string;
  status: string;
  reason: string;
  resolution: string | null;
  created_at: string;
};

export type SalesOrderItem = {
  id: string;
  line_no: number;
  name_snapshot: string | null;
  sku_snapshot: string | null;
  quantity: number | string;
  line_total: number | string | null;
};

export type SalesCaseItem = {
  id: string;
  case_id: string;
  order_item_id: string;
  quantity: number | string;
  inspection_result: string | null;
  received_at: string | null;
  restocked_quantity: number | string;
};

export function pageNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : 1;
}

export function caseKind(kind: string): string {
  switch (kind) {
    case "cancellation": return "Cancelación";
    case "return": return "Devolución";
    case "warranty": return "Garantía";
    default: return "Caso en revisión";
  }
}

export function refundStatus(status: string): string {
  switch (status) {
    case "requested": return "Solicitud registrada";
    case "in_review": return "En revisión";
    case "rejected": return "Rechazada";
    default: return "Estado en revisión";
  }
}

export function inspectionStatus(status: string | null): string {
  switch (status) {
    case "pending": return "Inspección pendiente";
    case "accepted": return "Inspección aceptada";
    case "rejected": return "Inspección rechazada";
    default: return "Sin inspección registrada";
  }
}
