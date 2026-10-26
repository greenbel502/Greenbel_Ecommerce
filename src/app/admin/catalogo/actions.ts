"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseActionClient } from "@/lib/supabase/server";
import { BRAND_LOGO_BUCKET, isBrandLogoPath } from "@/lib/brand-logo";
import {
  generateProductSlug,
  isProductSlugConflict,
} from "@/lib/products/product-slug";

export type CatalogActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  brandId?: string;
  categoryId?: string;
  productId?: string;
  fieldErrors?: Record<string, string>;
}>;

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const uuid = z.uuid();
const name = z.string().trim().min(1).max(160);
const money = z
  .string()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);
const nullableUuid = z.union([uuid, z.literal("")]);
const price = z.union([money, z.literal("")]);
const brandSchema = z.object({ name, slug });
const categorySchema = z.object({ name, slug, parentId: nullableUuid });
const editableBrandSchema = brandSchema.extend({ id: uuid });
const editableCategorySchema = categorySchema.extend({ id: uuid });
const productSchema = z.object({
  id: nullableUuid,
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(240),
  model: z.string().trim().max(160),
  kind: z.enum(["equipment", "part", "accessory", "agricultural"]),
  brandId: nullableUuid,
  categoryId: uuid,
  shortDescription: z.string().trim().max(1000),
  description: z.string().trim().max(12000),
  regularPrice: price,
  warrantyMonths: z.union([
    z.literal(""),
    z.coerce.number().int().min(0).max(1200),
  ]),
  warrantyTerms: z.string().trim().max(4000),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  featured: z.boolean(),
});
const timestamp = z
  .string()
  .refine(
    (value) =>
      /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  );
const offerSchema = z
  .object({
    id: nullableUuid,
    productId: uuid,
    kind: z.enum(["fixed_price", "percentage"]),
    value: money,
    startsAt: timestamp,
    endsAt: timestamp,
    enabled: z.boolean(),
  })
  .refine((value) => Date.parse(value.startsAt) < Date.parse(value.endsAt));
const toggleSchema = z.object({ id: uuid, active: z.enum(["true", "false"]) });
const deleteClassificationSchema = z.object({
  id: uuid,
  expectedName: name,
  confirmation: z.literal("delete"),
});
const nonnegativeOrder = z.coerce.number().int().min(0).max(100000);
const specSchema = z.object({
  id: nullableUuid,
  productId: uuid,
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(600),
  unit: z.string().trim().max(60),
  sortOrder: nonnegativeOrder,
});
const inclusionSchema = z.object({
  id: nullableUuid,
  productId: uuid,
  description: z.string().trim().min(1).max(300),
  quantity: z
    .string()
    .regex(/^\d{1,11}(?:\.\d{1,3})?$/)
    .refine((value) => Number(value) > 0),
  sortOrder: nonnegativeOrder,
});
const imageMetadataSchema = z.object({
  id: uuid,
  productId: uuid,
  altText: z.string().trim().min(1).max(300),
  sortOrder: nonnegativeOrder,
});
const primaryImageSchema = z.object({
  productId: uuid,
  imageId: uuid,
  expectedPrimaryId: nullableUuid,
});
const compatibilitySchema = z
  .object({
    equipmentId: uuid,
    partId: uuid,
    notes: z.string().trim().max(1000),
  })
  .refine((value) => value.equipmentId !== value.partId);

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function result(
  status: CatalogActionState["status"],
  message: string,
): CatalogActionState {
  return { status, message };
}

function refreshCatalog(): void {
  revalidatePath("/admin/catalogo");
  revalidatePath("/productos");
  revalidatePath("/");
  revalidatePath("/nosotros");
}

export async function createBrandAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = brandSchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Revisa los datos de la marca.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.path[0] === "name"
            ? "Escribe un nombre de hasta 160 caracteres."
            : "Usa un identificador de hasta 160 caracteres, con minúsculas, números y guiones.",
        ]),
      ),
    };
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("brands")
      .insert({ ...parsed.data, active: false })
      .select("id")
      .single();
    if (error || !data)
      return {
        status: "error",
        message:
          error?.code === "23505"
            ? "Ya existe una marca con ese nombre o identificador. Revisa la lista antes de crear otra."
            : "No se pudo guardar la marca. Tus datos se conservan para reintentar.",
      };
    refreshCatalog();
    return {
      status: "success",
      message: "Marca creada. Añade su logotipo y actívala cuando esté lista.",
      brandId: data.id,
    };
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar la marca.",
    );
  }
}

