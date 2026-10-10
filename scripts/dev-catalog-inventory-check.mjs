import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// DEV-only integration fixture. Run explicitly with --write-fixtures after 001–008.
// The test rows and audit movements intentionally remain in DEV; no real customer data is used.
if (!process.argv.includes("--write-fixtures")) {
  throw new Error("Se requiere --write-fixtures para crear datos ficticios en DEV.");
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL;
const linked = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (
  process.env.APP_ENV !== "DEV" ||
  !ref ||
  !url ||
  new URL(url).hostname !== `${ref}.supabase.co` ||
  linked !== ref
) {
  throw new Error("Destino DEV o enlace CLI no coincide; ninguna escritura realizada.");
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, process.env.DEV_SUPABASE_SECRET_KEY, options);
const anon = createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, options);
const stamp = randomBytes(5).toString("hex");
const tag = `qa-devci-${stamp}`;
const results = [];
const add = (name, pass, note = "") => {
  results.push({ name, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${note ? ` (${note})` : ""}`);
};
const need = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? result.error.status ?? "remote-error"}`);
  if (!result.data) throw new Error(`${label}: sin datos`);
  return result.data;
};
const one = (result, label) => need(result, label);
const countId = async (client, table, id) => {
  const result = await client.from(table).select("id").eq("id", id);
  return result.error ? { error: result.error.code } : { count: result.data.length };
};

console.log("Supabase DEV: fixture aislada de catálogo e inventario; sin correos ni cobros.");
console.log(`Etiqueta ficticia: ${tag}`);

let adminUser;
let customerUser;
try {
  const [adminCreated, customerCreated] = await Promise.all([
    service.auth.admin.createUser({
      email: `${tag}-admin@example.invalid`,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { test_fixture: tag }
    }),
    service.auth.admin.createUser({
      email: `${tag}-customer@example.invalid`,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { test_fixture: tag }
    })
  ]);
  adminUser = need(adminCreated, "crear Auth admin").user;
  customerUser = need(customerCreated, "crear Auth cliente").user;
  add("Auth crea dos identidades ficticias confirmadas sin correo", Boolean(adminUser?.id && customerUser?.id));

  // Admin creation generated random passwords that are not stored in the fixture;
  // use fresh credentials for the sessions below and never print them.
  const adminPassword = randomBytes(32).toString("base64url");
  const customerPassword = randomBytes(32).toString("base64url");
  need(await service.auth.admin.updateUserById(adminUser.id, { password: adminPassword }), "clave admin");
  need(await service.auth.admin.updateUserById(customerUser.id, { password: customerPassword }), "clave cliente");
  need(await service.from("profiles").update({ display_name: `PRUEBA DEV ${tag} admin` }).eq("id", adminUser.id).select("id").single(), "perfil admin");
  need(await service.from("profiles").update({ display_name: `PRUEBA DEV ${tag} cliente` }).eq("id", customerUser.id).select("id").single(), "perfil cliente");
  need(await service.from("user_roles").update({ role: "admin" }).eq("user_id", adminUser.id).select("user_id").single(), "rol admin");

  const admin = createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, options);
  const customer = createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, options);
  need(await admin.auth.signInWithPassword({ email: `${tag}-admin@example.invalid`, password: adminPassword }), "ingreso admin");
  need(await customer.auth.signInWithPassword({ email: `${tag}-customer@example.invalid`, password: customerPassword }), "ingreso cliente");

  const ownRole = await customer.from("user_roles").select("role").eq("user_id", customerUser.id).single();
  const foreignRole = await customer.from("user_roles").select("role").eq("user_id", adminUser.id);
  add("RLS rol propio y rol ajeno", ownRole.data?.role === "customer" && !ownRole.error && foreignRole.data?.length === 0 && !foreignRole.error);
  const escalation = await customer.from("user_roles").update({ role: "admin" }).eq("user_id", customerUser.id).select("user_id");
  add("cliente no puede elevar su rol", Boolean(escalation.error));

  const brand = one(await service.from("brands").insert({ name: `PRUEBA DEV ${tag} marca`, slug: `${tag}-marca`, active: false }).select("id").single(), "marca");
  const inactiveBrand = one(await service.from("brands").insert({ name: `PRUEBA DEV ${tag} marca inactiva`, slug: `${tag}-marca-inactiva`, active: false }).select("id").single(), "marca inactiva");
  const category = one(await service.from("categories").insert({ name: `PRUEBA DEV ${tag} categoría`, slug: `${tag}-categoria`, active: false }).select("id").single(), "categoría");
  const child = one(await service.from("categories").insert({ name: `PRUEBA DEV ${tag} subcategoría`, slug: `${tag}-subcategoria`, parent_id: category.id, active: false }).select("id,parent_id").single(), "subcategoría");
  add("categoría y subcategoría relacionadas", child.parent_id === category.id);

  const baseProduct = {
    kind: "equipment",
    category_id: category.id,
    brand_id: brand.id,
    currency: "GTQ",
    publication_status: "draft",
    short_description: `PRUEBA DEV ${tag}; no es producto real.`
  };
  const priced = one(await service.from("products").insert({ ...baseProduct, sku: `QA-DEV-CI-${stamp}-PRICE`, slug: `${tag}-priced`, name: `PRUEBA DEV ${tag} con precio`, regular_price: "100.00" }).select("id").single(), "producto con precio");
  const percent = one(await service.from("products").insert({ ...baseProduct, sku: `QA-DEV-CI-${stamp}-PERCENT`, slug: `${tag}-percent`, name: `PRUEBA DEV ${tag} oferta porcentual`, regular_price: "200.00" }).select("id").single(), "producto oferta porcentual");
  const unpriced = one(await service.from("products").insert({ ...baseProduct, sku: `QA-DEV-CI-${stamp}-NOPRICE`, slug: `${tag}-no-price`, name: `PRUEBA DEV ${tag} sin precio`, regular_price: null, currency: null }).select("id").single(), "producto sin precio");
  const draft = one(await service.from("products").insert({ ...baseProduct, sku: `QA-DEV-CI-${stamp}-DRAFT`, slug: `${tag}-draft`, name: `PRUEBA DEV ${tag} borrador`, regular_price: "50.00" }).select("id").single(), "producto borrador");
  const hiddenBrand = one(await service.from("products").insert({ ...baseProduct, brand_id: inactiveBrand.id, sku: `QA-DEV-CI-${stamp}-BRAND`, slug: `${tag}-brand-hidden`, name: `PRUEBA DEV ${tag} marca inactiva`, regular_price: "50.00", publication_status: "published" }).select("id").single(), "producto marca inactiva");
  const hiddenCategory = one(await service.from("products").insert({ ...baseProduct, category_id: child.id, sku: `QA-DEV-CI-${stamp}-CATEGORY`, slug: `${tag}-category-hidden`, name: `PRUEBA DEV ${tag} categoría inactiva`, regular_price: "50.00", publication_status: "published" }).select("id").single(), "producto categoría inactiva");

  let visible = await anon.from("catalog_products").select("id").in("id", [priced.id, percent.id, unpriced.id, draft.id, hiddenBrand.id, hiddenCategory.id]);
  add("catálogo no publica borrador ni dependencias inactivas", !visible.error && visible.data.length === 0);

  need(await service.from("brands").update({ active: true }).eq("id", brand.id).select("id").single(), "activar marca");
  need(await service.from("categories").update({ active: true }).eq("id", category.id).select("id").single(), "activar categoría");
  for (const id of [priced.id, percent.id, unpriced.id]) {
    need(await service.from("products").update({ publication_status: "published" }).eq("id", id).select("id").single(), "publicar producto");
  }
  const now = Date.now();
  one(await service.from("product_offers").insert({ product_id: priced.id, kind: "fixed_price", value: "80.00", starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(), enabled: true, created_by: adminUser.id }).select("id").single(), "oferta precio final");
  one(await service.from("product_offers").insert({ product_id: percent.id, kind: "percentage", value: "15.00", starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(), enabled: true, created_by: adminUser.id }).select("id").single(), "oferta porcentaje");
  const spec = one(await service.from("product_specs").insert({ product_id: priced.id, label: "Tipo", value: "PRUEBA DEV", sort_order: 1 }).select("id").single(), "especificación");
  const inclusion = one(await service.from("product_inclusions").insert({ product_id: priced.id, description: "Elemento ficticio de prueba", quantity: "1.000", sort_order: 1 }).select("id").single(), "incluido");

  visible = await anon.from("catalog_products").select("id,regular_price,effective_price,offer_kind").in("id", [priced.id, percent.id, unpriced.id, draft.id, hiddenBrand.id, hiddenCategory.id]);
  const byId = new Map(visible.data?.map((row) => [row.id, row]));
  add("publicación, marca y categoría filtran catálogo", !visible.error && byId.size === 3 && !byId.has(draft.id) && !byId.has(hiddenBrand.id) && !byId.has(hiddenCategory.id));
  add("oferta de precio final calculada en DEV", String(byId.get(priced.id)?.effective_price) === "80" && byId.get(priced.id)?.offer_kind === "fixed_price");
  add("oferta porcentual calculada en DEV", String(byId.get(percent.id)?.effective_price) === "170" && byId.get(percent.id)?.offer_kind === "percentage");
  add("precio ausente permanece NULL", byId.get(unpriced.id)?.regular_price === null && byId.get(unpriced.id)?.effective_price === null);
  const specPublic = await anon.from("product_specs").select("id").eq("id", spec.id);
  const inclusionPublic = await anon.from("product_inclusions").select("id").eq("id", inclusion.id);
  add("especificaciones e incluidos publicados", !specPublic.error && specPublic.data.length === 1 && !inclusionPublic.error && inclusionPublic.data.length === 1);

  const customerInsert = await customer.from("products").insert({ ...baseProduct, sku: `QA-DEV-CI-${stamp}-BAD`, slug: `${tag}-bad`, name: "PRUEBA DEV no autorizado" }).select("id");
  const adminInsert = await admin.from("products").insert({ ...baseProduct, sku: `QA-DEV-CI-${stamp}-BAD2`, slug: `${tag}-bad2`, name: "PRUEBA DEV no autorizado" }).select("id");
  add("escritura directa de catálogo bloqueada para cliente y admin", Boolean(customerInsert.error && adminInsert.error));

  const availabilityBefore = await anon.from("product_availability").select("verified,available").eq("product_id", priced.id).single();
  add("inventario sin verificar se distingue de agotado", !availabilityBefore.error && availabilityBefore.data?.verified === false && availabilityBefore.data?.available === false);
  const customerBalance = await customer.from("inventory_balances").select("product_id").eq("product_id", priced.id);
  add("cliente no lee balance privado", !customerBalance.error && customerBalance.data.length === 0);
  const unauthorizedChange = await customer.rpc("record_inventory_change", { p_product_id: priced.id, p_kind: "stock_entry", p_quantity_delta: 1, p_reason: `PRUEBA DEV ${tag}`, p_reference: tag, p_idempotency_key: randomUUID() });
  add("cliente no ejecuta comando de inventario", Boolean(unauthorizedChange.error));

  const entryKey = randomUUID();
  const entryInput = { p_product_id: priced.id, p_kind: "stock_entry", p_quantity_delta: 1, p_reason: `PRUEBA DEV ${tag}`, p_reference: tag, p_idempotency_key: entryKey };
  const entry = await admin.rpc("record_inventory_change", entryInput);
  const replay = await admin.rpc("record_inventory_change", entryInput);
  add("entrada de una unidad por admin", !entry.error && Boolean(entry.data));
  add("reintento exacto retorna mismo movimiento", !entry.error && !replay.error && entry.data === replay.data);
  const conflictingReplay = await admin.rpc("record_inventory_change", { ...entryInput, p_quantity_delta: 2 });
  add("clave reutilizada con entrada distinta rechazada", Boolean(conflictingReplay.error));
  const afterEntry = await admin.from("inventory_balances").select("stock_balance,reserved").eq("product_id", priced.id).single();
  const customerAfterEntry = await customer.from("inventory_balances").select("product_id").eq("product_id", priced.id);
  add("balance visible solo para personal activo", !afterEntry.error && Number(afterEntry.data?.stock_balance) === 1 && Number(afterEntry.data?.reserved) === 0 && !customerAfterEntry.error && customerAfterEntry.data.length === 0);
  const directBalance = await admin.from("inventory_balances").update({ stock_balance: 99 }).eq("product_id", priced.id).select("product_id");
  add("admin no modifica balance fuera de RPC", Boolean(directBalance.error));
  const availabilityAfter = await anon.from("product_availability").select("verified,available").eq("product_id", priced.id).single();
  add("disponibilidad pública verifica existencia sin cantidad", !availabilityAfter.error && availabilityAfter.data?.verified === true && availabilityAfter.data?.available === true && !Object.hasOwn(availabilityAfter.data, "stock_balance"));

  const sales = await Promise.all([
    admin.rpc("record_inventory_change", { p_product_id: priced.id, p_kind: "physical_sale", p_quantity_delta: -1, p_reason: `PRUEBA DEV ${tag} venta física A`, p_reference: tag, p_idempotency_key: randomUUID() }),
    admin.rpc("record_inventory_change", { p_product_id: priced.id, p_kind: "physical_sale", p_quantity_delta: -1, p_reason: `PRUEBA DEV ${tag} venta física B`, p_reference: tag, p_idempotency_key: randomUUID() })
  ]);
  const wins = sales.filter((sale) => !sale.error).length;
  const finalBalance = await admin.from("inventory_balances").select("stock_balance,reserved").eq("product_id", priced.id).single();
  add("dos ventas concurrentes compiten por última unidad", wins === 1 && sales.filter((sale) => sale.error).length === 1 && Number(finalBalance.data?.stock_balance) === 0 && Number(finalBalance.data?.reserved) === 0);
  const finalAvailability = await anon.from("product_availability").select("verified,available").eq("product_id", priced.id).single();
  add("disponibilidad pública refleja agotado", !finalAvailability.error && finalAvailability.data?.verified === true && finalAvailability.data?.available === false);

  const unpricedEntry = await admin.rpc("record_inventory_change", { p_product_id: unpriced.id, p_kind: "stock_entry", p_quantity_delta: 1, p_reason: `PRUEBA DEV ${tag}`, p_reference: tag, p_idempotency_key: randomUUID() });
  const unpricedSale = await admin.rpc("record_inventory_change", { p_product_id: unpriced.id, p_kind: "physical_sale", p_quantity_delta: -1, p_reason: `PRUEBA DEV ${tag}`, p_reference: tag, p_idempotency_key: randomUUID() });
  add("producto sin precio admite existencia pero bloquea venta física", !unpricedEntry.error && Boolean(unpricedSale.error));

  const pricedMovements = await service.from("inventory_movements").select("id").eq("product_id", priced.id);
  const pricedOperations = await service.from("inventory_operations").select("id").eq("product_id", priced.id);
  add("persistencia auditable sin movimiento duplicado", !pricedMovements.error && !pricedOperations.error && pricedMovements.data.length === 2 && pricedOperations.data.length === 2);
  const persisted = await countId(service, "products", priced.id);
  add("catálogo ficticio persistido en DEV", persisted.count === 1);
} catch (error) {
  const message = error instanceof Error ? error.message : "error-desconocido";
  add("ejecución completa", false, message.replace(/https?:\/\/\S+/g, "<URL oculta>"));
} finally {
  console.log(`Resultado: ${results.filter((r) => r.pass).length} PASS, ${results.filter((r) => !r.pass).length} FAIL.`);
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
