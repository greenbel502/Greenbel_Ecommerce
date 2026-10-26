const MAX_LENGTH = 160;

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Used only when creating a product; existing public links stay stable. */
export function generateProductSlug(
  name: string,
  sku: string,
  collisionId = "",
): string {
  const ending = [
    normalize(sku).slice(0, 100).replace(/-$/, ""),
    normalize(collisionId),
  ]
    .filter(Boolean)
    .join("-");
  const base = (normalize(name) || "producto")
    .slice(0, MAX_LENGTH - (ending ? ending.length + 1 : 0))
    .replace(/-$/, "");
  return [base, ending].filter(Boolean).join("-");
}

export function isProductSlugConflict(
  error: { code: string; message: string } | null,
): boolean {
  return (
    error?.code === "23505" && error.message.includes('"products_slug_key"')
  );
}