export async function createCategoryAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = categorySchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    parentId: field(formData, "parentId"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Revisa los datos de la categoría.",
      fieldErrors: categoryFieldErrors(parsed.error),
    };
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("categories")
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
        parent_id: parsed.data.parentId || null,
        active: false,
      })
      .select("id")
      .single();
    if (error || !data) return categoryWriteError(error?.code);
    refreshCatalog();
    return {
      status: "success",
      message: "Categoría creada inactiva. Actívala tras revisar sus datos.",
      categoryId: data.id,
    };
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar la categoría.",
    );
  }
}

export async function updateBrandAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = editableBrandSchema.safeParse({
    id: field(formData, "id"),
    name: field(formData, "name"),
    slug: field(formData, "slug"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Revisa los datos de la marca.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.path[0] === "name"
            ? "Escribe un nombre de hasta 160 caracteres."
            : "Usa un identificador de hasta 160 caracteres, con minúsculas, números y guiones.",
        ]),
      ),
    };
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("brands")
      .update({ name: parsed.data.name, slug: parsed.data.slug })
      .eq("id", parsed.data.id)
      .select("id")
      .single();
    if (error || !data)
      return {
        status: "error",
        message:
          error?.code === "23505"
            ? "Ese nombre o identificador ya pertenece a otra marca."
            : "No se pudo guardar la marca. Tus datos se conservan para reintentar.",
      };
    refreshCatalog();
    return {
      status: "success",
      message: "Los datos de la marca se guardaron correctamente.",
      brandId: data.id,
    };
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o actualizar la marca.",
    );
  }
}

export async function updateCategoryAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = editableCategorySchema.safeParse({
    id: field(formData, "id"),
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    parentId: field(formData, "parentId"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Revisa los datos de la categoría.",
      fieldErrors: categoryFieldErrors(parsed.error),
    };
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("categories")
      .update({
        name: parsed.data.name,
        slug: parsed.data.slug,
        parent_id: parsed.data.parentId || null,
      })
      .eq("id", parsed.data.id)
      .select("id")
      .single();
    if (error || !data) return categoryWriteError(error?.code);
    refreshCatalog();
    return {
      status: "success",
      message: "Categoría actualizada.",
      categoryId: data.id,
    };
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o actualizar la categoría.",
    );
  }
}

function categoryFieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      String(issue.path[0]),
      issue.path[0] === "name"
        ? "Escribe un nombre de hasta 160 caracteres."
        : issue.path[0] === "slug"
          ? "Usa minúsculas, números y guiones, hasta 160 caracteres."
          : "Selecciona una categoría superior válida.",
    ]),
  );
}
function categoryWriteError(code?: string): CatalogActionState {
  if (code === "23505")
    return {
      status: "error",
      message: "Ya existe una categoría con ese identificador.",
      fieldErrors: { slug: "Elige otro identificador." },
    };
  if (code === "P0001" || code === "23514")
    return {
      status: "error",
      message: "Revisa la categoría superior.",
      fieldErrors: {
        parentId:
          "No puedes elegir esta categoría ni una de sus subcategorías como superior.",
      },
    };
  if (code === "23503")
    return {
      status: "error",
      message: "La categoría superior ya no está disponible.",
      fieldErrors: { parentId: "Selecciona otra categoría superior." },
    };
  return result(
    "error",
    "No se pudo guardar la categoría. Tus datos se conservan para reintentar.",
  );
}

