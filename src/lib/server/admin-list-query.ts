import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchTerm, type ListState, type ListConfig } from "@/lib/admin-list";
/** Only called after the page's server authorization. Columns and tables come from code allowlists. */
export async function queryAdminList<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  state: ListState,
  config: ListConfig,
) {
  async function run(page: number, head = false) {
    let query = client.from(table).select(columns, { count: "exact", head });
    const q = searchTerm(state.q);
    if (q && config.search.length)
      query = query.or(
        config.search.map((column) => `${column}.ilike.%${q}%`).join(","),
        { referencedTable: config.searchTable },
      );
    if (
      config.filterColumn &&
      state.filter &&
      config.filters &&
      Object.hasOwn(config.filters, state.filter)
    )
      query = query.eq(config.filterColumn, state.filter);
    for (const column of config.notNull || [])
      query = query.not(column, "is", null);
    for (const [column, value] of config.fixed || [])
      query = query.eq(column, value);
    if (head) return query;
    return query
      .order(state.sort, { ascending: state.direction === "asc" })
      .order("id", { ascending: true })
      .range((page - 1) * state.size, page * state.size - 1);
  }
  let result = await run(state.page);
  // An offset beyond the result set can return HTTP 416 without a usable count.
  // Count only, then request the last valid bounded page; never fetch all rows.
  if (result.status === 416) {
    const counted = await run(1, true);
    if (counted.error || counted.count === null)
      throw new Error("Admin list unavailable");
    state.page = Math.max(1, Math.ceil(counted.count / state.size));
    result = await run(state.page);
  }
  if (result.error || result.count === null)
    throw new Error("Admin list unavailable");
  const last = Math.max(1, Math.ceil(result.count / state.size));
  if (state.page > last) {
    state.page = last;
    result = await run(last);
    if (result.error) throw new Error("Admin list unavailable");
  }
  state.total = result.count ?? 0;
  return { data: (result.data ?? []) as unknown as T[], state };
}
