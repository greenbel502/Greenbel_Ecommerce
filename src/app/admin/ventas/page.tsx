import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  caseStatus, deliveryStatus, localDate, orderStatus, paymentStatus, quetzales
} from "@/app/cuenta/pedidos/data";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { SalesNavigation, SalesUnavailable } from "./components";
import { caseKind, pageNumber, type SalesCase, type SalesOrder, type SalesPayment, type SalesShipment } from "./data";
import styles from "./sales.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ventas y posventa", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;
const RECENT_CASES = 20;

export default async function SalesAdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  let actor;
  try {
    actor = await requireStaffActor(["operator", "admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <SalesUnavailable />;
  }

  const currentPage = pageNumber((await searchParams).page);
  const offset = (currentPage - 1) * PAGE_SIZE;
  try {
    // Both reads use the current Auth session. PostgreSQL RLS is a second staff check.
    const client = await createSupabaseReadClient();
    const [ordersResult, casesResult] = await Promise.all([
      client.from("orders")
        .select("id,reference,stage,customer_total,created_at", { count: "exact" })
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
      client.from("service_cases")
        .select("id,order_id,kind,status,intake_path,reason,resolution,created_at")
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .limit(RECENT_CASES)
    ]);
    if (ordersResult.error || casesResult.error) throw new Error("Sales read unavailable");
    const orders = (ordersResult.data ?? []) as SalesOrder[];
    const cases = (casesResult.data ?? []) as SalesCase[];
    const orderIds = orders.map((order) => order.id);
    const caseOrderIds = [...new Set(cases.map((entry) => entry.order_id))];

    let shipments: SalesShipment[] = [];
    const latestPayments = new Map<string, SalesPayment>();
    if (orderIds.length > 0) {
      const [shipmentResult, ...paymentResults] = await Promise.all([
        client.from("shipments")
          .select("id,order_id,status,carrier_snapshot,tracking_number,tracking_url,dispatched_at,delivered_at,received_back_at")
          .in("order_id", orderIds),
        ...orderIds.map((id) => client.from("payments")
          .select("id,order_id,method,test_mode,status,amount,currency,paid_at,created_at")
          .eq("order_id", id).order("created_at", { ascending: false }).order("id", { ascending: false })
          .limit(1).maybeSingle())
      ]);
      if (shipmentResult.error || paymentResults.some((result) => result.error)) throw new Error("Related sales read unavailable");
      shipments = (shipmentResult.data ?? []) as SalesShipment[];
      for (const result of paymentResults) {
        if (result.data) {
          const payment = result.data as SalesPayment;
          latestPayments.set(payment.order_id, payment);
        }
      }
    }

    const caseReferences = new Map(orders.map((order) => [order.id, order.reference]));
    const missingCaseOrderIds = caseOrderIds.filter((id) => !caseReferences.has(id));
    if (missingCaseOrderIds.length > 0) {
      const referencesResult = await client.from("orders").select("id,reference").in("id", missingCaseOrderIds);
      if (referencesResult.error) throw new Error("Case references unavailable");
      for (const row of referencesResult.data ?? []) caseReferences.set(row.id, row.reference);
    }

    const shipmentByOrder = new Map(shipments.map((shipment) => [shipment.order_id, shipment]));
    const totalPages = Math.max(1, Math.ceil((ordersResult.count ?? 0) / PAGE_SIZE));

    return (
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div><span className="eyebrow">Panel administrativo</span><h1>Ventas y posventa</h1>
            <p>Consulta cada pedido, entrega y registro de pago de prueba con estados independientes.</p></div>
          <span className={styles.role}>{actor.role === "admin" ? "Administrador" : "Operador"}</span>
        </header>
        <SalesNavigation role={actor.role} />
        <p className={styles.notice}>Esta lista es de consulta; las operaciones se registran en el detalle. Los pagos de PRUEBA DEV no representan cobros reales.</p>
        <div className={styles.sectionLinks}><a href="#pedidos">Pedidos</a><a href="#casos">Casos posventa</a></div>

        <section id="pedidos" className={styles.section} aria-labelledby="orders-heading">
          <div className={styles.sectionHeading}><h2 id="orders-heading">Pedidos</h2><span>{ordersResult.count ?? 0} registrados</span></div>
          {orders.length === 0 ? (
            <div className={styles.empty}>
              <p>{currentPage > 1 ? "No hay pedidos en esta página." : "Aún no hay pedidos registrados."}</p>
              {currentPage > 1 && <Link href="/admin/ventas" className="inline-link">Ir a la primera página</Link>}
            </div>
          ) : <div className={styles.cards}>{orders.map((order) => {
            const shipment = shipmentByOrder.get(order.id);
            const payment = latestPayments.get(order.id);
            return <article className={styles.card} key={order.id}>
              <div className={styles.cardTop}><div><h3>{order.reference}</h3><small>{localDate(order.created_at) ?? "Fecha pendiente"}</small></div>
                <strong>{quetzales(order.customer_total) ?? "Total pendiente"}</strong></div>
              <dl className={styles.statusGrid}>
                <div><dt>Pedido</dt><dd>{orderStatus(order.stage)}</dd></div>
                <div><dt>Entrega</dt><dd>{deliveryStatus(shipment?.status ?? null, order.stage)}</dd></div>
                <div><dt>Último intento de pago</dt><dd>{payment?.test_mode === false
                  ? "Registro en revisión" : paymentStatus(payment?.status ?? null)}</dd></div>
              </dl>
              <div className={styles.cardFooter}>
                <span>{shipment?.tracking_number ? `Guía ${shipment.tracking_number}` : "Sin guía registrada"}</span>
                <Link href={`/admin/ventas/${order.id}`} className="inline-link">Ver pedido y registros</Link>
              </div>
            </article>;
          })}</div>}
          {totalPages > 1 && <nav className={styles.pager} aria-label="Páginas de ventas">
            {currentPage > 1 ? <Link href={`/admin/ventas?page=${currentPage - 1}`}>Anterior</Link> : <span />}
            <span>Página {Math.min(currentPage, totalPages)} de {totalPages}</span>
            {currentPage < totalPages ? <Link href={`/admin/ventas?page=${currentPage + 1}`}>Siguiente</Link> : <span />}
          </nav>}
        </section>

        <section id="casos" className={styles.section} aria-labelledby="cases-heading">
          <div className={styles.sectionHeading}><h2 id="cases-heading">Casos posventa recientes</h2><span>Últimos {RECENT_CASES} como máximo</span></div>
          <p className={styles.help}>Las solicitudes de cancelación, devolución y garantía se muestran sin cambiar el pedido ni aprobar reembolsos. Los registros de reembolso solo son visibles para administración en el detalle.</p>
          {cases.length === 0 ? <div className={styles.empty}><p>Sin casos registrados.</p></div> :
            <div className={styles.cards}>{cases.map((entry) => <article className={styles.card} key={entry.id}>
              <div className={styles.cardTop}><div><h3>{caseKind(entry.kind)}</h3><small>{localDate(entry.created_at) ?? "Fecha pendiente"}</small></div><span className={styles.tag}>{caseStatus(entry.status)}</span></div>
              <p className={styles.reason}>{entry.reason}</p>
              <div className={styles.cardFooter}><span>{caseReferences.get(entry.order_id) ?? "Pedido asociado"}</span>
                <Link href={`/admin/ventas/${entry.order_id}`} className="inline-link">Ver pedido y caso</Link></div>
            </article>)}</div>}
        </section>
      </main>
    );
  } catch {
    return <SalesUnavailable />;
  }
}
