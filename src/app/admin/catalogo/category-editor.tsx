"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import { useConfirm } from "@/presentation/notifications/notification-provider";

import { useRef, useState, type FormEvent } from "react";
import { FolderTree, Eye, Save } from "lucide-react";
import { suggestBrandSlug } from "@/lib/brand-logo";
import { EntityPicker } from "../_components/entity-picker";
import {
  createCategoryAction,
  updateCategoryAction,
  setCategoryActiveAction,
} from "./actions";
import type { CategoryRow } from "./catalog-admin";
import styles from "./brands.module.css";

const idle = { status: "idle" as const, message: "" };
type SavedCategory = Omit<CategoryRow, "id"> & { id: string | null };

export function CategoryEditor({
  category,
  onSaved,
  onCancel,
  onBusyChange,
}: {
  category?: CategoryRow;
  onSaved: (category: CategoryRow) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const confirm = useConfirm();
  const [saved, setSaved] = useState<SavedCategory>(
    category ?? {
      id: null,
      name: "",
      slug: "",
      parent_id: null,
      active: false,
    },
  );
  const [name, setName] = useState(saved.name);
  const [slug, setSlug] = useState(saved.slug);
  const [customSlug, setCustomSlug] = useState(!!category);
  const [parentId, setParentId] = useState(saved.parent_id ?? "");
  const [active, setActive] = useState(saved.active);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [uncertain, setUncertain] = useState(false);
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
    (parentId || null) !== saved.parent_id ||
    active !== saved.active;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    if (
      active !== saved.active &&
      !(await confirm({
        message: active
          ? "La categoría permitirá mostrar sus productos publicados. ¿Guardar estos cambios?"
          : "La categoría y sus productos dejarán de mostrarse en el catálogo. Sus asignaciones se conservarán. ¿Guardar estos cambios?",
      }))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(false);
    setMessage("");
    setFieldErrors({});
    let next = saved;
    try {
      if (
        !next.id ||
        name.trim() !== next.name ||
        slug.trim() !== next.slug ||
        (parentId || null) !== next.parent_id
      ) {
        const data = new FormData();
        if (next.id) data.set("id", next.id);
        data.set("name", name);
        data.set("slug", slug);
        data.set("parentId", parentId);
        const result = await (
          next.id ? updateCategoryAction : createCategoryAction
        )(idle, data);
        if (result.status !== "success") {
          setError(true);
          setMessage(result.message);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        const id = result.categoryId ?? next.id;
        if (!id) throw new Error("Category save not confirmed");
        next = {
          ...next,
          id,
          name: name.trim(),
          slug: slug.trim(),
          parent_id: parentId || null,
        };
        setSaved(next);
      }
      if (!next.id) throw new Error("Category ID unavailable");
      if (active !== next.active) {
        const data = new FormData();
        data.set("id", next.id);
        data.set("active", String(active));
        const result = await setCategoryActiveAction(idle, data);
        if (result.status !== "success") {
          setError(true);
          setMessage(
            "Los datos se guardaron, pero no se pudo cambiar la visibilidad. Reintenta para completar ese cambio.",
          );
          return;
        }
        next = { ...next, active };
        setSaved(next);
      }
      setMessage("Los cambios de la categoría se guardaron correctamente.");
      if (!next.id) throw new Error("Category save not confirmed");
      onSaved({ ...next, id: next.id });
    } catch {
      setError(true);
      setUncertain(true);
      setMessage(
        "No se pudo confirmar el resultado. Tus datos se conservan. Revisa la categoría guardada antes de reintentar.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit} data-category-editor="true">
      <fieldset disabled={busy}>
        <section className={styles.editorSection}>
          <h3>
            <FolderTree size={19} aria-hidden="true" /> Datos de la categoría
          </h3>
          <label className={styles.field}>
            Nombre de la categoría <span aria-hidden="true">*</span>
            <input
              name="name"
              required
              maxLength={160}
              autoComplete="off"
              placeholder="Ej. Aspersión"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!customSlug) setSlug(suggestBrandSlug(event.target.value));
              }}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={
                fieldErrors.name ? "category-name-error" : undefined
              }
            />
          </label>
          {fieldErrors.name && (
            <p id="category-name-error" className={styles.fieldError}>
              {fieldErrors.name}
            </p>
          )}
          <p className={styles.help}>
            Agrupa tus productos para que sea más fácil encontrarlos en el
            catálogo.
          </p>
          <details className={styles.advanced}>
            <summary>Editar identificador</summary>
            <label className={styles.field}>
              Identificador de la categoría <span aria-hidden="true">*</span>
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
                aria-describedby="category-slug-help"
              />
            </label>
            <p id="category-slug-help" className={styles.help}>
              Se genera con el nombre. Usa minúsculas, números y guiones.
            </p>
            {fieldErrors.slug && (
              <p className={styles.fieldError}>{fieldErrors.slug}</p>
            )}
          </details>
        </section>
        <section className={styles.editorSection}>
          <h3>
            <FolderTree size={19} aria-hidden="true" /> Organización
          </h3>
          <p className={styles.help}>
            Opcional: elige una categoría superior para crear una subcategoría.
            Elige «Sin categoría superior» para mantenerla como principal.
          </p>
          <div
            className={styles.parentPicker}
            onChange={(event) => {
              const element = event.target;
              if (
                element instanceof HTMLSelectElement &&
                element.name === "parentId"
              )
                setParentId(element.value);
            }}
          >
            <EntityPicker
              entity="categories"
              name="parentId"
              label="Categoría superior"
              emptyLabel="Sin categoría superior"
              defaultId={category?.parent_id ?? ""}
              defaultLabel={
                category?.parent_name ?? "Categoría superior guardada"
              }
              exclude={saved.id ? [saved.id] : []}
            />
          </div>
          {fieldErrors.parentId && (
            <p role="alert" className={styles.fieldError}>
              {fieldErrors.parentId}
            </p>
          )}
        </section>
        <section className={styles.editorSection}>
          <h3>
            <Eye size={19} aria-hidden="true" /> Visibilidad
          </h3>
          <label className={styles.visibilityChoice}>
            <input
              type="checkbox"
              name="active"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span>
              <strong>Mostrar esta categoría en el catálogo</strong>
              <small>
                Permite mostrar los productos publicados de esta categoría,
                según su disponibilidad y marca.
              </small>
            </span>
          </label>
          <p className={styles.help}>
            {active
              ? "La categoría será visible al guardar."
              : "La categoría quedará inactiva y conservará sus productos y subcategorías."}
          </p>
        </section>
        <footer className={styles.editorFooter}>
          {busy && (
            <p role="status" className={styles.saveProgress}>
              Guardando categoría…
            </p>
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
                onClick={() =>
                  window.location.assign(
                    `/admin/catalogo?view=categories${saved.id ? `&category=${saved.id}` : ""}`,
                  )
                }
              >
                Revisar categoría guardada
              </button>
            ) : (
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || !dirty}
              >
                <Save size={17} aria-hidden="true" />{" "}
                {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
          </div>
        </footer>
      </fieldset>
    </form>
  );
}
