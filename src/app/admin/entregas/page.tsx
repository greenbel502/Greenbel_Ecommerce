import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { getActiveEnvironment } from "@/lib/server/environment";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveCheckoutSettings, saveDeliveryService, saveDeliveryZone, saveServicePaymentOption, saveServiceZoneRate } from "./actions";
import styles from "./delivery-admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración de entregas", robots: { index: false, follow: false } };

type PickupDetails = { address: string; hours: string; instructions: string };
type Service = {
  id: string; name: string; kind: "pickup" | "own_delivery" | "external"; carrier_name: string | null;
  active: boolean; cod_enabled: boolean; cod_limit: string | number | null; cod_terms_reference: string | null;
  commission_percent: string | number | null; commission_min: string | number | null; commission_notes: string | null;
  pickup_details: PickupDetails | null;
};
type Zone = { id: string; code: string; name: string; department: string; municipality: string; zone_detail: string | null; active: boolean };
type Rate = { id: string; service_id: string; zone_id: string; pricing_mode: "fixed" | "manual"; shipping_fee: string | number | null; shipping_charge_mode: "with_order" | "at_destination" | "customer_choice"; active: boolean };
type Option = { id: string; service_id: string; method: "online_gateway" | "cash" | "terminal" | "carrier_cod"; timing: "prepaid" | "on_delivery" | "on_pickup"; active: boolean };
type CheckoutSettings = { online_reservation_minutes: number | null; offline_review_hours: number | null; simulated_gateway_enabled: boolean };

const messages: Record<string, string> = {
  service_saved: "Servicio guardado. Su disponibilidad depende de su estado, cobertura y medios configurados.",
  zone_saved: "Zona guardada.", rate_saved: "Cobertura y tarifa guardadas.", option_saved: "Medio de pago guardado.",
  invalid_service: "Revisa el servicio. El retiro requiere dirección, horario e instrucciones completos; COD requiere condiciones verificadas.",
  invalid_zone: "Revisa el código, la ubicación y el nombre de la zona.",
  invalid_rate: "Revisa la cobertura: una tarifa fija necesita monto GTQ; una tarifa manual debe dejarlo vacío.",
  invalid_option: "El medio de pago y su momento de cobro no corresponden a este servicio.",
  missing_service: "El servicio ya no está disponible.", immutable_kind: "No se puede cambiar el tipo de un servicio existente. Crea otro servicio.",
  immutable_pair: "No se puede cambiar la relación de una cobertura o medio existente. Crea una entrada nueva.",
  disable_cod_option_first: "Desactiva la opción de cobro por transportadora antes de retirar sus condiciones COD.",
  create_inactive_first: "Crea primero el registro inactivo; después revisa sus relaciones antes de activarlo.",
  payment_required: "Configura al menos un medio activo compatible antes de activar el servicio.",
  coverage_required: "Activa una zona y su cobertura antes de activar un servicio de entrega.",
  deactivate_service_first: "Desactiva el servicio antes de retirar un medio, cobertura o zona que utiliza.",
  invalid_coverage: "La cobertura necesita una zona y un servicio de entrega existentes; retiro no usa zonas.",
  activate_zone_first: "Activa la zona antes de activar su cobertura.",
  gateway_pending: "Solo puedes activar la opción de pasarela cuando el simulador PRUEBA DEV está habilitado en los ajustes de checkout.",
  cod_terms_required: "Registra y habilita las condiciones COD de la transportadora antes de activar este medio.",
  service_failed: "No se pudo guardar el servicio. Revisa duplicados, tipo y condiciones.",
  zone_failed: "No se pudo guardar la zona. Revisa si su código ya existe.",
  rate_failed: "No se pudo guardar la cobertura. Revisa si esa pareja servicio/zona ya existe y cumple las restricciones.",
  option_failed: "No se pudo guardar el medio. Revisa si ya existe y si es compatible con el servicio.",
  configuration_unavailable: "La configuración segura del entorno no está disponible; no se guardó ningún cambio.",
  settings_saved: "Ajustes de PRUEBA DEV guardados. Vacío significa que esa ruta de compra está cerrada.",
  invalid_settings: "Los plazos deben ser números enteros válidos: hasta 1,440 minutos en línea y 720 horas presenciales.",
  settings_failed: "No se pudieron guardar los ajustes de checkout DEV.",
  settings_dev_only: "Estos ajustes de simulación solo se pueden cambiar en DEV."
};

