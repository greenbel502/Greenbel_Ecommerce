"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { saveOfferAction } from "./actions";
import { ActionForm, Field } from "./catalog-form";
import { ProductsAdmin } from "./products-admin";
import styles from "./catalog.module.css";
import { EntityPicker } from "../_components/entity-picker";
import { BrandsAdmin } from "./brands-admin";
import { CategoriesAdmin } from "./categories-admin";

export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  logo_path: string | null;
  updated_at: string;
};
export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  active: boolean;
  parent_name?: string | null;
};
export type ProductRow = {
  id: string;
  cover_image_id?: string | null;
  sku: string;
  slug: string;
  name: string;
  model: string | null;
  kind: "equipment" | "part" | "accessory" | "agricultural";
  brand_id: string | null;
  category_id: string;
  short_description: string | null;
  description: string | null;
  regular_price: string | number | null;
  warranty_months: number | null;
  warranty_terms: string | null;
  publication_status: "draft" | "published" | "archived";
  featured: boolean;
};
export type OfferRow = {
  id: string;
  product_id: string;
  kind: "fixed_price" | "percentage";
  value: string | number;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
};
export type SpecRow = {
  id: string;
  product_id: string;
  label: string;
  value: string;
  unit: string | null;
  sort_order: number;
};
export type InclusionRow = {
  id: string;
  product_id: string;
  description: string;
  quantity: string | number;
  sort_order: number;
};
export type ImageRow = {
  id: string;
  product_id: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
};
export type CompatibilityRow = {
  equipment_id: string;
  part_id: string;
  notes: string | null;
};

