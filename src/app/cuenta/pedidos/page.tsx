import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  customerSession, deliveryStatus, localDate, orderStatus, paymentStatus,
  quetzales, type OrderRow
} from "./data";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis pedidos", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

type OrderShipment = { order_id: string; status: string };
type OrderPayment = { order_id: string; status: string; test_mode: boolean; created_at: string };

function pageNumber(value: string | undefined): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 10000 ? number : 1;
}

function Unavailable() {
  return (
    <section className={styles.shell} aria-labelledby="orders-title">
      <span className="eyebrow">Cuenta GreenBel</span>
      <h1 id="orders-title">Mis pedidos.</h1>
      <p className={styles.feedback} role="alert">No pudimos consultar tus pedidos en este momento. Inténtalo más tarde.</p>
      <Link href="/cuenta" className="inline-link">Volver a mi cuenta</Link>
    </section>
  );
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; error?: string }>;
}) {
  const session = await customerSession();
  if (session.status === "unauthenticated") redirect("/cuenta/ingresar");
  if (session.status === "unavailable") return <Unavailable />;

  const params = await searchParams;
  const currentPage = pageNumber(params.page);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const { data, count, error } = await session.client.from("orders")
    .select("id,reference,stage,currency,customer_total,created_at", { count: "exact" })
    .eq("customer_id", session.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) return <Unavailable />;

  const orders = (data ?? []) as OrderRow[];
  const orderIds = orders.map((order) => order.id);
  let shipmentRows: OrderShipment[] = [];
  let paymentRows: OrderPayment[] = [];
  if (orderIds.length > 0) {
    const [shipments, payments] = await Promise.all([
      session.client.from("shipments")
        .select("order_id,status").in("order_id", orderIds),
      session.client.from("payments")
        .select("order_id,status,test_mode,created_at")
        .in("order_id", orderIds).order("created_at", { ascending: false })
    ]);
    if (shipments.error || payments.error) return <Unavailable />;
    shipmentRows = (shipments.data ?? []) as OrderShipment[];
    paymentRows = (payments.data ?? []) as OrderPayment[];
  }

  const shipmentByOrder = new Map(shipmentRows.map((shipment) => [shipment.order_id, shipment]));
  const latestPaymentByOrder = new Map<string, OrderPayment>();
  for (const payment of paymentRows) {
    if (!latestPaymentByOrder.has(payment.order_id)) latestPaymentByOrder.set(payment.order_id, payment);
  }
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <section className={styles.shell} aria-labelledby="orders-title">
      <nav className={styles.breadcrumbs} aria-label="Migas de pan">
        <Link href="/cuenta">Mi cuenta</Link><span aria-hidden="true">/</span><span>Pedidos</span>
      </nav>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Cuenta GreenBel</span>
          <h1 id="orders-title">Mis pedidos.</h1>
          <p>Consulta por separado el avance del pedido, la entrega y los intentos de pago de prueba.</p>
        </div>
        <Link href="/productos" className="secondary-dark-button">Ver productos</Link>
      </div>

      {params.error === "accion" && (
        <p className={`${styles.feedback} ${styles.error}`} role="alert">
          No se pudo completar esa acción. Comprueba el pedido e inténtalo de nuevo.
        </p>
      )}

      {orders.length === 0 ? (
        <div className={styles.empty}>
          <h2>{currentPage > 1 ? "No hay pedidos en esta página." : "Aún no tienes pedidos registrados."}</h2>
          <p>Prepara tu compra desde el catálogo. Los pedidos confirmados y las solicitudes de costo de envío aparecerán aquí.</p>
          {currentPage > 1 && <Link href="/cuenta/pedidos" className="inline-link">Ir al inicio del historial</Link>}
        </div>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => {
            const shipment = shipmentByOrder.get(order.id);
            const payment = latestPaymentByOrder.get(order.id);
            return (
              <article className={styles.orderCard} key={order.id}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.reference}>{order.reference}</span>
                    <span className={styles.date}>{localDate(order.created_at) ?? "Fecha pendiente"}</span>
                  </div>
                  <strong>{quetzales(order.customer_total) ?? "Total pendiente"}</strong>
                </div>
                <dl className={styles.statusGrid}>
                  <div><dt>Pedido</dt><dd>{orderStatus(order.stage)}</dd></div>
                  <div><dt>Entrega</dt><dd>{deliveryStatus(shipment?.status ?? null, order.stage)}</dd></div>
                  <div><dt>Último intento de pago</dt><dd>{payment?.test_mode === false
                    ? "Registro en revisión"
                    : paymentStatus(payment?.status ?? null)}</dd></div>
                </dl>
                <div className={styles.cardFoot}>
                  <small>Los pagos mostrados son registros de prueba; no confirman un cobro real.</small>
                  <Link href={`/cuenta/pedidos/${order.id}`} className="inline-link">Ver detalle</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Páginas de pedidos">
          {currentPage > 1 ? <Link href={`/cuenta/pedidos?page=${currentPage - 1}`}>Anterior</Link> : <span />}
          <span>Página {Math.min(currentPage, totalPages)} de {totalPages}</span>
          {currentPage < totalPages && <Link href={`/cuenta/pedidos?page=${currentPage + 1}`}>Siguiente</Link>}
        </nav>
      )}
    </section>
  );
}
