export const CATALOG_PAGE_SIZE = 12;

/** Slice only after applying the catalog's filters and ordering. */
export function paginateCatalog<T>(items: readonly T[], requestedPage: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
  );
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  return {
    items: items.slice(offset, offset + CATALOG_PAGE_SIZE),
    page,
    totalPages,
    total,
    first: total ? offset + 1 : 0,
    last: Math.min(offset + CATALOG_PAGE_SIZE, total),
  };
}
