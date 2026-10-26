"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import { useConfirm } from "@/presentation/notifications/notification-provider";

import { useRef, useState, type FormEvent } from "react";
import { Building2, Eye, Save } from "lucide-react";
import { suggestBrandSlug } from "@/lib/brand-logo";
import {
  saveBrandChanges,
  type SavedBrand,
} from "@/lib/brands/save-brand-changes";
import { saveBrandLogo } from "@/lib/brands/brand-logo-request";
import {
  createBrandAction,
  updateBrandAction,
  setBrandActiveAction,
} from "./actions";
import type { BrandRow } from "./catalog-admin";
import { BrandLogoUpload } from "./brand-logo-upload";
import styles from "./brands.module.css";

const idle = { status: "idle" as const, message: "" };
export function BrandEditor({
  brand,
  logoReady,
  onSaved,
  onCancel,
  onBusyChange,
}: {
  brand?: BrandRow;
  logoReady: boolean;
  onSaved: (saved: SavedBrand) => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const confirm = useConfirm();
  const [saved, setSaved] = useState<SavedBrand>({
    id: brand?.id ?? null,
    name: brand?.name ?? "",
    slug: brand?.slug ?? "",
    active: brand?.active ?? false,
    logoPath: brand?.logo_path ?? null,
  });
  const [name, setName] = useState(saved.name),
    [slug, setSlug] = useState(saved.slug);
  const [customSlug, setCustomSlug] = useState(!!brand),
    [active, setActive] = useState(saved.active);
  const [file, setFile] = useState<File | null>(null),
    [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useNotificationFeedback(
    message ? (error ? "error" : "success") : "idle",
    message,
  );
  const inFlight = useRef(false);
  const dirty =
    !saved.id ||
    name.trim() !== saved.name ||
    slug.trim() !== saved.slug ||
    active !== saved.active ||
    !!file ||
    removing;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    if ((file || removing) && !logoReady) {
      setError(true);
      setMessage(
        "No se puede guardar el logotipo ahora. Tu selección se conserva.",
      );
      return;
    }
    const confirmations = [];
    if (active !== saved.active)
      confirmations.push(
        active
          ? "La marca se mostrará en Inicio y Nosotros."
          : "La marca y sus productos dejarán de mostrarse en el sitio. Sus asignaciones se conservarán.",
      );
    if (removing) confirmations.push("Se quitará el logotipo actual.");
    if (
      confirmations.length &&
      !(await confirm({
        message: `${confirmations.join("\n")}\n¿Guardar estos cambios?`,
      }))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(false);
    setMessage("");
    setFieldErrors({});
    try {
      const result = await saveBrandChanges(
        saved,
        {
          name,
          slug,
          active,
          file,
          logoOperation: file ? "upload" : removing ? "remove" : "keep",
        },
        {
          details: (id, draft) => {
            const data = new FormData();
            data.set("name", draft.name);
            data.set("slug", draft.slug);
            if (id) data.set("id", id);
            return id
              ? updateBrandAction(idle, data)
              : createBrandAction(idle, data);
          },
          logo: saveBrandLogo,
          visibility: (id, value) => {
            const data = new FormData();
            data.set("id", id);
            data.set("active", String(value));
            return setBrandActiveAction(idle, data);
          },
        },
        setProgress,
      );
      setSaved(result.saved);
      setMessage(result.message);
      setError(result.status === "error");
      setFieldErrors(result.fieldErrors ?? {});
      setUncertain(!!result.uncertain);
      if (result.logoCompleted) {
        setFile(null);
        setRemoving(false);
      }
      if (result.status === "success" && result.saved.id) {
        setName(result.saved.name);
        setSlug(result.saved.slug);
        onSaved(result.saved);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange?.(false);
      setProgress("");
    }
  }
  return (
    <form className={styles.form} onSubmit={submit} data-brand-editor="true">
      <fieldset disabled={busy}>
        <section className={styles.editorSection}>
          <h3>
            <Building2 size={18} /> Datos de la marca
          </h3>
          <label className={styles.field}>
            Nombre de la marca <span aria-hidden="true">*</span>
            <input
              name="name"
              required
              maxLength={160}
              autoComplete="off"
              value={name}
              placeholder="Ej. Kawashima"
              onChange={(event) => {
                setName(event.target.value);
                if (!customSlug) setSlug(suggestBrandSlug(event.target.value));
              }}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={
                fieldErrors.name ? "brand-name-error" : undefined
              }
            />
          </label>
          {fieldErrors.name && (
            <p id="brand-name-error" className={styles.fieldError}>
              {fieldErrors.name}
            </p>
          )}
          <p className={styles.help}>
            Así aparecerá en la tienda y en tus productos.
          </p>
          <details className={styles.advanced}>
            <summary>Editar identificador</summary>
            <label className={styles.field}>
              Identificador de la marca
              <input
                name="slug"
                required
                maxLength={160}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onInvalid={(event) =>
                  event.currentTarget
                    .closest("details")
                    ?.setAttribute("open", "")
                }
                onChange={(event) => {
                  setCustomSlug(true);
                  setSlug(event.target.value);
                }}
                aria-invalid={!!fieldErrors.slug}
                aria-describedby="brand-slug-help"
              />
            </label>
            <p id="brand-slug-help" className={styles.help}>
              Se genera con el nombre. Usa minúsculas, números y guiones, sin
              espacios.
            </p>
            {fieldErrors.slug && (
              <p className={styles.fieldError}>{fieldErrors.slug}</p>
            )}
          </details>
        </section>
        <BrandLogoUpload
          id={saved.id}
          name={name}
          logoPath={saved.logoPath}
          file={file}
          removing={removing}
          ready={logoReady}
          busy={busy}
          onFile={setFile}
          onRemove={setRemoving}
          onError={(value) => {
            setError(!!value);
            setMessage(value);
          }}
        />
        <section className={styles.editorSection}>
          <h3>
            <Eye size={18} /> Visibilidad
          </h3>
          <label className={styles.visibilityChoice}>
            <input
              type="checkbox"
              name="active"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>
              <strong>Mostrar esta marca en el sitio</strong>
              <small>
                Inicio, Nosotros y productos publicados de esta marca.
              </small>
            </span>
          </label>
          <p className={styles.help}>
            {active
              ? "La marca será visible al guardar."
              : "La marca quedará inactiva. Puedes asignarla a productos sin publicarla."}
          </p>
        </section>
        <footer className={styles.editorFooter}>
          {busy && (
            <div className={styles.saveProgress} role="status">
              <span className={styles.progressTrack} aria-hidden="true" />
              {progress}
            </div>
          )}
          {message && (
            <p
              role={error ? "alert" : "status"}
              className={`${styles.feedback} ${error ? styles.error : styles.success}`}
            >
              {message}
            </p>
          )}
          {!busy && !message && (
            <p className={styles.help}>
              {dirty
                ? "Los cambios se aplican al guardar."
                : "Todos los cambios están guardados."}
            </p>
          )}
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={onCancel}
            >
              Cancelar
            </button>
            {uncertain ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  window.location.assign(
                    `/admin/catalogo?view=brands${saved.id ? `&brand=${saved.id}` : ""}`,
                  );
                }}
              >
                Revisar marca guardada
              </button>
            ) : (
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || !dirty}
              >
                <Save size={17} /> {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
          </div>
        </footer>
      </fieldset>
    </form>
  );
}
