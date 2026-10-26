import { isBrandLogoPath } from "../brand-logo.ts";
import type { BrandDraft, LogoSaveResult } from "./save-brand-changes.ts";

export async function saveBrandLogo(
  id: string,
  expected: string | null,
  draft: BrandDraft,
  request: typeof fetch = fetch,
): Promise<LogoSaveResult> {
  const data = new FormData();
  data.set("brandId", id);
  data.set("expectedLogoPath", expected ?? "");
  data.set("operation", draft.logoOperation);
  if (draft.file && draft.logoOperation === "upload")
    data.set("image", draft.file);
  const response = await request("/api/admin/brand-logos", {
    method: "POST",
    body: data,
  });
  const body = await response.json();
  if (!response.ok || body.status !== "recorded")
    return {
      ok: false,
      message:
        typeof body.error === "string"
          ? body.error
          : "No se pudo guardar el logotipo.",
      uncertain: response.status === 409 || response.status >= 500,
    };
  if (
    draft.logoOperation === "upload"
      ? !isBrandLogoPath(id, body.logoPath)
      : body.logoPath !== null
  )
    throw new Error("Unconfirmed image response");
  return {
    ok: true,
    logoPath: body.logoPath,
    cleanupPending: body.cleanupPending === true,
  };
}
