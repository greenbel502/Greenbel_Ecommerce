"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { checkoutReviewRequestSchema, type CheckoutReviewRequest } from "@/domain/checkout/review-request";
import { useCart } from "@/presentation/providers/cart-provider";
import { AnimatedTitle } from "./motion-primitives";

type Service = { id: string; name: string; kind: "pickup" | "own_delivery" | "external";
  pickup_details: { address: string; hours: string; instructions: string } | null };
type Zone = { id: string; name: string; municipality: string; department: string };
type Rate = { service_id: string; zone_id: string; pricing_mode: "fixed" | "manual";
  shipping_fee: string | number | null; shipping_charge_mode: "with_order" | "at_destination" | "customer_choice" };
type Payment = { id: string; service_id: string; method: "online_gateway" | "cash" | "terminal" | "carrier_cod";
  timing: "prepaid" | "on_delivery" | "on_pickup" };
type Options = { environment: "DEV" | "PROD"; services: Service[]; zones: Zone[];
  rates: Rate[]; paymentOptions: Payment[] };
type Review = { reviewId: string; revision: number; stage: "draft" | "pending_shipping";
  merchandiseTotal: string; shippingFee: string | null; total: string | null;
  amountDueCarrierShipping: string | null;
  lines: { productId: string; name: string; quantity: number; lineTotal: string }[] };
type Confirmed = { orderId: string; reference: string; total: string;
  stage: "confirmed" | "completed" | "cancelled"; alreadyConfirmed: boolean;
  paymentStatus: "pending" | "test_succeeded" };
type LoadState = "loading" | "ready" | "unauthenticated" | "forbidden" | "error";

function money(value: string): string {
  const [whole, fraction] = value.split(".");
  return `Q${BigInt(whole).toLocaleString("es-GT")}.${fraction}`;
}

function paymentLabel(option: Payment): string {
  const method = { online_gateway: "Pago en línea (pruebas)", cash: "Efectivo", terminal: "Terminal",
    carrier_cod: "Cobro por transportadora" }[option.method];
  const timing = { prepaid: "antes de entregar", on_delivery: "al recibir", on_pickup: "al retirar" }[option.timing];
  return `${method} · ${timing}`;
}

function isOptions(value: unknown): value is Options {
  return typeof value === "object" && value !== null
    && "environment" in value && (value.environment === "DEV" || value.environment === "PROD")
    && "services" in value && Array.isArray(value.services)
    && "zones" in value && Array.isArray(value.zones)
    && "rates" in value && Array.isArray(value.rates)
    && "paymentOptions" in value && Array.isArray(value.paymentOptions);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") return payload.error;
  } catch { /* The server response may be uncertain. */ }
  return "No pudimos comprobar la respuesta. Consulta Mis pedidos antes de iniciar otra compra.";
}

