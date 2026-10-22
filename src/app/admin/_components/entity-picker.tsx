"use client";
import { useEffect, useId, useState } from "react";
export function EntityPicker({
  entity,
  name,
  label,
  defaultId = "",
  defaultLabel = "Selección guardada",
  required = false,
  kind,
  published = false,
  active = false,
  exclude = [],
}: {
  entity: "products" | "brands" | "categories" | "services" | "zones";
  name: string;
  label: string;
  defaultId?: string;
  defaultLabel?: string;
  required?: boolean;
  kind?: string;
  published?: boolean;
  active?: boolean;
  exclude?: string[];
}) {
  const id = useId(),
    [search, setSearch] = useState(""),
    [value, setValue] = useState(defaultId),
    [items, setItems] = useState<{ id: string; label: string }[]>(
      defaultId ? [{ id: defaultId, label: defaultLabel }] : [],
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [more, setMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const p = new URLSearchParams({
          entity,
          q: search,
          ...(kind ? { kind } : {}),
          ...(published ? { published: "true" } : {}),
          ...(active ? { active: "true" } : {}),
        });
        const r = await fetch(`/api/admin/lookup?${p}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!r.ok) throw new Error();
        const data = await r.json();
        setItems((old) => [
          ...old.filter(
            (o) =>
              o.id === value &&
              !data.items.some((n: { id: string }) => n.id === value),
          ),
          ...data.items,
        ]);
        setMore(data.hasMore);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [entity, search, kind, published, active, value]);
  return (
    <div className="admin-entity-picker">
      <label htmlFor={`${id}-search`}>
        Buscar {label.toLowerCase()}
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre o código"
          autoComplete="off"
        />
      </label>
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
        <select
          id={id}
          name={name}
          value={value}
          required={required}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">Seleccionar</option>
          {items
            .filter((item) => !exclude.includes(item.id) || item.id === value)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      {loading && <small role="status">Buscando…</small>}
      {error && (
        <small role="alert">
          No se pudo cargar la selección. Cambia la búsqueda para reintentar.
        </small>
      )}
      {more && (
        <small>
          Hay más resultados. Escribe un nombre o código más específico.
        </small>
      )}
    </div>
  );
}
