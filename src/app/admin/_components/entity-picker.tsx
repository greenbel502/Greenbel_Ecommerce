"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import styles from "./entity-picker.module.css";

type Option = { id: string; label: string };

export function EntityPicker({
  entity,
  name,
  label,
  defaultId = "",
  defaultLabel = "Selección guardada",
  emptyLabel = "Sin selección",
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
  emptyLabel?: string;
  required?: boolean;
  kind?: string;
  published?: boolean;
  active?: boolean;
  exclude?: string[];
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Option>({
    id: defaultId,
    label: defaultLabel,
  });
  const [results, setResults] = useState<{ query: string; items: Option[] }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [retry, setRetry] = useState(0);
  const placeholder = required ? "Seleccionar" : emptyLabel;
  const items = (results?.items ?? []).filter(
    (item) => !exclude.includes(item.id) || item.id === selected.id,
  );
  const options = [
    ...(!search.trim() ? [{ id: "", label: placeholder }] : []),
    ...(results?.query === search ? items : []),
  ];
  // Keep the saved selection available to FormData even when a search excludes it.
  const formOptions = [
    ...(selected.id ? [selected] : []),
    ...items.filter((item) => item.id !== selected.id),
  ];

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function show() {
    if (trigger.current?.matches(":disabled")) return;
    setSearch("");
    setResults(undefined);
    setLoading(true);
    setError(false);
    setCursor(0);
    setOpen(true);
  }

  function choose(option: Option) {
    const control = select.current;
    if (!control || control.matches(":disabled")) return;
    control.value = option.id;
    // Preserve native form/change semantics, including CategoryEditor's parentId.
    control.dispatchEvent(new Event("change", { bubbles: true }));
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const params = new URLSearchParams({
            entity,
            q: search,
            ...(kind ? { kind } : {}),
            ...(published ? { published: "true" } : {}),
            ...(active ? { active: "true" } : {}),
          });
          const response = await fetch(`/api/admin/lookup?${params}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok) throw new Error();
          const data: { items: Option[]; hasMore: boolean } =
            await response.json();
          if (controller.signal.aborted) return;
          setResults({ query: search, items: data.items });
          setSelected(
            (old) => data.items.find((item) => item.id === old.id) ?? old,
          );
          setMore(data.hasMore);
        } catch {
          if (!controller.signal.aborted) setError(true);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, entity, search, kind, published, active, retry]);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = popup.current;
    const button = trigger.current;
    if (!panel || !button) return;
    function position() {
      if (!panel || !button) return;
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const below = height + offsetTop - rect.bottom - 14;
      const above = rect.top - offsetTop - 14;
      const upwards = below < 240 && above > below;
      const panelWidth = Math.min(Math.max(rect.width, 240), width - 24);
      panel.style.width = `${panelWidth}px`;
      panel.style.left = `${Math.max(offsetLeft + 12, Math.min(rect.left, offsetLeft + width - panelWidth - 12))}px`;
      panel.style.maxHeight = `${Math.min(360, Math.max(100, upwards ? above : below))}px`;
      panel.style.top = upwards ? "auto" : `${rect.bottom + 6}px`;
      panel.style.bottom = upwards
        ? `${window.innerHeight - rect.top + 6}px`
        : "auto";
    }
    // Native top layer keeps the list above a modal drawer and its scrolling body.
    panel.showPopover?.();
    position();
    input.current?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      if (panel.isConnected) panel.hidePopover?.();
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);

  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${cursor}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, cursor, id]);

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      // Home/End still edit the query while typing.
      if (search && ["Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const last = Math.max(0, options.length - 1);
      setCursor((old) =>
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? last
            : Math.min(
                last,
                Math.max(0, old + (event.key === "ArrowDown" ? 1 : -1)),
              ),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options[cursor]) choose(options[cursor]);
    }
  }

  return (
    <div
      ref={root}
      className={`admin-entity-picker ${styles.picker}`}
      data-entity-picker
    >
      <label id={`${id}-label`} htmlFor={`${id}-trigger`}>
        {label}
        {required ? " *" : ""}
      </label>
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-popup` : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        data-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!open) show();
          }
        }}
      >
        <span
          id={`${id}-value`}
          className={selected.id ? undefined : styles.placeholder}
        >
          {selected.id ? selected.label : placeholder}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <select
        ref={select}
        name={name}
        value={selected.id}
        required={required}
        aria-invalid={invalid || undefined}
        tabIndex={-1}
        aria-hidden="true"
        aria-label={label}
        className={styles.nativeSelect}
        onChange={(event) => {
          const option = event.target.selectedOptions[0];
          setSelected({ id: event.target.value, label: option?.text ?? "" });
          setInvalid(false);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          show();
        }}
      >
        <option value="">{placeholder}</option>
        {formOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {invalid && (
        <p className={styles.validation} role="alert" id={`${id}-error`}>
          Selecciona una opción para continuar.
        </p>
      )}
      {open && (
        <div
          ref={popup}
          id={`${id}-popup`}
          className={styles.popup}
          popover="manual"
          role="dialog"
          aria-label={`Seleccionar ${label.toLowerCase()}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }
          }}
        >
          <div className={styles.searchBar}>
            <Search size={17} aria-hidden="true" />
            <input
              ref={input}
              className={styles.search}
              type="search"
              role="combobox"
              aria-label={`Buscar ${label.toLowerCase()}`}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={
                options[cursor] ? `${id}-option-${cursor}` : undefined
              }
              value={search}
              autoComplete="off"
              placeholder="Buscar por nombre o código…"
              onChange={(event) => {
                setSearch(event.target.value);
                setLoading(true);
                setError(false);
                setCursor(0);
              }}
              onKeyDown={navigate}
            />
          </div>
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            aria-busy={loading}
            className={styles.list}
          >
            {options.map((option, index) => (
              <li
                key={option.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={selected.id === option.id}
                data-highlighted={cursor === index}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setCursor(index)}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {selected.id === option.id && (
                  <Check size={17} aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
          {loading ? (
            <p className={styles.status} role="status">
              Buscando…
            </p>
          ) : error ? (
            <div className={styles.status}>
              <p role="alert">No se pudieron cargar las opciones.</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => {
                  setError(false);
                  setLoading(true);
                  setRetry((old) => old + 1);
                }}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <p className={styles.status} role="status">
              {!items.length
                ? search
                  ? "Sin coincidencias. Prueba otro nombre."
                  : "No hay opciones disponibles."
                : more
                  ? "Hay más resultados. Afina la búsqueda."
                  : `${items.length} ${items.length === 1 ? "opción disponible" : "opciones disponibles"}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
