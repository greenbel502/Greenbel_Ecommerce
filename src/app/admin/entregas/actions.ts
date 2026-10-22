"use server";

import {
  AdminOperationResult,
  runAdminOperation,
  type AdminFormResult,
} from "@/lib/server/admin-operation-result";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { getActiveEnvironment } from "@/lib/server/environment";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuid = z.uuid();
const optionalId = z.union([uuid, z.literal("")]);
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
const percent = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) <= 100);
const optionalMoney = z.union([money, z.literal("")]);
const optionalPercent = z.union([percent, z.literal("")]);
const optionalOnlineMinutes = z.union([
  z.literal(""),
  z.coerce.number().int().min(1).max(1440),
]);
const optionalOfflineHours = z.union([
  z.literal(""),
  z.coerce.number().int().min(1).max(720),
]);

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function checked(data: FormData, key: string): boolean {
  return data.get(key) === "on";
}

function finish(code: string): never {
  revalidatePath("/admin/entregas");
  throw new AdminOperationResult(code);
}

function adminClientOrFail(): ReturnType<typeof createSupabaseAdminClient> {
  try {
    return createSupabaseAdminClient();
  } catch {
    finish("configuration_unavailable");
  }
}

async function adminOnly(): Promise<string> {
  try {
    const actor = await requireStaffActor(["admin"]);
    return actor.userId;
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "unauthenticated"
    )
      redirect("/cuenta/ingresar");
    notFound();
  }
}

const serviceSchema = z
  .object({
    id: optionalId,
    name: z.string().min(1).max(160),
    kind: z.enum(["pickup", "own_delivery", "external"]),
    carrierName: z.string().max(160),
    active: z.boolean(),
    codEnabled: z.boolean(),
    codLimit: optionalMoney,
    codTermsReference: z.string().max(300),
    commissionPercent: optionalPercent,
    commissionMin: optionalMoney,
    commissionNotes: z.string().max(500),
    pickupAddress: z.string().max(500),
    pickupHours: z.string().max(300),
    pickupInstructions: z.string().max(1000),
  })
  .superRefine((value, context) => {
    if (value.kind === "external" && !value.carrierName)
      context.addIssue({
        code: "custom",
        path: ["carrierName"],
        message: "La transportadora necesita nombre.",
      });
    if (
      value.kind !== "external" &&
      (value.carrierName ||
        value.codEnabled ||
        value.codLimit ||
        value.codTermsReference ||
        value.commissionPercent ||
        value.commissionMin ||
        value.commissionNotes)
    ) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message:
          "Los términos de transportadora son exclusivos del servicio externo.",
      });
    }
    if (
      value.codEnabled &&
      (value.kind !== "external" ||
        !value.codLimit ||
        Number(value.codLimit) <= 0 ||
        !value.codTermsReference ||
        !value.commissionNotes)
    ) {
      context.addIssue({
        code: "custom",
        path: ["codEnabled"],
        message: "Faltan límite y condiciones COD verificadas.",
      });
    }
    if (
      value.kind === "pickup" &&
      value.active &&
      (!value.pickupAddress || !value.pickupHours || !value.pickupInstructions)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pickupAddress"],
        message: "Completa dirección, horario e instrucciones de retiro.",
      });
    }
    if (
      value.kind === "pickup" &&
      [value.pickupAddress, value.pickupHours, value.pickupInstructions].some(
        Boolean,
      ) &&
      ![value.pickupAddress, value.pickupHours, value.pickupInstructions].every(
        Boolean,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["pickupAddress"],
        message: "Los datos de retiro deben completarse juntos.",
      });
    }
    if (
      value.kind !== "pickup" &&
      (value.pickupAddress || value.pickupHours || value.pickupInstructions)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pickupAddress"],
        message: "El punto de retiro solo aplica al retiro.",
      });
    }
  });

