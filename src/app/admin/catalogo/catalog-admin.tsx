"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import {
  createBrandAction,
  createCategoryAction,
  removeCompatibilityAction,
  removeInclusionAction,
  removeSpecAction,
  saveInclusionAction,
  saveCompatibilityAction,
  saveOfferAction,
  saveProductAction,
  saveSpecAction,
  setBrandActiveAction,
  setCategoryActiveAction,
  setPrimaryImageAction,
  updateBrandAction,
  updateCategoryAction,
  updateImageMetadataAction,
  type CatalogActionState
} from "./actions";
import styles from "./catalog.module.css";

export type BrandRow = { id: string; name: string; slug: string; active: boolean };
export type CategoryRow = { id: string; name: string; slug: string; parent_id: string | null; active: boolean };
export type ProductRow = {
  id: string; sku: string; slug: string; name: string; model: string | null; kind: "equipment" | "part" | "accessory";
  brand_id: string | null; category_id: string; short_description: string | null; description: string | null;
  regular_price: string | number | null; warranty_months: number | null; warranty_terms: string | null;
  publication_status: "draft" | "published" | "archived"; featured: boolean;
};
export type OfferRow = {
  id: string; product_id: string; kind: "fixed_price" | "percentage"; value: string | number;
  starts_at: string; ends_at: string; enabled: boolean;
};
export type SpecRow = { id: string; product_id: string; label: string; value: string; unit: string | null; sort_order: number };
export type InclusionRow = { id: string; product_id: string; description: string; quantity: string | number; sort_order: number };
export type ImageRow = { id: string; product_id: string; alt_text: string; sort_order: number; is_primary: boolean };
export type CompatibilityRow = { equipment_id: string; part_id: string; notes: string | null };

type CatalogData = {
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
type CatalogAction = (previous: CatalogActionState, formData: FormData) => Promise<CatalogActionState>;
const idle: CatalogActionState = { status: "idle", message: "" };

function ActionForm({ action, children, submitLabel, disabled = false, compact = false, confirmMessage }: {
  action: CatalogAction; children: ReactNode; submitLabel: string; disabled?: boolean; compact?: boolean; confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return <form action={formAction} className={compact ? styles.compactForm : styles.form} onSubmit={(event) => {
    if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
  }}>
    <fieldset disabled={pending || disabled}>
      {children}
      <button type="submit" className={compact ? styles.smallButton : styles.button}>{pending ? "Guardando..." : submitLabel}</button>
    </fieldset>
    {state.status !== "idle" && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
  </form>;
}

function Field({ label, name, defaultValue = "", required = false, type = "text", placeholder, min, max, step }: {
  label: string; name: string; defaultValue?: string | number; required?: boolean; type?: string; placeholder?: string;
  min?: string | number; max?: string | number; step?: string;
}) {
  return <label className={styles.field}><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} min={min} max={max} step={step} /></label>;
}

function ProductEditor({ product, brands, categories }: { product?: ProductRow; brands: BrandRow[]; categories: CategoryRow[] }) {
  return <ActionForm key={product?.id ?? "new"} action={saveProductAction} submitLabel={product ? "Guardar cambios" : "Crear producto"} disabled={categories.length === 0}>
    <input type="hidden" name="id" value={product?.id ?? ""} />
    <div className={styles.fields}>
      <Field label="SKU" name="sku" defaultValue={product?.sku} required />
      <Field label="Identificador URL" name="slug" defaultValue={product?.slug} required placeholder="equipo-modelo" />
      <Field label="Nombre" name="name" defaultValue={product?.name} required />
      <Field label="Modelo" name="model" defaultValue={product?.model ?? ""} />
      <label className={styles.field}><span>Tipo</span><select name="kind" defaultValue={product?.kind ?? "equipment"}><option value="equipment">Equipo</option><option value="part">Repuesto</option><option value="accessory">Accesorio</option></select></label>
      <label className={styles.field}><span>Marca</span><select name="brandId" defaultValue={product?.brand_id ?? ""}><option value="">Sin marca</option>{brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}{brand.active ? "" : " · inactiva"}</option>)}</select></label>
      <label className={styles.field}><span>Categoría</span><select name="categoryId" defaultValue={product?.category_id ?? ""} required><option value="">Seleccionar categoría</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}{category.active ? "" : " · inactiva"}</option>)}</select></label>
      <Field label="Precio regular, Q IVA incluido" name="regularPrice" defaultValue={product?.regular_price ?? ""} placeholder="Vacío = Precio próximamente" />
      <Field label="Garantía en meses" name="warrantyMonths" defaultValue={product?.warranty_months ?? ""} type="number" min={0} max={1200} />
      <label className={styles.field}><span>Estado de publicación</span><select name="publicationStatus" defaultValue={product?.publication_status ?? "draft"}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label>
      <Field label="Descripción breve" name="shortDescription" defaultValue={product?.short_description ?? ""} />
      <label className={`${styles.field} ${styles.wide}`}><span>Descripción completa</span><textarea name="description" rows={4} defaultValue={product?.description ?? ""} /></label>
      <label className={`${styles.field} ${styles.wide}`}><span>Condiciones de garantía</span><textarea name="warrantyTerms" rows={3} defaultValue={product?.warranty_terms ?? ""} /></label>
    </div>
    <label className={styles.check}><input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} /> Destacar en Inicio</label>
    {categories.length === 0 && <p className={styles.help}>Crea una categoría para poder guardar productos.</p>}
    <p className={styles.help}>El precio puede quedar vacío para publicar «Precio próximamente». Guarda el producto antes de agregar imágenes o detalles técnicos.</p>
  </ActionForm>;
}