/** Only unreferenced classifications may be removed. Existing foreign keys enforce races too. */
async function deleteClassification(
  table: "brands" | "categories",
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = deleteClassificationSchema.safeParse({
    id: field(formData, "id"),
    expectedName: field(formData, "expectedName"),
    confirmation: field(formData, "confirmation"),
  });
  if (!parsed.success)
    return result("error", "Confirma el registro que deseas eliminar.");
  const noun = table === "brands" ? "marca" : "categoría";
  try {
    await requireStaffActor(["admin"]);
    const admin = createSupabaseAdminClient();
    const current =
      table === "brands"
        ? await admin
            .from("brands")
            .select("id,name,logo_path")
            .eq("id", parsed.data.id)
            .maybeSingle()
        : await admin
            .from("categories")
            .select("id,name")
            .eq("id", parsed.data.id)
            .maybeSingle();
    if (current.error)
      return result(
        "error",
        "No se pudo cargar el registro. Inténtalo de nuevo.",
      );
    if (!current.data)
      return result("error", `La ${noun} ya no existe. Actualiza la lista.`);
    if (current.data.name !== parsed.data.expectedName)
      return result(
        "error",
        `La ${noun} cambió desde que abriste la confirmación. Actualiza la lista antes de eliminarla.`,
      );
    const dependencies = await Promise.all([
      admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq(table === "brands" ? "brand_id" : "category_id", parsed.data.id),
      ...(table === "categories"
        ? [
            admin
              .from("categories")
              .select("id", { count: "exact", head: true })
              .eq("parent_id", parsed.data.id),
            admin
              .from("training_categories")
              .select("category_id", { count: "exact", head: true })
              .eq("category_id", parsed.data.id),
          ]
        : []),
    ]);
    if (dependencies.some((query) => query.error || query.count === null))
      return result(
        "error",
        "No se pudieron comprobar sus vínculos. No se eliminó el registro.",
      );
    if (dependencies.some((query) => (query.count ?? 0) > 0))
      return result(
        "error",
        table === "brands"
          ? "No puedes eliminar esta marca porque tiene productos asignados. Puedes desactivarla desde Editar."
          : "No puedes eliminar esta categoría porque tiene productos, subcategorías o capacitaciones vinculadas. Puedes desactivarla desde Editar.",
      );
    const deletion = await admin
      .from(table)
      .delete()
      .eq("id", parsed.data.id)
      .eq("name", parsed.data.expectedName)
      .select("id")
      .maybeSingle();
    if (deletion.error || !deletion.data)
      return result(
        "error",
        deletion.error?.code === "23503"
          ? `La ${noun} tiene registros vinculados y no se puede eliminar. Sus datos se conservaron.`
          : `No se confirmó la eliminación de la ${noun}. Actualiza la lista antes de reintentar.`,
      );
    let cleanupPending = false;
    // The record is deleted before its owned image; failed/restricted deletion never removes the logo.
    const logoPath =
      "logo_path" in current.data ? current.data.logo_path : null;
    if (typeof logoPath === "string") {
      if (isBrandLogoPath(parsed.data.id, logoPath)) {
        try {
          const cleanup = await admin.storage
            .from(BRAND_LOGO_BUCKET)
            .remove([logoPath]);
          cleanupPending = !!cleanup.error;
        } catch {
          cleanupPending = true;
        }
      } else cleanupPending = true;
      if (cleanupPending)
        console.warn("BRAND_DELETE_LOGO_CLEANUP_PENDING", {
          brandId: parsed.data.id,
          path: logoPath,
        });
    }
    refreshCatalog();
    return result(
      "success",
      `${table === "brands" ? "Marca eliminada" : "Categoría eliminada"} correctamente.${cleanupPending ? " La limpieza de su imagen está pendiente." : ""}`,
    );
  } catch {
    return result(
      "error",
      `No se pudo verificar el permiso o confirmar la eliminación de la ${noun}. Actualiza la lista antes de reintentar.`,
    );
  }
}
export async function deleteBrandAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  return deleteClassification("brands", formData);
}
export async function deleteCategoryAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  return deleteClassification("categories", formData);
}

export async function setBrandActiveAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = toggleSchema.safeParse({
    id: field(formData, "id"),
    active: field(formData, "active"),
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
    if (error || !data)
      return result("error", "No se pudo cambiar el estado de la marca.");
    refreshCatalog();
    return result(
      "success",
      parsed.data.active === "true" ? "Marca activada." : "Marca desactivada.",
    );
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o cambiar la marca.",
    );
  }
}

export async function setCategoryActiveAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = toggleSchema.safeParse({
    id: field(formData, "id"),
    active: field(formData, "active"),
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
    if (error || !data)
      return result("error", "No se pudo cambiar el estado de la categoría.");
    refreshCatalog();
    return result(
      "success",
      parsed.data.active === "true"
        ? "Categoría activada."
        : "Categoría desactivada.",
    );
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o cambiar la categoría.",
    );
  }
}