function statusLabel(active: boolean): string { return active ? "Activo" : "Inactivo"; }
function kindLabel(kind: Service["kind"]): string {
  return kind === "pickup" ? "Retiro" : kind === "own_delivery" ? "Mensajería propia" : "Transportadora externa";
}
function methodLabel(method: Option["method"]): string {
  return { online_gateway: "Pasarela en línea", cash: "Efectivo", terminal: "Terminal", carrier_cod: "Cobro por transportadora" }[method];
}
function timingLabel(timing: Option["timing"]): string {
  return { prepaid: "Antes de entregar", on_delivery: "Contra entrega", on_pickup: "Al retirar" }[timing];
}
function chargeLabel(mode: Rate["shipping_charge_mode"]): string {
  return { with_order: "Con el pedido", at_destination: "En destino", customer_choice: "A elección del cliente" }[mode];
}

function ServiceForm({ service }: { service?: Service }) {
  const pickup = service?.pickup_details;
  return <form action={saveDeliveryService} className={styles.form}>
    <input type="hidden" name="id" value={service?.id ?? ""} />
    <div className={styles.fields}>
      <label>Nombre del servicio<input name="name" required maxLength={160} defaultValue={service?.name ?? ""} /></label>
      <label>Tipo{service ? <><input type="hidden" name="kind" value={service.kind} /><span className={styles.readonly}>{kindLabel(service.kind)}</span></> :
        <select name="kind" required defaultValue=""><option value="" disabled>Seleccionar</option><option value="pickup">Retiro</option><option value="own_delivery">Mensajería propia</option><option value="external">Transportadora externa</option></select>}</label>
      <label>Nombre de la transportadora <small>Solo externo</small><input name="carrierName" maxLength={160} defaultValue={service?.carrier_name ?? ""} /></label>
      <label className={styles.check}><input type="checkbox" name="active" defaultChecked={service?.active ?? false} /> Servicio activo</label>
    </div>
    <fieldset><legend>Punto de retiro · solo retiro</legend><div className={styles.fields}>
      <label>Dirección<input name="pickupAddress" maxLength={500} defaultValue={pickup?.address ?? ""} /></label>
      <label>Horario<input name="pickupHours" maxLength={300} defaultValue={pickup?.hours ?? ""} /></label>
      <label className={styles.wide}>Instrucciones<textarea name="pickupInstructions" maxLength={1000} rows={2} defaultValue={pickup?.instructions ?? ""} /></label>
    </div></fieldset>
    <fieldset><legend>Condiciones de cobro por transportadora · solo externo</legend><div className={styles.fields}>
      <label className={styles.check}><input type="checkbox" name="codEnabled" defaultChecked={service?.cod_enabled ?? false} /> COD habilitado tras verificar condiciones</label>
      <label>Límite de cobro (GTQ)<input name="codLimit" inputMode="decimal" placeholder="Sin dato confirmado" defaultValue={service?.cod_limit ?? ""} /></label>
      <label>Referencia de condiciones<input name="codTermsReference" maxLength={300} defaultValue={service?.cod_terms_reference ?? ""} /></label>
      <label>Comisión % <small>Si está confirmada</small><input name="commissionPercent" inputMode="decimal" defaultValue={service?.commission_percent ?? ""} /></label>
      <label>Comisión mínima (GTQ) <small>Si está confirmada</small><input name="commissionMin" inputMode="decimal" defaultValue={service?.commission_min ?? ""} /></label>
      <label className={styles.wide}>Notas de condiciones<textarea name="commissionNotes" maxLength={500} rows={2} defaultValue={service?.commission_notes ?? ""} /></label>
    </div></fieldset>
    <button type="submit" className="primary-button">{service ? "Guardar servicio" : "Crear servicio inactivo"}</button>
  </form>;
}

function ZoneForm({ zone }: { zone?: Zone }) {
  return <form action={saveDeliveryZone} className={styles.form}>
    <input type="hidden" name="id" value={zone?.id ?? ""} />
    <div className={styles.fields}>
      <label>Código único<input name="code" required maxLength={40} pattern="[A-Z0-9][A-Z0-9_-]*" defaultValue={zone?.code ?? ""} placeholder="EJEMPLO_DEV" /></label>
      <label>Nombre de zona<input name="name" required maxLength={160} defaultValue={zone?.name ?? ""} /></label>
      <label>Departamento<input name="department" required maxLength={160} defaultValue={zone?.department ?? ""} /></label>
      <label>Municipio<input name="municipality" required maxLength={160} defaultValue={zone?.municipality ?? ""} /></label>
      <label>Detalle opcional<input name="zoneDetail" maxLength={160} defaultValue={zone?.zone_detail ?? ""} /></label>
      <label className={styles.check}><input type="checkbox" name="active" defaultChecked={zone?.active ?? false} /> Zona activa</label>
    </div>
    <button type="submit" className="primary-button">{zone ? "Guardar zona" : "Crear zona inactiva"}</button>
  </form>;
}

