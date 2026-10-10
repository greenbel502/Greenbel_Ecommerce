"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseActionClient } from "@/lib/supabase/server";

export type CatalogActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const uuid = z.uuid();
const name = z.string().trim().min(1).max(160);
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0);
const nullableUuid = z.union([uuid, z.literal("")]);
const price = z.union([money, z.literal("")]);
const brandSchema = z.object({ name, slug });
const categorySchema = z.object({ name, slug, parentId: nullableUuid });
const editableBrandSchema = brandSchema.extend({ id: uuid });
const editableCategorySchema = categorySchema.extend({ id: uuid });
const productSchema = z.object({
  id: nullableUuid,
  sku: z.string().trim().min(1).max(100),
  slug,
  name: z.string().trim().min(1).max(240),
  model: z.string().trim().max(160),
  kind: z.enum(["equipment", "part", "accessory"]),
  brandId: nullableUuid,
  categoryId: uuid,
  shortDescription: z.string().trim().max(1000),
  description: z.string().trim().max(12000),
  regularPrice: price,
  warrantyMonths: z.union([z.literal(""), z.coerce.number().int().min(0).max(1200)]),
  warrantyTerms: z.string().trim().max(4000),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  featured: z.boolean()
});
const timestamp = z.string().refine((value) =>
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value))
);
const offerSchema = z.object({
  id: nullableUuid,
  productId: uuid,
  kind: z.enum(["fixed_price", "percentage"]),
  value: money,
  startsAt: timestamp,
  endsAt: timestamp,
  enabled: z.boolean()
}).refine((value) => Date.parse(value.startsAt) < Date.parse(value.endsAt));
const toggleSchema = z.object({ id: uuid, active: z.enum(["true", "false"]) });
const nonnegativeOrder = z.coerce.number().int().min(0).max(100000);
const specSchema = z.object({
  id: nullableUuid,
  productId: uuid,
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(600),
  unit: z.string().trim().max(60),
  sortOrder: nonnegativeOrder
});
const inclusionSchema = z.object({
  id: nullableUuid,
  productId: uuid,
  description: z.string().trim().min(1).max(300),
  quantity: z.string().regex(/^\d{1,11}(?:\.\d{1,3})?$/).refine((value) => Number(value) > 0),
  sortOrder: nonnegativeOrder
});
const imageMetadataSchema = z.object({
  id: uuid,
  productId: uuid,
  altText: z.string().trim().min(1).max(300),
  sortOrder: nonnegativeOrder
});
const primaryImageSchema = z.object({
  productId: uuid,
  imageId: uuid,
  expectedPrimaryId: nullableUuid
});
const compatibilitySchema = z.object({
  equipmentId: uuid,
  partId: uuid,
  notes: z.string().trim().max(1000)
}).refine((value) => value.equipmentId !== value.partId);

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function result(status: CatalogActionState["status"], message: string): CatalogActionState {
  return { status, message };
}

function refreshCatalog(): void {
  revalidatePath("/admin/catalogo");
  revalidatePath("/productos");
  revalidatePath("/");
}

export async function createBrandAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = brandSchema.safeParse({ name: field(formData, "name"), slug: field(formData, "slug") });
  if (!parsed.success) return result("error", "Revisa el nombre y el identificador de la marca.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("brands")
      .insert({ ...parsed.data, active: false })
      .select("id")
      .single();
    if (error || !data) return result("error", "No se pudo guardar la marca. Revisa si ya existe.");
    refreshCatalog();
    return result("success", "Marca creada en borrador. Actívala tras revisar sus datos.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar la marca.");
  }
}

export async function createCategoryAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = categorySchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    parentId: field(formData, "parentId")
  });
  if (!parsed.success) return result("error", "Revisa la categoría y su categoría superior.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("categories")
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
        parent_id: parsed.data.parentId || null,
        active: false
      })
      .select("id")
      .single();
    if (error || !data) return result("error", "No se pudo guardar la categoría. Revisa el nombre y la jerarquía.");
    refreshCatalog();
    return result("success", "Categoría creada inactiva. Actívala tras revisar sus datos.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar la categoría.");
  }
}

export async function updateBrandAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = editableBrandSchema.safeParse({
    id: field(formData, "id"), name: field(formData, "name"), slug: field(formData, "slug")
  });
  if (!parsed.success) return result("error", "Revisa el nombre y el identificador de la marca.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient().from("brands")
      .update({ name: parsed.data.name, slug: parsed.data.slug })
      .eq("id", parsed.data.id).select("id").single();
    if (error || !data) return result("error", "No se pudo actualizar la marca. Revisa si ya existe.");
    refreshCatalog();
    return result("success", "Marca actualizada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o actualizar la marca.");
  }
}