type CatalogData = {
  counts: Record<string, number>;
  view: string;
  controls: Record<string, ReactNode>;
  pagers: Record<string, ReactNode>;
  productRows: ProductRow[];
  offerRows: OfferRow[];
  selectedProductId: string;
  selectedOfferId: string;
  selectedBrandId: string;
  selectedCategoryId: string;
  brandRows: BrandRow[];
  categoryRows: CategoryRow[];
  brandLogoReady: boolean;
  brands: BrandRow[];
  categories: CategoryRow[];
  products: ProductRow[];
  offers: OfferRow[];
  specs: SpecRow[];
  inclusions: InclusionRow[];
  images: ImageRow[];
  compatibilities: CompatibilityRow[];
  publicCatalogConnected: boolean;
};
export function CatalogAdmin({
  brands,
  categories,
  products,
  offers,
  specs,
  inclusions,
  images,
  compatibilities,
  publicCatalogConnected,
  controls,
  pagers,
  productRows,
  offerRows,
  selectedProductId,
  selectedOfferId,
  selectedBrandId,
  selectedCategoryId,
  brandRows,
  categoryRows,
  brandLogoReady,
  view,
  counts,
}: CatalogData) {
  const router = useRouter();
  function selectRecord(key: string, id: string) {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set(key, id);
    else params.delete(key);
    params.set("view", key === "product" ? "products" : "offers");
    router.push(
      `/admin/catalogo?${params}#${key === "product" ? "productos" : "ofertas"}`,
    );
  }
  const setSelectedOfferId = (id: string) => selectRecord("offer", id);
  const offer = offers.find((item) => item.id === selectedOfferId);
  const productLabel = new Map(
    products.map((item) => [item.id, `${item.sku} · ${item.name}`]),
  );

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <span className="eyebrow">Panel administrativo</span>
          <h1>
            {view === "brands"
              ? "Marcas"
              : view === "categories"
                ? "Categorías"
                : "Catálogo GreenBel"}
          </h1>
          <p>
            {view === "brands"
              ? "Gestiona las marcas de tus productos y su presencia en la tienda."
              : view === "categories"
                ? "Organiza las categorías y subcategorías de tu catálogo."
                : "Administra borradores, fichas, precios y ofertas con permisos de administrador."}
          </p>
        </div>
        <div className={styles.adminLinks}>
          <Link href="/admin/inventario" className="secondary-dark-button">
            Ver inventario
          </Link>
          <Link href="/admin/ventas" className="secondary-dark-button">
            Ventas y posventa
          </Link>
          <Link href="/admin/cotizaciones" className="secondary-dark-button">
            Cotizaciones
          </Link>
          <Link href="/admin/entregas" className="secondary-dark-button">
            Entregas
          </Link>
          <Link href="/admin/capacitaciones" className="secondary-dark-button">
            Capacitaciones
          </Link>
          <Link href="/admin/resenas" className="secondary-dark-button">
            Reseñas
          </Link>
          <Link href="/admin/consultas" className="secondary-dark-button">
            Consultas
          </Link>
          <Link href="/admin/financiamiento" className="secondary-dark-button">
            Financiamiento
          </Link>
          <Link href="/admin/usuarios" className="secondary-dark-button">
            Usuarios
          </Link>
        </div>
      </header>
      {view !== "brands" && view !== "categories" && (
        <p className={styles.notice} role="status">
          {publicCatalogConnected
            ? "La tienda muestra los productos publicados con marcas y categorías activas."
            : "La tienda pública está en modo de demostración; los cambios se guardan en desarrollo."}
        </p>
      )}

      <nav className={styles.sectionNav} aria-label="Secciones del catálogo">
        {[
          ["products", "Productos"],
          ["brands", "Marcas"],
          ["categories", "Categorías"],
          ["offers", "Ofertas"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/catalogo?view=${key}`}
            aria-current={view === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div>
        {view === "brands" && (
          <BrandsAdmin
            rows={brandRows}
            selected={brands.find((brand) => brand.id === selectedBrandId)}
            selectedId={selectedBrandId}
            count={counts.brands}
            controls={controls.brands}
            pager={pagers.brands}
            logoReady={brandLogoReady}
          />
        )}
        {view === "categories" && (
          <CategoriesAdmin
            rows={categoryRows}
            selected={categories.find(
              (category) => category.id === selectedCategoryId,
            )}
            selectedId={selectedCategoryId}
            count={counts.categories}
            controls={controls.categories}
            pager={pagers.categories}
          />
        )}
      </div>

      {view === "products" && (
        <ProductsAdmin
          rows={productRows}
          products={products}
          brands={brands}
          categories={categories}
          selectedId={selectedProductId}
          specs={specs}
          inclusions={inclusions}
          images={images}
          compatibilities={compatibilities}
          controls={controls.products}
          pager={pagers.products}
          count={counts.products}
        />
      )}

      {view === "offers" && (
        <section className={styles.panel} id="ofertas">
          {controls.offers}
          <div
            className="admin-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Tabla de registros, desplazamiento horizontal"
          >
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Oferta</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {offerRows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {productLabel.get(item.product_id) || "Producto asociado"}
                    </td>
                    <td>
                      {item.kind === "percentage"
                        ? `${item.value}%`
                        : `Q${item.value}`}
                    </td>
                    <td>
                      {new Date(item.starts_at).toLocaleDateString("es-GT")}
                    </td>
                    <td>
                      {new Date(item.ends_at).toLocaleDateString("es-GT")}
                    </td>
                    <td>{item.enabled ? "Habilitada" : "Inactiva"}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button onClick={() => setSelectedOfferId(item.id)}>
                          Editar oferta
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagers.offers}
          <div className={styles.panelHeading}>
            <div>
              <h2>Edición de oferta</h2>
              <p className={styles.help}>
                Precio final exacto o porcentaje; fechas con zona horaria
                explícita.
              </p>
            </div>
            <label className={styles.field}>
              <span>Oferta</span>
              <select
                value={selectedOfferId}
                onChange={(event) => setSelectedOfferId(event.target.value)}
              >
                <option value="">Nueva oferta</option>
                {offers.map((item) => (
                  <option value={item.id} key={item.id}>
                    {productLabel.get(item.product_id) ?? "Producto asociado"} ·{" "}
                    {item.enabled ? "activa" : "inactiva"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="admin-editor" open={!!offer}>
            <summary>{offer ? "Editar oferta" : "Crear oferta"}</summary>
            <ActionForm
              key={offer?.id ?? "new"}
              action={saveOfferAction}
              submitLabel={offer ? "Guardar oferta" : "Crear oferta"}
            >
              <input type="hidden" name="id" value={offer?.id ?? ""} />
              <div className={styles.fields}>
                <EntityPicker
                  entity="products"
                  name="productId"
                  label="Producto"
                  required
                  defaultId={offer?.product_id ?? ""}
                  defaultLabel={productLabel.get(offer?.product_id ?? "")}
                />
                <label className={styles.field}>
                  <span>Tipo</span>
                  <select
                    name="kind"
                    defaultValue={offer?.kind ?? "fixed_price"}
                  >
                    <option value="fixed_price">Precio final exacto</option>
                    <option value="percentage">Porcentaje de descuento</option>
                  </select>
                </label>
                <Field
                  label="Valor"
                  name="value"
                  defaultValue={offer?.value ?? ""}
                  required
                  placeholder="Precio Q o porcentaje"
                />
                <Field
                  label="Inicio ISO con zona"
                  name="startsAt"
                  defaultValue={offer?.starts_at ?? ""}
                  required
                  placeholder="2026-10-01T08:00:00-06:00"
                />
                <Field
                  label="Fin ISO con zona"
                  name="endsAt"
                  defaultValue={offer?.ends_at ?? ""}
                  required
                  placeholder="2026-10-31T18:00:00-06:00"
                />
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={offer?.enabled ?? false}
                />{" "}
                Activar oferta
              </label>
              <p className={styles.help}>
                La oferta requiere precio base vigente; no se acumula con otras
                promociones. Si se cambia el precio regular, revisa la oferta
                antes de guardar.
              </p>
            </ActionForm>
          </details>
        </section>
      )}
    </div>
  );
}
