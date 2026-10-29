"use client";
import {
  notify,
  useNotificationFeedback,
} from "@/presentation/notifications/notify";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  Building2,
  Check,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type { ContactEntry, ContactSettings } from "@/lib/contacts/model";
import { LocationsAdmin } from "./locations-admin";
import { CatalogDrawer } from "../catalogo/catalog-drawer";
import {
  saveContactAction,
  deleteContactAction,
  type ContactActionResult,
} from "./actions";
import styles from "./contacts.module.css";
type Editor = {
  company: ContactEntry["company"];
  kind: ContactEntry["kind"];
  entry?: ContactEntry;
};
const companyName = { greenbel: "GreenBel", cooperative: "Cooperativa" };
function principalLabel(
  company: ContactEntry["company"],
  kind: ContactEntry["kind"],
) {
  return company === "greenbel" && kind === "phone"
    ? "Usar para las compras por WhatsApp"
    : `Usar como ${kind === "phone" ? "teléfono" : "correo"} principal`;
}
function ContactEditor({
  editor,
  settings,
  onSaved,
  onBusy,
}: {
  editor: Editor;
  settings: ContactSettings;
  onSaved: (result: ContactActionResult) => void;
  onBusy: (value: boolean) => void;
}) {
  const [value, setValue] = useState(editor.entry?.value ?? ""),
    [label, setLabel] = useState(editor.entry?.label ?? ""),
    [primary, setPrimary] = useState(
      editor.entry?.primary ??
        !settings.contacts.entries.some(
          (e) => e.company === editor.company && e.kind === editor.kind,
        ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useNotificationFeedback(error ? "error" : "idle", error);
  const sending = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await saveContactAction({
        ...(editor.entry && { id: editor.entry.id }),
        company: editor.company,
        kind: editor.kind,
        value,
        label,
        primary,
        revision: settings.revision,
      });
      if (result.status === "success") onSaved(result);
      else setError(result.message);
    } catch {
      setError(
        "No se confirmó el guardado. Actualiza la página antes de reintentar.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.fields}>
        <span className="eyebrow">{companyName[editor.company]}</span>
        <label>
          <span>
            {editor.kind === "phone"
              ? "Número de teléfono *"
              : "Correo electrónico *"}
          </span>
          <input
            type={editor.kind === "phone" ? "tel" : "email"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            maxLength={254}
            disabled={busy}
            autoComplete="off"
            placeholder={
              editor.kind === "phone" ? "+502 1234 5678" : "nombre@empresa.com"
            }
          />
          {editor.kind === "phone" && (
            <small>
              Incluye el código de país. Por ejemplo, +502 seguido de ocho
              dígitos.
            </small>
          )}
        </label>
        <label>
          <span>Nombre del contacto (opcional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            disabled={busy}
            placeholder="Ej. Ventas o atención al cliente"
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={primary}
            onChange={(e) => setPrimary(e.target.checked)}
            disabled={busy}
          />
          <span>{principalLabel(editor.company, editor.kind)}</span>
        </label>
        <p className={styles.help}>
          {editor.company === "greenbel"
            ? "El teléfono y el correo principales se muestran a los clientes. Las compras por WhatsApp se dirigen al teléfono seleccionado."
            : "Los datos de la cooperativa se conservan para la gestión administrativa. Guardarlos no envía correos ni solicitudes."}
        </p>
      </div>
      <footer className={styles.formFooter}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.primary} disabled={busy}>
          <Save size={18} />
          {busy ? "Guardando…" : "Guardar contacto"}
        </button>
      </footer>
    </form>
  );
}
function DeleteContact({
  entry,
  revision,
  onClose,
  onSaved,
}: {
  entry: ContactEntry;
  revision: string;
  onClose: () => void;
  onSaved: (result: ContactActionResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    sending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useNotificationFeedback(error ? "error" : "idle", error);
  useLayoutEffect(() => {
    const d = dialog.current!;
    const previous = document.activeElement;
    d.showModal();
    cancel.current?.focus();
    return () => {
      d.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous !== document.body
      )
        previous.focus();
      else document.getElementById("contact-admin-title")?.focus();
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await deleteContactAction({
        id: entry.id,
        revision,
        confirmation: "delete",
      });
      if (r.status === "success") onSaved(r);
      else setError(r.message);
    } catch {
      setError("No se confirmó la eliminación. Actualiza la página.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.confirm}
      aria-labelledby="contact-delete-title"
      aria-describedby="contact-delete-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <Trash2 size={25} />
        <h2 id="contact-delete-title">Eliminar contacto</h2>
        <p id="contact-delete-description">
          ¿Deseas eliminar{" "}
          <strong>
            {entry.kind === "phone" ? "+" : ""}
            {entry.value}
          </strong>{" "}
          de {companyName[entry.company]}?
        </p>
        {entry.primary && (
          <p>
            {entry.company === "greenbel" && entry.kind === "phone"
              ? "Las compras por WhatsApp quedarán sin un número hasta que selecciones otro."
              : "Quedará sin un contacto principal de este tipo hasta que selecciones otro."}
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            ref={cancel}
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className={styles.danger} disabled={busy}>
            {busy ? "Eliminando…" : "Eliminar contacto"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function ContactsAdmin({ initial }: { initial: ContactSettings }) {
  const [view, setView] = useState<"channels" | "locations">("channels");
  const [settings, setSettings] = useState(initial),
    [editor, setEditor] = useState<Editor | null>(null),
    [deleting, setDeleting] = useState<ContactEntry | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const saved = (result: ContactActionResult) => {
    if (result.settings) setSettings(result.settings);
    notify.success("Contacto actualizado", { description: result.message });
    setNotice(result.message);
    setEditor(null);
    setDeleting(null);
  };
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className="eyebrow">Configuración</span>
        <h1 id="contact-admin-title" tabIndex={-1}>
          Contacto
        </h1>
        <p>
          Administra los teléfonos, correos y ubicaciones de GreenBel y de la
          cooperativa.
        </p>
      </header>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <nav className={styles.tabs} aria-label="Configuración de contacto">
        <button
          type="button"
          aria-pressed={view === "channels"}
          onClick={() => setView("channels")}
        >
          Teléfonos y correos
        </button>
        <button
          type="button"
          aria-pressed={view === "locations"}
          onClick={() => setView("locations")}
        >
          Ubicaciones
        </button>
      </nav>
      {view === "locations" ? (
        <LocationsAdmin settings={settings} onSaved={saved} />
      ) : (
        <>
          <div className={styles.grid}>
            {(["greenbel", "cooperative"] as const).map((company) => (
              <section className={styles.card} key={company}>
                <header>
                  <Building2 size={23} />
                  <div>
                    <h2>{companyName[company]}</h2>
                    <p>
                      {company === "greenbel"
                        ? "Contacto público y compras por WhatsApp."
                        : "Contactos para la gestión de financiamiento."}
                    </p>
                  </div>
                </header>
                {(["phone", "email"] as const).map((kind) => {
                  const entries = settings.contacts.entries.filter(
                    (e) => e.company === company && e.kind === kind,
                  );
                  return (
                    <section className={styles.group} key={kind}>
                      <div className={styles.groupHeading}>
                        <h3>
                          {kind === "phone" ? (
                            <Phone size={18} />
                          ) : (
                            <Mail size={18} />
                          )}{" "}
                          {kind === "phone" ? "Teléfonos" : "Correos"}
                        </h3>
                        <button
                          id={`add-contact-${company}-${kind}`}
                          type="button"
                          className={styles.secondary}
                          onClick={() => setEditor({ company, kind })}
                          aria-label={`Agregar ${kind === "phone" ? "teléfono" : "correo"} de ${companyName[company]}`}
                        >
                          <Plus size={16} />
                          Agregar
                        </button>
                      </div>
                      {!entries.length && (
                        <p className={styles.empty}>
                          Aún no hay{" "}
                          {kind === "phone" ? "teléfonos" : "correos"}{" "}
                          registrados.
                        </p>
                      )}
                      {entries.map((entry) => (
                        <article className={styles.entry} key={entry.id}>
                          <div>
                            <strong>
                              {kind === "phone" ? "+" : ""}
                              {entry.value}
                            </strong>
                            {entry.label && <small>{entry.label}</small>}
                            {entry.primary && (
                              <span className={styles.badge}>
                                <Check size={13} />
                                {company === "greenbel" && kind === "phone"
                                  ? "Compras por WhatsApp"
                                  : "Principal"}
                              </span>
                            )}
                          </div>
                          <div className={styles.actions}>
                            <button
                              id={`edit-contact-${entry.id}`}
                              type="button"
                              className={styles.secondary}
                              onClick={() =>
                                setEditor({ company, kind, entry })
                              }
                              aria-label={`Editar ${entry.value}`}
                            >
                              <Pencil size={16} />
                              <span className={styles.actionText}>Editar</span>
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={() => setDeleting(entry)}
                              aria-label={`Eliminar ${entry.value}`}
                            >
                              <Trash2 size={16} />
                              <span className={styles.actionText}>
                                Eliminar
                              </span>
                            </button>
                          </div>
                        </article>
                      ))}
                      {company === "greenbel" &&
                        kind === "phone" &&
                        !entries.some((e) => e.primary) && (
                          <p className={styles.help}>
                            Selecciona un número principal para habilitar las
                            compras por WhatsApp.
                          </p>
                        )}
                    </section>
                  );
                })}
              </section>
            ))}
          </div>
          <p className={styles.help}>
            El correo principal de Cooperativa recibirá las solicitudes de
            financiamiento confirmadas. La conexión Gmail se administra en
            Consultas.
          </p>
        </>
      )}
      {editor && (
        <CatalogDrawer
          id="contact-editor"
          title={editor.entry ? "Editar contacto" : "Agregar contacto"}
          kicker={companyName[editor.company]}
          closeLabel="Cerrar editor de contacto"
          busy={busy}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          returnFocusId={
            editor.entry
              ? `edit-contact-${editor.entry.id}`
              : `add-contact-${editor.company}-${editor.kind}`
          }
        >
          <ContactEditor
            editor={editor}
            settings={settings}
            onSaved={saved}
            onBusy={setBusy}
          />
        </CatalogDrawer>
      )}
      {deleting && settings.revision && (
        <DeleteContact
          entry={deleting}
          revision={settings.revision}
          onClose={() => setDeleting(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
