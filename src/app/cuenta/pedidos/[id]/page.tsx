import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { acceptShippingProposal, cancelConfirmedOrder, cancelDraftOrder, requestCancellation } from "../actions";
import {
  caseStatus, customerSession, deliveryStatus, localDate, orderStatus,
  paymentMethod, paymentStatus, quetzales,
  type OrderItemRow, type OrderRow, type PaymentRow,
  type ServiceCaseRow, type ShipmentRow
} from "../data";
import styles from "../orders.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Detalle de pedido", robots: { index: false, follow: false } };

function Unavailable() {
  return (
    <section className={styles.shell} aria-labelledby="detail-title">
      <h1 id="detail-title">Detalle de pedido.</h1>
      <p className={`${styles.feedback} ${styles.error}`} role="alert">
        No pudimos consultar este pedido en este momento. Inténtalo más tarde.
      </p>
      <Link href="/cuenta/pedidos" className="inline-link">Volver a mis pedidos</Link>
    </section>
  );
}

export default async function OrderDetailPage({
  params, searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await customerSession();
  if (session.status === "unauthenticated") redirect("/cuenta/ingresar");
  if (session.status === "unavailable") return <Unavailable />;

  const { data: orderData, error: orderError } = await session.client.from("orders")
    .select("id,reference,stage,currency,customer_total,created_at")
    .eq("id", id).eq("customer_id", session.userId).maybeSingle();
  if (orderError) return <Unavailable />;
  if (!orderData) notFound();
  const order = orderData as OrderRow;

  const [itemsResult, shipmentResult, paymentsResult, casesResult, proposalResult] = await Promise.all([
    session.client.from("order_items")
      .select("id,line_no,sku_snapshot,name_snapshot,quantity,final_unit_price,line_total")
      .eq("order_id", id).order("line_no"),
    session.client.from("shipments")
      .select("id,status,tracking_number,tracking_url,dispatched_at,delivered_at,received_back_at")
      .eq("order_id", id).maybeSingle(),
    session.client.from("payments")
      .select("id,method,status,test_mode,amount,currency,created_at,paid_at")
      .eq("order_id", id).order("created_at", { ascending: false }),
    session.client.from("service_cases")
      .select("id,kind,status,intake_path,reason,created_at")
      .eq("order_id", id).order("created_at", { ascending: false }),
    session.client.from("shipping_proposals")
      .select("id,fee,charge_mode,status,terms_snapshot,revision")
      .eq("order_id", id).in("status", ["offered", "accepted"])
      .order("revision", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (itemsResult.error || shipmentResult.error || paymentsResult.error || casesResult.error || proposalResult.error) {
    return <Unavailable />;
  }
  const items = (itemsResult.data ?? []) as OrderItemRow[];
  const shipment = shipmentResult.data as ShipmentRow | null;
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const cases = (casesResult.data ?? []) as ServiceCaseRow[];
  const proposal = proposalResult.data;
  const activeCancellation = cases.find((entry) => entry.kind === "cancellation"
    && ["requested", "in_review"].includes(entry.status));
  const canCancelDraft = ["draft", "pending_shipping"].includes(order.stage);
  const canCancelConfirmed = order.stage === "confirmed" && !shipment && !activeCancellation
    && !payments.some((payment) => ["test_created", "test_succeeded", "test_review_required"].includes(payment.status));
  const canRequestCancellation = ["confirmed", "completed"].includes(order.stage)
    && !canCancelConfirmed && !activeCancellation;
  const showCancellationAction = canCancelDraft || canCancelConfirmed || canRequestCancellation;
  const actionKey = showCancellationAction ? randomUUID() : null;
  const query = await searchParams;

  return (
    <section className={styles.shell} aria-labelledby="detail-title">
      <nav className={styles.breadcrumbs} aria-label="Migas de pan">
        <Link href="/cuenta">Mi cuenta</Link><span aria-hidden="true">/</span>
        <Link href="/cuenta/pedidos">Pedidos</Link><span aria-hidden="true">/</span>
        <span>{order.reference}</span>
      </nav>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Detalle de pedido</span>
          <h1 id="detail-title">{order.reference}</h1>
          <p>Registrado {localDate(order.created_at) ?? "en fecha pendiente"}. Cada estado se muestra por separado.</p>
        </div>
        <Link href="/cuenta/pedidos" className="secondary-dark-button">Mis pedidos</Link>
      </div>

      {query.error && (
        <p className={`${styles.feedback} ${styles.error}`} role="alert">
          {query.error === "datos"
            ? "Escribe un motivo válido para continuar."
            : query.error === "propuesta"
              ? "No se pudo aceptar la propuesta de transporte. Actualiza el pedido y verifica que siga vigente."
            : "No se pudo completar la acción. El pedido puede haber cambiado; revisa sus estados e inténtalo de nuevo."}
        </p>
      )}
      {order.stage === "cancelled" && (
        <p className={styles.feedback} role="status">Este pedido figura cancelado en el registro.</p>
      )}
      {activeCancellation && (
        <p className={styles.feedback} role="status">
          Hay una solicitud de cancelación {caseStatus(activeCancellation.status).toLowerCase()}.
          El pedido, el pago y la entrega no cambian hasta su revisión.
        </p>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.panel} aria-labelledby="lines-title">
            <h2 id="lines-title">Productos del pedido</h2>
            {items.length === 0 ? <p className={styles.muted}>Aún no hay líneas registradas.</p> : (
              <div className={styles.lines}>
                {items.map((item) => (
                  <div className={styles.line} key={item.id}>
                    <div>
                      <strong>{item.name_snapshot || "Producto del pedido"}</strong>
                      <small>{item.sku_snapshot || "SKU pendiente"} · Cantidad {item.quantity}</small>
                    </div>
                    <div className={styles.lineMoney}>
                      <strong>{quetzales(item.line_total) ?? "Precio próximamente"}</strong>
                      {item.final_unit_price !== null && <small>{quetzales(item.final_unit_price)} por unidad</small>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.totalRow}>
              <span>Total del pedido</span>
              <strong>{quetzales(order.customer_total) ?? "Pendiente de cálculo final"}</strong>
            </div>
            <p className={styles.finePrint}>Los precios de productos, cuando existen, incluyen IVA. El total pendiente no autoriza un cobro.</p>
          </section>

          <section className={styles.panel} aria-labelledby="payment-title">
            <h2 id="payment-title">Pago</h2>
            <p className={styles.muted}>Estos registros corresponden a pruebas. Una prueba aprobada no confirma un cobro real.</p>
            {payments.length === 0 ? <p className={styles.emptyLine}>Sin intentos de pago registrados.</p> : (
              <ul className={styles.events}>
                {payments.map((payment) => (
                  <li key={payment.id}>
                    <div><strong>{payment.test_mode ? paymentStatus(payment.status) : "Registro en revisión"}</strong>
                      <small>{paymentMethod(payment.method)} · {localDate(payment.created_at) ?? "Fecha pendiente"}</small></div>
                    <span>{quetzales(payment.amount) ?? "Importe pendiente"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {order.stage === "pending_shipping" && <section className={styles.panel} aria-labelledby="shipping-quote-title">
            <h2 id="shipping-quote-title">Costo de transporte</h2>
            {!proposal ? <p className={styles.muted}>GreenBel debe preparar una propuesta de transporte antes de continuar. Este pedido aún no reserva inventario ni autoriza cobro.</p>
              : <>
                <p className={styles.muted}>Propuesta #{proposal.revision} · {proposal.status === "accepted" ? "aceptada" : "pendiente de aceptación"}</p>
                <p><strong>{quetzales(proposal.fee) ?? "Costo pendiente"}</strong> de transporte · {proposal.charge_mode === "at_destination" ? "se cobra en destino" : "se cobra con el pedido"}.</p>
                <p className={styles.finePrint}>{proposal.terms_snapshot}</p>
                {proposal.status === "offered" ? <form action={acceptShippingProposal} className={styles.cancelForm}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button type="submit" className="primary-button">Aceptar costo de transporte</button>
                </form> : <Link href={`/checkout?reviewId=${order.id}`} className="primary-button">Revisar precio, stock y total final</Link>}
                <p className={styles.finePrint}>Aceptar el transporte no confirma la compra. Se recalcularán precio y disponibilidad; deberás aceptar el total final antes de reservar.</p>
              </>}
          </section>}

          {cases.length > 0 && (
            <section className={styles.panel} aria-labelledby="cases-title">
              <h2 id="cases-title">Solicitudes y posventa</h2>
              <ul className={styles.events}>
                {cases.map((entry) => (
                  <li key={entry.id}>
                    <div><strong>{entry.kind === "cancellation" ? "Cancelación" : entry.kind === "return" ? "Devolución" : "Garantía"}</strong>
                      <small>{localDate(entry.created_at) ?? "Fecha pendiente"} · {entry.reason}</small></div>
                    <span>{caseStatus(entry.status)}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.finePrint}>Una solicitud de reembolso no significa que el dinero se haya devuelto.</p>
            </section>
          )}
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.panel} aria-labelledby="status-title">
            <h2 id="status-title">Estado actual</h2>
            <dl className={styles.statusStack}>
              <div><dt>Pedido</dt><dd>{orderStatus(order.stage)}</dd></div>
              <div><dt>Entrega</dt><dd>{deliveryStatus(shipment?.status ?? null, order.stage)}</dd></div>
              <div><dt>Último intento de pago</dt><dd>{payments[0]?.test_mode === false
                ? "Registro en revisión" : paymentStatus(payments[0]?.status ?? null)}</dd></div>
            </dl>
            {shipment?.tracking_number && <p className={styles.tracking}>Guía: <strong>{shipment.tracking_number}</strong></p>}
            {shipment?.tracking_url && <a href={shipment.tracking_url} className="inline-link" rel="noopener noreferrer">Consultar seguimiento</a>}
            {shipment?.delivered_at && <p className={styles.finePrint}>Entrega registrada {localDate(shipment.delivered_at)}.</p>}
          </section>

          {showCancellationAction && actionKey && (
            <section className={styles.panel} aria-labelledby="cancel-title">
              <h2 id="cancel-title">{canCancelDraft ? "Cancelar borrador"
                : canCancelConfirmed ? "Cancelar antes de preparación" : "Solicitar cancelación"}</h2>
              <p className={styles.muted}>{canCancelDraft
                ? "Se cancelará solo si no hay preparación, cobro aprobado ni inventario reservado."
                : canCancelConfirmed
                  ? "Se cancelará y liberará la reserva solo si no comenzó la preparación ni existe un intento de pago pendiente o aprobado."
                  : "El equipo revisará la solicitud. Enviarla no cancela el pedido ni confirma un reembolso."}</p>
              <form action={canCancelDraft ? cancelDraftOrder
                : canCancelConfirmed ? cancelConfirmedOrder : requestCancellation} className={styles.cancelForm}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="idempotencyKey" value={actionKey} />
                <label htmlFor="cancel-reason">Motivo</label>
                <textarea id="cancel-reason" name="reason" required minLength={1} maxLength={2000} rows={4} />
                <button type="submit" className="primary-button">
                  {canCancelDraft ? "Cancelar borrador"
                    : canCancelConfirmed ? "Cancelar pedido" : "Registrar solicitud"}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
