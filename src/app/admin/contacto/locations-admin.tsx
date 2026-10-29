"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { DEPARTMENTS, type LocationEntry } from "@/lib/contacts/locations";
import type { ContactSettings } from "@/lib/contacts/model";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import { CatalogDrawer } from "../catalogo/catalog-drawer";
import {
  deleteLocationAction,
  saveLocationAction,
  type ContactActionResult,
} from "./actions";
import styles from "./locations-admin.module.css";

const companies = {
  greenbel: "GreenBel",
  cooperative: "Cooperativa Concepción R.L.",
};
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

type Editor = { company: LocationEntry["company"]; entry?: LocationEntry };

/** One control, with its search inside the expanded list. No network lookup. */
function DepartmentPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const requiredControl = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const options = DEPARTMENTS.filter((department) =>
    normalize(department.name).includes(normalize(query)),
  );
  const selected = DEPARTMENTS.find((department) => department.id === value);
  function show() {
    if (disabled) return;
    setQuery("");
    setCursor(0);
    setOpen(true);
  }
  function choose(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((index) =>
        Math.max(
          0,
          Math.min(
            options.length - 1,
            index + (event.key === "ArrowDown" ? 1 : -1),
          ),
        ),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options[cursor]) choose(options[cursor].id);
    }
  }
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${cursor}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [cursor, id, open]);
  return (
    <div className={styles.picker} ref={root}>
      <span id={`${id}-label`} className={styles.label}>
        Departamento *
      </span>
      <select
        ref={requiredControl}
        className={styles.nativeSelect}
        aria-hidden="true"
        aria-label="Departamento"
        value={value}
        required
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          show();
        }}
        tabIndex={-1}
      >
        <option value="">Seleccionar departamento</option>
        {DEPARTMENTS.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      <button
        ref={trigger}
        type="button"
        className={styles.pickerTrigger}
        aria-labelledby={`${id}-label ${id}-selection`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span id={`${id}-selection`}>
          {selected?.name ?? "Seleccionar departamento"}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.pickerMenu}>
          <div className={styles.pickerSearch}>
            <Search size={17} aria-hidden="true" />
            <input
              ref={input}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={keyboard}
              placeholder="Buscar departamento…"
              aria-label="Buscar departamento"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={
                options[cursor] ? `${id}-option-${cursor}` : undefined
              }
            />
          </div>
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="Departamentos"
            className={styles.pickerList}
          >
            {options.map((department, index) => (
              <button
                key={department.id}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                aria-selected={value === department.id}
                tabIndex={-1}
                className={index === cursor ? styles.highlighted : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(department.id)}
              >
                {department.name}
                {value === department.id && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
            ))}
            {!options.length && (
              <p className={styles.help}>
                No hay departamentos con ese nombre.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LocationEditor({
  editor,
  settings,
  onSaved,
  onClose,
  onBusy,
  onDirty,
}: {
  editor: Editor;
  settings: ContactSettings;
  onSaved: (result: ContactActionResult) => void;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const entry = editor.entry;
  const [name, setName] = useState(entry?.name ?? "");
  const [department, setDepartment] = useState<string>(entry?.department ?? "");
  const [address, setAddress] = useState(entry?.address ?? "");
  const [hours, setHours] = useState(entry?.hours ?? "");
  const [mapsUrl, setMapsUrl] = useState(entry?.mapsUrl ?? "");
  const [latitude, setLatitude] = useState(entry?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(
    entry?.longitude?.toString() ?? "",
  );
  const [active, setActive] = useState(entry?.active ?? true);
  const [sortOrder, setSortOrder] = useState(entry?.sortOrder ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const dirty =
    name !== (entry?.name ?? "") ||
    department !== (entry?.department ?? "") ||
    address !== (entry?.address ?? "") ||
    hours !== (entry?.hours ?? "") ||
    mapsUrl !== (entry?.mapsUrl ?? "") ||
    latitude !== (entry?.latitude?.toString() ?? "") ||
    longitude !== (entry?.longitude?.toString() ?? "") ||
    active !== (entry?.active ?? true) ||
    sortOrder !== (entry?.sortOrder ?? 0);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useNotificationFeedback(error ? "error" : "idle", error);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    if (!department) {
      setError("Selecciona el departamento de esta ubicación.");
      return;
    }
    if (!!latitude.trim() !== !!longitude.trim()) {
      setError("Agrega latitud y longitud juntas, o deja ambas vacías.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await saveLocationAction({
        ...(entry ? { id: entry.id } : {}),
        company: editor.company,
        name,
        department,
        address,
        hours,
        mapsUrl: mapsUrl.trim() || null,
        latitude: latitude.trim() ? Number(latitude) : null,
        longitude: longitude.trim() ? Number(longitude) : null,
        active,
        sortOrder,
        revision: settings.revision,
      });
      if (result.status === "success") onSaved(result);
      else setError(result.message);
    } catch {
      setUncertain(true);
      setError(
        "No se confirmó el guardado. Revisa las ubicaciones guardadas antes de reintentar; tus datos siguen aquí.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset disabled={busy}>
        <section className={styles.fields}>
          <h3>
            <MapPin size={20} aria-hidden="true" /> Datos de la ubicación
          </h3>
          <p className={styles.help}>
            Los campos con * son obligatorios. Esta ubicación aparecerá en{" "}
            {editor.company === "greenbel" ? "Contacto" : "Financiamiento"}{" "}
            cuando esté visible.
          </p>
          <label className={styles.field}>
            Nombre de la ubicación *
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Quetzaltenango o Sede central"
              autoComplete="off"
            />
          </label>
          <DepartmentPicker
            value={department}
            onChange={setDepartment}
            disabled={busy}
          />
          <label className={styles.field}>
            Dirección (opcional)
            <textarea
              minLength={5}
              maxLength={400}
              rows={3}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Agrega la dirección exacta cuando la tengas confirmada."
            />
          </label>
          <label className={styles.field}>
            Horario de atención (opcional)
            <input
              maxLength={180}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="Ej. Lunes a viernes, de 8:00 a 17:00"
            />
          </label>
          <label className={styles.field}>
            Enlace de Google Maps (opcional)
            <input
              type="url"
              maxLength={2048}
              value={mapsUrl}
              onChange={(event) => setMapsUrl(event.target.value)}
              placeholder="https://maps.app.goo.gl/…"
            />
            <small>
              Guarda el enlace de Google Maps como referencia administrativa.
              El mapa público muestra el nombre de la ubicación.
            </small>
          </label>
          <details className={styles.advanced}>
            <summary>Posición exacta y orden (opcional)</summary>
            <p className={styles.help}>
              Sin coordenadas, el marcador indica el departamento de forma
              aproximada. Agrega ambas coordenadas únicamente cuando conozcas la
              ubicación exacta.
            </p>
            <div className={styles.coordinateGrid}>
              <label className={styles.field}>
                Latitud
                <input
                  type="number"
                  step="any"
                  min="13.5"
                  max="18"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  placeholder="14.6…"
                />
              </label>
              <label className={styles.field}>
                Longitud
                <input
                  type="number"
                  step="any"
                  min="-92.4"
                  max="-88"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  placeholder="-90.5…"
                />
              </label>
            </div>
            <label className={styles.field}>
              Orden de presentación
              <input
                type="number"
                min={0}
                max={999}
                step={1}
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
              <small>
                Las ubicaciones con el número menor aparecen primero.
              </small>
            </label>
          </details>
          <label className={styles.visibility}>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>
              <strong>Mostrar esta ubicación</strong>
              <small>
                Puedes ocultarla sin perder la dirección ni sus datos.
              </small>
            </span>
          </label>
        </section>
      </fieldset>
      <footer className={styles.footer}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.help}>
          {busy ? "Guardando ubicación…" : "Los cambios se aplican al guardar."}
        </p>
        <div className={styles.footerActions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          {uncertain ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => window.location.reload()}
            >
              Revisar ubicaciones guardadas
            </button>
          ) : (
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || (!!entry && !dirty)}
            >
              <Save size={17} aria-hidden="true" />
              {busy ? "Guardando…" : "Guardar ubicación"}
            </button>
          )}
        </div>
      </footer>
    </form>
  );
}

export function LocationsAdmin({
  settings,
  onSaved,
}: {
  settings: ContactSettings;
  onSaved: (result: ContactActionResult) => void;
}) {
  const [company, setCompany] = useState<LocationEntry["company"]>("greenbel");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const inFlight = useRef(false);
  const confirm = useConfirm();
  useNotificationFeedback(error ? "error" : "idle", error);
  const entries = settings.contacts.locations
    .filter((entry) => entry.company === company)
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"),
    );
  const filtered = entries.filter((entry) =>
    normalize(
      `${entry.name} ${DEPARTMENTS.find((department) => department.id === entry.department)?.name ?? ""} ${entry.address}`,
    ).includes(normalize(query)),
  );
  async function closeEditor() {
    if (busy) return;
    if (
      dirty &&
      !(await confirm({
        title: "Salir sin guardar",
        message:
          "Tienes cambios en esta ubicación. ¿Deseas salir sin guardarlos?",
        confirmLabel: "Salir sin guardar",
      }))
    )
      return;
    setEditor(null);
    setDirty(false);
  }
  function saved(result: ContactActionResult) {
    setEditor(null);
    setDirty(false);
    onSaved(result);
  }
  async function remove(entry: LocationEntry) {
    if (inFlight.current) return;
    if (
      !(await confirm({
        title: "Eliminar ubicación",
        message: `¿Deseas eliminar «${entry.name}» de ${companies[entry.company]}? Dejará de aparecer en el mapa y sus datos se eliminarán de la configuración.`,
        confirmLabel: "Eliminar ubicación",
      }))
    )
      return;
    inFlight.current = true;
    setDeletingId(entry.id);
    setError("");
    try {
      const result = await deleteLocationAction({
        id: entry.id,
        revision: settings.revision,
        confirmation: "delete",
      });
      if (result.status === "success") {
        onSaved(result);
        document.getElementById("locations-heading")?.focus();
      } else setError(result.message);
    } catch {
      setError(
        "No se confirmó la eliminación. Actualiza la página antes de reintentar.",
      );
    } finally {
      inFlight.current = false;
      setDeletingId(null);
    }
  }
  return (
    <section className={styles.shell} aria-labelledby="locations-heading">
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">Presencia en Guatemala</span>
          <h2 id="locations-heading" tabIndex={-1}>
            Ubicaciones
          </h2>
          <p>
            Administra los departamentos que aparecen en Contacto y
            Financiamiento. Puedes agregar direcciones exactas cuando estén
            confirmadas.
          </p>
        </div>
        <button
          id="add-location"
          type="button"
          className={styles.primary}
          disabled={!!deletingId}
          onClick={() => {
            setDirty(false);
            setEditor({ company });
          }}
        >
          <Plus size={18} aria-hidden="true" />
          Agregar ubicación
        </button>
      </header>
      <div className={styles.controls}>
        <div
          className={styles.organizations}
          aria-label="Organización de las ubicaciones"
        >
          {(["greenbel", "cooperative"] as const).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={company === key}
              className={company === key ? styles.selectedOrganization : ""}
              disabled={!!deletingId}
              onClick={() => {
                setCompany(key);
                setQuery("");
              }}
            >
              {companies[key]}
              <span>
                {
                  settings.contacts.locations.filter(
                    (entry) => entry.company === key,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className={styles.srOnly}>Buscar ubicaciones</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar sede, departamento o dirección…"
          />
        </label>
      </div>
      <p className={styles.context}>
        <MapPin size={16} aria-hidden="true" />
        {company === "greenbel"
          ? "Las ubicaciones visibles de GreenBel aparecen en Contacto."
          : "Las ubicaciones visibles de la cooperativa aparecen en Financiamiento."}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Ubicaciones de {companies[company]}
          </caption>
          <thead>
            <tr>
              <th scope="col">Ubicación</th>
              <th scope="col">Dirección</th>
              <th scope="col">Visibilidad</th>
              <th scope="col" className={styles.actionHeading}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id}>
                <td data-label="Ubicación">
                  <div className={styles.locationName}>
                    <span className={styles.pin}>
                      <MapPin size={21} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{entry.name}</strong>
                      <small>
                        {entry.name ===
                        DEPARTMENTS.find(
                          (department) => department.id === entry.department,
                        )?.name
                          ? "Presencia por departamento"
                          : DEPARTMENTS.find(
                              (department) =>
                                department.id === entry.department,
                            )?.name}
                      </small>
                    </div>
                  </div>
                </td>
                <td data-label="Dirección">
                  <span className={styles.address}>
                    {entry.address || "Dirección por confirmar"}
                  </span>
                  {entry.hours && (
                    <small className={styles.hours}>{entry.hours}</small>
                  )}
                </td>
                <td data-label="Visibilidad">
                  <span
                    className={`${styles.badge} ${entry.active ? styles.visible : ""}`}
                  >
                    {entry.active ? (
                      <Eye size={13} aria-hidden="true" />
                    ) : (
                      <EyeOff size={13} aria-hidden="true" />
                    )}
                    {entry.active ? "Visible" : "Oculta"}
                  </span>
                </td>
                <td data-label="Acciones">
                  <div className={styles.actions}>
                    <button
                      id={`edit-location-${entry.id}`}
                      type="button"
                      className={styles.secondary}
                      disabled={!!deletingId}
                      onClick={() => {
                        setDirty(false);
                        setEditor({ company: entry.company, entry });
                      }}
                      aria-label={`Editar ${entry.name}`}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      disabled={!!deletingId}
                      onClick={() => void remove(entry)}
                      aria-label={`Eliminar ${entry.name}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {deletingId === entry.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className={styles.empty}>
            <MapPin size={30} aria-hidden="true" />
            <h3>
              {entries.length
                ? "No hay coincidencias"
                : "Agrega la primera ubicación"}
            </h3>
            <p>
              {entries.length
                ? "Prueba con otro nombre, departamento o dirección."
                : `Agrega un departamento de ${companies[company]}. Puedes completar su dirección exacta después; mientras tanto, el mapa mostrará una referencia aproximada.`}
            </p>
            {query && (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setQuery("")}
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}
      </div>
      <p className={styles.help}>
        {filtered.length} de {entries.length} ubicaciones ·{" "}
        {entries.filter((entry) => entry.active).length} visibles
      </p>
      {editor && (
        <CatalogDrawer
          id="location-editor"
          title={editor.entry ? "Editar ubicación" : "Agregar ubicación"}
          kicker={companies[editor.company]}
          closeLabel="Cerrar editor de ubicación"
          busy={busy}
          onClose={() => void closeEditor()}
          returnFocusId={
            editor.entry ? `edit-location-${editor.entry.id}` : "add-location"
          }
        >
          <LocationEditor
            editor={editor}
            settings={settings}
            onSaved={saved}
            onClose={() => void closeEditor()}
            onBusy={setBusy}
            onDirty={setDirty}
          />
        </CatalogDrawer>
      )}
    </section>
  );
}
