import { ManagedForm } from "../_components/managed-form";
import { randomUUID } from "node:crypto";
import { quetzales, deliveryStatus } from "@/app/cuenta/pedidos/data";
import {
  offerShippingProposal,
  recordCarrierReceipt,
  recordCarrierStatement,
  recordShipmentEvent,
  recordStaffTestPayment,
  withdrawShippingProposal,
} from "./staff-actions";
import styles from "./sales.module.css";

export type StaffProposal = {
  id: string;
  revision: number;
  fee: number | string;
  charge_mode: string;
  status: string;
  terms_snapshot: string;
};
export type StaffStatement = {
  id: string;
  gross_collected: number | string;
  expected_net: number | string;
  status: string;
};
export type StaffReceipt = {
  id: string;
  amount: number | string;
  received_at: string;
};

type Props = {
  orderId: string;
  stage: string;
  kind: string | null;
  method: string | null;
  chargeMode: string | null;
  shipment: { id: string; status: string; delivered_at: string | null } | null;
  paymentSucceeded: boolean;
  paymentNeedsReview: boolean;
  proposal: StaffProposal | null;
  statement: StaffStatement | null;
  receipts: StaffReceipt[];
  staffResult?: string;
  staffAction?: string;
  retryKey?: string;
};

function operationKey(
  action: string,
  staffAction?: string,
  retryKey?: string,
): string {
  return staffAction === action && retryKey && /^[0-9a-f-]{36}$/i.test(retryKey)
    ? retryKey
    : randomUUID();
}

function ShipmentForm({
  orderId,
  event,
  staffAction,
  retryKey,
}: {
  orderId: string;
  event: "prepare" | "ready_for_pickup" | "dispatch" | "deliver" | "returned";
  staffAction?: string;
  retryKey?: string;
}) {
  const labels = {
    prepare: "Iniciar preparación",
    ready_for_pickup: "Listo para retirar",
    dispatch: "Registrar despacho",
    deliver: "Registrar entrega",
    returned: "Registrar retorno sin reingresar inventario",
  };
  return (
    <ManagedForm
      confirmMessage={`¿Confirmas «${labels[event]}» para este pedido?`}
      action={recordShipmentEvent}
      className={styles.caseForm}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input
        type="hidden"
        name="idempotencyKey"
        value={operationKey(`shipment_${event}`, staffAction, retryKey)}
      />
      <input type="hidden" name="event" value={event} />
      {event === "dispatch" && (
        <>
          <label>
            Número de guía{" "}
            <small>Obligatorio para transportadora externa</small>
            <input type="text" name="trackingNumber" maxLength={160} />
          </label>
          <label>
            URL de seguimiento HTTPS <small>Opcional</small>
            <input type="url" name="trackingUrl" maxLength={2000} />
          </label>
        </>
      )}
      <label>
        Referencia comprobable del evento
        <input
          type="text"
          name="evidence"
          required
          maxLength={200}
          placeholder="Registro ficticio DEV"
        />
      </label>
      <button type="submit" className="primary-button">
        {labels[event]}
      </button>
    </ManagedForm>
  );
}

