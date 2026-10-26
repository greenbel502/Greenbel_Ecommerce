"use client";

import Image from "next/image";
import {
  Package,
  Tags,
  FileText,
  Store,
  ShieldCheck,
  ListChecks,
  Images,
  Link2,
  Box,
  CloudUpload,
  Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  removeCompatibilityAction,
  removeInclusionAction,
  removeSpecAction,
  saveInclusionAction,
  saveCompatibilityAction,
  saveProductAction,
  saveSpecAction,
  setPrimaryImageAction,
  updateImageMetadataAction,
  type CatalogActionState,
} from "./actions";
import type {
  ProductRow,
  BrandRow,
  CategoryRow,
  SpecRow,
  InclusionRow,
  ImageRow,
  CompatibilityRow,
} from "./catalog-admin";
import {
  ActionForm,
  Field,
  CatalogOperations,
  CatalogRefresh,
  useCatalogOperation,
} from "./catalog-form";
import { EntityPicker } from "../_components/entity-picker";
import styles from "./catalog.module.css";
import productStyles from "./products.module.css";
import drawerStyles from "./brands.module.css";

function ProductDataForm({
  product,
  brands,
  categories,
  formId,
  onResult,
}: {
  product?: ProductRow;
  brands: BrandRow[];
  categories: CategoryRow[];
  formId: string;
  onResult: (state: CatalogActionState) => void;
}) {
  return (
    <ActionForm
      key={product?.id ?? "new"}
      action={saveProductAction}
      submitLabel={product ? "Guardar cambios" : "Crear producto"}
      formId={formId}
      hideSubmit
      onResult={onResult}
    >
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <section className={styles.formSection}>
        <header className={styles.formSectionHeading}>
          <Package size={20} aria-hidden="true" />
          <h3>Datos del producto</h3>
        </header>
        <div className={styles.fields}>
          <Field
            label="Nombre"
            name="name"
            defaultValue={product?.name}
            required
          />
          <Field
            label="Código del producto"
            name="sku"
            defaultValue={product?.sku}
            required
            help="Código único del catálogo de la empresa. Por ejemplo: UPL1008."
          />
          <Field
            label="Modelo"
            name="model"
            defaultValue={product?.model ?? ""}
          />
          <label className={styles.field}>
            <span>Tipo</span>
            <select name="kind" defaultValue={product?.kind ?? "equipment"}>
              <option value="equipment">Equipo</option>
              <option value="part">Repuesto</option>
              <option value="accessory">Accesorio</option>
              <option value="agricultural">Producto agrícola</option>
            </select>
          </label>
        </div>
      </section>
      <section className={styles.formSection}>
        <header className={styles.formSectionHeading}>
          <Tags size={20} aria-hidden="true" />
          <h3>Marca y categoría</h3>
        </header>
        <div className={styles.fields}>
          <EntityPicker
            entity="brands"
            name="brandId"
            label="Marca"
            emptyLabel="Sin marca"
            defaultId={product?.brand_id ?? ""}
            defaultLabel={brands.find((b) => b.id === product?.brand_id)?.name}
          />
          <EntityPicker
            entity="categories"
            name="categoryId"
            label="Categoría"
            required
            defaultId={product?.category_id ?? ""}
            defaultLabel={
              categories.find((c) => c.id === product?.category_id)?.name
            }
          />
        </div>
      </section>
      <section className={styles.formSection}>
        <header className={styles.formSectionHeading}>
          <FileText size={20} aria-hidden="true" />
          <h3>Descripción</h3>
        </header>
        <div className={styles.fields}>
          <Field
            label="Descripción breve"
            name="shortDescription"
            defaultValue={product?.short_description ?? ""}
          />
          <label className={`${styles.field} ${styles.wide}`}>
            <span>Descripción completa</span>
            <textarea
              name="description"
              rows={4}
              defaultValue={product?.description ?? ""}
            />
          </label>
        </div>
      </section>
      <section className={styles.formSection}>
        <header className={styles.formSectionHeading}>
          <Store size={20} aria-hidden="true" />
          <h3>Precio y publicación</h3>
        </header>
        <div className={styles.fields}>
          <Field
            label="Precio regular, Q IVA incluido"
            name="regularPrice"
            defaultValue={product?.regular_price ?? ""}
            placeholder="Vacío = Precio próximamente"
          />
          <label className={styles.field}>
            <span>Estado de publicación</span>
            <select
              name="publicationStatus"
              defaultValue={product?.publication_status ?? "draft"}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="featured"
              defaultChecked={product?.featured ?? false}
            />{" "}
            Destacar en Inicio
          </label>
        </div>
      </section>
      <section className={styles.formSection}>
        <header className={styles.formSectionHeading}>
          <ShieldCheck size={20} aria-hidden="true" />
          <h3>Garantía</h3>
        </header>
        <div className={styles.fields}>
          <Field
            label="Garantía en meses"
            name="warrantyMonths"
            defaultValue={product?.warranty_months ?? ""}
            type="number"
            min={0}
            max={1200}
          />
          <label className={`${styles.field} ${styles.wide}`}>
            <span>Condiciones de garantía</span>
            <textarea
              name="warrantyTerms"
              rows={3}
              defaultValue={product?.warranty_terms ?? ""}
            />
          </label>
        </div>
      </section>{" "}
      <p className={styles.help}>
        El precio puede quedar vacío para publicar «Precio próximamente».
      </p>
    </ActionForm>
  );
}

