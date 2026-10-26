import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  caseStatus,
  deliveryStatus,
  localDate,
  orderStatus,
  paymentStatus,
  quetzales,
} from "@/app/cuenta/pedidos/data";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { SalesNavigation, SalesUnavailable } from "./components";
import {
  caseKind,
  type SalesCase,
  type SalesOrder,
  type SalesPayment,
  type SalesShipment,
} from "./data";
import styles from "./sales.module.css";
import { getPausedAdminModule } from "@/lib/admin-module-status";
import { PausedModule } from "../_components/paused-module";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ventas y posventa",
  robots: { index: false, follow: false },
};

export default async function SalesAdminPage({
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
    return <SalesUnavailable />;
  }

  if (getPausedAdminModule("/admin/ventas"))
    return <PausedModule module="ventas" />;

  const params = await searchParams;
  const state = listState(params, "", adminLists.orders);
  const caseState = listState(params, "case_", adminLists.cases);
  try {
    // Both reads use the current Auth session. PostgreSQL RLS is a second staff check.
    const client = await createSupabaseReadClient();
    const [ordersResult, casesResult] = await Promise.all([
      queryAdminList<SalesOrder>(
        client,
        "orders",
        "id,reference,stage,customer_total,created_at",
        state,
        adminLists.orders,
      ),
      queryAdminList<SalesCase>(
        client,
        "service_cases",
        "id,order_id,kind,status,intake_path,reason,resolution,created_at",
        caseState,
        adminLists.cases,
      ),
    ]);
    const orders = (ordersResult.data ?? []) as SalesOrder[];
    const cases = (casesResult.data ?? []) as SalesCase[];
    const orderIds = orders.map((order) => order.id);
    const caseOrderIds = [...new Set(cases.map((entry) => entry.order_id))];

    let shipments: SalesShipment[] = [];
    const latestPayments = new Map<string, SalesPayment>();
    if (orderIds.length > 0) {
      const [shipmentResult, ...paymentResults] = await Promise.all([
        client
          .from("shipments")
          .select(
            "id,order_id,status,carrier_snapshot,tracking_number,tracking_url,dispatched_at,delivered_at,received_back_at",
          )
          .in("order_id", orderIds),
        ...orderIds.map((id) =>
          client
            .from("payments")
            .select(
              "id,order_id,method,test_mode,status,amount,currency,paid_at,created_at",
            )
            .eq("order_id", id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      ]);
      if (shipmentResult.error || paymentResults.some((result) => result.error))
        throw new Error("Related sales read unavailable");
      shipments = (shipmentResult.data ?? []) as SalesShipment[];
      for (const result of paymentResults) {
        if (result.data) {
          const payment = result.data as SalesPayment;
          latestPayments.set(payment.order_id, payment);
        }
      }
    }

    const caseReferences = new Map(
      orders.map((order) => [order.id, order.reference]),
    );
    const missingCaseOrderIds = caseOrderIds.filter(
      (id) => !caseReferences.has(id),
    );
    if (missingCaseOrderIds.length > 0) {
      const referencesResult = await client
        .from("orders")
        .select("id,reference")
        .in("id", missingCaseOrderIds);
      if (referencesResult.error)
        throw new Error("Case references unavailable");
      for (const row of referencesResult.data ?? [])
        caseReferences.set(row.id, row.reference);
    }

    const shipmentByOrder = new Map(
      shipments.map((shipment) => [shipment.order_id, shipment]),
    );

    return (
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <span className="eyebrow">Panel administrativo</span>
            <h1>Ventas y posventa</h1>
            <p>
              Consulta cada pedido, entrega y registro de pago de prueba con
              estados independientes.
            </p>
          </div>
          <span className={styles.role}>
            {actor.role === "admin" ? "Administrador" : "Operador"}
          </span>
        </header>
        <SalesNavigation role={actor.role} />
        <p className={styles.notice}>
          Esta lista es de consulta; las operaciones se registran en el detalle.
          Los pagos de PRUEBA DEV no representan cobros reales.
        </p>
        <div className={styles.sectionLinks}>
          <a href="#pedidos">Pedidos</a>
          <a href="#casos">Casos posventa</a>
        </div>

        <section
          id="pedidos"
          className={styles.section}
          aria-labelledby="orders-heading"
        >
          <div className={styles.sectionHeading}>
            <h2 id="orders-heading">Pedidos</h2>
            <span>{state.total} registrados</span>
          </div>
          <ListTools
            state={state}
            config={adminLists.orders}
            path="/admin/ventas"
            label="pedidos"
          />
          {orders.length === 0 ? (
            <ListEmpty state={state} path="/admin/ventas" noun="pedidos" />
          ) : (
            <div
              className="admin-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Tabla de registros, desplazamiento horizontal"
            >
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Fecha</th>
                    <th>Total</th>
                    <th>Pedido</th>
                    <th>Entrega</th>
                    <th>Pago</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const shipment = shipmentByOrder.get(order.id),
                      payment = latestPayments.get(order.id);
                    return (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.reference}</strong>
                          <small>
                            {shipment?.tracking_number || "Sin guía"}
                          </small>
                        </td>
                        <td>{localDate(order.created_at)}</td>
                        <td>
                          {quetzales(order.customer_total) || "Pendiente"}
                        </td>
                        <td>
                          <span className="admin-tag">
                            {orderStatus(order.stage)}
                          </span>
                        </td>
                        <td>
                          {deliveryStatus(
                            shipment?.status ?? null,
                            order.stage,
                          )}
                        </td>
                        <td>
                          {payment?.test_mode === false
                            ? "En revisión"
                            : paymentStatus(payment?.status ?? null)}
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <Link href={`/admin/ventas/${order.id}`}>
                              Ver pedido
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ListPager state={state} path="/admin/ventas" label="pedidos" />
        </section>

        <section
          id="casos"
          className={styles.section}
          aria-labelledby="cases-heading"
        >
          <div className={styles.sectionHeading}>
            <h2 id="cases-heading">Casos posventa</h2>
            <span>{caseState.total} registrados</span>
          </div>
          <p className={styles.help}>
            Las solicitudes de cancelación, devolución y garantía se muestran
            sin cambiar el pedido ni aprobar reembolsos. Los registros de
            reembolso solo son visibles para administración en el detalle.
          </p>
          <ListTools
            state={caseState}
            config={adminLists.cases}
            path="/admin/ventas"
            label="casos"
          />
          {cases.length === 0 ? (
            <ListEmpty state={caseState} path="/admin/ventas" noun="casos" />
          ) : (
            <div className={styles.cards}>
              {cases.map((entry) => (
                <article className={styles.card} key={entry.id}>
                  <div className={styles.cardTop}>
                    <div>
                      <h3>{caseKind(entry.kind)}</h3>
                      <small>
                        {localDate(entry.created_at) ?? "Fecha pendiente"}
                      </small>
                    </div>
                    <span className={styles.tag}>
                      {caseStatus(entry.status)}
                    </span>
                  </div>
                  <p className={styles.reason}>{entry.reason}</p>
                  <div className={styles.cardFooter}>
                    <span>
                      {caseReferences.get(entry.order_id) ?? "Pedido asociado"}
                    </span>
                    <Link
                      href={`/admin/ventas/${entry.order_id}`}
                      className="inline-link"
                    >
                      Ver pedido y caso
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          <ListPager state={caseState} path="/admin/ventas" label="casos" />
        </section>
      </div>
    );
  } catch {
    return <SalesUnavailable />;
  }
}