function RateForm({ rate, services, zones }: { rate?: Rate; services: Service[]; zones: Zone[] }) {
  return <form action={saveServiceZoneRate} className={styles.form}>
    <input type="hidden" name="id" value={rate?.id ?? ""} />
    <div className={styles.fields}>
      <label>Servicio<select name="serviceId" required defaultValue={rate?.service_id ?? ""} disabled={!!rate}>
        <option value="" disabled>Seleccionar</option>{services.filter((service) => service.kind !== "pickup").map((service) =>
          <option value={service.id} key={service.id}>{service.name} · {kindLabel(service.kind)}</option>)}
      </select>{rate && <input type="hidden" name="serviceId" value={rate.service_id} />}</label>
      <label>Zona<select name="zoneId" required defaultValue={rate?.zone_id ?? ""} disabled={!!rate}>
        <option value="" disabled>Seleccionar</option>{zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.code} · {zone.name}</option>)}
      </select>{rate && <input type="hidden" name="zoneId" value={rate.zone_id} />}</label>
      <label>Tipo de tarifa<select name="pricingMode" required defaultValue={rate?.pricing_mode ?? "manual"}>
        <option value="manual">Manual · costo pendiente</option><option value="fixed">Fija</option>
      </select></label>
      <label>Tarifa fija (GTQ) <small>Vacío para manual; cero solo si realmente es gratis</small><input name="shippingFee" inputMode="decimal" defaultValue={rate?.shipping_fee ?? ""} /></label>
      <label>Cómo se cobra el transporte<select name="chargeMode" required defaultValue={rate?.shipping_charge_mode ?? "with_order"}>
        <option value="with_order">Con el pedido</option><option value="at_destination">En destino</option><option value="customer_choice">A elección del cliente</option>
      </select></label>
      <label className={styles.check}><input type="checkbox" name="active" defaultChecked={rate?.active ?? false} /> Cobertura activa</label>
    </div>
    <button type="submit" className="primary-button">{rate ? "Guardar cobertura" : "Crear cobertura inactiva"}</button>
  </form>;
}

function OptionForm({ option, services }: { option?: Option; services: Service[] }) {
  return <form action={saveServicePaymentOption} className={styles.form}>
    <input type="hidden" name="id" value={option?.id ?? ""} />
    <div className={styles.fields}>
      <label>Servicio<select name="serviceId" required defaultValue={option?.service_id ?? ""} disabled={!!option}>
        <option value="" disabled>Seleccionar</option>{services.map((service) => <option value={service.id} key={service.id}>{service.name} · {kindLabel(service.kind)}</option>)}
      </select>{option && <input type="hidden" name="serviceId" value={option.service_id} />}</label>
      <label>Medio<select name="method" required defaultValue={option?.method ?? ""} disabled={!!option}>
        <option value="" disabled>Seleccionar</option><option value="online_gateway">Pasarela en línea</option>
        <option value="cash">Efectivo</option><option value="terminal">Terminal</option><option value="carrier_cod">Cobro por transportadora</option>
      </select>{option && <input type="hidden" name="method" value={option.method} />}</label>
      <label>Momento<select name="timing" required defaultValue={option?.timing ?? ""} disabled={!!option}>
        <option value="" disabled>Seleccionar</option><option value="prepaid">Antes de entregar</option>
        <option value="on_delivery">Contra entrega</option><option value="on_pickup">Al retirar</option>
      </select>{option && <input type="hidden" name="timing" value={option.timing} />}</label>
      <label className={styles.check}><input type="checkbox" name="active" defaultChecked={option?.active ?? false} /> Medio activo</label>
    </div>
    <button type="submit" className="primary-button">{option ? "Guardar medio" : "Crear medio inactivo"}</button>
  </form>;
}