function BrandEditor({ brand }: { brand: BrandRow }) {
  return <div className={styles.listRow}>
    <div><strong>{brand.name}</strong><small>{brand.slug} · {brand.active ? "Activa" : "Inactiva"}</small></div>
    <div className={styles.rowActions}>
      <details className={styles.editDisclosure}><summary>Editar</summary>
        <ActionForm action={updateBrandAction} submitLabel="Guardar marca" compact>
          <input type="hidden" name="id" value={brand.id} />
          <Field label="Nombre" name="name" defaultValue={brand.name} required />
          <Field label="Identificador URL" name="slug" defaultValue={brand.slug} required />
        </ActionForm>
      </details>
      <ActionForm action={setBrandActiveAction} submitLabel={brand.active ? "Desactivar" : "Activar"} compact>
        <input type="hidden" name="id" value={brand.id} /><input type="hidden" name="active" value={String(!brand.active)} />
      </ActionForm>
    </div>
  </div>;
}

function CategoryEditor({ category, categories }: { category: CategoryRow; categories: CategoryRow[] }) {
  const parent = categories.find((item) => item.id === category.parent_id);
  return <div className={styles.listRow}>
    <div><strong>{category.name}</strong><small>{parent ? `${parent.name} / ` : ""}{category.slug} · {category.active ? "Activa" : "Inactiva"}</small></div>
    <div className={styles.rowActions}>
      <details className={styles.editDisclosure}><summary>Editar</summary>
        <ActionForm action={updateCategoryAction} submitLabel="Guardar categoría" compact>
          <input type="hidden" name="id" value={category.id} />
          <Field label="Nombre" name="name" defaultValue={category.name} required />
          <Field label="Identificador URL" name="slug" defaultValue={category.slug} required />
          <label className={styles.field}><span>Categoría superior</span><select name="parentId" defaultValue={category.parent_id ?? ""}><option value="">Sin categoría superior</option>{categories.filter((item) => item.id !== category.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </ActionForm>
      </details>
      <ActionForm action={setCategoryActiveAction} submitLabel={category.active ? "Desactivar" : "Activar"} compact>
        <input type="hidden" name="id" value={category.id} /><input type="hidden" name="active" value={String(!category.active)} />
      </ActionForm>
    </div>
  </div>;
}

function ProductDetails({ product, specs, inclusions }: { product: ProductRow; specs: SpecRow[]; inclusions: InclusionRow[] }) {
  return <div className={styles.detailGrid}>
    <section className={styles.subpanel} aria-label="Especificaciones">
      <h3>Especificaciones</h3>
      {specs.length === 0 ? <p className={styles.help}>Sin especificaciones cargadas.</p> : specs.map((spec) => <div className={styles.record} key={spec.id}>
        <ActionForm action={saveSpecAction} submitLabel="Guardar" compact>
          <input type="hidden" name="id" value={spec.id} /><input type="hidden" name="productId" value={product.id} />
          <Field label="Característica" name="label" defaultValue={spec.label} required />
          <Field label="Valor" name="value" defaultValue={spec.value} required />
          <Field label="Unidad" name="unit" defaultValue={spec.unit ?? ""} />
          <Field label="Orden" name="sortOrder" defaultValue={spec.sort_order} type="number" min={0} required />
        </ActionForm>
        <ActionForm action={removeSpecAction} submitLabel="Quitar" compact confirmMessage="¿Quitar esta especificación del producto?">
          <input type="hidden" name="id" value={spec.id} /><input type="hidden" name="productId" value={product.id} />
        </ActionForm>
      </div>)}
      <h4>Agregar especificación</h4>
      <ActionForm action={saveSpecAction} submitLabel="Agregar" compact>
        <input type="hidden" name="id" value="" /><input type="hidden" name="productId" value={product.id} />
        <Field label="Característica" name="label" required />
        <Field label="Valor" name="value" required />
        <Field label="Unidad" name="unit" />
        <Field label="Orden" name="sortOrder" defaultValue={specs.length} type="number" min={0} required />
      </ActionForm>
    </section>
    <section className={styles.subpanel} aria-label="Contenido incluido">
      <h3>Qué incluye</h3>
      {inclusions.length === 0 ? <p className={styles.help}>Sin elementos incluidos cargados.</p> : inclusions.map((item) => <div className={styles.record} key={item.id}>
        <ActionForm action={saveInclusionAction} submitLabel="Guardar" compact>
          <input type="hidden" name="id" value={item.id} /><input type="hidden" name="productId" value={product.id} />
          <Field label="Descripción" name="description" defaultValue={item.description} required />
          <Field label="Cantidad" name="quantity" defaultValue={item.quantity} type="number" min="0.001" step="0.001" required />
          <Field label="Orden" name="sortOrder" defaultValue={item.sort_order} type="number" min={0} required />
        </ActionForm>
        <ActionForm action={removeInclusionAction} submitLabel="Quitar" compact confirmMessage="¿Quitar este elemento incluido?">
          <input type="hidden" name="id" value={item.id} /><input type="hidden" name="productId" value={product.id} />
        </ActionForm>
      </div>)}
      <h4>Agregar elemento</h4>
      <ActionForm action={saveInclusionAction} submitLabel="Agregar" compact>
        <input type="hidden" name="id" value="" /><input type="hidden" name="productId" value={product.id} />
        <Field label="Descripción" name="description" required />
        <Field label="Cantidad" name="quantity" defaultValue="1" type="number" min="0.001" step="0.001" required />
        <Field label="Orden" name="sortOrder" defaultValue={inclusions.length} type="number" min={0} required />
      </ActionForm>
    </section>
  </div>;
}

function ImageUpload({ product, images }: { product: ProductRow; images: ImageRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("image");
    const altText = formData.get("altText");
    if (!(file instanceof File) || file.size < 1 || file.size > 8_000_000 ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ||
      typeof altText !== "string" || altText.trim().length < 1 || altText.trim().length > 300) {
      setResult({ status: "error", message: "Selecciona una imagen válida de hasta 8 MB y una descripción de 1 a 300 caracteres." });
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/product-images", { method: "POST", body: formData, cache: "no-store" });
      const payload: unknown = await response.json();
      if (response.status !== 201 || typeof payload !== "object" || payload === null ||
        !("status" in payload) || payload.status !== "recorded" || !("id" in payload) || typeof payload.id !== "string") {
        const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error : "No se pudo guardar la imagen.";
        setResult({ status: "error", message });
        return;
      }
      form.reset();
      setResult({ status: "success", message: "Imagen registrada y asociada al producto." });
      router.refresh();
    } catch {
      setResult({ status: "error", message: "No se pudo conectar con el almacenamiento. Reintenta." });
    } finally {
      setPending(false);
    }
  }

  const primaryImageId = images.find((image) => image.is_primary)?.id ?? "";
  return <section className={styles.subpanel} aria-labelledby="catalog-images-title">
    <h3 id="catalog-images-title">Imágenes</h3>
    <p className={styles.help}>JPEG, PNG, WebP o AVIF de hasta 8 MB. La imagen se guarda en un bucket privado y su acceso público depende de la ficha publicada. La portada se cambia en una operación atómica y auditada.</p>
    {images.length === 0 ? <p className={styles.help}>Sin imágenes registradas.</p> : <ul className={styles.imageList}>{images.map((image) => <li key={image.id}>
      <div className={styles.imageMeta}><strong>{image.alt_text}</strong><small>{image.is_primary ? "Portada" : `Orden ${image.sort_order}`}</small></div>
      <div className={styles.imageControls}>
        {!image.is_primary && <ActionForm action={setPrimaryImageAction} submitLabel="Usar como portada" compact>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="imageId" value={image.id} />
          <input type="hidden" name="expectedPrimaryId" value={primaryImageId} />
        </ActionForm>}
        <details className={styles.editDisclosure}><summary>Editar descripción y orden</summary>
          <ActionForm action={updateImageMetadataAction} submitLabel="Guardar imagen" compact>
            <input type="hidden" name="id" value={image.id} />
            <input type="hidden" name="productId" value={product.id} />
            <Field label="Descripción" name="altText" defaultValue={image.alt_text} required />
            <Field label="Orden" name="sortOrder" defaultValue={image.sort_order} type="number" min={0} required />
          </ActionForm>
        </details>
      </div>
    </li>)}</ul>}
    <form onSubmit={submit} className={styles.form}>
      <input type="hidden" name="productId" value={product.id} />
      <div className={styles.fields}>
        <label className={styles.field}><span>Archivo</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" required /></label>
        <Field label="Descripción de la imagen" name="altText" required placeholder="Vista frontal del producto" />
      </div>
      <button type="submit" className={styles.button} disabled={pending}>{pending ? "Guardando..." : "Agregar imagen"}</button>
      {result && <p className={result.status === "success" ? styles.success : styles.error} role={result.status === "error" ? "alert" : "status"}>{result.message}</p>}
    </form>
  </section>;
}

function CompatibilityEditor({ product, products, compatibilities }: {
  product: ProductRow;
  products: ProductRow[];
  compatibilities: CompatibilityRow[];
}) {
  if (product.kind === "accessory") return null;
  const isEquipment = product.kind === "equipment";
  const linked = compatibilities.filter((item) => isEquipment
    ? item.equipment_id === product.id : item.part_id === product.id);
  const candidates = products.filter((item) => item.kind === (isEquipment ? "part" : "equipment"));
  const names = new Map(products.map((item) => [item.id, `${item.sku} · ${item.name}`]));
  const counterpartName = isEquipment ? "Repuesto" : "Equipo";
  return <section className={styles.subpanel} aria-labelledby="catalog-compatibilities-title">
    <h3 id="catalog-compatibilities-title">{isEquipment ? "Repuestos compatibles" : "Equipos compatibles"}</h3>
    <p className={styles.help}>Registra únicamente correspondencias verificadas. Los vínculos no alteran el inventario.</p>
    {linked.length === 0 ? <p className={styles.help}>Sin compatibilidades registradas.</p> : linked.map((item) => {
      const counterpartId = isEquipment ? item.part_id : item.equipment_id;
      return <div className={styles.record} key={`${item.equipment_id}:${item.part_id}`}>
        <strong>{names.get(counterpartId) ?? "Producto no visible en esta página"}</strong>
        <ActionForm action={saveCompatibilityAction} submitLabel="Guardar nota" compact>
          <input type="hidden" name="equipmentId" value={item.equipment_id} />
          <input type="hidden" name="partId" value={item.part_id} />
          <Field label="Nota verificada (opcional)" name="notes" defaultValue={item.notes ?? ""} />
        </ActionForm>
        <ActionForm action={removeCompatibilityAction} submitLabel="Quitar vínculo" compact
          confirmMessage="¿Quitar esta correspondencia verificada?">
          <input type="hidden" name="equipmentId" value={item.equipment_id} />
          <input type="hidden" name="partId" value={item.part_id} />
        </ActionForm>
      </div>;
    })}
    <h4>Vincular {counterpartName.toLowerCase()}</h4>
    <ActionForm action={saveCompatibilityAction} submitLabel="Guardar compatibilidad" compact disabled={candidates.length === 0}>
      <input type="hidden" name={isEquipment ? "equipmentId" : "partId"} value={product.id} />
      <label className={styles.field}><span>{counterpartName}</span><select name={isEquipment ? "partId" : "equipmentId"} defaultValue="" required>
        <option value="">Seleccionar {counterpartName.toLowerCase()}</option>
        {candidates.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}
      </select></label>
      <Field label="Nota verificada (opcional)" name="notes" />
    </ActionForm>
  </section>;
}

export function CatalogAdmin({ brands, categories, products, offers, specs, inclusions, images, compatibilities, publicCatalogConnected }: CatalogData) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const product = products.find((item) => item.id === selectedProductId);
  const offer = offers.find((item) => item.id === selectedOfferId);
  const productLabel = new Map(products.map((item) => [item.id, `${item.sku} · ${item.name}`]));

  return <div className={styles.shell}>
    <header className={styles.hero}>
      <div><span className="eyebrow">Panel administrativo</span><h1>Catálogo GreenBel</h1><p>Administra borradores, fichas, precios y ofertas con permisos de administrador.</p></div>
      <div className={styles.adminLinks}>
        <Link href="/admin/inventario" className="secondary-dark-button">Ver inventario</Link>
        <Link href="/admin/ventas" className="secondary-dark-button">Ventas y posventa</Link>
        <Link href="/admin/cotizaciones" className="secondary-dark-button">Cotizaciones</Link>
        <Link href="/admin/entregas" className="secondary-dark-button">Entregas</Link>
        <Link href="/admin/capacitaciones" className="secondary-dark-button">Capacitaciones</Link>
        <Link href="/admin/resenas" className="secondary-dark-button">Reseñas</Link>
        <Link href="/admin/consultas" className="secondary-dark-button">Consultas</Link>
        <Link href="/admin/financiamiento" className="secondary-dark-button">Financiamiento</Link>
        <Link href="/admin/usuarios" className="secondary-dark-button">Usuarios</Link>
      </div>
    </header>
    <p className={styles.notice} role="status">{publicCatalogConnected ? "La fuente pública está conectada a Supabase; los productos visibles dependen de publicación y clasificaciones activas." : "La tienda pública sigue mostrando datos ficticios DEV. Los cambios guardados aquí no aparecen en ese catálogo hasta conectar su fuente Supabase."}</p>
    {(brands.length >= 1000 || categories.length >= 1000 || products.length >= 1000 || offers.length >= 1000 || specs.length >= 3000 || inclusions.length >= 3000 || images.length >= 3000 || compatibilities.length >= 3000) && <p className={styles.notice}>La vista alcanzó su límite de registros; no se muestran todos los elementos. Amplía la consulta antes de editar fuera de lo visible.</p>}
    <nav className={styles.sectionNav} aria-label="Secciones del catálogo"><a href="#marcas">Marcas</a><a href="#categorias">Categorías</a><a href="#productos">Productos</a><a href="#ofertas">Ofertas</a></nav>

    <div className={styles.columns}>
      <section className={styles.panel} id="marcas"><h2>Marcas <span>{brands.length}</span></h2>
        <ActionForm action={createBrandAction} submitLabel="Crear marca">
          <div className={styles.fields}><Field label="Nombre" name="name" required /><Field label="Identificador URL" name="slug" required placeholder="marca-ejemplo" /></div>
          <p className={styles.help}>Una marca nueva queda inactiva hasta que la revises y actives.</p>
        </ActionForm>
        <div className={styles.list}>{brands.length === 0 ? <p className={styles.help}>Sin marcas cargadas.</p> : brands.map((brand) => <BrandEditor brand={brand} key={brand.id} />)}</div>
      </section>
      <section className={styles.panel} id="categorias"><h2>Categorías <span>{categories.length}</span></h2>
        <ActionForm action={createCategoryAction} submitLabel="Crear categoría">
          <div className={styles.fields}><Field label="Nombre" name="name" required /><Field label="Identificador URL" name="slug" required placeholder="categoria-ejemplo" /><label className={styles.field}><span>Categoría superior</span><select name="parentId" defaultValue=""><option value="">Sin categoría superior</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div>
          <p className={styles.help}>Las categorías nuevas quedan inactivas. Elige una superior para crear una subcategoría.</p>
        </ActionForm>
        <div className={styles.list}>{categories.length === 0 ? <p className={styles.help}>Sin categorías cargadas.</p> : categories.map((category) => <CategoryEditor category={category} categories={categories} key={category.id} />)}</div>
      </section>
    </div>

    <section className={styles.panel} id="productos"><div className={styles.panelHeading}><div><h2>Productos <span>{products.length}</span></h2><p className={styles.help}>Selecciona una ficha existente para editarla o crea una nueva.</p></div><label className={styles.field}><span>Ficha</span><select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">Nuevo producto</option>{products.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name} · {item.publication_status}</option>)}</select></label></div>
      <ProductEditor key={product?.id ?? "new"} product={product} brands={brands} categories={categories} />
      {product && <ProductDetails key={product.id} product={product} specs={specs.filter((item) => item.product_id === product.id)} inclusions={inclusions.filter((item) => item.product_id === product.id)} />}
      {product && <ImageUpload key={product.id} product={product} images={images.filter((item) => item.product_id === product.id)} />}
      {product && <CompatibilityEditor key={product.id} product={product} products={products} compatibilities={compatibilities} />}
    </section>

    <section className={styles.panel} id="ofertas"><div className={styles.panelHeading}><div><h2>Ofertas <span>{offers.length}</span></h2><p className={styles.help}>Precio final exacto o porcentaje; fechas con zona horaria explícita.</p></div><label className={styles.field}><span>Oferta</span><select value={selectedOfferId} onChange={(event) => setSelectedOfferId(event.target.value)}><option value="">Nueva oferta</option>{offers.map((item) => <option value={item.id} key={item.id}>{productLabel.get(item.product_id) ?? item.product_id} · {item.enabled ? "activa" : "inactiva"}</option>)}</select></label></div>
      <ActionForm key={offer?.id ?? "new"} action={saveOfferAction} submitLabel={offer ? "Guardar oferta" : "Crear oferta"} disabled={products.length === 0}>
        <input type="hidden" name="id" value={offer?.id ?? ""} />
        <div className={styles.fields}>
          <label className={styles.field}><span>Producto</span><select name="productId" defaultValue={offer?.product_id ?? ""} required><option value="">Seleccionar producto</option>{products.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}</select></label>
          <label className={styles.field}><span>Tipo</span><select name="kind" defaultValue={offer?.kind ?? "fixed_price"}><option value="fixed_price">Precio final exacto</option><option value="percentage">Porcentaje de descuento</option></select></label>
          <Field label="Valor" name="value" defaultValue={offer?.value ?? ""} required placeholder="Precio Q o porcentaje" />
          <Field label="Inicio ISO con zona" name="startsAt" defaultValue={offer?.starts_at ?? ""} required placeholder="2026-10-01T08:00:00-06:00" />
          <Field label="Fin ISO con zona" name="endsAt" defaultValue={offer?.ends_at ?? ""} required placeholder="2026-10-31T18:00:00-06:00" />
        </div>
        <label className={styles.check}><input type="checkbox" name="enabled" defaultChecked={offer?.enabled ?? false} /> Activar oferta</label>
        <p className={styles.help}>La oferta requiere precio base vigente; no se acumula con otras promociones. Si se cambia el precio regular, revisa la oferta antes de guardar.</p>
      </ActionForm>
    </section>
  </div>;
}
