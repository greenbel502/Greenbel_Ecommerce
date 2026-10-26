"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import type { SavedBrand } from "@/lib/brands/save-brand-changes";
import { brandLogoUrl } from "@/lib/brand-logo";
import type { BrandRow } from "./catalog-admin";
import { BrandEditor } from "./brand-editor";
import { CatalogDrawer } from "./catalog-drawer";
import { CatalogDeleteDialog } from "./catalog-delete-dialog";
import styles from "./brands.module.css";

export function BrandsAdmin({
  rows,
  selected,
  selectedId,
  count,
  controls,
  pager,
  logoReady,
}: {
  rows: BrandRow[];
  selected?: BrandRow;
  selectedId: string;
  count: number;
  controls: ReactNode;
  pager: ReactNode;
  logoReady: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [deleting, setDeleting] = useState<BrandRow | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorId, setEditorId] = useState(selectedId);
  const [records, setRecords] = useState(
    () =>
      new Map(
        [...rows, ...(selected ? [selected] : [])].map((brand) => [
          brand.id,
          brand,
        ]),
      ),
  );
  const rawUrlId = params.get("brand") ?? "";
  const urlId =
    rawUrlId === "new" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawUrlId,
    )
      ? rawUrlId
      : "";
  const editorBrand =
    records.get(editorId) ??
    rows.find((brand) => brand.id === editorId) ??
    (selected?.id === editorId ? selected : undefined);
  const requestedMissing = useRef("");
  const editing = !!editorId;
  // History changes update Next's search params without reloading the server page.
  // Keep Back/Forward and direct URL entries in sync with the local drawer.
  useEffect(() => {
    // Ignore a stale concurrent router snapshot after a newer open/close click.
    const currentUrlId =
      new URLSearchParams(window.location.search).get("brand") ?? "";
    if (currentUrlId === rawUrlId) setEditorId(urlId);
  }, [rawUrlId, urlId]);
  useEffect(() => {
    setRecords((current) => {
      const next = new Map(current);
      for (const brand of rows) next.set(brand.id, brand);
      if (selected) next.set(selected.id, selected);
      return next;
    });
  }, [rows, selected]);
  useEffect(() => {
    if (
      !editorId ||
      editorId === "new" ||
      editorBrand ||
      requestedMissing.current === editorId
    )
      return;
    // Only an unknown/off-page history entry needs fresh server data. Listed rows do not.
    requestedMissing.current = editorId;
    router.refresh();
  }, [editorId, editorBrand, router]);
  function href(id: string) {
    const p = new URLSearchParams(params.toString());
    p.set("view", "brands");
    p.delete("category");
    if (id) p.set("brand", id);
    else p.delete("brand");
    return `/admin/catalogo?${p}${id ? "#editor-marca" : ""}`;
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
  function savedBrand(value: SavedBrand) {
    if (!value.id) return;
    const id = value.id;
    setRecords((current) =>
      new Map(current).set(id, {
        id,
        name: value.name,
        slug: value.slug,
        active: value.active,
        logo_path: value.logoPath,
        updated_at: current.get(id)?.updated_at ?? "",
      }),
    );
    setEditorId(id);
    window.history.replaceState(null, "", href(id));
    // Refresh actual list data after a confirmed write, never just to open/close.
    router.refresh();
  }
  return (
    <section
      className={styles.module}
      aria-labelledby="brands-admin-title"
      id="marcas"
    >
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>Catálogo</span>
          <h2 id="brands-admin-title" tabIndex={-1}>
            Listado de marcas <span>{count}</span>
          </h2>
          <p>
            Una sola lista para tus productos y para las marcas que se muestran
            en Inicio y Nosotros.
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => openEditor("new")}
        >
          <Plus size={18} /> Nueva marca
        </button>
      </header>
      {notice && (
        <p role="status" className={`${styles.feedback} ${styles.success}`}>
          {notice}
        </p>
      )}
      <div className={styles.workspace}>
        <div className={styles.list}>
          <div className={styles.tools}>{controls}</div>
          <div
            className={styles.tableWrap}
            role="region"
            aria-label="Marcas, desplazamiento horizontal"
            tabIndex={0}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Marca</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const brand = records.get(row.id) ?? row;
                  const logo = brandLogoUrl(brand.id, brand.logo_path, true);
                  return (
                    <tr key={brand.id} data-selected={editorId === brand.id}>
                      <td>
                        <div className={styles.identity}>
                          <span className={styles.logo}>
                            {logo ? (
                              <Image
                                src={logo}
                                alt={`Logotipo de ${brand.name}`}
                                width={64}
                                height={48}
                                unoptimized
                              />
                            ) : (
                              <ImageIcon size={23} aria-label="Sin logotipo" />
                            )}
                          </span>
                          <div>
                            <strong>{brand.name}</strong>
                            <small>
                              {brand.logo_path
                                ? "Logotipo guardado"
                                : "Sin logotipo"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${brand.active ? styles.active : ""}`}
                        >
                          {brand.active && <Check size={13} />}
                          {brand.active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.edit}
                            onClick={() => openEditor(brand.id)}
                            aria-label={`Editar ${brand.name}`}
                          >
                            <Pencil size={15} />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            className={styles.deleteAction}
                            onClick={() => setDeleting(brand)}
                            aria-label={`Eliminar ${brand.name}`}
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
        </div>
        {editing && (
          <CatalogDrawer
            key={editorId}
            id="editor-marca"
            title={
              editorId === "new"
                ? "Crea tu marca"
                : (editorBrand?.name ?? "Cargando marca…")
            }
            kicker={editorId === "new" ? "Nueva marca" : "Editar marca"}
            closeLabel="Cerrar editor de marca"
            busy={saving}
            onClose={closeEditor}
            returnFocusId="brands-admin-title"
          >
            {editorId === "new" || editorBrand ? (
              <BrandEditor
                key={editorId}
                brand={editorBrand}
                logoReady={logoReady}
                onSaved={savedBrand}
                onCancel={closeEditor}
                onBusyChange={setSaving}
              />
            ) : (
              <p className={styles.editorSection} role="status">
                Cargando los datos de la marca…
              </p>
            )}
          </CatalogDrawer>
        )}
      </div>
      {deleting && (
        <CatalogDeleteDialog
          kind="brand"
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