export async function updateCategoryAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = editableCategorySchema.safeParse({
    id: field(formData, "id"), name: field(formData, "name"), slug: field(formData, "slug"),
    parentId: field(formData, "parentId")
  });
  if (!parsed.success) return result("error", "Revisa la categoría y su jerarquía.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient().from("categories")
      .update({ name: parsed.data.name, slug: parsed.data.slug, parent_id: parsed.data.parentId || null })
      .eq("id", parsed.data.id).select("id").single();
    if (error || !data) return result("error", "No se pudo actualizar la categoría. Revisa nombre o ciclo jerárquico.");
    refreshCatalog();
    return result("success", "Categoría actualizada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o actualizar la categoría.");
  }
}

export async function setBrandActiveAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = toggleSchema.safeParse({
    id: field(formData, "id"),
    active: field(formData, "active")
  });
  if (!parsed.success) return result("error", "Marca inválida.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("brands")
      .update({ active: parsed.data.active === "true" })
      .eq("id", parsed.data.id)
      .select("id")
      .single();
    if (error || !data) return result("error", "No se pudo cambiar el estado de la marca.");
    refreshCatalog();
    return result("success", parsed.data.active === "true" ? "Marca activada." : "Marca desactivada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o cambiar la marca.");
  }
}

export async function setCategoryActiveAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = toggleSchema.safeParse({
    id: field(formData, "id"),
    active: field(formData, "active")
  });
  if (!parsed.success) return result("error", "Categoría inválida.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("categories")
      .update({ active: parsed.data.active === "true" })
      .eq("id", parsed.data.id)
      .select("id")
      .single();
    if (error || !data) return result("error", "No se pudo cambiar el estado de la categoría.");
    refreshCatalog();
    return result("success", parsed.data.active === "true" ? "Categoría activada." : "Categoría desactivada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o cambiar la categoría.");
  }
}

export async function saveProductAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = productSchema.safeParse({
    id: field(formData, "id"),
    sku: field(formData, "sku"),
    slug: field(formData, "slug"),
    name: field(formData, "name"),
    model: field(formData, "model"),
    kind: field(formData, "kind"),
    brandId: field(formData, "brandId"),
    categoryId: field(formData, "categoryId"),
    shortDescription: field(formData, "shortDescription"),
    description: field(formData, "description"),
    regularPrice: field(formData, "regularPrice"),
    warrantyMonths: field(formData, "warrantyMonths"),
    warrantyTerms: field(formData, "warrantyTerms"),
    publicationStatus: field(formData, "publicationStatus"),
    featured: formData.get("featured") === "on"
  });
  if (!parsed.success) return result("error", "Revisa los campos del producto, su precio y clasificación.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      sku: input.sku,
      slug: input.slug,
      name: input.name,
      model: input.model || null,
      kind: input.kind,
      brand_id: input.brandId || null,
      category_id: input.categoryId,
      short_description: input.shortDescription || null,
      description: input.description || null,
      regular_price: input.regularPrice || null,
      currency: input.regularPrice ? "GTQ" : null,
      warranty_months: input.warrantyMonths === "" ? null : input.warrantyMonths,
      warranty_terms: input.warrantyTerms || null,
      publication_status: input.publicationStatus,
      featured: input.featured
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin.from("products").update(payload).eq("id", input.id)
      : admin.from("products").insert(payload);
    const { data, error } = await query.select("id").single();
    if (error || !data) return result("error", "No se pudo guardar el producto. Revisa SKU, oferta y relaciones.");
    refreshCatalog();
    return result("success", "Producto guardado. Su visibilidad depende del estado y categoría/marca activas.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar el producto.");
  }
}

export async function saveOfferAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = offerSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    kind: field(formData, "kind"),
    value: field(formData, "value"),
    startsAt: field(formData, "startsAt"),
    endsAt: field(formData, "endsAt"),
    enabled: formData.get("enabled") === "on"
  });
  if (!parsed.success) return result("error", "Revisa importe, fechas y producto de la oferta.");
  try {
    const actor = await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      product_id: input.productId,
      kind: input.kind,
      value: input.value,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      enabled: input.enabled
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin.from("product_offers").update(payload).eq("id", input.id)
      : admin.from("product_offers").insert({ ...payload, created_by: actor.userId });
    const { data, error } = await query.select("id").single();
    if (error || !data) return result("error", "No se pudo guardar la oferta. Revisa precio base, vigencia y solapamientos.");
    refreshCatalog();
    return result("success", "Oferta guardada; el cálculo público depende de su vigencia y activación.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar la oferta.");
  }
}

export async function saveSpecAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = specSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    label: field(formData, "label"),
    value: field(formData, "value"),
    unit: field(formData, "unit"),
    sortOrder: field(formData, "sortOrder")
  });
  if (!parsed.success) return result("error", "Revisa la especificación y su orden.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      product_id: input.productId,
      label: input.label,
      value: input.value,
      unit: input.unit || null,
      sort_order: input.sortOrder
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin.from("product_specs").update(payload).eq("id", input.id).eq("product_id", input.productId)
      : admin.from("product_specs").insert(payload);
    const { data, error } = await query.select("id").single();
    if (error || !data) return result("error", "No se pudo guardar la especificación.");
    refreshCatalog();
    return result("success", "Especificación guardada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar la especificación.");
  }
}