export async function saveProductAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = productSchema.safeParse({
    id: field(formData, "id"),
    sku: field(formData, "sku"),
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
    featured: formData.get("featured") === "on",
  });
  if (!parsed.success)
    return result(
      "error",
      "Revisa los campos del producto, su precio y clasificación.",
    );
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      sku: input.sku,
      name: input.name,
      model: input.model || null,
      kind: input.kind,
      brand_id: input.brandId || null,
      category_id: input.categoryId,
      short_description: input.shortDescription || null,
      description: input.description || null,
      regular_price: input.regularPrice || null,
      currency: input.regularPrice ? "GTQ" : null,
      warranty_months:
        input.warrantyMonths === "" ? null : input.warrantyMonths,
      warranty_terms: input.warrantyTerms || null,
      publication_status: input.publicationStatus,
      featured: input.featured,
    };
    const admin = createSupabaseAdminClient();
    let saved;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Updates deliberately omit slug, including when a stale client submits it.
      const query = input.id
        ? admin.from("products").update(payload).eq("id", input.id)
        : admin.from("products").insert({
            ...payload,
            slug: generateProductSlug(
              input.name,
              input.sku,
              attempt === 0 ? "" : randomUUID(),
            ),
          });
      saved = await query.select("id").single();
      // The unique constraint resolves concurrent creations without a race-prone precheck.
      if (input.id || !isProductSlugConflict(saved.error)) break;
    }
    if (!saved || saved.error || !saved.data)
      return result(
        "error",
        "No se pudo guardar el producto. Revisa el código, la oferta y sus asignaciones.",
      );
    refreshCatalog();
    return {
      status: "success",
      productId: saved.data.id,
      message: "Los datos del producto se guardaron correctamente.",
    };
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar el producto.",
    );
  }
}

/** One restricted DELETE: never remove linked media, stock, orders or other history implicitly. */
export async function deleteProductAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = z
    .object({
      id: uuid,
      expectedName: z.string().trim().min(1).max(240),
      confirmation: z.literal("delete"),
    })
    .safeParse({
      id: field(formData, "id"),
      expectedName: field(formData, "expectedName"),
      confirmation: field(formData, "confirmation"),
    });
  if (!parsed.success)
    return result("error", "Confirma el producto que deseas eliminar.");
  try {
    await requireStaffActor(["admin"]);
    const deletion = await createSupabaseAdminClient()
      .from("products")
      .delete()
      .eq("id", parsed.data.id)
      .eq("name", parsed.data.expectedName)
      .select("id")
      .maybeSingle();
    if (deletion.error || !deletion.data)
      return result(
        "error",
        deletion.error?.code === "23503"
          ? "No se puede eliminar este producto porque tiene información vinculada, como imágenes, detalles, inventario o movimientos. Puedes archivarlo desde Editar para retirarlo del catálogo. Sus datos se conservaron."
          : "No se confirmó la eliminación. El producto pudo cambiar o ya no existir. Actualiza la lista antes de reintentar.",
      );
    refreshCatalog();
    return result("success", "Producto eliminado correctamente.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o eliminar el producto.",
    );
  }
}

export async function saveOfferAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = offerSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    kind: field(formData, "kind"),
    value: field(formData, "value"),
    startsAt: field(formData, "startsAt"),
    endsAt: field(formData, "endsAt"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success)
    return result("error", "Revisa importe, fechas y producto de la oferta.");
  try {
    const actor = await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      product_id: input.productId,
      kind: input.kind,
      value: input.value,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      enabled: input.enabled,
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin.from("product_offers").update(payload).eq("id", input.id)
      : admin
          .from("product_offers")
          .insert({ ...payload, created_by: actor.userId });
    const { data, error } = await query.select("id").single();
    if (error || !data)
      return result(
        "error",
        "No se pudo guardar la oferta. Revisa precio base, vigencia y solapamientos.",
      );
    refreshCatalog();
    return result(
      "success",
      "Oferta guardada; el cálculo público depende de su vigencia y activación.",
    );
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar la oferta.",
    );
  }
}

export async function saveSpecAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = specSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    label: field(formData, "label"),
    value: field(formData, "value"),
    unit: field(formData, "unit"),
    sortOrder: field(formData, "sortOrder"),
  });
  if (!parsed.success)
    return result("error", "Revisa la especificación y su orden.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      product_id: input.productId,
      label: input.label,
      value: input.value,
      unit: input.unit || null,
      sort_order: input.sortOrder,
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin
          .from("product_specs")
          .update(payload)
          .eq("id", input.id)
          .eq("product_id", input.productId)
      : admin.from("product_specs").insert(payload);
    const { data, error } = await query.select("id").single();
    if (error || !data)
      return result("error", "No se pudo guardar la especificación.");
    refreshCatalog();
    return result("success", "Especificación guardada.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar la especificación.",
    );
  }
}

export async function removeSpecAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = z.object({ id: uuid, productId: uuid }).safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
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
    if (error || !data)
      return result("error", "No se pudo quitar la especificación.");
    refreshCatalog();
    return result("success", "Especificación quitada.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o quitar la especificación.",
    );
  }
}