export default async function DeliveryAdminPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <main className={styles.shell}><p role="alert">No se pudo verificar el acceso a entregas.</p></main>;
  }

  let services: Service[] = [];
  let zones: Zone[] = [];
  let rates: Rate[] = [];
  let options: Option[] = [];
  let checkoutSettings: CheckoutSettings | null = null;
  let checkoutSettingsAvailable = false;
  try {
    const admin = createSupabaseAdminClient();
    const [serviceResult, zoneResult, rateResult, optionResult] = await Promise.all([
      admin.from("delivery_services").select("id,name,kind,carrier_name,active,cod_enabled,cod_limit,cod_terms_reference,commission_percent,commission_min,commission_notes,pickup_details").order("name").limit(500),
      admin.from("delivery_zones").select("id,code,name,department,municipality,zone_detail,active").order("code").limit(500),
      admin.from("service_zone_rates").select("id,service_id,zone_id,pricing_mode,shipping_fee,shipping_charge_mode,active").order("created_at", { ascending: false }).limit(1000),
      admin.from("service_payment_options").select("id,service_id,method,timing,active").order("created_at", { ascending: false }).limit(1000)
    ]);
    if (serviceResult.error || zoneResult.error || rateResult.error || optionResult.error) throw new Error("Delivery configuration unavailable");
    services = (serviceResult.data ?? []) as Service[];
    zones = (zoneResult.data ?? []) as Zone[];
    rates = (rateResult.data ?? []) as Rate[];
    options = (optionResult.data ?? []) as Option[];
    const settingsResult = await admin.from("checkout_settings")
      .select("online_reservation_minutes,offline_review_hours,simulated_gateway_enabled")
      .eq("id", true).maybeSingle();
    checkoutSettingsAvailable = !settingsResult.error;
    checkoutSettings = (settingsResult.data ?? null) as CheckoutSettings | null;
  } catch {
    return <main className={styles.shell}><h1>Configuración de entregas</h1><p role="alert">La configuración no está disponible. Verifica que la migración de entregas esté aplicada en DEV.</p></main>;
  }

  const result = (await searchParams).result;
  const serviceNames = new Map(services.map((service) => [service.id, service.name]));
  const zoneNames = new Map(zones.map((zone) => [zone.id, `${zone.code} · ${zone.name}`]));
  const devMode = getActiveEnvironment().appEnvironment === "DEV";

  return <main className={styles.shell}>
    <header className={styles.hero}><div><span className="eyebrow">Panel administrativo</span><h1>Entregas, zonas y medios</h1><p>Configura retiro, mensajería propia y servicios externos con sus coberturas y medios compatibles.</p></div><Link href="/admin/catalogo" className="secondary-dark-button">Volver al catálogo</Link></header>
    <p className={styles.notice}>No hay transportadoras, tarifas ni punto de retiro precargados. Registra solo datos y condiciones verificados. El simulador de pasarela es exclusivo de PRUEBA DEV y nunca acredita un cobro real.</p>
    {result && messages[result] && <p className={result.endsWith("_saved") ? styles.success : styles.error} role={result.endsWith("_saved") ? "status" : "alert"}>{messages[result]}</p>}
    {(services.length === 500 || zones.length === 500 || rates.length === 1000 || options.length === 1000) && <p className={styles.notice}>Esta vista alcanzó su límite de registros; revisa la lista completa antes de modificar elementos no visibles.</p>}
    <nav className={styles.sectionNav} aria-label="Secciones de entregas"><a href="#ajustes">Ajustes DEV</a><a href="#servicios">Servicios</a><a href="#zonas">Zonas</a><a href="#coberturas">Coberturas y tarifas</a><a href="#medios">Medios de pago</a></nav>
    <section id="ajustes" className={styles.section}><h2>Checkout · PRUEBA DEV</h2>
      <p>Los plazos son configurables. Una casilla vacía cierra ese método hasta definir un plazo. Desactivar el simulador bloquea la revisión de compras con pasarela aunque haya una opción de medio activa.</p>
      {!devMode ? <p className={styles.notice}>La configuración de simulación solo está disponible en DEV.</p>
        : !checkoutSettingsAvailable ? <p className={styles.notice}>La migración transaccional de checkout aún no está disponible; los ajustes siguen cerrados.</p>
          : <form action={saveCheckoutSettings} className={styles.form}>
            <div className={styles.fields}>
              <label>Reserva temporal en línea (minutos)<input name="onlineMinutes" type="number" min="1" max="1440" step="1" defaultValue={checkoutSettings?.online_reservation_minutes ?? ""} placeholder="Ruta cerrada" /></label>
              <label>Revisión de pedido presencial (horas)<input name="offlineHours" type="number" min="1" max="720" step="1" defaultValue={checkoutSettings?.offline_review_hours ?? ""} placeholder="Ruta cerrada" /></label>
              <label className={styles.check}><input type="checkbox" name="simulatedGatewayEnabled" defaultChecked={checkoutSettings?.simulated_gateway_enabled ?? false} /> Simulador de pasarela PRUEBA DEV</label>
            </div>
            <button type="submit" className="primary-button">Guardar ajustes DEV</button>
          </form>}
    </section>
    <section id="servicios" className={styles.section}><h2>Servicios <span>{services.length}</span></h2><p>El retiro requiere dirección, horario e instrucciones. Un servicio activo requiere al menos un medio compatible activo; las entregas también necesitan cobertura en una zona activa.</p>
      <details className={styles.create}><summary>Crear servicio</summary><ServiceForm /></details>
      <div className={styles.list}>{services.map((service) => <article key={service.id} className={styles.card}><div className={styles.cardHead}><div><h3>{service.name}</h3><p>{kindLabel(service.kind)}{service.carrier_name ? ` · ${service.carrier_name}` : ""}</p></div><span className={service.active ? styles.active : styles.inactive}>{statusLabel(service.active)}</span></div>
        {service.kind === "pickup" && <p>{service.pickup_details ? `${service.pickup_details.address} · ${service.pickup_details.hours}` : "Punto de retiro sin datos completos"}</p>}
        {service.kind === "external" && <p>COD: {service.cod_enabled ? "configurado" : "inactivo"}</p>}
        <details><summary>Editar servicio y estado</summary><ServiceForm service={service} /></details>
      </article>)}</div>
    </section>
    <section id="zonas" className={styles.section}><h2>Zonas <span>{zones.length}</span></h2><p>Una zona define cobertura geográfica; la tarifa se configura por cada servicio de entrega.</p>
      <details className={styles.create}><summary>Crear zona</summary><ZoneForm /></details>
      <div className={styles.list}>{zones.map((zone) => <article key={zone.id} className={styles.card}><div className={styles.cardHead}><div><h3>{zone.code} · {zone.name}</h3><p>{zone.municipality}, {zone.department}{zone.zone_detail ? ` · ${zone.zone_detail}` : ""}</p></div><span className={zone.active ? styles.active : styles.inactive}>{statusLabel(zone.active)}</span></div><details><summary>Editar zona y estado</summary><ZoneForm zone={zone} /></details></article>)}</div>
    </section>
    <section id="coberturas" className={styles.section}><h2>Coberturas y tarifas <span>{rates.length}</span></h2><p>Tarifa manual significa costo pendiente, nunca Q0. Solo servicios de entrega usan zonas. El cobro del transporte se define separado del medio de pago de productos.</p>
      <details className={styles.create}><summary>Crear cobertura</summary><RateForm services={services} zones={zones} /></details>
      <div className={styles.list}>{rates.map((rate) => <article key={rate.id} className={styles.card}><div className={styles.cardHead}><div><h3>{serviceNames.get(rate.service_id) ?? "Servicio no disponible"} · {zoneNames.get(rate.zone_id) ?? "Zona no disponible"}</h3><p>{rate.pricing_mode === "manual" ? "Costo pendiente de cotización" : `Q${rate.shipping_fee} GTQ`} · {chargeLabel(rate.shipping_charge_mode)}</p></div><span className={rate.active ? styles.active : styles.inactive}>{statusLabel(rate.active)}</span></div><details><summary>Editar cobertura y estado</summary><RateForm rate={rate} services={services} zones={zones} /></details></article>)}</div>
    </section>
    <section id="medios" className={styles.section}><h2>Medios de pago por servicio <span>{options.length}</span></h2><p>Retiro: efectivo/terminal al retirar. Mensajería propia: efectivo/terminal contra entrega. Externo: COD solo con condiciones confirmadas. La opción en línea solo usa el simulador PRUEBA DEV cuando está habilitado.</p>
      <details className={styles.create}><summary>Crear medio</summary><OptionForm services={services} /></details>
      <div className={styles.list}>{options.map((option) => <article key={option.id} className={styles.card}><div className={styles.cardHead}><div><h3>{serviceNames.get(option.service_id) ?? "Servicio no disponible"} · {methodLabel(option.method)}</h3><p>{timingLabel(option.timing)}</p></div><span className={option.active ? styles.active : styles.inactive}>{statusLabel(option.active)}</span></div><details><summary>Editar medio y estado</summary><OptionForm option={option} services={services} /></details></article>)}</div>
    </section>
  </main>;
}