export async function removeSpecAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = z.object({ id: uuid, productId: uuid }).safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId")
  });
  if (!parsed.success) return result("error", "Especificación inválida.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("product_specs")
      .delete()
      .eq("id", parsed.data.id)
      .eq("product_id", parsed.data.productId)
      .select("id")
      .single();
    if (error || !data) return result("error", "No se pudo quitar la especificación.");
    refreshCatalog();
    return result("success", "Especificación quitada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o quitar la especificación.");
  }
}

export async function saveInclusionAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = inclusionSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    description: field(formData, "description"),
    quantity: field(formData, "quantity"),
    sortOrder: field(formData, "sortOrder")
  });
  if (!parsed.success) return result("error", "Revisa lo incluido, la cantidad y el orden.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      product_id: input.productId,
      description: input.description,
      quantity: input.quantity,
      sort_order: input.sortOrder
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin.from("product_inclusions").update(payload).eq("id", input.id).eq("product_id", input.productId)
      : admin.from("product_inclusions").insert(payload);
    const { data, error } = await query.select("id").single();
    if (error || !data) return result("error", "No se pudo guardar el elemento incluido.");
    refreshCatalog();
    return result("success", "Elemento incluido guardado.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar lo incluido.");
  }
}

export async function removeInclusionAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = z.object({ id: uuid, productId: uuid }).safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId")
  });
  if (!parsed.success) return result("error", "Elemento incluido inválido.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("product_inclusions")
      .delete()
      .eq("id", parsed.data.id)
      .eq("product_id", parsed.data.productId)
      .select("id")
      .single();
    if (error || !data) return result("error", "No se pudo quitar el elemento incluido.");
    refreshCatalog();
    return result("success", "Elemento incluido quitado.");
  } catch {
    return result("error", "No se pudo verificar el permiso o quitar lo incluido.");
  }
}

export async function updateImageMetadataAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = imageMetadataSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    altText: field(formData, "altText"),
    sortOrder: field(formData, "sortOrder")
  });
  if (!parsed.success) return result("error", "Revisa descripción y orden de la imagen.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const { data, error } = await createSupabaseAdminClient().from("product_images")
      .update({ alt_text: input.altText, sort_order: input.sortOrder })
      .eq("id", input.id).eq("product_id", input.productId)
      .select("id").single();
    if (error || data?.id !== input.id) return result("error", "No se pudo actualizar la imagen.");
    refreshCatalog();
    return result("success", "Imagen actualizada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o actualizar la imagen.");
  }
}

export async function setPrimaryImageAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = primaryImageSchema.safeParse({
    productId: field(formData, "productId"),
    imageId: field(formData, "imageId"),
    expectedPrimaryId: field(formData, "expectedPrimaryId")
  });
  if (!parsed.success) return result("error", "Imagen principal inválida.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    // Migration 008 locks the product, compares the previous cover and records
    // the change atomically. It repeats the Auth role check inside PostgreSQL.
    const client = await createSupabaseActionClient();
    const { data, error } = await client.rpc("set_product_primary_image", {
      p_product_id: input.productId,
      p_image_id: input.imageId,
      p_expected_primary_id: input.expectedPrimaryId || null
    });
    if (error?.code === "P4090") return result("error", "La portada cambió. Actualiza la página antes de elegir otra imagen.");
    if (error || data !== input.imageId) return result("error", "No se pudo elegir la imagen principal.");
    refreshCatalog();
    return result("success", "Imagen principal actualizada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o cambiar la portada.");
  }
}

export async function saveCompatibilityAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = compatibilitySchema.safeParse({
    equipmentId: field(formData, "equipmentId"),
    partId: field(formData, "partId"),
    notes: field(formData, "notes")
  });
  if (!parsed.success) return result("error", "Selecciona un equipo, un repuesto y revisa las notas.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const { data, error } = await createSupabaseAdminClient().from("product_compatibilities")
      .upsert({ equipment_id: input.equipmentId, part_id: input.partId,
        notes: input.notes || null }, { onConflict: "equipment_id,part_id" })
      .select("equipment_id,part_id").single();
    if (error || data?.equipment_id !== input.equipmentId || data?.part_id !== input.partId) {
      return result("error", "No se guardó la compatibilidad. Comprueba que el equipo y el repuesto correspondan.");
    }
    refreshCatalog();
    return result("success", "Compatibilidad guardada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o guardar la compatibilidad.");
  }
}

export async function removeCompatibilityAction(
  _previous: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const parsed = compatibilitySchema.omit({ notes: true }).safeParse({
    equipmentId: field(formData, "equipmentId"),
    partId: field(formData, "partId")
  });
  if (!parsed.success) return result("error", "Compatibilidad inválida.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient().from("product_compatibilities")
      .delete().eq("equipment_id", parsed.data.equipmentId).eq("part_id", parsed.data.partId)
      .select("equipment_id,part_id").single();
    if (error || !data) return result("error", "No se pudo quitar la compatibilidad.");
    refreshCatalog();
    return result("success", "Compatibilidad quitada.");
  } catch {
    return result("error", "No se pudo verificar el permiso o quitar la compatibilidad.");
  }
}