function ProductDetails({
  product,
  specs,
  inclusions,
}: {
  product: ProductRow;
  specs: SpecRow[];
  inclusions: InclusionRow[];
}) {
  return (
    <div className={`${styles.detailGrid} ${productStyles.detailsGrid}`}>
      <section className={styles.subpanel} aria-label="Especificaciones">
        <h3 className={styles.detailHeading}>
          <ListChecks size={20} aria-hidden="true" />
          Especificaciones
        </h3>
        {specs.length === 0 ? (
          <p className={styles.help}>Sin especificaciones cargadas.</p>
        ) : (
          specs.map((spec) => (
            <div className={styles.record} key={spec.id}>
              <ActionForm action={saveSpecAction} submitLabel="Guardar" compact>
                <input type="hidden" name="id" value={spec.id} />
                <input type="hidden" name="productId" value={product.id} />
                <Field
                  label="Característica"
                  name="label"
                  defaultValue={spec.label}
                  required
                />
                <Field
                  label="Valor"
                  name="value"
                  defaultValue={spec.value}
                  required
                />
                <Field
                  label="Unidad"
                  name="unit"
                  defaultValue={spec.unit ?? ""}
                />
                <Field
                  label="Orden"
                  name="sortOrder"
                  defaultValue={spec.sort_order}
                  type="number"
                  min={0}
                  required
                />
              </ActionForm>
              <ActionForm
                action={removeSpecAction}
                submitLabel="Quitar"
                compact
                confirmMessage="¿Quitar esta especificación del producto?"
              >
                <input type="hidden" name="id" value={spec.id} />
                <input type="hidden" name="productId" value={product.id} />
              </ActionForm>
            </div>
          ))
        )}
        <h4>Agregar especificación</h4>
        <ActionForm action={saveSpecAction} submitLabel="Agregar" compact>
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="productId" value={product.id} />
          <Field label="Característica" name="label" required />
          <Field label="Valor" name="value" required />
          <Field label="Unidad" name="unit" />
          <Field
            label="Orden"
            name="sortOrder"
            defaultValue={specs.length}
            type="number"
            min={0}
            required
          />
        </ActionForm>
      </section>
      <section className={styles.subpanel} aria-label="Contenido incluido">
        <h3 className={styles.detailHeading}>
          <Box size={20} aria-hidden="true" />
          Qué incluye
        </h3>
        {inclusions.length === 0 ? (
          <p className={styles.help}>Sin elementos incluidos cargados.</p>
        ) : (
          inclusions.map((item) => (
            <div className={styles.record} key={item.id}>
              <ActionForm
                action={saveInclusionAction}
                submitLabel="Guardar"
                compact
              >
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="productId" value={product.id} />
                <Field
                  label="Descripción"
                  name="description"
                  defaultValue={item.description}
                  required
                />
                <Field
                  label="Cantidad"
                  name="quantity"
                  defaultValue={item.quantity}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                />
                <Field
                  label="Orden"
                  name="sortOrder"
                  defaultValue={item.sort_order}
                  type="number"
                  min={0}
                  required
                />
              </ActionForm>
              <ActionForm
                action={removeInclusionAction}
                submitLabel="Quitar"
                compact
                confirmMessage="¿Quitar este elemento incluido?"
              >
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="productId" value={product.id} />
              </ActionForm>
            </div>
          ))
        )}
        <h4>Agregar elemento</h4>
        <ActionForm action={saveInclusionAction} submitLabel="Agregar" compact>
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="productId" value={product.id} />
          <Field label="Descripción" name="description" required />
          <Field
            label="Cantidad"
            name="quantity"
            defaultValue="1"
            type="number"
            min="0.001"
            step="0.001"
            required
          />
          <Field
            label="Orden"
            name="sortOrder"
            defaultValue={inclusions.length}
            type="number"
            min={0}
            required
          />
        </ActionForm>
      </section>
    </div>
  );
}

