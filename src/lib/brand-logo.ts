export const BRAND_LOGO_BUCKET = "brand-logos";
export const BRAND_LOGO_MAX_INPUT = 5_000_000;
export const BRAND_LOGO_MAX_STORED = 2_000_000;

export function isBrandLogoPath(
  brandId: string,
  path: unknown,
): path is string {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      brandId,
    ) &&
    typeof path === "string" &&
    /^[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(
      path,
    ) &&
    path.startsWith(`${brandId.toLowerCase()}/`)
  );
}

export function brandLogoUrl(
  id: string,
  path: string | null,
  admin = false,
): string | null {
  if (!isBrandLogoPath(id, path)) return null;
  return `/api/${admin ? "admin/" : ""}brand-logos/${id}?v=${encodeURIComponent(path.split("/")[1])}`;
}

export function suggestBrandSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160)
    .replace(/-$/, "");
}
