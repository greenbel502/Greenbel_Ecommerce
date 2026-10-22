import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  deliveryStatus,
  localDate,
  orderStatus,
  paymentStatus,
} from "@/app/cuenta/pedidos/data";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { SalesNavigation } from "../ventas/components";
import styles from "../ventas/sales.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Envíos externos",
  robots: { index: false, follow: false },
};

type ShipmentRow = {
  id: string;
  order_id: string;
  status: string;
  carrier_snapshot: string;
  tracking_number: string | null;
  tracking_url: string | null;
  cod_amount: number | string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

type OrderRow = { id: string; reference: string; stage: string };
type PaymentRow = {
  order_id: string;
  status: string;
  test_mode: boolean;
  created_at: string;
};
type SettlementRow = {
  id: string;
  shipment_id: string;
  status: string;
  expected_net: number | string;
};
type ReceiptRow = { settlement_id: string; amount: number | string };

function settlementStatus(value: string, expectedNet: number | string): string {
  switch (value) {
    case "settled":
      return Number(expectedNet) === 0
        ? "Sin depósito esperado"
        : "Depósito registrado completo";
    case "partial":
      return "Depósito parcial";
    case "disputed":
      return "Diferencia en revisión";
    default:
      return "Depósito pendiente";
  }
}

export default async function ExternalShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  let actor;
  try {
    actor = await requireStaffActor(["operator", "admin"]);
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "unauthenticated"
    )
      redirect("/cuenta/ingresar");
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "forbidden"
    )
      notFound();
    return (
      <div className={styles.shell}>
        <p className={styles.alert} role="alert">
          No se pudo verificar el acceso a envíos.
        </p>
      </div>
    );
  }

  const state = listState(await searchParams, "", adminLists.shipments);
  try {
    // All reads use the staff session and the table's RLS policies.
    const client = await createSupabaseReadClient();
    const shipmentsResult = await queryAdminList<ShipmentRow>(
      client,
      "shipments",
      "id,order_id,status,carrier_snapshot,tracking_number,tracking_url,cod_amount,dispatched_at,delivered_at,created_at",
      state,
      adminLists.shipments,
    );
    const shipments = (shipmentsResult.data ?? []) as ShipmentRow[];
    const orderIds = shipments.map((shipment) => shipment.order_id);
    const orders = new Map<string, OrderRow>();
    const latestPayments = new Map<string, PaymentRow>();
    const settlementByShipment = new Map<string, SettlementRow>();
    const receivedBySettlement = new Map<string, number>();
    if (orderIds.length > 0) {
      const [orderResult, paymentResult, settlementResult] = await Promise.all([
        client.from("orders").select("id,reference,stage").in("id", orderIds),
        client
          .from("payments")
          .select("order_id,status,test_mode,created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(1000),
        client
          .from("carrier_settlements")
          .select("id,shipment_id,status,expected_net")
          .in(
            "shipment_id",
            shipments.map((shipment) => shipment.id),
          ),
      ]);
      if (
        orderResult.error ||
        paymentResult.error ||
        settlementResult.error ||
        (paymentResult.data?.length ?? 0) === 1000
      )
        throw new Error("Shipment relations unavailable");
      for (const order of (orderResult.data ?? []) as OrderRow[])
        orders.set(order.id, order);
      for (const payment of (paymentResult.data ?? []) as PaymentRow[]) {
        if (!latestPayments.has(payment.order_id))
          latestPayments.set(payment.order_id, payment);
      }
      for (const statement of (settlementResult.data ??
        []) as SettlementRow[]) {
        settlementByShipment.set(statement.shipment_id, statement);
      }
      const statementIds = [...settlementByShipment.values()].map(
        (statement) => statement.id,
      );
      if (statementIds.length > 0) {
        const receiptResult = await client
          .from("settlement_receipts")
          .select("settlement_id,amount")
          .in("settlement_id", statementIds)
          .limit(1000);
        if (receiptResult.error || (receiptResult.data?.length ?? 0) === 1000) {
          throw new Error("Carrier receipts unavailable");
        }
        for (const receipt of (receiptResult.data ?? []) as ReceiptRow[]) {
          receivedBySettlement.set(
            receipt.settlement_id,
            (receivedBySettlement.get(receipt.settlement_id) ?? 0) +
              Number(receipt.amount),
          );
        }
      }
      if (orders.size !== orderIds.length)
        throw new Error("Shipment order visibility mismatch");
    }

    return (
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className="eyebrow">Panel administrativo</span>
            <h1>Envíos externos</h1>
            <p>
              Consulta guía, entrega y último registro de pago de prueba de cada
              pedido. El depósito de la transportadora se concilia por separado.
            </p>
          </div>
          <span className={styles.role}>
            {actor.role === "admin" ? "Administrador" : "Operador"}
          </span>
        </header>
        <SalesNavigation role={actor.role} />
        <p className={styles.notice}>
          Vista de solo lectura. Una entrega o un cobro reportado por la
          transportadora no demuestra que GreenBel haya recibido el depósito.
        </p>
        <section className={styles.section} aria-labelledby="external-heading">
          <div className={styles.sectionHeading}>
            <h2 id="external-heading">Pedidos con transportadora</h2>
            <span>{state.total} registrados</span>
          </div>
          <ListTools
            state={state}
            config={adminLists.shipments}
            path="/admin/envios"
            label="envíos"
          />
          {shipments.length === 0 ? (
            <ListEmpty state={state} path="/admin/envios" noun="envíos" />
          ) : (
            <div className={styles.cards}>
              {shipments.map((shipment) => {
                const order = orders.get(shipment.order_id);
                const payment = latestPayments.get(shipment.order_id);
                const statement = settlementByShipment.get(shipment.id);
                return (
                  <article className={styles.card} key={shipment.id}>
                    <div className={styles.cardTop}>
                      <div>
                        <h3>{order?.reference ?? "Pedido asociado"}</h3>
                        <small>
                          {shipment.carrier_snapshot} ·{" "}
                          {localDate(shipment.created_at) ?? "Fecha pendiente"}
                        </small>
                      </div>
                      <span className={styles.tag}>
                        {deliveryStatus(
                          shipment.status,
                          order?.stage ?? "confirmed",
                        )}
                      </span>
                    </div>
                    <dl className={styles.statusGrid}>
                      <div>
                        <dt>Pedido</dt>
                        <dd>{orderStatus(order?.stage ?? "draft")}</dd>
                      </div>
                      <div>
                        <dt>Último intento de pago</dt>
                        <dd>
                          {payment?.test_mode === false
                            ? "Registro en revisión"
                            : paymentStatus(payment?.status ?? null)}
                        </dd>
                      </div>
                      <div>
                        <dt>Guía</dt>
                        <dd>{shipment.tracking_number ?? "Pendiente"}</dd>
                      </div>
                    </dl>
                    <p className={styles.help}>
                      {statement
                        ? `${settlementStatus(statement.status, statement.expected_net)} · Depósito registrado Q${(receivedBySettlement.get(statement.id) ?? 0).toFixed(2)} de Q${Number(statement.expected_net).toFixed(2)} esperados según reporte de prueba.`
                        : "Sin reporte de recaudación de la transportadora."}
                    </p>
                    <div className={styles.cardFooter}>
                      <span>
                        {shipment.delivered_at
                          ? `Entregado ${localDate(shipment.delivered_at) ?? ""}`
                          : shipment.dispatched_at
                            ? `Despachado ${localDate(shipment.dispatched_at) ?? ""}`
                            : "Sin despacho registrado"}
                      </span>
                      <Link
                        href={`/admin/ventas/${shipment.order_id}`}
                        className="inline-link"
                      >
                        Ver pedido y registros
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <ListPager state={state} path="/admin/envios" label="envíos" />
        </section>
      </div>
    );
  } catch {
    return (
      <div className={styles.shell}>
        <h1>Envíos externos</h1>
        <p className={styles.alert} role="alert">
          No se pudieron consultar los envíos y pedidos. Inténtalo más tarde.
        </p>
      </div>
    );
  }
}