function ImageUpload({
  product,
  images,
}: {
  product: ProductRow;
  images: ImageRow[];
}) {
  const router = useRouter();
  const refreshDetails = useContext(CatalogRefresh);
  const [pending, setPending] = useState(false);
  useCatalogOperation(pending);
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [fileName, setFileName] = useState("");
  const [filePreview, setFilePreview] = useState("");
  useEffect(
    () => () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    },
    [filePreview],
  );
  const [result, setResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("image");
    const altText = formData.get("altText");
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 8_000_000 ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        file.type,
      ) ||
      typeof altText !== "string" ||
      altText.trim().length < 1 ||
      altText.trim().length > 300
    ) {
      setResult({
        status: "error",
        message:
          "Selecciona una imagen válida de hasta 8 MB y una descripción de 1 a 300 caracteres.",
      });
      return;
    }
    setPending(true);
    inFlight.current = true;
    setResult(null);
    try {
      const response = await fetch("/api/admin/product-images", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (
        response.status !== 201 ||
        typeof payload !== "object" ||
        payload === null ||
        !("status" in payload) ||
        payload.status !== "recorded" ||
        !("id" in payload) ||
        typeof payload.id !== "string"
      ) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "No se pudo guardar la imagen.";
        setResult({ status: "error", message });
        return;
      }
      form.reset();
      setFileName("");
      setFilePreview("");
      setResult({
        status: "success",
        message:
          "Imagen agregada. Elige «Usar como portada» para mostrarla en el listado y el catálogo.",
      });
      refreshDetails?.();
      router.refresh();
    } catch {
      setResult({
        status: "error",
        message: "No se pudo conectar con el almacenamiento. Reintenta.",
      });
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  const primaryImageId = images.find((image) => image.is_primary)?.id ?? "";
  return (
    <section className={styles.subpanel} aria-labelledby="catalog-images-title">
      <h3 id="catalog-images-title" className={styles.detailHeading}>
        <Images size={20} aria-hidden="true" />
        Imágenes
      </h3>
      <p className={styles.help}>
        Agrega fotografías y elige la portada que se mostrará en el catálogo.
        PNG, JPG, WebP o AVIF de hasta 8 MB.
      </p>
      {images.length === 0 ? (
        <p className={styles.help}>Sin imágenes registradas.</p>
      ) : (
        <ul className={styles.imageList}>
          {images.map((image) => (
            <li key={image.id}>
              <Image
                src={`/api/admin/product-images/${image.id}`}
                alt={image.alt_text || "Imagen del producto"}
                width={160}
                height={120}
                unoptimized
                className={productStyles.galleryImage}
              />
              <div className={styles.imageMeta}>
                <strong>{image.alt_text}</strong>
                <small>
                  {image.is_primary ? "Portada" : `Orden ${image.sort_order}`}
                </small>
              </div>
              <div className={styles.imageControls}>
                {!image.is_primary && (
                  <ActionForm
                    action={setPrimaryImageAction}
                    submitLabel="Usar como portada"
                    compact
                  >
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <input
                      type="hidden"
                      name="expectedPrimaryId"
                      value={primaryImageId}
                    />
                  </ActionForm>
                )}
                <details className={styles.editDisclosure}>
                  <summary>Editar descripción y orden</summary>
                  <ActionForm
                    action={updateImageMetadataAction}
                    submitLabel="Guardar imagen"
                    compact
                  >
                    <input type="hidden" name="id" value={image.id} />
                    <input type="hidden" name="productId" value={product.id} />
                    <Field
                      label="Descripción"
                      name="altText"
                      defaultValue={image.alt_text}
                      required
                    />
                    <Field
                      label="Orden"
                      name="sortOrder"
                      defaultValue={image.sort_order}
                      type="number"
                      min={0}
                      required
                    />
                  </ActionForm>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className={styles.form}>
        <fieldset disabled={pending}>
          <input type="hidden" name="productId" value={product.id} />
          <div className={`${styles.fields} ${productStyles.mediaFields}`}>
            <label className={styles.field}>
              <span>Agregar fotografía</span>
              <span className={productStyles.uploadZone}>
                {filePreview ? (
                  <Image
                    src={filePreview}
                    width={160}
                    height={100}
                    alt="Vista previa de la imagen seleccionada"
                    unoptimized
                  />
                ) : (
                  <CloudUpload size={30} aria-hidden="true" />
                )}
                <strong>
                  {fileName || "Selecciona o arrastra una imagen"}
                </strong>
                <span>PNG, JPG, WebP o AVIF · Hasta 8 MB</span>
              </span>
              <input
                ref={fileInput}
                className={productStyles.fileInput}
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/webp,image/avif"
                required
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setFileName(file?.name ?? "");
                  setFilePreview(file ? URL.createObjectURL(file) : "");
                }}
              />
            </label>
            <Field
              label="Descripción de la imagen"
              name="altText"
              required
              placeholder="Vista frontal del producto"
            />
          </div>
          <button type="submit" className={styles.button} disabled={pending}>
            {pending ? "Guardando..." : "Agregar imagen"}
          </button>
        </fieldset>
        {result && (
          <p
            className={
              result.status === "success" ? styles.success : styles.error
            }
            role={result.status === "error" ? "alert" : "status"}
          >
            {result.message}
          </p>
        )}
      </form>
    </section>
  );
}

function CompatibilityEditor({
  product,
  products,
  compatibilities,
}: {
  product: ProductRow;
  products: ProductRow[];
  compatibilities: CompatibilityRow[];
}) {
  if (product.kind === "accessory" || product.kind === "agricultural")
    return null;
  const isEquipment = product.kind === "equipment";
  const linked = compatibilities.filter((item) =>
    isEquipment
      ? item.equipment_id === product.id
      : item.part_id === product.id,
  );
  const names = new Map(
    products.map((item) => [item.id, `${item.sku} · ${item.name}`]),
  );
  const counterpartName = isEquipment ? "Repuesto" : "Equipo";
  return (
    <section
      className={styles.subpanel}
      aria-labelledby="catalog-compatibilities-title"
    >
      <h3 id="catalog-compatibilities-title" className={styles.detailHeading}>
        <Link2 size={20} aria-hidden="true" />
        {isEquipment ? "Repuestos compatibles" : "Equipos compatibles"}
      </h3>
      <p className={styles.help}>
        Registra únicamente correspondencias verificadas. Los vínculos no
        alteran el inventario.
      </p>
      {linked.length === 0 ? (
        <p className={styles.help}>Sin compatibilidades registradas.</p>
      ) : (
        linked.map((item) => {
          const counterpartId = isEquipment ? item.part_id : item.equipment_id;
          return (
            <div
              className={styles.record}
              key={`${item.equipment_id}:${item.part_id}`}
            >
              <strong>
                {names.get(counterpartId) ??
                  "Producto no visible en esta página"}
              </strong>
              <ActionForm
                action={saveCompatibilityAction}
                submitLabel="Guardar nota"
                compact
              >
                <input
                  type="hidden"
                  name="equipmentId"
                  value={item.equipment_id}
                />
                <input type="hidden" name="partId" value={item.part_id} />
                <Field
                  label="Nota verificada (opcional)"
                  name="notes"
                  defaultValue={item.notes ?? ""}
                />
              </ActionForm>
              <ActionForm
                action={removeCompatibilityAction}
                submitLabel="Quitar vínculo"
                compact
                confirmMessage="¿Quitar esta correspondencia verificada?"
              >
                <input
                  type="hidden"
                  name="equipmentId"
                  value={item.equipment_id}
                />
                <input type="hidden" name="partId" value={item.part_id} />
              </ActionForm>
            </div>
          );
        })
      )}
      <h4>Vincular {counterpartName.toLowerCase()}</h4>
      <ActionForm
        action={saveCompatibilityAction}
        submitLabel="Guardar compatibilidad"
        compact
      >
        <input
          type="hidden"
          name={isEquipment ? "equipmentId" : "partId"}
          value={product.id}
        />
        <EntityPicker
          entity="products"
          name={isEquipment ? "partId" : "equipmentId"}
          label={counterpartName}
          kind={isEquipment ? "part" : "equipment"}
          required
        />
        <Field label="Nota verificada (opcional)" name="notes" />
      </ActionForm>
    </section>
  );
}

export function ProductEditor({
  product,
  brands,
  categories,
  products,
  images,
  specs,
  inclusions,
  compatibilities,
  detailsReady,
  detailsError,
  detailsLoading = false,
  onDetailsRefresh,
  onBusyChange,
  onSaved,
  onCancel,
}: {
  product?: ProductRow;
  brands: BrandRow[];
  categories: CategoryRow[];
  products: ProductRow[];
  images: ImageRow[];
  specs: SpecRow[];
  inclusions: InclusionRow[];
  compatibilities: CompatibilityRow[];
  detailsReady: boolean;
  detailsError?: string;
  detailsLoading?: boolean;
  onDetailsRefresh?: () => void;
  onBusyChange: (busy: boolean) => void;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const operations = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<CatalogActionState | null>(null);
  const notify = useCallback(
    (id: string, pending: boolean) => {
      if (pending) operations.current.add(id);
      else operations.current.delete(id);
      const value = operations.current.size > 0;
      setBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  const result = useCallback(
    (state: CatalogActionState) => {
      setFeedback(state);
      if (state.status === "success" && state.productId)
        onSaved(state.productId);
    },
    [onSaved],
  );
  return (
    <CatalogOperations.Provider value={notify}>
      <CatalogRefresh.Provider value={onDetailsRefresh ?? null}>
        <div className={productStyles.editorContent}>
          <div className={productStyles.editorSections}>
            {detailsReady && (detailsError || detailsLoading) && (
              <div className={productStyles.loadFeedback}>
                <p role={detailsError ? "alert" : "status"}>
                  {detailsError ?? "Actualizando fotografías y detalles…"}
                </p>
                {detailsError && (
                  <button
                    type="button"
                    className={drawerStyles.secondary}
                    disabled={detailsLoading}
                    onClick={onDetailsRefresh}
                  >
                    Reintentar carga
                  </button>
                )}
              </div>
            )}
            {product && detailsReady ? (
              <ImageUpload product={product} images={images} />
            ) : (
              <section className={styles.subpanel}>
                <h3 className={styles.detailHeading}>
                  <Images size={20} aria-hidden="true" /> Imágenes
                </h3>
                {product?.cover_image_id && (
                  <Image
                    src={`/api/admin/product-images/${product.cover_image_id}`}
                    alt={product.name}
                    width={200}
                    height={150}
                    unoptimized
                    className={productStyles.galleryImage}
                  />
                )}
                <p
                  className={styles.help}
                  role={detailsError ? "alert" : product ? "status" : undefined}
                >
                  {product
                    ? (detailsError ??
                      "Cargando fotografías y detalles del producto…")
                    : "Crea primero el producto para asociar sus fotografías. Después podrás cargarlas aquí."}
                </p>
                {product && detailsError && (
                  <button
                    type="button"
                    className={drawerStyles.secondary}
                    disabled={detailsLoading}
                    onClick={onDetailsRefresh}
                  >
                    Reintentar carga
                  </button>
                )}
              </section>
            )}
            <ProductDataForm
              product={product}
              brands={brands}
              categories={categories}
              formId={formId}
              onResult={result}
            />
            {product && detailsReady && (
              <>
                <ProductDetails
                  product={product}
                  specs={specs}
                  inclusions={inclusions}
                />
                <CompatibilityEditor
                  product={product}
                  products={products}
                  compatibilities={compatibilities}
                />
              </>
            )}
          </div>
          <footer className={productStyles.saveFooter}>
            {feedback && (
              <p
                role={feedback.status === "error" ? "alert" : "status"}
                className={
                  feedback.status === "error" ? styles.error : styles.success
                }
              >
                {feedback.message}
              </p>
            )}
            <p className={productStyles.footerHelp}>
              Este botón guarda los datos del producto. Las fotografías y los
              detalles tienen sus propias acciones.
            </p>
            <div className={drawerStyles.footerActions}>
              <button
                type="button"
                className={drawerStyles.secondary}
                onClick={onCancel}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={formId}
                className={drawerStyles.primary}
                disabled={busy}
              >
                <Save size={17} aria-hidden="true" />
                {busy
                  ? "Guardando…"
                  : product
                    ? "Guardar cambios"
                    : "Crear producto"}
              </button>
            </div>
          </footer>
        </div>
      </CatalogRefresh.Provider>
    </CatalogOperations.Provider>
  );
}