export async function saveInclusionAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = inclusionSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    description: field(formData, "description"),
    quantity: field(formData, "quantity"),
    sortOrder: field(formData, "sortOrder"),
  });
  if (!parsed.success)
    return result("error", "Revisa lo incluido, la cantidad y el orden.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      product_id: input.productId,
      description: input.description,
      quantity: input.quantity,
      sort_order: input.sortOrder,
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin
          .from("product_inclusions")
          .update(payload)
          .eq("id", input.id)
          .eq("product_id", input.productId)
      : admin.from("product_inclusions").insert(payload);
    const { data, error } = await query.select("id").single();
    if (error || !data)
      return result("error", "No se pudo guardar el elemento incluido.");
    refreshCatalog();
    return result("success", "Elemento incluido guardado.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar lo incluido.",
    );
  }
}

export async function removeInclusionAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = z.object({ id: uuid, productId: uuid }).safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
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
    if (error || !data)
      return result("error", "No se pudo quitar el elemento incluido.");
    refreshCatalog();
    return result("success", "Elemento incluido quitado.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o quitar lo incluido.",
    );
  }
}

export async function updateImageMetadataAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = imageMetadataSchema.safeParse({
    id: field(formData, "id"),
    productId: field(formData, "productId"),
    altText: field(formData, "altText"),
    sortOrder: field(formData, "sortOrder"),
  });
  if (!parsed.success)
    return result("error", "Revisa descripción y orden de la imagen.");
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const { data, error } = await createSupabaseAdminClient()
      .from("product_images")
      .update({ alt_text: input.altText, sort_order: input.sortOrder })
      .eq("id", input.id)
      .eq("product_id", input.productId)
      .select("id")
      .single();
    if (error || data?.id !== input.id)
      return result("error", "No se pudo actualizar la imagen.");
    refreshCatalog();
    return result("success", "Imagen actualizada.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o actualizar la imagen.",
    );
  }
}

export async function setPrimaryImageAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = primaryImageSchema.safeParse({
    productId: field(formData, "productId"),
    imageId: field(formData, "imageId"),
    expectedPrimaryId: field(formData, "expectedPrimaryId"),
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
      p_expected_primary_id: input.expectedPrimaryId || null,
    });
    if (error?.code === "P4090")
      return result(
        "error",
        "La portada cambió. Actualiza la página antes de elegir otra imagen.",
      );
    if (error || data !== input.imageId)
      return result("error", "No se pudo elegir la imagen principal.");
    refreshCatalog();
    return result("success", "Imagen principal actualizada.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o cambiar la portada.",
    );
  }
}

export async function saveCompatibilityAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = compatibilitySchema.safeParse({
    equipmentId: field(formData, "equipmentId"),
    partId: field(formData, "partId"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success)
    return result(
      "error",
      "Selecciona un equipo, un repuesto y revisa las notas.",
    );
  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const { data, error } = await createSupabaseAdminClient()
      .from("product_compatibilities")
      .upsert(
        {
          equipment_id: input.equipmentId,
          part_id: input.partId,
          notes: input.notes || null,
        },
        { onConflict: "equipment_id,part_id" },
      )
      .select("equipment_id,part_id")
      .single();
    if (
      error ||
      data?.equipment_id !== input.equipmentId ||
      data?.part_id !== input.partId
    ) {
      return result(
        "error",
        "No se guardó la compatibilidad. Comprueba que el equipo y el repuesto correspondan.",
      );
    }
    refreshCatalog();
    return result("success", "Compatibilidad guardada.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o guardar la compatibilidad.",
    );
  }
}

export async function removeCompatibilityAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const parsed = compatibilitySchema.omit({ notes: true }).safeParse({
    equipmentId: field(formData, "equipmentId"),
    partId: field(formData, "partId"),
  });
  if (!parsed.success) return result("error", "Compatibilidad inválida.");
  try {
    await requireStaffActor(["admin"]);
    const { data, error } = await createSupabaseAdminClient()
      .from("product_compatibilities")
      .delete()
      .eq("equipment_id", parsed.data.equipmentId)
      .eq("part_id", parsed.data.partId)
      .select("equipment_id,part_id")
      .single();
    if (error || !data)
      return result("error", "No se pudo quitar la compatibilidad.");
    refreshCatalog();
    return result("success", "Compatibilidad quitada.");
  } catch {
    return result(
      "error",
      "No se pudo verificar el permiso o quitar la compatibilidad.",
    );
  }
}