async function perform_saveDeliveryService(formData: FormData): Promise<void> {
  const actorId = await adminOnly();
  const parsed = serviceSchema.safeParse({
    id: field(formData, "id"),
    name: field(formData, "name"),
    kind: field(formData, "kind"),
    carrierName: field(formData, "carrierName"),
    active: checked(formData, "active"),
    codEnabled: checked(formData, "codEnabled"),
    codLimit: field(formData, "codLimit"),
    codTermsReference: field(formData, "codTermsReference"),
    commissionPercent: field(formData, "commissionPercent"),
    commissionMin: field(formData, "commissionMin"),
    commissionNotes: field(formData, "commissionNotes"),
    pickupAddress: field(formData, "pickupAddress"),
    pickupHours: field(formData, "pickupHours"),
    pickupInstructions: field(formData, "pickupInstructions"),
  });
  if (!parsed.success) finish("invalid_service");
  const input = parsed.data;
  const admin = adminClientOrFail();
  if (input.id) {
    const existing = await admin
      .from("delivery_services")
      .select("kind,cod_enabled")
      .eq("id", input.id)
      .maybeSingle();
    if (existing.error || !existing.data) finish("missing_service");
    if (existing.data.kind !== input.kind) finish("immutable_kind");
    if (existing.data.cod_enabled && !input.codEnabled) {
      const dependent = await admin
        .from("service_payment_options")
        .select("id", { count: "exact", head: true })
        .eq("service_id", input.id)
        .eq("method", "carrier_cod")
        .eq("active", true);
      if (dependent.error || (dependent.count ?? 0) > 0)
        finish("disable_cod_option_first");
    }
  }
  if (input.active) {
    if (!input.id) finish("create_inactive_first");
    const options = await admin
      .from("service_payment_options")
      .select("method")
      .eq("service_id", input.id)
      .eq("active", true);
    if (options.error || !options.data?.length) finish("payment_required");
    if (
      options.data.every((option) => option.method === "online_gateway") &&
      !(await devTestGatewayEnabled(admin))
    )
      finish("payment_required");
    if (input.kind !== "pickup") {
      const rates = await admin
        .from("service_zone_rates")
        .select("zone_id")
        .eq("service_id", input.id)
        .eq("active", true);
      if (rates.error || !rates.data?.length) finish("coverage_required");
      const zones = await admin
        .from("delivery_zones")
        .select("id")
        .in(
          "id",
          rates.data.map((rate) => rate.zone_id),
        )
        .eq("active", true)
        .limit(1);
      if (zones.error || !zones.data?.length) finish("coverage_required");
    }
  }
  const pickupDetails =
    input.kind === "pickup" && input.pickupAddress
      ? {
          address: input.pickupAddress,
          hours: input.pickupHours,
          instructions: input.pickupInstructions,
        }
      : null;
  const payload = {
    name: input.name,
    kind: input.kind,
    carrier_name: input.carrierName || null,
    active: input.active,
    cod_enabled: input.codEnabled,
    cod_limit: input.codLimit || null,
    cod_terms_reference: input.codTermsReference || null,
    commission_percent: input.commissionPercent || null,
    commission_min: input.commissionMin || null,
    commission_notes: input.commissionNotes || null,
    pickup_details: pickupDetails,
  };
  const query = input.id
    ? admin.from("delivery_services").update(payload).eq("id", input.id)
    : admin
        .from("delivery_services")
        .insert({ ...payload, created_by: actorId });
  const saved = await query.select("id").single();
  if (saved.error || !saved.data) finish("service_failed");
  finish("service_saved");
}

const zoneSchema = z.object({
  id: optionalId,
  code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
  name: z.string().min(1).max(160),
  department: z.string().min(1).max(160),
  municipality: z.string().min(1).max(160),
  zoneDetail: z.string().max(160),
  active: z.boolean(),
});

