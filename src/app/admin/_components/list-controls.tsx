import { CanonicalPage } from "./canonical-page";
import Link from "next/link";
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { listHref, type ListState, type ListConfig } from "@/lib/admin-list";
export function ListTools({
  state,
  config,
  path,
  label = "registros",
  extraFields = [],
}: {
  state: ListState;
  config: ListConfig;
  path: string;
  label?: string;
  extraFields?: {
    key: string;
    label: string;
    value: string;
    options: Record<string, string>;
  }[];
}) {
  const managed = new Set([
    ...["q", "filter", "sort", "dir", "size", "page"].map(
      (key) => state.prefix + key,
    ),
    ...extraFields.map((f) => f.key),
  ]);
  return (
    <form
      className="admin-list-tools"
      action={path}
      aria-label={`Buscar y filtrar ${label}`}
    >
      {Object.entries(state.params)
        .filter(([key]) => !managed.has(key) && key !== "result")
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <input type="hidden" name={`${state.prefix}page`} value="1" />
      {config.search.length > 0 && (
        <label className="admin-list-search">
          <span>Buscar {label}</span>
          <span className="admin-list-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              name={`${state.prefix}q`}
              defaultValue={state.q}
              placeholder="Escribe para buscar…"
              maxLength={120}
            />
          </span>
        </label>
      )}
      <div className="admin-list-options">
        {config.filters && (
          <label>
            {config.filterLabel || "Estado o tipo"}
            <select name={`${state.prefix}filter`} defaultValue={state.filter}>
              <option value="">Todos</option>
              {Object.entries(config.filters).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        {extraFields.map((field) => (
          <label key={field.key}>
            {field.label}
            <select name={field.key} defaultValue={field.value}>
              <option value="">Todos</option>
              {Object.entries(field.options).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Ordenar por
          <select name={`${state.prefix}sort`} defaultValue={state.sort}>
            {Object.entries(config.sorts).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dirección
          <select name={`${state.prefix}dir`} defaultValue={state.direction}>
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </select>
        </label>
        <label className="admin-list-size">
          Por página
          <select name={`${state.prefix}size`} defaultValue={state.size}>
            {[10, 25, 50].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="admin-list-actions">
          <button type="submit">
            <SlidersHorizontal size={16} aria-hidden="true" /> Aplicar filtros
          </button>
          <Link
            href={listHref(path, state, {
              q: "",
              filter: "",
              page: 1,
              ...(path === "/admin/usuarios" ? { active: "" } : {}),
            })}
          >
            <RotateCcw size={15} aria-hidden="true" /> Limpiar
          </Link>
        </div>
      </div>
    </form>
  );
}
export function ListPager({
  state,
  path,
  label = "registros",
}: {
  state: ListState;
  path: string;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(state.total / state.size));
  return (
    <nav className="admin-pager" aria-label={`Páginas de ${label}`}>
      <CanonicalPage prefix={state.prefix} page={state.page} />
      <span>
        Mostrando {state.total ? (state.page - 1) * state.size + 1 : 0}–
        {Math.min(state.page * state.size, state.total)} de {state.total}
      </span>
      <div>
        {state.page > 1 ? (
          <Link href={listHref(path, state, { page: state.page - 1 })}>
            Anterior
          </Link>
        ) : (
          <span className="disabled" aria-disabled="true">
            Anterior
          </span>
        )}
        <span>
          Página {state.page} de {pages}
        </span>
        {state.page < pages ? (
          <Link href={listHref(path, state, { page: state.page + 1 })}>
            Siguiente
          </Link>
        ) : (
          <span className="disabled" aria-disabled="true">
            Siguiente
          </span>
        )}
      </div>
    </nav>
  );
}
export function ListEmpty({
  state,
  path,
  noun = "registros",
}: {
  state: ListState;
  path: string;
  noun?: string;
}) {
  return (
    <div className="admin-empty">
      <h3>
        {state.q || state.filter
          ? "No hay coincidencias"
          : `Todavía no hay ${noun}`}
      </h3>
      <p>
        {state.q || state.filter
          ? "Prueba con otros términos o filtros."
          : "Los registros aparecerán aquí cuando se creen."}
      </p>
      {(state.q || state.filter) && (
        <Link
          href={listHref(path, state, {
            q: "",
            filter: "",
            page: 1,
            ...(path === "/admin/usuarios" ? { active: "" } : {}),
          })}
        >
          Limpiar búsqueda y filtros
        </Link>
      )}
    </div>
  );
}

export function SortHeading({
  state,
  path,
  column,
  label,
}: {
  state: ListState;
  path: string;
  column: string;
  label: string;
}) {
  const active = state.sort === column;
  return (
    <th
      scope="col"
      aria-sort={
        active
          ? state.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <Link
        href={listHref(path, state, {
          sort: column,
          dir: active && state.direction === "asc" ? "desc" : "asc",
          page: 1,
        })}
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        {active ? (state.direction === "asc" ? " ↑" : " ↓") : " ↕"}
      </Link>
    </th>
  );
}
