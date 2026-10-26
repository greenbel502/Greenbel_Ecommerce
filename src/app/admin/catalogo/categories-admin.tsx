"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import type { CategoryRow } from "./catalog-admin";
import { CatalogDrawer } from "./catalog-drawer";
import { CatalogDeleteDialog } from "./catalog-delete-dialog";
import { CategoryEditor } from "./category-editor";
import styles from "./brands.module.css";

export function CategoriesAdmin({
  rows,
  selected,
  selectedId,
  count,
  controls,
  pager,
}: {
  rows: CategoryRow[];
  selected?: CategoryRow;
  selectedId: string;
  count: number;
  controls: ReactNode;
  pager: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [editorId, setEditorId] = useState(selectedId);
  const [records, setRecords] = useState(
    () =>
      new Map(
        [...rows, ...(selected ? [selected] : [])].map((row) => [row.id, row]),
      ),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [notice, setNotice] = useState("");
  const requestedMissing = useRef("");
  const rawId = params.get("category") ?? "";
  const urlId =
    rawId === "new" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawId,
    )
      ? rawId
      : "";
  const category =
    records.get(editorId) ??
    rows.find((row) => row.id === editorId) ??
    (selected?.id === editorId ? selected : undefined);
  useEffect(() => {
    if (
      (new URLSearchParams(window.location.search).get("category") ?? "") ===
      rawId
    )
      setEditorId(urlId);
  }, [rawId, urlId]);
  useEffect(() => {
    setRecords((current) => {
      const next = new Map(current);
      for (const row of rows) next.set(row.id, row);
      if (selected) next.set(selected.id, selected);
      return next;
    });
  }, [rows, selected]);
  useEffect(() => {
    if (
      !editorId ||
      editorId === "new" ||
      category ||
      requestedMissing.current === editorId
    )
      return;
    requestedMissing.current = editorId;
    router.refresh();
  }, [editorId, category, router]);
  function href(id: string) {
    const query = new URLSearchParams(params.toString());
    query.set("view", "categories");
    query.delete("brand");
    if (id) query.set("category", id);
    else query.delete("category");
    return `/admin/catalogo?${query}${id ? "#editor-categoria" : ""}`;
  }
  function openEditor(id: string) {
    if (saving) return;
    setEditorId(id);
    window.history.pushState(null, "", href(id));
  }
  function closeEditor() {
    if (saving) return;
    setEditorId("");
    window.history.replaceState(null, "", href(""));
  }
  function savedCategory(value: CategoryRow) {
    setRecords((current) => new Map(current).set(value.id, value));
    setEditorId(value.id);
    window.history.replaceState(null, "", href(value.id));
    router.refresh();
  }
  return (
    <section
      className={styles.module}
      aria-labelledby="categories-admin-title"
      id="categorias"
    >
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>Catálogo</span>
          <h2 id="categories-admin-title" tabIndex={-1}>
            Listado de categorías <span>{count}</span>
          </h2>
          <p>
            Organiza tus productos en categorías y subcategorías para facilitar
            su búsqueda.
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => openEditor("new")}
        >
          <Plus size={18} aria-hidden="true" /> Nueva categoría
        </button>
      </header>
      {notice && (
        <p role="status" className={`${styles.feedback} ${styles.success}`}>
          {notice}
        </p>
      )}
      <div className={styles.tools}>{controls}</div>
      <div
        className={styles.tableWrap}
        role="region"
        aria-label="Categorías, desplazamiento horizontal"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = records.get(row.id) ?? row;
              return (
                <tr key={item.id} data-selected={editorId === item.id}>
                  <td>
                    <div className={styles.identity}>
                      <span className={styles.categoryIcon}>
                        <FolderTree size={21} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.parent_id
                            ? `Subcategoría de ${item.parent_name ?? "categoría superior"}`
                            : "Categoría principal"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${item.active ? styles.active : ""}`}
                    >
                      {item.active && <Check size={13} aria-hidden="true" />}
                      {item.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.edit}
                        onClick={() => openEditor(item.id)}
                        aria-label={`Editar ${item.name}`}
                      >
                        <Pencil size={15} aria-hidden="true" /> Editar
                      </button>
                      <button
                        type="button"
                        className={styles.deleteAction}
                        onClick={() => setDeleting(item)}
                        aria-label={`Eliminar ${item.name}`}
                      >
                        <Trash2 size={15} aria-hidden="true" /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pager}
      {editorId && (
        <CatalogDrawer
          key={editorId}
          id="editor-categoria"
          title={
            editorId === "new"
              ? "Crea tu categoría"
              : (category?.name ?? "Cargando categoría…")
          }
          kicker={editorId === "new" ? "Nueva categoría" : "Editar categoría"}
          busy={saving}
          onClose={closeEditor}
          closeLabel="Cerrar editor de categoría"
          returnFocusId="categories-admin-title"
        >
          {editorId === "new" || category ? (
            <CategoryEditor
              key={editorId}
              category={category}
              onSaved={savedCategory}
              onCancel={closeEditor}
              onBusyChange={setSaving}
            />
          ) : (
            <p className={styles.editorSection} role="status">
              Cargando los datos de la categoría…
            </p>
          )}
        </CatalogDrawer>
      )}
      {deleting && (
        <CatalogDeleteDialog
          kind="category"
          record={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id, message) => {
            setDeleting(null);
            setNotice(message);
            setRecords((current) => {
              const next = new Map(current);
              next.delete(id);
              return next;
            });
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