async function perform_saveDeliveryZone(formData: FormData): Promise<void> {
  await adminOnly();
  const parsed = zoneSchema.safeParse({
    id: field(formData, "id"),
    code: field(formData, "code"),
    name: field(formData, "name"),
    department: field(formData, "department"),
    municipality: field(formData, "municipality"),
    zoneDetail: field(formData, "zoneDetail"),
    active: checked(formData, "active"),
  });
  if (!parsed.success) finish("invalid_zone");
  const input = parsed.data;
  if (!input.id && input.active) finish("create_inactive_first");
  const admin = adminClientOrFail();
  if (input.id && !input.active) {
    const rates = await admin
      .from("service_zone_rates")
      .select("service_id")
      .eq("zone_id", input.id)
      .eq("active", true);
    if (rates.error) finish("zone_failed");
    if (rates.data?.length) {
      const linked = await admin
        .from("delivery_services")
        .select("id", { count: "exact", head: true })
        .in(
          "id",
          rates.data.map((rate) => rate.service_id),
        )
        .eq("active", true);
      if (linked.error || (linked.count ?? 0) > 0)
        finish("deactivate_service_first");
    }
  }
  const payload = {
    code: input.code,
    name: input.name,
    department: input.department,
    municipality: input.municipality,
    zone_detail: input.zoneDetail || null,
    active: input.active,
  };
  const query = input.id
    ? admin.from("delivery_zones").update(payload).eq("id", input.id)
    : admin.from("delivery_zones").insert(payload);
  const saved = await query.select("id").single();
  if (saved.error || !saved.data) finish("zone_failed");
  finish("zone_saved");
}

const rateSchema = z
  .object({
    id: optionalId,
    serviceId: uuid,
    zoneId: uuid,
    pricingMode: z.enum(["fixed", "manual"]),
    shippingFee: optionalMoney,
    chargeMode: z.enum(["with_order", "at_destination", "customer_choice"]),
    active: z.boolean(),
  })
  .refine(
    (value) =>
      value.pricingMode === "manual"
        ? value.shippingFee === ""
        : value.shippingFee !== "",
    {
      path: ["shippingFee"],
      message: "La tarifa manual no tiene monto; la fija sí.",
    },
  );

async function perform_saveServiceZoneRate(formData: FormData): Promise<void> {
  await adminOnly();
  const parsed = rateSchema.safeParse({
    id: field(formData, "id"),
    serviceId: field(formData, "serviceId"),
    zoneId: field(formData, "zoneId"),
    pricingMode: field(formData, "pricingMode"),
    shippingFee: field(formData, "shippingFee"),
    chargeMode: field(formData, "chargeMode"),
    active: checked(formData, "active"),
  });
  if (!parsed.success) finish("invalid_rate");
  const input = parsed.data;
  if (!input.id && input.active) finish("create_inactive_first");
  const admin = adminClientOrFail();
  const [service, zone] = await Promise.all([
    admin
      .from("delivery_services")
      .select("kind,active")
      .eq("id", input.serviceId)
      .maybeSingle(),
    admin
      .from("delivery_zones")
      .select("active")
      .eq("id", input.zoneId)
      .maybeSingle(),
  ]);
  if (
    service.error ||
    !service.data ||
    service.data.kind === "pickup" ||
    zone.error ||
    !zone.data
  )
    finish("invalid_coverage");
  if (input.active && !zone.data.active) finish("activate_zone_first");
  if (input.id) {
    const existing = await admin
      .from("service_zone_rates")
      .select("service_id,zone_id,active")
      .eq("id", input.id)
      .maybeSingle();
    if (
      existing.error ||
      !existing.data ||
      existing.data.service_id !== input.serviceId ||
      existing.data.zone_id !== input.zoneId
    )
      finish("immutable_pair");
    if (existing.data.active && !input.active && service.data.active)
      finish("deactivate_service_first");
  }
  const payload = {
    service_id: input.serviceId,
    zone_id: input.zoneId,
    pricing_mode: input.pricingMode,
    shipping_fee: input.pricingMode === "manual" ? null : input.shippingFee,
    currency: "GTQ",
    shipping_charge_mode: input.chargeMode,
    active: input.active,
  };
  const query = input.id
    ? admin.from("service_zone_rates").update(payload).eq("id", input.id)
    : admin.from("service_zone_rates").insert(payload);
  const saved = await query.select("id").single();
  if (saved.error || !saved.data) finish("rate_failed");
  finish("rate_saved");
}

