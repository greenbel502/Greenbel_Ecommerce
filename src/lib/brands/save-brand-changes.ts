import { isBrandLogoPath } from "../brand-logo.ts";

export type SavedBrand = {
  id: string | null;
  name: string;
  slug: string;
  active: boolean;
  logoPath: string | null;
};
export type BrandDraft = {
  name: string;
  slug: string;
  active: boolean;
  logoOperation: "keep" | "upload" | "remove";
  file: File | null;
};
type ActionResult = {
  status: "idle" | "success" | "error";
  message: string;
  brandId?: string;
  fieldErrors?: Record<string, string>;
};
export type LogoSaveResult = {
  ok: boolean;
  message?: string;
  logoPath?: string | null;
  cleanupPending?: boolean;
  uncertain?: boolean;
};
export type BrandSaveResult = {
  status: "success" | "error";
  message: string;
  saved: SavedBrand;
  logoCompleted: boolean;
  fieldErrors?: Record<string, string>;
  uncertain?: boolean;
};
export type BrandSaveDependencies = {
  details: (id: string | null, draft: BrandDraft) => Promise<ActionResult>;
  logo: (
    id: string,
    expected: string | null,
    draft: BrandDraft,
  ) => Promise<LogoSaveResult>;
  visibility: (id: string, active: boolean) => Promise<ActionResult>;
};

/** One user save, using the existing protected operations. Each confirmed step
 * is retained for safe retries; this is deliberately not presented as a DB transaction. */
export async function saveBrandChanges(
  previous: SavedBrand,
  draft: BrandDraft,
  dependencies: BrandSaveDependencies,
  progress: (message: string) => void = () => {},
): Promise<BrandSaveResult> {
  const saved = { ...previous };
  let stage = "los datos de la marca";
  let logoCompleted = false;
  let cleanupPending = false;
  try {
    if (
      !saved.id ||
      saved.name !== draft.name.trim() ||
      saved.slug !== draft.slug.trim()
    ) {
      progress("Guardando datos de la marca…");
      const details = await dependencies.details(saved.id, draft);
      if (details.status !== "success" || !details.brandId)
        return {
          status: "error",
          message: details.message,
          fieldErrors: details.fieldErrors,
          saved,
          logoCompleted,
        };
      saved.id = details.brandId;
      saved.name = draft.name.trim();
      saved.slug = draft.slug.trim();
    }
    if (!saved.id) throw new Error("Unconfirmed brand");
    if (draft.logoOperation !== "keep") {
      stage = "el logotipo";
      progress(
        draft.logoOperation === "remove"
          ? "Retirando logotipo…"
          : "Subiendo y guardando logotipo…",
      );
      const logo = await dependencies.logo(saved.id, saved.logoPath, draft);
      if (!logo.ok)
        return {
          status: "error",
          saved,
          logoCompleted,
          uncertain: logo.uncertain,
          message: `Los datos de la marca están guardados. ${logo.message || "No se pudo guardar el logotipo; la selección se conserva."}`,
        };
      if (
        draft.logoOperation === "upload"
          ? !isBrandLogoPath(saved.id, logo.logoPath)
          : logo.logoPath !== null
      )
        throw new Error("Unconfirmed logo");
      saved.logoPath = logo.logoPath ?? null;
      logoCompleted = true;
      cleanupPending = !!logo.cleanupPending;
    }
    if (saved.active !== draft.active) {
      stage = "la visibilidad";
      progress("Actualizando visibilidad…");
      const visibility = await dependencies.visibility(saved.id, draft.active);
      if (visibility.status !== "success")
        return {
          status: "error",
          saved,
          logoCompleted,
          message: `Los datos${logoCompleted ? " y el logotipo" : ""} están guardados, pero la visibilidad no cambió. ${visibility.message}`,
        };
      saved.active = draft.active;
    }
    return {
      status: "success",
      saved,
      logoCompleted,
      message: cleanupPending
        ? "La marca se guardó. Quedó pendiente retirar un archivo anterior."
        : saved.active
          ? "Marca guardada. Los cambios ya están disponibles en Inicio y Nosotros."
          : "Marca guardada como inactiva. Actívala para mostrarla en Inicio y Nosotros.",
    };
  } catch {
    return {
      status: "error",
      saved,
      logoCompleted,
      uncertain: true,
      message: `No se pudo confirmar el cambio en ${stage}. Revisa la marca antes de reintentar; no se informa un guardado completo.`,
    };
  }
}
