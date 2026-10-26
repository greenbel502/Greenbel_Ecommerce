"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  loadProductEditorData,
  ProductEditorLoadError,
  type ProductEditorData,
} from "@/lib/products/product-editor-data";
import type {
  ProductRow,
  BrandRow,
  CategoryRow,
  SpecRow,
  InclusionRow,
  ImageRow,
  CompatibilityRow,
} from "./catalog-admin";
import { ProductEditor } from "./product-editor";
import { CatalogDrawer } from "./catalog-drawer";
import { CatalogDeleteDialog } from "./catalog-delete-dialog";
import styles from "./brands.module.css";
import productStyles from "./products.module.css";

export function ProductsAdmin({
  rows,
  products,
  brands,
  categories,
  selectedId,
  images,
  specs,
  inclusions,
  compatibilities,
  controls,
  pager,
  count,
}: {
  rows: ProductRow[];
  products: ProductRow[];
  brands: BrandRow[];
  categories: CategoryRow[];
  selectedId: string;
  images: ImageRow[];
  specs: SpecRow[];
  inclusions: InclusionRow[];
  compatibilities: CompatibilityRow[];
  controls: ReactNode;
  pager: ReactNode;
  count: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const rawId = params.get("product") ?? "";
  const [editorId, setEditorId] = useState(selectedId.toLowerCase());
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [removed, setRemoved] = useState(new Set<string>());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [detailState, setDetailState] = useState<{
    id: string;
    data?: ProductEditorData;
    loading: boolean;
    error?: string;
  }>(() => {
    const product = products.find(
      (item) => item.id === selectedId.toLowerCase(),
    );
    return {
      id: selectedId.toLowerCase(),
      loading: false,
      data: product
        ? {
            product,
            images: images.filter((item) => item.product_id === product.id),
            specs: specs.filter((item) => item.product_id === product.id),
            inclusions: inclusions.filter(
              (item) => item.product_id === product.id,
            ),
            compatibilities,
            relatedProducts: products,
            brands,
            categories,
          }
        : undefined,
    };
  });
  const details = detailState.id === editorId ? detailState.data : undefined;
  const detailsError =
    detailState.id === editorId ? detailState.error : undefined;
  const detailsLoading = detailState.id !== editorId || detailState.loading;
  const product =
    details?.product ?? products.find((item) => item.id === editorId);
  const refreshDetails = useCallback(
    () => setRevision((value) => value + 1),
    [],
  );
  const href = useCallback((id: string) => {
    const p = new URLSearchParams(window.location.search);
    p.set("view", "products");
    p.delete("brand");
    p.delete("category");
    if (id) p.set("product", id);
    else p.delete("product");
    return `/admin/catalogo?${p}${id ? "#editor-producto" : ""}`;
  }, []);
  useEffect(() => {
    if (
      (new URLSearchParams(window.location.search).get("product") ?? "") ===
      rawId
    )
      setEditorId(
        rawId === "new" || /^[0-9a-f-]{36}$/i.test(rawId)
          ? rawId.toLowerCase()
          : "",
      );
  }, [rawId]);
  useEffect(() => {
    if (!editorId || editorId === "new") return;
    const controller = new AbortController();
    let current = true;
    setDetailState((old) => ({
      id: editorId,
      data: old.id === editorId ? old.data : undefined,
      loading: true,
    }));
    loadProductEditorData(editorId, { signal: controller.signal })
      .then((data) => {
        if (current) setDetailState({ id: editorId, data, loading: false });
      })
      .catch((error) => {
        if (!current) return;
        setDetailState((old) => ({
          ...old,
          loading: false,
          error:
            error instanceof ProductEditorLoadError
              ? error.message
              : "No se pudieron cargar las fotografías y los detalles. Inténtalo de nuevo.",
        }));
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [editorId, revision]);
  function openEditor(id: string) {
    if (saving) return;
    setEditorId(id);
    window.history.pushState(null, "", href(id));
  }
  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditorId("");
    window.history.replaceState(null, "", href(""));
  }, [saving, href]);
  const saved = useCallback(
    (id: string) => {
      setEditorId(id);
      refreshDetails();
      window.history.replaceState(null, "", href(id));
      router.refresh();
    },
    [href, router, refreshDetails],
  );
  return (
    <section
      className={styles.module}
      id="productos"
      aria-labelledby="products-admin-title"
    >
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>Catálogo</span>
          <h2 id="products-admin-title" tabIndex={-1}>
            Listado de productos <span>{count}</span>
          </h2>
          <p>
            Consulta tus productos y abre su ficha para editar datos,
            fotografías y detalles.
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => openEditor("new")}
        >
          <Plus size={18} /> Nuevo producto
        </button>
      </header>
      {notice && (
        <p className={`${styles.feedback} ${styles.success}`} role="status">
          {notice}
        </p>
      )}
      <div className={styles.tools}>{controls}</div>
      <div
        className={styles.tableWrap}
        role="region"
        aria-label="Productos, desplazamiento horizontal"
        tabIndex={0}
      >
        <table className={`${styles.table} ${productStyles.table}`}>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Código</th>
              <th scope="col">Precio</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((item) => !removed.has(item.id))
              .map((item) => (
                <tr key={item.id} data-selected={editorId === item.id}>
                  <td>
                    <div className={styles.identity}>
                      <span
                        className={`${styles.logo} ${productStyles.thumbnail}`}
                      >
                        <Image
                          src={
                            item.cover_image_id
                              ? `/api/admin/product-images/${item.cover_image_id}`
                              : "/images/product-placeholder.svg"
                          }
                          width={64}
                          height={60}
                          unoptimized
                          alt={
                            item.cover_image_id
                              ? item.name
                              : "Imagen no disponible"
                          }
                        />
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        {item.model && <small>{item.model}</small>}
                      </div>
                    </div>
                  </td>
                  <td>{item.sku}</td>
                  <td>
                    {item.regular_price === null
                      ? "Precio próximamente"
                      : `Q${Number(item.regular_price).toFixed(2)}`}
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${item.publication_status === "published" ? styles.active : ""}`}
                    >
                      {
                        {
                          draft: "Borrador",
                          published: "Publicado",
                          archived: "Archivado",
                        }[item.publication_status]
                      }
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
                        <Pencil size={15} /> Editar
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
              ))}
          </tbody>
        </table>
      </div>
      {pager}
      {editorId && (
        <CatalogDrawer
          key={editorId}
          id="editor-producto"
          title={
            editorId === "new"
              ? "Crea tu producto"
              : (product?.name ??
                (detailsError
                  ? "Producto no disponible"
                  : "Cargando producto…"))
          }
          kicker={editorId === "new" ? "Nuevo producto" : "Editar producto"}
          closeLabel="Cerrar editor de producto"
          busy={saving}
          onClose={closeEditor}
          returnFocusId="products-admin-title"
          className={productStyles.drawer}
        >
          {editorId === "new" || product ? (
            <ProductEditor
              product={product}
              brands={details?.brands.length ? details.brands : brands}
              categories={
                details?.categories.length ? details.categories : categories
              }
              products={
                details
                  ? [
                      ...new Map(
                        [
                          ...products,
                          ...details.relatedProducts,
                          details.product,
                        ].map((item) => [item.id, item]),
                      ).values(),
                    ]
                  : products
              }
              images={details?.images ?? []}
              specs={details?.specs ?? []}
              inclusions={details?.inclusions ?? []}
              compatibilities={details?.compatibilities ?? []}
              detailsReady={!!details}
              detailsError={detailsError}
              detailsLoading={detailsLoading}
              onDetailsRefresh={refreshDetails}
              onBusyChange={setSaving}
              onSaved={saved}
              onCancel={closeEditor}
            />
          ) : detailsError ? (
            <div className={productStyles.loadFeedback}>
              <p role="alert">{detailsError}</p>
              <button
                type="button"
                className={styles.secondary}
                disabled={detailsLoading}
                onClick={refreshDetails}
              >
                Reintentar carga
              </button>
            </div>
          ) : (
            <p className={styles.help} role="status">
              Cargando información del producto…
            </p>
          )}
        </CatalogDrawer>
      )}
      {deleting && (
        <CatalogDeleteDialog
          kind="product"
          record={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id, message) => {
            setDeleting(null);
            setNotice(message);
            setRemoved((current) => new Set(current).add(id));
            if (editorId === id) closeEditor();
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