const optionSchema = z.object({
  id: optionalId,
  serviceId: uuid,
  method: z.enum(["online_gateway", "cash", "terminal", "carrier_cod"]),
  timing: z.enum(["prepaid", "on_delivery", "on_pickup"]),
  active: z.boolean(),
});

function compatible(kind: string, method: string, timing: string): boolean {
  return (
    (method === "online_gateway" && timing === "prepaid") ||
    (kind === "pickup" &&
      ["cash", "terminal"].includes(method) &&
      timing === "on_pickup") ||
    (kind === "own_delivery" &&
      ["cash", "terminal"].includes(method) &&
      timing === "on_delivery") ||
    (kind === "external" &&
      method === "carrier_cod" &&
      timing === "on_delivery")
  );
}

async function devTestGatewayEnabled(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<boolean> {
  if (getActiveEnvironment().appEnvironment !== "DEV") return false;
  const { data, error } = await admin
    .from("checkout_settings")
    .select("simulated_gateway_enabled")
    .eq("id", true)
    .maybeSingle();
  return !error && data?.simulated_gateway_enabled === true;
}

async function perform_saveServicePaymentOption(
  formData: FormData,
): Promise<void> {
  await adminOnly();
  const parsed = optionSchema.safeParse({
    id: field(formData, "id"),
    serviceId: field(formData, "serviceId"),
    method: field(formData, "method"),
    timing: field(formData, "timing"),
    active: checked(formData, "active"),
  });
  if (!parsed.success) finish("invalid_option");
  const input = parsed.data;
  if (!input.id && input.active) finish("create_inactive_first");
  const admin = adminClientOrFail();
  const service = await admin
    .from("delivery_services")
    .select("kind,cod_enabled,active")
    .eq("id", input.serviceId)
    .maybeSingle();
  if (
    service.error ||
    !service.data ||
    !compatible(service.data.kind, input.method, input.timing)
  )
    finish("invalid_option");
  if (
    input.active &&
    input.method === "online_gateway" &&
    !(await devTestGatewayEnabled(admin))
  )
    finish("gateway_pending");
  if (
    input.active &&
    input.method === "carrier_cod" &&
    !service.data.cod_enabled
  )
    finish("cod_terms_required");
  if (input.id) {
    const existing = await admin
      .from("service_payment_options")
      .select("service_id,method,timing,active")
      .eq("id", input.id)
      .maybeSingle();
    if (
      existing.error ||
      !existing.data ||
      existing.data.service_id !== input.serviceId ||
      existing.data.method !== input.method ||
      existing.data.timing !== input.timing
    )
      finish("immutable_pair");
    if (existing.data.active && !input.active && service.data.active)
      finish("deactivate_service_first");
  }
  const payload = {
    service_id: input.serviceId,
    method: input.method,
    timing: input.timing,
    active: input.active,
  };
  const query = input.id
    ? admin.from("service_payment_options").update(payload).eq("id", input.id)
    : admin.from("service_payment_options").insert(payload);
  const saved = await query.select("id").single();
  if (saved.error || !saved.data) finish("option_failed");
  finish("option_saved");
}

/** DEV-only policy switch. Blank duration closes that checkout path. */
async function perform_saveCheckoutSettings(formData: FormData): Promise<void> {
  const actorId = await adminOnly();
  if (getActiveEnvironment().appEnvironment !== "DEV")
    finish("settings_dev_only");
  const parsed = z
    .object({
      onlineMinutes: optionalOnlineMinutes,
      offlineHours: optionalOfflineHours,
      simulatedGatewayEnabled: z.boolean(),
    })
    .safeParse({
      onlineMinutes: field(formData, "onlineMinutes"),
      offlineHours: field(formData, "offlineHours"),
      simulatedGatewayEnabled: checked(formData, "simulatedGatewayEnabled"),
    });
  if (!parsed.success) finish("invalid_settings");
  const admin = adminClientOrFail();
  const { error } = await admin.from("checkout_settings").upsert(
    {
      id: true,
      online_reservation_minutes:
        parsed.data.onlineMinutes === "" ? null : parsed.data.onlineMinutes,
      offline_review_hours:
        parsed.data.offlineHours === "" ? null : parsed.data.offlineHours,
      simulated_gateway_enabled: parsed.data.simulatedGatewayEnabled,
      updated_by: actorId,
    },
    { onConflict: "id" },
  );
  if (error) finish("settings_failed");
  finish("settings_saved");
}

const messages: Record<string, string> = {
  service_saved:
    "Servicio guardado. Su disponibilidad depende de su estado, cobertura y medios configurados.",
  zone_saved: "Zona guardada.",
  rate_saved: "Cobertura y tarifa guardadas.",
  option_saved: "Medio de pago guardado.",
  invalid_service:
    "Revisa el servicio. El retiro requiere dirección, horario e instrucciones completos; COD requiere condiciones verificadas.",
  invalid_zone: "Revisa el código, la ubicación y el nombre de la zona.",
  invalid_rate:
    "Revisa la cobertura: una tarifa fija necesita monto GTQ; una tarifa manual debe dejarlo vacío.",
  invalid_option:
    "El medio de pago y su momento de cobro no corresponden a este servicio.",
  missing_service: "El servicio ya no está disponible.",
  immutable_kind:
    "No se puede cambiar el tipo de un servicio existente. Crea otro servicio.",
  immutable_pair:
    "No se puede cambiar la relación de una cobertura o medio existente. Crea una entrada nueva.",
  disable_cod_option_first:
    "Desactiva la opción de cobro por transportadora antes de retirar sus condiciones COD.",
  create_inactive_first:
    "Crea primero el registro inactivo; después revisa sus relaciones antes de activarlo.",
  payment_required:
    "Configura al menos un medio activo compatible antes de activar el servicio.",
  coverage_required:
    "Activa una zona y su cobertura antes de activar un servicio de entrega.",
  deactivate_service_first:
    "Desactiva el servicio antes de retirar un medio, cobertura o zona que utiliza.",
  invalid_coverage:
    "La cobertura necesita una zona y un servicio de entrega existentes; retiro no usa zonas.",
  activate_zone_first: "Activa la zona antes de activar su cobertura.",
  gateway_pending:
    "Solo puedes activar la opción de pasarela cuando el simulador PRUEBA DEV está habilitado en los ajustes de checkout.",
  cod_terms_required:
    "Registra y habilita las condiciones COD de la transportadora antes de activar este medio.",
  service_failed:
    "No se pudo guardar el servicio. Revisa duplicados, tipo y condiciones.",
  zone_failed: "No se pudo guardar la zona. Revisa si su código ya existe.",
  rate_failed:
    "No se pudo guardar la cobertura. Revisa si esa pareja servicio/zona ya existe y cumple las restricciones.",
  option_failed:
    "No se pudo guardar el medio. Revisa si ya existe y si es compatible con el servicio.",
  configuration_unavailable:
    "La configuración segura del entorno no está disponible; no se guardó ningún cambio.",
  settings_saved:
    "Ajustes de PRUEBA DEV guardados. Vacío significa que esa ruta de compra está cerrada.",
  invalid_settings:
    "Los plazos deben ser números enteros válidos: hasta 1,440 minutos en línea y 720 horas presenciales.",
  settings_failed: "No se pudieron guardar los ajustes de checkout DEV.",
  settings_dev_only:
    "Estos ajustes de simulación solo se pueden cambiar en DEV.",
};

export async function saveCheckoutSettings(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(() => perform_saveCheckoutSettings(data), messages);
}

export async function saveDeliveryService(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(() => perform_saveDeliveryService(data), messages);
}

export async function saveDeliveryZone(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(() => perform_saveDeliveryZone(data), messages);
}

export async function saveServicePaymentOption(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(
    () => perform_saveServicePaymentOption(data),
    messages,
  );
}

export async function saveServiceZoneRate(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(() => perform_saveServiceZoneRate(data), messages);
}