export function CheckoutFlow() {
  const { lines, totals, restoreStatus, storageError, retryRestore, clearCart } = useCart();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [options, setOptions] = useState<Options | null>(null);
  const [billingKind, setBillingKind] = useState<"cf" | "nit">("cf");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nit, setNit] = useState("");
  const [nitOwnerName, setNitOwnerName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [chargeMode, setChargeMode] = useState<"with_order" | "at_destination" | "">("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [paymentOptionId, setPaymentOptionId] = useState("");
  const [review, setReview] = useState<{ data: Review; intent: CheckoutReviewRequest; signature: string } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [busy, setBusy] = useState<"review" | "confirm" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reviewKey = useRef<string | null>(null);
  const reviewKeySignature = useRef<string | null>(null);
  const confirmationKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/checkout/options", { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) { setLoadState("unauthenticated"); return; }
        if (response.status === 403) { setLoadState("forbidden"); return; }
        if (!response.ok) throw new Error("Options unavailable");
        const payload: unknown = await response.json();
        if (!isOptions(payload)) throw new Error("Options invalid");
        if (!controller.signal.aborted) { setOptions(payload); setLoadState("ready"); }
      } catch {
        if (!controller.signal.aborted) setLoadState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("reviewId");
    if (!id) return;
    const controller = new AbortController();
    setResuming(true);
    async function resume() {
      try {
        const response = await fetch(`/api/checkout/review?id=${encodeURIComponent(id!)}`,
          { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (response.status === 401) setLoadState("unauthenticated");
          throw new Error(await errorMessage(response));
        }
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null || !("intent" in payload) || !("reviewId" in payload))
          throw new Error("No pudimos recuperar la revisión guardada.");
        const validated = checkoutReviewRequestSchema.safeParse(payload.intent);
        if (!validated.success || typeof payload.reviewId !== "string") throw new Error("Revisión guardada inválida.");
        if (controller.signal.aborted) return;
        const saved = validated.data;
        setReviewId(payload.reviewId);
        setBillingKind(saved.billing.kind);
        setPhone(saved.billing.phone);
        if (saved.billing.kind === "cf") {
          setFirstName(saved.billing.firstName); setLastName(saved.billing.lastName);
        } else {
          setNit(saved.billing.nit); setNitOwnerName(saved.billing.nitOwnerName);
          setFullName(saved.billing.fullName); setEmail(saved.billing.email ?? "");
        }
        setServiceId(saved.delivery.serviceId);
        setPaymentOptionId(saved.paymentOptionId);
        if (saved.delivery.kind === "shipping") {
          setZoneId(saved.delivery.zoneId); setChargeMode(saved.delivery.chargeMode);
          setRecipientName(saved.delivery.recipientName); setRecipientPhone(saved.delivery.recipientPhone);
          setAddressLine(saved.delivery.addressLine);
        }
        setMessage("Se recuperó tu solicitud. Revisa de nuevo precio, inventario y transporte antes de confirmar.");
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "No pudimos recuperar esta revisión.");
      } finally {
        if (!controller.signal.aborted) setResuming(false);
      }
    }
    void resume();
    return () => controller.abort();
  }, []);

  const service = options?.services.find((item) => item.id === serviceId);
  const zones = useMemo(() => options?.zones.filter((zone) =>
    options.rates.some((rate) => rate.service_id === serviceId && rate.zone_id === zone.id)) ?? [], [options, serviceId]);
  const rate = options?.rates.find((item) => item.service_id === serviceId && item.zone_id === zoneId);
  const payments = options?.paymentOptions.filter((item) => item.service_id === serviceId) ?? [];
  const cartReady = restoreStatus === "ready" && !storageError;
  const unsupported = lines.some(({ product }) => product.price === null || product.isMockPrice
    || product.availability !== "available" || !/^[0-9a-f-]{36}$/i.test(product.id));

  const intent = useMemo(() => ({
    lines: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
    billing: billingKind === "cf" ? { kind: "cf" as const, firstName, lastName, phone }
      : { kind: "nit" as const, nit, nitOwnerName, fullName, phone, email },
    delivery: service?.kind === "pickup" ? { kind: "pickup" as const, serviceId }
      : { kind: "shipping" as const, serviceId, zoneId, chargeMode, recipientName, recipientPhone, addressLine },
    paymentOptionId
  }), [lines, billingKind, firstName, lastName, phone, nit, nitOwnerName, fullName, email,
    service?.kind, serviceId, zoneId, chargeMode, recipientName, recipientPhone, addressLine, paymentOptionId]);
  const validIntent = checkoutReviewRequestSchema.safeParse(intent);
  const currentSignature = validIntent.success ? JSON.stringify(validIntent.data) : null;
  const reviewCurrent = review?.signature === currentSignature;

  function changeService(id: string) {
    setServiceId(id); setZoneId(""); setChargeMode(""); setPaymentOptionId("");
    reviewKey.current = null; reviewKeySignature.current = null; confirmationKey.current = null; setMessage(null);
  }
  function changeZone(id: string) {
    setZoneId(id);
    const selected = options?.rates.find((item) => item.service_id === serviceId && item.zone_id === id);
    setChargeMode(selected?.shipping_charge_mode === "customer_choice" ? "" : selected?.shipping_charge_mode ?? "");
    reviewKey.current = null; reviewKeySignature.current = null; confirmationKey.current = null; setMessage(null);
  }

  async function requestReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || resuming || loadState !== "ready" || !cartReady || unsupported) return;
    const parsed = validIntent;
    if (!parsed.success) { setMessage("Completa los datos de facturación, entrega y pago antes de revisar."); return; }
    setBusy("review"); setMessage(null);
    const signature = JSON.stringify(parsed.data);
    if (reviewKeySignature.current !== signature) reviewKey.current = null;
    reviewKey.current ??= crypto.randomUUID();
    reviewKeySignature.current = signature;
    try {
      const response = await fetch("/api/checkout/review", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: parsed.data, reviewKey: reviewKey.current, reviewId }) });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        if (response.status === 401) setLoadState("unauthenticated");
        if (response.status === 409 || response.status === 422) { reviewKey.current = null; reviewKeySignature.current = null; }
        return;
      }
      const payload: unknown = await response.json();
      if (typeof payload !== "object" || payload === null || !("review" in payload)) throw new Error("Review missing");
      const result = payload.review as Review;
      if (typeof result.reviewId !== "string" || typeof result.revision !== "number") throw new Error("Review invalid");
      setReview({ data: result, intent: parsed.data, signature: JSON.stringify(parsed.data) });
      setReviewId(result.reviewId);
      window.history.replaceState(null, "", `/checkout?reviewId=${encodeURIComponent(result.reviewId)}`);
      reviewKey.current = null; reviewKeySignature.current = null; confirmationKey.current = null;
    } catch {
      setMessage("La revisión puede seguir procesándose. Reintenta esta misma solicitud; aún no se ha confirmado una compra.");
    } finally { setBusy(null); }
  }

  async function confirm() {
    if (busy || !review || !reviewCurrent || review.data.stage !== "draft" || review.data.total === null) return;
    setBusy("confirm"); setMessage(null);
    confirmationKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/checkout/confirm", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          reviewId: review.data.reviewId, review: review.intent, acceptedRevision: review.data.revision,
          acceptedTotal: review.data.total, idempotencyKey: confirmationKey.current
        }) });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        if (response.status === 401) setLoadState("unauthenticated");
        if (response.status === 409 || response.status === 422) { setReview(null); confirmationKey.current = null; }
        return;
      }
      const payload: unknown = await response.json();
      if (typeof payload !== "object" || payload === null || !("order" in payload)) throw new Error("Order missing");
      const order = payload.order as Confirmed;
      if (typeof order.orderId !== "string" || !["confirmed", "completed", "cancelled"].includes(order.stage)) throw new Error("Order invalid");
      setConfirmed(order);
      if (order.stage !== "cancelled") clearCart();
      window.history.replaceState(null, "", "/checkout");
    } catch {
      setMessage("La respuesta es incierta. Consulta Mis pedidos o reintenta con la misma solicitud; no inicies otra compra todavía.");
    } finally { setBusy(null); }
  }

  if (confirmed) return <section className="order-success" role="status">
    <span className="success-icon"><ShoppingBag /></span><span className="eyebrow">Pedido de prueba</span>
    <h1>{confirmed.stage === "cancelled" ? "Pedido cancelado." : confirmed.stage === "completed" ? "Pedido completado." : "Pedido confirmado."}</h1>
    <p>Referencia <strong>{confirmed.reference}</strong>. Total {money(confirmed.total)}.
      {confirmed.alreadyConfirmed ? " Esta solicitud ya se había procesado; no se creó otra reserva." : " Se creó una reserva de inventario."}
      {confirmed.paymentStatus === "test_succeeded" ? " Existe un pago simulado DEV aprobado en servidor." : " El pago se gestiona por separado."}{" "}
      Esta pantalla no registra cobro ni despacho.</p>
    <Link href={`/cuenta/pedidos/${encodeURIComponent(confirmed.orderId)}`} className="primary-button">Ver mi pedido</Link>
  </section>;

  if (restoreStatus === "loading" || (loadState === "loading" && lines.length > 0))
    return <section className="empty-state" role="status"><ShoppingBag size={42} /><h1>Preparando tu compra</h1><p>Consultamos tu selección y las opciones disponibles.</p></section>;
  if (lines.length === 0 && cartReady) return <section className="empty-state"><ShoppingBag size={42} />
    <AnimatedTitle as="h1" lines={["Tu carrito está vacío"]} /><p>Selecciona productos para revisarlos.</p>
    <Link href="/productos" className="primary-button">Ver productos</Link></section>;

  return <section className="checkout-shell">
    <div className="checkout-intro"><span className="eyebrow">Tu selección</span><AnimatedTitle as="h1" lines={["Revisar compra"]} />
      <p>El servidor calcula precios y comprueba disponibilidad antes de que aceptes el total. El carrito no reserva inventario.</p></div>
    <div className="checkout-layout"><div className="checkout-form">
      {options?.environment === "DEV" && <p className="checkout-dev-banner" role="status">PRUEBA DEV · dirección, cobertura y tarifas ficticias. Los pagos en línea son simulados; no hay cobros reales.</p>}
      {loadState === "unauthenticated" && <div className="form-section" role="alert"><h2>Inicia sesión para comprar</h2>
        <p>Tu selección permanece en este navegador. Después de ingresar volverás a revisarla.</p>
        <Link href="/cuenta/ingresar?next=%2Fcheckout" className="primary-button">Ingresar</Link></div>}
      {loadState === "forbidden" && <p className="form-section" role="alert">Esta cuenta no está activa para compras.</p>}
      {loadState === "error" && <p className="form-section" role="alert">No pudimos consultar entrega y pago. Actualiza para intentarlo de nuevo.</p>}
      {restoreStatus !== "ready" && <div className="form-section" role="alert"><p>El carrito no se restauró completamente. Reintenta antes de revisar precios.</p>
        <button className="secondary-dark-button" type="button" onClick={retryRestore}>Reintentar carrito</button></div>}
      {storageError && <p className="form-section" role="alert">El navegador no pudo guardar el carrito. Comprueba tu selección antes de continuar.</p>}
      {unsupported && <p className="form-section" role="status">Hay productos sin precio, de demostración o sin disponibilidad confirmada. No se puede confirmar esta selección como compra.</p>}
      {resuming && <p className="form-section" role="status">Recuperando tu solicitud pendiente…</p>}
      {loadState === "ready" && !resuming && <form className="checkout-form" onSubmit={requestReview}>
        <section className="form-section" aria-labelledby="billing-title"><div className="form-section-heading"><span>1</span><div>
          <h2 id="billing-title">Datos de facturación</h2><p>GreenBel emite la factura por su proceso interno. Los precios ya incluyen IVA.</p></div></div>
          <fieldset className="checkout-billing-choice"><legend>Tipo de factura</legend>
            <label><input type="radio" name="billing" checked={billingKind === "cf"} onChange={() => setBillingKind("cf")} /> Consumidor final (CF)</label>
            <label><input type="radio" name="billing" checked={billingKind === "nit"} onChange={() => setBillingKind("nit")} /> Con NIT</label>
          </fieldset><div className="form-grid">
          {billingKind === "cf" ? <>
            <label>Nombre<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required maxLength={160} /></label>
            <label>Apellido<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required maxLength={160} /></label>
          </> : <>
            <label>NIT<input value={nit} onChange={(event) => setNit(event.target.value)} required maxLength={40} /></label>
            <label>Nombre del titular del NIT<input value={nitOwnerName} onChange={(event) => setNitOwnerName(event.target.value)} required maxLength={160} /></label>
            <label>Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required maxLength={240} /></label>
            <label>Correo (opcional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} /></label>
          </>}
          <label>Teléfono<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required maxLength={40} /></label>
        </div></section>
        <section className="form-section" aria-labelledby="delivery-title"><div className="form-section-heading"><span>2</span><div>
          <h2 id="delivery-title">Entrega</h2><p>Una tarifa pendiente necesita propuesta y nueva aceptación.</p></div></div>
          <div className="form-grid"><label className="field-wide">Servicio<select value={serviceId} onChange={(event) => changeService(event.target.value)} required>
            <option value="">Selecciona entrega</option>{options?.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          {service?.kind === "pickup" && service.pickup_details && <div className="checkout-pickup-details field-wide">
            <strong>Retiro gratuito</strong><p>{service.pickup_details.address}</p><p>{service.pickup_details.hours}</p><p>{service.pickup_details.instructions}</p></div>}
          {service && service.kind !== "pickup" && <>
            <label className="field-wide">Zona o municipio<select value={zoneId} onChange={(event) => changeZone(event.target.value)} required>
              <option value="">Selecciona destino</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {zone.municipality}, {zone.department}</option>)}
            </select></label>
            {rate?.shipping_charge_mode === "customer_choice" && <label className="field-wide">Cómo pagar el transporte
              <select value={chargeMode} onChange={(event) => setChargeMode(event.target.value as "with_order" | "at_destination")} required>
                <option value="">Selecciona</option><option value="with_order">Junto con el pedido</option><option value="at_destination">Al recibir</option>
              </select></label>}
            <label>Nombre de quien recibe<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required maxLength={240} autoComplete="name" /></label>
            <label>Teléfono de quien recibe<input type="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} required maxLength={40} autoComplete="tel" /></label>
            <label className="field-wide">Dirección de entrega<input value={addressLine} onChange={(event) => setAddressLine(event.target.value)} required minLength={5} maxLength={500} autoComplete="street-address" /></label>
            {rate && <p className="checkout-fee-note field-wide">Transporte: {rate.pricing_mode === "manual" || rate.shipping_fee === null
              ? "Pendiente de cotización manual" : money(Number(rate.shipping_fee).toFixed(2))}. El servidor confirma el importe.</p>}
          </>}
        </div></section>
        <section className="form-section" aria-labelledby="payment-title"><div className="form-section-heading"><span>3</span><div>
          <h2 id="payment-title">Forma de pago</h2><p>El cobro y el avance de entrega se registran por separado.</p></div></div>
          <label className="checkout-payment-select">Medio<select value={paymentOptionId} onChange={(event) => setPaymentOptionId(event.target.value)} required disabled={!serviceId}>
            <option value="">Selecciona un medio</option>{payments.map((option) => <option key={option.id} value={option.id}>{paymentLabel(option)}</option>)}
          </select></label>
        </section>
        {message && <p className="checkout-feedback" role="alert">{message}</p>}
        <button className="primary-button checkout-submit" type="submit" disabled={busy !== null || !cartReady || unsupported || options?.services.length === 0}>
          {busy === "review" ? "Calculando en servidor…" : review && !reviewCurrent ? "Actualizar revisión" : "Revisar total y disponibilidad"}
        </button>
      </form>}
      {review && reviewCurrent && <section className="form-section" aria-labelledby="review-title">
        <div className="form-section-heading"><span>4</span><div><h2 id="review-title">Revisión del servidor</h2>
          <p>Versión {review.data.revision}. El inventario se verifica de nuevo al confirmar.</p></div></div>
        <dl className="checkout-reviewed-lines">{review.data.lines.map((line) => <div key={line.productId}>
          <dt>{line.quantity} × {line.name}</dt><dd>{money(line.lineTotal)}</dd></div>)}
          <div><dt>Productos</dt><dd>{money(review.data.merchandiseTotal)}</dd></div>
          <div><dt>Transporte</dt><dd>{review.data.shippingFee === null ? "Pendiente de cotizar" : money(review.data.shippingFee)}</dd></div>
          <div className="checkout-reviewed-total"><dt>Total para el cliente</dt><dd>{review.data.total === null ? "Pendiente" : money(review.data.total)}</dd></div>
        </dl>
        {review.data.amountDueCarrierShipping !== null && review.data.amountDueCarrierShipping !== "0.00" &&
          <p>Transporte que se paga directamente a la transportadora: {money(review.data.amountDueCarrierShipping)}. No se cobra dos veces.</p>}
        {review.data.stage === "pending_shipping" ? <p role="status">GreenBel debe proponer el costo del transporte. No se reservó inventario ni se creó un cobro.</p>
          : <><p>Confirmar crea una reserva; no marca el pago como completado ni despacha el pedido.</p>
            <button className="primary-button checkout-submit" type="button" onClick={confirm} disabled={busy !== null || !cartReady}>
              {busy === "confirm" ? "Confirmando de forma segura…" : `Aceptar ${money(review.data.total!)} y confirmar pedido`}
            </button></>}
      </section>}
    </div><aside className="summary-panel checkout-summary"><span className="eyebrow">Tu carrito</span><h2>Resumen provisional</h2>
      <div className="checkout-products">{lines.map(({ product, quantity }) => <div key={product.id}>
        <span><b>{quantity}</b>{product.name}<small>{product.sku}</small></span>
        <strong>{product.price === null ? "Precio próximamente" : money((product.price * quantity).toFixed(2))}</strong>
      </div>)}</div><div className="summary-lines"><span>Productos <strong>{totals.subtotal === null ? "Pendiente" : money(totals.subtotal.toFixed(2))}</strong></span>
        <span>Entrega <strong>{rate?.pricing_mode === "manual" ? "Pendiente" : service?.kind === "pickup" ? "Retiro gratuito" : "Por revisar"}</strong></span>
        <span className="summary-total">Total final <strong>{review && reviewCurrent && review.data.total !== null ? money(review.data.total) : "Pendiente de revisar"}</strong></span></div>
      <p className="warranty-note">El carrito no garantiza precio ni disponibilidad. El total se calcula en servidor con IVA ya incluido.</p>
      <Link href="/carrito" className="continue-shopping">Editar carrito</Link>
    </aside></div>
  </section>;
}