export function StaffOperations({
  orderId,
  stage,
  kind,
  method,
  chargeMode,
  shipment,
  paymentSucceeded,
  paymentNeedsReview,
  proposal,
  statement,
  receipts,
  staffResult,
  staffAction,
  retryKey,
}: Props) {
  const confirmed = stage === "confirmed";
  const isOffline =
    method === "cash" || method === "terminal" || method === "carrier_cod";
  const paymentReady =
    confirmed &&
    !!shipment &&
    !paymentSucceeded &&
    isOffline &&
    ((kind === "pickup" && shipment.status === "ready_for_pickup") ||
      (kind === "own_delivery" && shipment.status === "dispatched") ||
      (kind === "external" &&
        method === "carrier_cod" &&
        (shipment.status === "delivered" ||
          (shipment.status === "returned" && shipment.delivered_at !== null))));
  const canDeliver =
    confirmed &&
    !!shipment &&
    ((kind === "pickup" &&
      shipment.status === "ready_for_pickup" &&
      paymentSucceeded) ||
      (kind === "own_delivery" &&
        shipment.status === "dispatched" &&
        paymentSucceeded) ||
      (kind === "external" && shipment.status === "dispatched")) &&
    !paymentNeedsReview &&
    (method !== "online_gateway" || paymentSucceeded);
  const receiptTotal = receipts.reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );

  return (
    <section
      id="staff-operations"
      className={styles.panel}
      aria-labelledby="staff-operations-heading"
    >
      <h2 id="staff-operations-heading">Operación del pedido</h2>
      <p className={styles.help}>
        Cada cobro registrado aquí es PRUEBA DEV. Los eventos de entrega, cobro
        de transportadora y depósito son hechos separados. Ninguna acción envía
        correos ni ejecuta cobros reales.
      </p>
      {staffResult?.endsWith("_saved") && (
        <p className={styles.notice} role="status">
          Operación registrada. Revisa el estado actualizado antes de continuar.
        </p>
      )}
      {staffResult === "proposal_withdrawn" && (
        <p className={styles.notice} role="status">
          Propuesta retirada. Puedes preparar otra con condiciones revisadas.
        </p>
      )}
      {staffResult === "invalid" && (
        <p className={styles.alert} role="alert">
          Revisa los campos, importes y referencias del formulario.
        </p>
      )}
      {staffResult === "failed" && (
        <p className={styles.alert} role="alert">
          No se pudo confirmar la operación. Revisa primero los registros; si no
          aparece, repite exactamente los mismos datos con la clave conservada.
        </p>
      )}
      {staffResult === "unavailable" && (
        <p className={styles.alert} role="alert">
          No se pudo verificar tu permiso. Inténtalo más tarde.
        </p>
      )}
      {paymentNeedsReview && (
        <p className={styles.alert} role="alert">
          Este pedido tiene un evento online simulado que requiere conciliación.
          No se puede preparar, despachar ni entregar hasta resolverlo.
        </p>
      )}

      {stage === "pending_shipping" && (
        <div className={styles.refundDisclosure}>
          <h3>Cotización manual del transporte</h3>
          {proposal ? (
            <>
              <p className={styles.help}>
                Propuesta #{proposal.revision}: {quetzales(proposal.fee)} ·{" "}
                {proposal.status === "accepted"
                  ? "aceptada por el cliente"
                  : "ofrecida al cliente"}
                .{" "}
                {proposal.charge_mode === "at_destination"
                  ? "Cobra la transportadora en destino"
                  : "Se cobra con el pedido"}
                .
              </p>
              <p className={styles.help}>{proposal.terms_snapshot}</p>
              {proposal.status === "offered" && (
                <ManagedForm
                  confirmMessage="¿Retirar esta propuesta de transporte?"
                  action={withdrawShippingProposal}
                  className={styles.caseForm}
                >
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <input
                    type="hidden"
                    name="idempotencyKey"
                    value={operationKey("withdraw", staffAction, retryKey)}
                  />
                  <label>
                    Motivo de retiro
                    <input
                      type="text"
                      name="reason"
                      required
                      maxLength={2000}
                    />
                  </label>
                  <button type="submit" className="secondary-dark-button">
                    Retirar propuesta
                  </button>
                </ManagedForm>
              )}
              {proposal.status === "accepted" && (
                <p className={styles.help}>
                  El cliente debe volver a revisar precio, stock y total final
                  antes de confirmar. Aún no hay reserva.
                </p>
              )}
            </>
          ) : (
            <ManagedForm
              action={offerShippingProposal}
              className={styles.caseForm}
            >
              <input type="hidden" name="orderId" value={orderId} />
              <input
                type="hidden"
                name="idempotencyKey"
                value={operationKey("offer", staffAction, retryKey)}
              />
              <label>
                Transporte acordado (GTQ)
                <input
                  type="number"
                  name="fee"
                  required
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                />
              </label>
              <label>
                Momento de cobro
                <select
                  name="chargeMode"
                  required
                  defaultValue={chargeMode ?? ""}
                >
                  <option value="" disabled>
                    Seleccionar
                  </option>
                  <option value="with_order">Con el pedido</option>
                  <option value="at_destination">
                    En destino por la transportadora
                  </option>
                </select>
              </label>
              <label>
                Condiciones ofrecidas
                <textarea
                  name="terms"
                  required
                  minLength={1}
                  maxLength={5000}
                  rows={3}
                />
              </label>
              <p className={styles.help}>
                Registrar esta propuesta no reserva productos, no cobra y no
                confirma un total final.
              </p>
              <button type="submit" className="primary-button">
                Ofrecer costo de transporte
              </button>
            </ManagedForm>
          )}
        </div>
      )}

      {confirmed && (
        <div className={styles.refundDisclosure}>
          <h3>Preparación y entrega</h3>
          {!shipment &&
            !paymentNeedsReview &&
            (method !== "online_gateway" || paymentSucceeded) && (
              <ShipmentForm
                orderId={orderId}
                event="prepare"
                staffAction={staffAction}
                retryKey={retryKey}
              />
            )}
          {!shipment &&
            method === "online_gateway" &&
            !paymentSucceeded &&
            !paymentNeedsReview && (
              <p className={styles.help}>
                Espera la confirmación del pago simulado del servidor antes de
                iniciar la preparación.
              </p>
            )}
          {shipment?.status === "preparing" &&
            kind === "pickup" &&
            (method !== "online_gateway" ||
              (paymentSucceeded && !paymentNeedsReview)) && (
              <ShipmentForm
                orderId={orderId}
                event="ready_for_pickup"
                staffAction={staffAction}
                retryKey={retryKey}
              />
            )}
          {shipment?.status === "preparing" &&
            kind !== "pickup" &&
            (method !== "online_gateway" ||
              (paymentSucceeded && !paymentNeedsReview)) && (
              <ShipmentForm
                orderId={orderId}
                event="dispatch"
                staffAction={staffAction}
                retryKey={retryKey}
              />
            )}
          {shipment?.status === "preparing" &&
            method === "online_gateway" &&
            !paymentSucceeded && (
              <p className={styles.help}>
                Espera la confirmación del pago simulado del servidor antes de
                despachar.
              </p>
            )}
          {canDeliver && (
            <ShipmentForm
              orderId={orderId}
              event="deliver"
              staffAction={staffAction}
              retryKey={retryKey}
            />
          )}
          {shipment &&
            kind !== "pickup" &&
            ["dispatched", "delivered"].includes(shipment.status) && (
              <details className={styles.refundDisclosure}>
                <summary>Registrar retorno</summary>
                <p className={styles.help}>
                  Un retorno no reincorpora inventario ni autoriza reembolso.
                  Requiere revisión física y política comercial.
                </p>
                <ShipmentForm
                  orderId={orderId}
                  event="returned"
                  staffAction={staffAction}
                  retryKey={retryKey}
                />
              </details>
            )}
          {shipment &&
            ![
              "preparing",
              "ready_for_pickup",
              "dispatched",
              "delivered",
            ].includes(shipment.status) && (
              <p className={styles.help}>
                El envío está en estado {deliveryStatus(shipment.status, stage)}
                ; no hay otra transición disponible aquí.
              </p>
            )}
        </div>
      )}

      {paymentReady && (
        <div className={styles.refundDisclosure}>
          <h3>Cobro registrado · PRUEBA DEV</h3>
          <ManagedForm
            confirmMessage="¿Registrar este resultado de pago simulado? No representa un cobro real."
            action={recordStaffTestPayment}
            className={styles.caseForm}
          >
            <input type="hidden" name="orderId" value={orderId} />
            <input
              type="hidden"
              name="idempotencyKey"
              value={operationKey("payment", staffAction, retryKey)}
            />
            <input type="hidden" name="method" value={method ?? ""} />
            <p className={styles.help}>
              Medio del pedido:{" "}
              {method === "carrier_cod"
                ? "cobro reportado por transportadora"
                : method === "terminal"
                  ? "terminal presencial"
                  : "efectivo presencial"}
              . El importe lo toma el servidor del pedido confirmado.
            </p>
            <label>
              Resultado observado
              <select name="outcome" required defaultValue="">
                <option value="" disabled>
                  Seleccionar
                </option>
                <option value="succeeded">Prueba aprobada</option>
                <option value="failed">Prueba rechazada</option>
              </select>
            </label>
            <label>
              Referencia de prueba
              <input
                type="text"
                name="evidence"
                required
                maxLength={200}
                placeholder="Evidencia ficticia DEV"
              />
            </label>
            <button type="submit" className="primary-button">
              Registrar resultado de prueba
            </button>
          </ManagedForm>
        </div>
      )}

      {confirmed &&
        kind === "external" &&
        method === "carrier_cod" &&
        shipment &&
        (shipment.status === "delivered" ||
          (shipment.status === "returned" &&
            shipment.delivered_at !== null)) && (
          <div className={styles.refundDisclosure}>
            <h3>Cobro y depósito de transportadora · PRUEBA DEV</h3>
            {!statement ? (
              <ManagedForm
                confirmMessage="¿Registrar el reporte de recaudación de prueba con estos importes?"
                action={recordCarrierStatement}
                className={styles.caseForm}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={operationKey("statement", staffAction, retryKey)}
                />
                <label>
                  Importe recaudado informado (GTQ)
                  <input
                    type="number"
                    name="gross"
                    required
                    min="0.01"
                    step="0.01"
                  />
                </label>
                <label>
                  Comisión documentada (GTQ)
                  <input
                    type="number"
                    name="commission"
                    required
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
                <label>
                  Transporte descontado (GTQ)
                  <input
                    type="number"
                    name="shippingDeducted"
                    required
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
                <label>
                  Otros descuentos documentados (GTQ)
                  <input
                    type="number"
                    name="otherDeductions"
                    required
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
                <label>
                  Documento de comisión
                  <input type="text" name="commissionNotes" maxLength={500} />
                </label>
                <label>
                  Documento de transporte u otros descuentos
                  <input type="text" name="deductionNotes" maxLength={500} />
                </label>
                <label>
                  Explicación de diferencia contra cobro instruido
                  <input type="text" name="varianceNotes" maxLength={500} />
                </label>
                <p className={styles.help}>
                  Registra únicamente importes reportados y documentos reales de
                  prueba. No se calcula una tarifa comercial ni se presume
                  depósito.
                </p>
                <button type="submit" className="primary-button">
                  Registrar reporte de recaudación
                </button>
              </ManagedForm>
            ) : (
              <>
                <p className={styles.help}>
                  Cobro del pedido:{" "}
                  {paymentSucceeded ? "prueba aprobada" : "sin prueba aprobada"}
                  . Recaudación informada por transportadora:{" "}
                  {quetzales(statement.gross_collected)}. Depósito esperado
                  después de descuentos documentados:{" "}
                  {quetzales(statement.expected_net)}. Depósito registrado por
                  GreenBel: {quetzales(receiptTotal)}.
                </p>
                <p className={styles.help}>
                  Conciliación:{" "}
                  {statement.status === "disputed"
                    ? "diferencia en revisión; registrar el depósito no la resuelve"
                    : statement.status === "settled"
                      ? Number(statement.expected_net) === 0
                        ? "sin depósito esperado"
                        : "depósito de prueba completo"
                      : statement.status === "partial"
                        ? "depósito parcial"
                        : "depósito pendiente"}
                  .
                </p>
                {statement.status === "pending" ||
                statement.status === "partial" ||
                statement.status === "disputed" ? (
                  <ManagedForm
                    confirmMessage="¿Registrar este depósito de prueba con su referencia?"
                    action={recordCarrierReceipt}
                    className={styles.caseForm}
                  >
                    <input type="hidden" name="orderId" value={orderId} />
                    <input
                      type="hidden"
                      name="statementId"
                      value={statement.id}
                    />
                    <input
                      type="hidden"
                      name="idempotencyKey"
                      value={operationKey("receipt", staffAction, retryKey)}
                    />
                    <label>
                      Depósito recibido (GTQ)
                      <input
                        type="number"
                        name="amount"
                        required
                        min="0.01"
                        step="0.01"
                      />
                    </label>
                    <label>
                      Referencia bancaria de prueba
                      <input
                        type="text"
                        name="bankReference"
                        required
                        maxLength={200}
                      />
                    </label>
                    <button type="submit" className="primary-button">
                      Registrar depósito de prueba
                    </button>
                  </ManagedForm>
                ) : null}
              </>
            )}
          </div>
        )}
    </section>
  );
}
