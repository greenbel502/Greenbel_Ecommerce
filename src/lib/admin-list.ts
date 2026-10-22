export type AdminParams = Record<string, string | string[] | undefined>;
export type ListState = {
  prefix: string;
  q: string;
  filter: string;
  sort: string;
  direction: "asc" | "desc";
  size: number;
  page: number;
  total: number;
  params: Record<string, string>;
};
export type ListConfig = {
  search: string[];
  searchTable?: string;
  sorts: Record<string, string>;
  defaultSort?: string;
  filterLabel?: string;
  filterColumn?: string;
  filters?: Record<string, string>;
  fixed?: [string, string][];
  notNull?: string[];
};
export function listState(
  params: AdminParams,
  prefix = "",
  config?: ListConfig,
): ListState {
  const stringParams = Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const get = (key: string) => stringParams[`${prefix}${key}`] || "";
  const page = Number(get("page")),
    size = Number(get("size"));
  const rawSort = get("sort"),
    defaultSort =
      config?.defaultSort ||
      Object.keys(config?.sorts || { created_at: "Fecha" })[0];
  return {
    prefix,
    q: get("q").slice(0, 120),
    filter:
      config?.filters && Object.hasOwn(config.filters, get("filter"))
        ? get("filter")
        : "",
    sort:
      config?.sorts && Object.hasOwn(config.sorts, rawSort)
        ? rawSort
        : defaultSort,
    direction: get("dir")
      ? get("dir") === "asc"
        ? "asc"
        : "desc"
      : config?.defaultSort
        ? "asc"
        : "desc",
    size: [10, 25, 50].includes(size) ? size : 10,
    page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1,
    total: 0,
    params: stringParams,
  };
}
export function listHref(
  path: string,
  state: ListState,
  changes: Record<string, string | number> = {},
) {
  const params = new URLSearchParams(state.params);
  for (const [key, value] of Object.entries(changes))
    params.set(`${state.prefix}${key}`, String(value));
  params.delete("result");
  return `${path}${params.size ? `?${params}` : ""}`;
}
export function searchTerm(q: string) {
  return q
    .replace(/[^\p{L}\p{N}\s@.+-]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
