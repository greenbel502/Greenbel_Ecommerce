import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { queryAdminList } from "@/lib/server/admin-list-query";
import {
  ListTools,
  ListPager,
  ListEmpty,
} from "../../_components/list-controls";
import { ManagedForm } from "../../_components/managed-form";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  caseStatus,
  deliveryStatus,
  localDate,
  orderStatus,
  paymentMethod,
  paymentStatus,
  quetzales,
} from "@/app/cuenta/pedidos/data";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { registerManualCase, registerRefundRequest } from "../actions";
import { SalesNavigation, SalesUnavailable } from "../components";
import {
  StaffOperations,
  type StaffProposal,
  type StaffReceipt,
  type StaffStatement,
} from "../staff-forms";
import {
  caseKind,
  inspectionStatus,
  refundStatus,
  type SalesCase,
  type SalesCaseItem,
  type SalesOrder,
  type SalesOrderItem,
  type SalesPayment,
  type SalesRefund,
  type SalesShipment,
} from "../data";
import styles from "../sales.module.css";
import { getPausedAdminModule } from "@/lib/admin-module-status";
import { PausedModule } from "../../_components/paused-module";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Detalle de venta",
  robots: { index: false, follow: false },
};

const missingOrder = Symbol("missing-order");

export default async function SalesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<AdminParams>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

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
    return <SalesUnavailable detail />;
  }

  if (getPausedAdminModule("/admin/ventas"))
    return <PausedModule module="ventas" />;

  const inputParams = await searchParams;
  const query = Object.fromEntries(
    Object.entries(inputParams).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const paymentConfig = {
    ...adminLists.payments,
    fixed: [["order_id", id]] as [string, string][],
  };
  const caseConfig = {
    ...adminLists.cases,
    fixed: [["order_id", id]] as [string, string][],
  };
  const paymentState = listState(query, "pay_", paymentConfig),
    caseState = listState(query, "case_", caseConfig);
  try {
    const client = await createSupabaseReadClient();
    const { data: orderData, error: orderError } = await client
      .from("orders")
      .select(
        "id,reference,stage,customer_total,amount_due_greenbel,delivery_snapshot,payment_method_snapshot,checkout_intent,created_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (orderError) throw new Error("Order read unavailable");
    if (!orderData) throw missingOrder;
    const order = orderData as SalesOrder;

    const [
      itemsResult,
      shipmentResult,
      paymentsResult,
      latestPaymentResult,
      successfulPaymentsResult,
      reviewRequiredResult,
      proposalResult,
      casesResult,
    ] = await Promise.all([
      client
        .from("order_items")
        .select("id,line_no,name_snapshot,sku_snapshot,quantity,line_total", {
          count: "exact",
        })
        .eq("order_id", id)
        .order("line_no")
        .limit(1000),
      client
        .from("shipments")
        .select(
          "id,order_id,status,carrier_snapshot,tracking_number,tracking_url,dispatched_at,delivered_at,received_back_at",
        )
        .eq("order_id", id)
        .maybeSingle(),
      queryAdminList<SalesPayment>(
        client,
        "payments",
        "id,order_id,method,test_mode,status,amount,currency,paid_at,created_at",
        paymentState,
        paymentConfig,
      ),
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
      client
        .from("payments")
        .select("method,amount")
        .eq("order_id", id)
        .eq("test_mode", true)
        .eq("status", "test_succeeded")
        .limit(10),
      client
        .from("payments")
        .select("id")
        .eq("order_id", id)
        .eq("method", "online_gateway")
        .eq("test_mode", true)
        .eq("status", "test_review_required")
        .limit(1),
      client
        .from("shipping_proposals")
        .select("id,revision,fee,charge_mode,status,terms_snapshot")
        .eq("order_id", id)
        .in("status", ["offered", "accepted"])
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
      queryAdminList<SalesCase>(
        client,
        "service_cases",
        "id,order_id,kind,status,intake_path,reason,resolution,created_at",
        caseState,
        caseConfig,
      ),
    ]);
    if (
      itemsResult.error ||
      shipmentResult.error ||
      latestPaymentResult.error ||
      successfulPaymentsResult.error ||
      reviewRequiredResult.error ||
      proposalResult.error
    ) {
      throw new Error("Related sales read unavailable");
    }
    const items = (itemsResult.data ?? []) as SalesOrderItem[];
    const shipment = shipmentResult.data as SalesShipment | null;
    const payments = (paymentsResult.data ?? []) as SalesPayment[];
    const latestPayment = latestPaymentResult.data as SalesPayment | null;
    const proposal = proposalResult.data as StaffProposal | null;
    const cases = (casesResult.data ?? []) as SalesCase[];
    const caseIds = cases.map((entry) => entry.id);

    let statement: StaffStatement | null = null;
    let receipts: StaffReceipt[] = [];
    if (shipment) {
      const statementResult = await client
        .from("carrier_settlements")
        .select("id,gross_collected,expected_net,status")
        .eq("shipment_id", shipment.id)
        .maybeSingle();
      if (statementResult.error)
        throw new Error("Carrier statement read unavailable");
      statement = statementResult.data as StaffStatement | null;
      if (statement) {
        const receiptResult = await client
          .from("settlement_receipts")
          .select("id,amount,received_at")
          .eq("settlement_id", statement.id)
          .order("received_at", { ascending: false })
          .limit(1000);
        if (receiptResult.error)
          throw new Error("Carrier receipt read unavailable");
        receipts = (receiptResult.data ?? []) as StaffReceipt[];
      }
    }
    const delivery = order.delivery_snapshot;
    const payment = order.payment_method_snapshot;
    const kind = typeof delivery?.kind === "string" ? delivery.kind : null;
    const method = typeof payment?.method === "string" ? payment.method : null;
    const chargeMode =
      typeof order.checkout_intent?.delivery === "object" &&
      order.checkout_intent.delivery !== null &&
      "chargeMode" in order.checkout_intent.delivery &&
      typeof order.checkout_intent.delivery.chargeMode === "string"
        ? order.checkout_intent.delivery.chargeMode
        : null;
    const expectedPaidAmount =
      method === "carrier_cod"
        ? order.customer_total
        : order.amount_due_greenbel;
    const paymentSucceeded =
      expectedPaidAmount !== null &&
      expectedPaidAmount !== undefined &&
      (successfulPaymentsResult.data ?? []).some(
        (row) =>
          row.method === method &&
          Number(row.amount) === Number(expectedPaidAmount),
      );
    const paymentNeedsReview =
      method === "online_gateway" &&
      (reviewRequiredResult.data?.length ?? 0) > 0;

    let caseItems: SalesCaseItem[] = [];
    let caseItemCount = 0;
    let refunds: SalesRefund[] = [];
    let refundCount = 0;
    if (caseIds.length > 0) {
      const [caseItemsResult, refundResult] = await Promise.all([
        client
          .from("service_case_items")
          .select(
            "id,case_id,order_item_id,quantity,inspection_result,received_at,restocked_quantity",
            { count: "exact" },
          )
          .in("case_id", caseIds)
          .limit(1000),
        // Operators cannot read refunds under RLS, and do not request them here.
        actor.role === "admin"
          ? client
              .from("refunds")
              .select(
                "id,case_id,payment_id,requested_amount,currency,status,reason,resolution,created_at",
                { count: "exact" },
              )
              .in("case_id", caseIds)
              .order("created_at", { ascending: false })
              .limit(1000)
          : Promise.resolve(null),
      ]);
      if (caseItemsResult.error || refundResult?.error)
        throw new Error("After-sales read unavailable");
      caseItems = (caseItemsResult.data ?? []) as SalesCaseItem[];
      caseItemCount = caseItemsResult.count ?? 0;
      refunds = (refundResult?.data ?? []) as SalesRefund[];
      refundCount = refundResult?.count ?? 0;
    }

    const itemById = new Map(items.map((item) => [item.id, item]));
    const caseItemsByCase = new Map<string, SalesCaseItem[]>();
    for (const line of caseItems) {
      const existing = caseItemsByCase.get(line.case_id) ?? [];
      existing.push(line);
      caseItemsByCase.set(line.case_id, existing);
    }
    const refundsByCase = new Map<string, SalesRefund[]>();
    for (const refund of refunds) {
      const existing = refundsByCase.get(refund.case_id) ?? [];
      existing.push(refund);
      refundsByCase.set(refund.case_id, existing);
    }
    const confirmedPurchase =
      order.stage === "confirmed" || order.stage === "completed";
    const canRecordReturn =
      confirmedPurchase &&
      !!shipment &&
      ["dispatched", "delivered", "returned"].includes(shipment.status) &&
      (shipment.dispatched_at !== null || shipment.delivered_at !== null);
    const canRecordWarranty =
      confirmedPurchase &&
      !!shipment &&
      ["delivered", "returned"].includes(shipment.status) &&
      shipment.delivered_at !== null;
    const canRecordCase =
      items.length > 0 && (canRecordReturn || canRecordWarranty);
    const actionKey = canRecordCase
      ? z.uuid().safeParse(query.retryKey).success
        ? query.retryKey!
        : randomUUID()
      : null;

    return (
      <div className={styles.shell}>
        <nav className={styles.breadcrumbs} aria-label="Migas de pan">
          <Link href="/admin/ventas">Ventas y posventa</Link>
          <span aria-hidden="true">/</span>
          <span>{order.reference}</span>
        </nav>
        <header className={styles.hero}>
          <div>
            <span className="eyebrow">Detalle de venta</span>
            <h1>{order.reference}</h1>
            <p>
              Registrado {localDate(order.created_at) ?? "en fecha pendiente"}.
              Consulta estados y registra un contacto posventa cuando
              corresponda.
            </p>
          </div>
          <Link href="/admin/ventas" className="secondary-dark-button">
            Volver al listado
          </Link>
        </header>
        <SalesNavigation role={actor.role} />
        <p className={styles.notice}>
          Los pagos son registros de prueba. Las solicitudes posventa y de
          reembolso no cambian por sí mismas el estado del pedido, la entrega,
          el inventario ni el dinero.
        </p>
        {query.caseResult === "registered" && (
          <p className={styles.notice} role="status">
            Caso registrado para revisión. No se aprobó una devolución o
            garantía, ni se reembolsó dinero ni se reincorporó inventario.
          </p>
        )}
        {query.caseResult === "invalid" && (
          <p className={styles.alert} role="alert">
            Selecciona al menos un producto, indica una cantidad válida y
            describe el motivo.
          </p>
        )}
        {query.caseResult === "failed" && (
          <div className={styles.alert} role="alert">
            No pudimos confirmar si el caso quedó registrado. Revisa los casos
            y, si no aparece, repite exactamente los mismos datos; se conservará
            la clave de operación para evitar duplicarlo.
            <p>
              Si necesitas cambiar los datos,{" "}
              <Link
                href={`/admin/ventas/${id}#manual-case`}
                className="inline-link"
              >
                inicia un nuevo caso
              </Link>{" "}
              después de comprobar que el anterior no apareció.
            </p>
          </div>
        )}
        {query.caseResult === "unavailable" && (
          <p className={styles.alert} role="alert">
            No se pudo verificar el acceso del personal. Inténtalo más tarde.
          </p>
        )}
        {actor.role === "admin" && query.refundResult === "registered" && (
          <p className={styles.notice} role="status">
            Solicitud de reembolso registrada para evaluación. No se fijó
            importe, no se autorizó ni se devolvió dinero.
          </p>
        )}
        {actor.role === "admin" && query.refundResult === "invalid" && (
          <p className={styles.alert} role="alert">
            Escribe un motivo válido para la solicitud de reembolso.
          </p>
        )}
        {actor.role === "admin" && query.refundResult === "failed" && (
          <div className={styles.alert} role="alert">
            No pudimos confirmar si la solicitud quedó registrada. Revisa el
            caso y, si no aparece, repite exactamente el mismo motivo; se
            conservará la clave de operación.
            <p>
              Si necesitas cambiar los datos,{" "}
              <Link
                href={`/admin/ventas/${id}#cases-heading`}
                className="inline-link"
              >
                inicia una nueva solicitud
              </Link>{" "}
              después de revisar los registros.
            </p>
          </div>
        )}
        {actor.role === "admin" && query.refundResult === "unavailable" && (
          <p className={styles.alert} role="alert">
            No se pudo verificar el acceso de administración. Inténtalo más
            tarde.
          </p>
        )}

        <div className={styles.detailGrid}>
          <div className={styles.mainColumn}>
            <section
              className={styles.panel}
              aria-labelledby="products-heading"
            >
              <h2 id="products-heading">Productos del pedido</h2>
              {items.length === 0 ? (
                <p className={styles.emptyLine}>Sin líneas registradas.</p>
              ) : (
                <ul className={styles.recordList}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>
                          {item.name_snapshot ?? "Producto del pedido"}
                        </strong>
                        <small>
                          {item.sku_snapshot ?? "SKU pendiente"} · Cantidad{" "}
                          {item.quantity}
                        </small>
                      </div>
                      <span>
                        {quetzales(item.line_total) ?? "Precio próximamente"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.totalRow}>
                <span>Total del pedido</span>
                <strong>
                  {quetzales(order.customer_total) ??
                    "Pendiente de cálculo final"}
                </strong>
              </div>
              {(itemsResult.count ?? 0) > items.length && (
                <p className={styles.help}>
                  La lista de productos excede el límite de esta vista. Revisa
                  el registro completo antes de tomar decisiones.
                </p>
              )}
              <p className={styles.help}>
                Los precios de producto, si existen, incluyen IVA. Un total
                pendiente no autoriza cobro.
              </p>
            </section>

            <StaffOperations
              orderId={order.id}
              stage={order.stage}
              kind={kind}
              method={method}
              chargeMode={chargeMode}
              shipment={shipment}
              paymentSucceeded={paymentSucceeded}
              paymentNeedsReview={paymentNeedsReview}
              proposal={proposal}
              statement={statement}
              receipts={receipts}
              staffResult={query.staffResult}
              staffAction={query.staffAction}
              retryKey={query.staffRetryKey}
            />

            <section
              className={styles.panel}
              aria-labelledby="payments-heading"
            >
              <div className={styles.sectionHeading}>
                <h2 id="payments-heading">Registros de pago de prueba</h2>
                <span>{paymentState.total}</span>
              </div>
              <ListTools
                state={paymentState}
                config={paymentConfig}
                path={`/admin/ventas/${id}`}
                label="pagos"
              />
              {payments.length === 0 ? (
                <ListEmpty
                  state={paymentState}
                  path={`/admin/ventas/${id}`}
                  noun="pagos"
                />
              ) : (
                <ul className={styles.recordList}>
                  {payments.map((payment) => (
                    <li key={payment.id}>
                      <div>
                        <strong>
                          {payment.test_mode
                            ? paymentStatus(payment.status)
                            : "Registro en revisión"}
                        </strong>
                        <small>
                          {paymentMethod(payment.method)} ·{" "}
                          {localDate(payment.created_at) ?? "Fecha pendiente"}
                        </small>
                        {payment.paid_at && (
                          <small>
                            Prueba aprobada {localDate(payment.paid_at)}
                          </small>
                        )}
                      </div>
                      <span>
                        {quetzales(payment.amount) ?? "Importe pendiente"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <ListPager
                state={paymentState}
                path={`/admin/ventas/${id}`}
                label="pagos"
              />
            </section>

            <section className={styles.panel} aria-labelledby="cases-heading">
              <div className={styles.sectionHeading}>
                <h2 id="cases-heading">Casos posventa</h2>
                <span>{caseState.total}</span>
              </div>
              <ListTools
                state={caseState}
                config={caseConfig}
                path={`/admin/ventas/${id}`}
                label="casos"
              />
              {cases.length === 0 ? (
                <ListEmpty
                  state={caseState}
                  path={`/admin/ventas/${id}`}
                  noun="casos"
                />
              ) : (
                <div className={styles.caseList}>
                  {cases.map((entry) => (
                    <article className={styles.caseCard} key={entry.id}>
                      <div className={styles.cardTop}>
                        <div>
                          <h3>{caseKind(entry.kind)}</h3>
                          <small>
                            {localDate(entry.created_at) ?? "Fecha pendiente"} ·{" "}
                            {entry.intake_path === "direct_draft"
                              ? "Borrador cancelado"
                              : entry.intake_path === "staff_manual"
                                ? "Registro manual"
                                : "Solicitud del cliente"}
                          </small>
                        </div>
                        <span className={styles.tag}>
                          {caseStatus(entry.status)}
                        </span>
                      </div>
                      <p className={styles.reason}>{entry.reason}</p>
                      {entry.resolution && (
                        <p className={styles.help}>
                          Resolución registrada: {entry.resolution}
                        </p>
                      )}
                      {(caseItemsByCase.get(entry.id) ?? []).length > 0 && (
                        <div className={styles.subRecords}>
                          <h4>Productos asociados</h4>
                          <ul>
                            {caseItemsByCase.get(entry.id)?.map((line) => (
                              <li key={line.id}>
                                {itemById.get(line.order_item_id)
                                  ?.name_snapshot ?? "Producto del pedido"}{" "}
                                · Cantidad {line.quantity} ·{" "}
                                {inspectionStatus(line.inspection_result)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {actor.role === "admin" &&
                        (refundsByCase.get(entry.id) ?? []).length > 0 && (
                          <div className={styles.subRecords}>
                            <h4>Solicitudes de reembolso</h4>
                            <ul>
                              {refundsByCase.get(entry.id)?.map((refund) => (
                                <li key={refund.id}>
                                  {refundStatus(refund.status)} ·{" "}
                                  {quetzales(refund.requested_amount) ??
                                    "Importe sin definir"}{" "}
                                  · {refund.reason}
                                </li>
                              ))}
                            </ul>
                            <p className={styles.help}>
                              Estos registros no confirman una devolución de
                              dinero.
                            </p>
                          </div>
                        )}
                      {actor.role === "admin" &&
                        ["cancellation", "return"].includes(entry.kind) &&
                        entry.intake_path !== "direct_draft" &&
                        refunds.length === refundCount &&
                        !refundsByCase.has(entry.id) && (
                          <details className={styles.refundDisclosure}>
                            <summary>Registrar solicitud de reembolso</summary>
                            <p className={styles.help}>
                              Solo registra una solicitud para evaluación. No
                              determina procedencia, importe ni pago al cliente.
                            </p>
                            <ManagedForm
                              confirmMessage="¿Registrar esta solicitud para revisión? No autoriza ni devuelve dinero."
                              action={registerRefundRequest}
                              className={styles.caseForm}
                            >
                              <input
                                type="hidden"
                                name="orderId"
                                value={order.id}
                              />
                              <input
                                type="hidden"
                                name="caseId"
                                value={entry.id}
                              />
                              <input
                                type="hidden"
                                name="idempotencyKey"
                                value={
                                  query.refundCaseId === entry.id &&
                                  z.uuid().safeParse(query.refundRetryKey)
                                    .success
                                    ? query.refundRetryKey
                                    : randomUUID()
                                }
                              />
                              <label htmlFor={`refund-reason-${entry.id}`}>
                                Motivo de la solicitud
                              </label>
                              <textarea
                                id={`refund-reason-${entry.id}`}
                                name="reason"
                                required
                                minLength={1}
                                maxLength={2000}
                                rows={3}
                              />
                              <button type="submit" className="primary-button">
                                Registrar para evaluación
                              </button>
                            </ManagedForm>
                          </details>
                        )}
                    </article>
                  ))}
                </div>
              )}
              {actor.role === "admin" && refundCount > refunds.length && (
                <p className={styles.help}>
                  Hay más solicitudes de reembolso de las que muestra esta
                  vista. Revisa el registro completo antes de tomar decisiones.
                </p>
              )}
              {caseItemCount > caseItems.length && (
                <p className={styles.help}>
                  Hay más productos asociados a casos de los que muestra esta
                  vista. Revisa el registro completo antes de tomar decisiones.
                </p>
              )}
              <ListPager
                state={caseState}
                path={`/admin/ventas/${id}`}
                label="casos"
              />
            </section>

            {canRecordCase && actionKey && (
              <section
                id="manual-case"
                className={styles.panel}
                aria-labelledby="manual-case-heading"
              >
                <h2 id="manual-case-heading">Registrar contacto de posventa</h2>
                <p className={styles.help}>
                  Registra una devolución o garantía comunicada a GreenBel. Esta
                  acción abre un caso para revisión; no decide procedencia,
                  plazo, costo, reembolso ni reingreso de existencias.
                </p>
                <ManagedForm
                  action={registerManualCase}
                  className={styles.caseForm}
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <input
                    type="hidden"
                    name="idempotencyKey"
                    value={actionKey}
                  />
                  <label htmlFor="case-kind">Tipo de caso</label>
                  <select id="case-kind" name="kind" required defaultValue="">
                    <option value="" disabled>
                      Seleccionar
                    </option>
                    {canRecordReturn && (
                      <option value="return">Devolución</option>
                    )}
                    {canRecordWarranty && (
                      <option value="warranty">Garantía</option>
                    )}
                  </select>
                  <label htmlFor="case-reason">Motivo informado</label>
                  <textarea
                    id="case-reason"
                    name="reason"
                    required
                    minLength={1}
                    maxLength={2000}
                    rows={4}
                  />
                  <fieldset>
                    <legend>Productos y cantidades informados</legend>
                    <p className={styles.help}>
                      Marca únicamente las líneas que corresponden al caso.
                    </p>
                    {items.map((item) => (
                      <div className={styles.caseLine} key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            name="itemId"
                            value={item.id}
                          />
                          <span>
                            {item.name_snapshot ?? "Producto del pedido"} ·
                            comprado: {item.quantity}
                          </span>
                        </label>
                        <label htmlFor={`quantity-${item.id}`}>
                          Cantidad
                          <input
                            id={`quantity-${item.id}`}
                            type="number"
                            name={`quantity:${item.id}`}
                            min="0.001"
                            step="0.001"
                            defaultValue="1"
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    ))}
                  </fieldset>
                  <button type="submit" className="primary-button">
                    Registrar caso para revisión
                  </button>
                </ManagedForm>
              </section>
            )}
          </div>

          <aside className={styles.sideColumn} aria-label="Estado y entrega">
            <section className={styles.panel}>
              <h2>Estado actual</h2>
              <dl className={styles.statusStack}>
                <div>
                  <dt>Pedido</dt>
                  <dd>{orderStatus(order.stage)}</dd>
                </div>
                <div>
                  <dt>Entrega</dt>
                  <dd>
                    {deliveryStatus(shipment?.status ?? null, order.stage)}
                  </dd>
                </div>
                <div>
                  <dt>Último intento de pago</dt>
                  <dd>
                    {latestPayment?.test_mode === false
                      ? "Registro en revisión"
                      : paymentStatus(latestPayment?.status ?? null)}
                  </dd>
                </div>
              </dl>
            </section>
            <section className={styles.panel}>
              <h2>Entrega</h2>
              {shipment ? (
                <dl className={styles.detailFacts}>
                  <div>
                    <dt>Servicio</dt>
                    <dd>
                      {shipment.carrier_snapshot ?? "Servicio registrado"}
                    </dd>
                  </div>
                  <div>
                    <dt>Guía</dt>
                    <dd>{shipment.tracking_number ?? "Sin guía registrada"}</dd>
                  </div>
                  {shipment.dispatched_at && (
                    <div>
                      <dt>Despachado</dt>
                      <dd>{localDate(shipment.dispatched_at)}</dd>
                    </div>
                  )}
                  {shipment.delivered_at && (
                    <div>
                      <dt>Entregado</dt>
                      <dd>{localDate(shipment.delivered_at)}</dd>
                    </div>
                  )}
                  {shipment.received_back_at && (
                    <div>
                      <dt>Devuelto</dt>
                      <dd>{localDate(shipment.received_back_at)}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className={styles.emptyLine}>Sin envío registrado.</p>
              )}
              {shipment?.tracking_url && (
                <a
                  href={shipment.tracking_url}
                  className="inline-link"
                  rel="noopener noreferrer"
                >
                  Consultar seguimiento
                </a>
              )}
            </section>
          </aside>
        </div>
      </div>
    );
  } catch (error) {
    if (error === missingOrder) notFound();
    return <SalesUnavailable detail />;
  }
}
