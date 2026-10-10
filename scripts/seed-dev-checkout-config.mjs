/**
 * Configuración comercial ficticia, idempotente y exclusiva de Supabase DEV.
 * No modifica registros existentes: una diferencia detiene la carga.
 * Ejecutar después de la migración de checkout:
 * node --env-file=.env scripts/seed-dev-checkout-config.mjs --apply
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv.length !== 3 || process.argv[2] !== "--apply") {
  console.error("NO EJECUTADO: se requiere --apply para cargar PRUEBA DEV.");
  process.exit(2);
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const key = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && key && linked === ref,
  "Destino DEV y enlace requeridos");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`, "URL DEV distinta del enlace");
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled",
  "Correos de negocio deben seguir pausados");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const tag = "PRUEBA DEV";
const ids = Object.freeze({
  pickup: "a1000000-0000-4000-8000-000000000001",
  own: "a1000000-0000-4000-8000-000000000002",
  external: "a1000000-0000-4000-8000-000000000003",
  fixedZone: "a2000000-0000-4000-8000-000000000001",
  manualZone: "a2000000-0000-4000-8000-000000000002",
  ownFixedRate: "a3000000-0000-4000-8000-000000000001",
  externalFixedRate: "a3000000-0000-4000-8000-000000000002",
  ownManualRate: "a3000000-0000-4000-8000-000000000003",
  pickupCash: "a4000000-0000-4000-8000-000000000001",
  pickupTerminal: "a4000000-0000-4000-8000-000000000002",
  pickupOnline: "a4000000-0000-4000-8000-000000000003",
  ownCash: "a4000000-0000-4000-8000-000000000004",
  ownTerminal: "a4000000-0000-4000-8000-000000000005",
  ownOnline: "a4000000-0000-4000-8000-000000000006",
  externalOnline: "a4000000-0000-4000-8000-000000000007",
  externalCod: "a4000000-0000-4000-8000-000000000008"
});

const settings = {
  id: true,
  online_reservation_minutes: 15,
  offline_review_hours: 24,
  simulated_gateway_enabled: true
};
const services = [
  {
    id: ids.pickup, name: `${tag} · Punto de retiro ficticio`, kind: "pickup",
    carrier_name: null, cod_enabled: false, cod_limit: null, cod_terms_reference: null,
    commission_percent: null, commission_min: null, commission_notes: null,
    pickup_details: {
      address: "Punto de retiro PRUEBA DEV, dirección ficticia",
      hours: "Lunes a viernes, 08:00–17:00",
      instructions: "PRUEBA DEV: punto inexistente; no acudir ni entregar mercancía."
    }
  },
  {
    id: ids.own, name: `${tag} · Mensajería propia ficticia`, kind: "own_delivery",
    carrier_name: null, cod_enabled: false, cod_limit: null, cod_terms_reference: null,
    commission_percent: null, commission_min: null, commission_notes: null,
    pickup_details: null
  },
  {
    id: ids.external, name: `${tag} · Transportadora simulada`, kind: "external",
    carrier_name: "Transportadora ficticia PRUEBA DEV", cod_enabled: true,
    cod_limit: "500.00", cod_terms_reference: "PRUEBA DEV · contrato inexistente",
    commission_percent: null, commission_min: null,
    commission_notes: "PRUEBA DEV: condiciones y límite solo para ensayos; sin contrato ni servicio real.",
    pickup_details: null
  }
];
const zones = [
  { id: ids.fixedZone, code: "GB_DEV_FIXED", name: `${tag} · Zona ficticia fija`,
    department: `${tag} · departamento ficticio`, municipality: `${tag} · municipio ficticio`,
    zone_detail: "Sin cobertura real", active: true },
  { id: ids.manualZone, code: "GB_DEV_MANUAL", name: `${tag} · Zona ficticia manual`,
    department: `${tag} · departamento ficticio`, municipality: `${tag} · municipio manual`,
    zone_detail: "Costo pendiente de cotización", active: true }
];
const rates = [
  { id: ids.ownFixedRate, service_id: ids.own, zone_id: ids.fixedZone,
    pricing_mode: "fixed", shipping_fee: "25.00", currency: "GTQ",
    shipping_charge_mode: "with_order", active: true },
  { id: ids.externalFixedRate, service_id: ids.external, zone_id: ids.fixedZone,
    pricing_mode: "fixed", shipping_fee: "40.00", currency: "GTQ",
    shipping_charge_mode: "at_destination", active: true },
  { id: ids.ownManualRate, service_id: ids.own, zone_id: ids.manualZone,
    pricing_mode: "manual", shipping_fee: null, currency: "GTQ",
    shipping_charge_mode: "with_order", active: true }
];
const options = [
  [ids.pickupCash, ids.pickup, "cash", "on_pickup"],
  [ids.pickupTerminal, ids.pickup, "terminal", "on_pickup"],
  [ids.pickupOnline, ids.pickup, "online_gateway", "prepaid"],
  [ids.ownCash, ids.own, "cash", "on_delivery"],
  [ids.ownTerminal, ids.own, "terminal", "on_delivery"],
  [ids.ownOnline, ids.own, "online_gateway", "prepaid"],
  [ids.externalOnline, ids.external, "online_gateway", "prepaid"],
  [ids.externalCod, ids.external, "carrier_cod", "on_delivery"]
].map(([id, service_id, method, timing]) => ({ id, service_id, method, timing, active: true }));

function equal(actual, expected) {
  if (expected === null || typeof expected === "boolean") return actual === expected;
  if (typeof expected === "number") return Number(actual) === expected;
  if (typeof expected === "string" && /^\d+\.\d{2}$/.test(expected)) {
    return Number(actual) === Number(expected);
  }
  if (typeof expected === "string") return actual === expected;
  if (typeof expected === "object" && expected && actual && typeof actual === "object") {
    return Object.entries(expected).every(([key, value]) => equal(actual[key], value));
  }
  return false;
}

async function ensure(table, row) {
  const { data, error } = await db.from(table).select("*").eq("id", row.id).maybeSingle();
  if (error) throw new Error(`${table} lectura: ${error.code ?? "remote_error"}`);
  if (data) {
    if (!equal(data, row)) throw new Error(`${table} fixture ya existe con cambios; no se sobrescribió`);
    return { row: data, created: false };
  }
  const inserted = await db.from(table).insert(row).select("*").single();
  if (inserted.error || !inserted.data) {
    throw new Error(`${table} inserción: ${inserted.error?.code ?? "remote_error"}`);
  }
  return { row: inserted.data, created: true };
}

async function main() {
  let inserted = 0;
  const setting = await ensure("checkout_settings", settings);
  inserted += Number(setting.created);
  const createdServices = [];
  for (const service of services) {
    const { data, error } = await db.from("delivery_services").select("*").eq("id", service.id).maybeSingle();
    if (error) throw new Error(`Servicio DEV lectura: ${error.code ?? "remote_error"}`);
    if (data) {
      if (!equal(data, { ...service, active: true })) {
        throw new Error("Servicio DEV existente distinto o desactivado; no se sobrescribió");
      }
    } else {
      const created = await ensure("delivery_services", { ...service, active: false });
      if (!created.created) throw new Error("Servicio DEV cambió durante la carga");
      createdServices.push(service.id);
      inserted += 1;
    }
  }
  for (const zone of zones) inserted += Number((await ensure("delivery_zones", zone)).created);
  for (const rate of rates) inserted += Number((await ensure("service_zone_rates", rate)).created);
  for (const option of options) inserted += Number((await ensure("service_payment_options", option)).created);

  // Solo se activan servicios creados en esta ejecución tras verificar sus dependencias.
  for (const id of createdServices) {
    const activeOptions = options.filter((option) => option.service_id === id);
    const activeRates = rates.filter((rate) => rate.service_id === id);
    if (activeOptions.length === 0 || (id !== ids.pickup && activeRates.length === 0)) {
      throw new Error("Servicio PRUEBA DEV carece de medio o cobertura");
    }
    const changed = await db.from("delivery_services").update({ active: true })
      .eq("id", id).eq("active", false).select("id").single();
    if (changed.error || !changed.data) throw new Error("No se pudo activar el servicio PRUEBA DEV");
  }
  console.log(`PASS: configuración ${tag} idempotente; ${inserted} registros nuevos; retiro Q0, propia Q25, externa Q40, manual pendiente; 15 min/24 h.`);
  console.log("PASS: ningún registro existente se sobrescribió; no se realizó pedido, cobro, despacho ni envío de correo.");
}

main().catch((error) => {
  console.error(`FAIL: carga ${tag} detenida: ${error instanceof Error ? error.message : "error desconocido"}`);
  process.exitCode = 1;
});
