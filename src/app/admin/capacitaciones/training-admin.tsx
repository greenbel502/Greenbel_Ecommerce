"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveTrainingAction, saveTrainingRelationAction, type TrainingActionState } from "./actions";
import styles from "./training-admin.module.css";

export type TrainingRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  video_url: string | null;
  cover_path: string | null;
  publication_status: "draft" | "published" | "archived";
  created_at: string;
};
export type TrainingProductOption = { id: string; name: string; sku: string };
export type TrainingCategoryOption = { id: string; name: string };
export type TrainingProductLink = { training_id: string; product_id: string };
export type TrainingCategoryLink = { training_id: string; category_id: string };

type RelationKind = "product" | "category";
type RelationOption = { id: string; label: string };

const idle: TrainingActionState = { status: "idle", message: "" };

function TrainingEditor({ training }: { training?: TrainingRow }) {
  const [state, action, pending] = useActionState(saveTrainingAction, idle);
  const [videoUrl, setVideoUrl] = useState(training?.video_url ?? "");
  const [status, setStatus] = useState(training?.publication_status ?? "draft");
  const missingVideo = status === "published" && !videoUrl.trim();

  return <form action={action} className={styles.form}>
    <fieldset disabled={pending}>
      <input type="hidden" name="id" value={training?.id ?? ""} />
      <div className={styles.fields}>
        <label><span>Título</span><input name="title" defaultValue={training?.title ?? ""} maxLength={240} required /></label>
        <label><span>Identificador URL</span><input name="slug" defaultValue={training?.slug ?? ""} maxLength={160} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="uso-de-equipo" required /></label>
        <label className={styles.wide}><span>Descripción</span><textarea name="description" defaultValue={training?.description ?? ""} maxLength={12000} rows={5} /></label>
        <label className={styles.wide}><span>URL del video HTTPS</span><input name="videoUrl" type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://..." maxLength={2000} required={status === "published"} /><small>Para publicar se necesita una URL HTTPS verificable. En borrador puede quedar vacía.</small></label>
        <label><span>Estado</span><select name="publicationStatus" value={status} onChange={(event) => setStatus(event.target.value as TrainingRow["publication_status"])}><option value="draft">Borrador</option><option value="published" disabled={!videoUrl.trim()}>Publicado</option><option value="archived">Archivado</option></select></label>
      </div>
      {missingVideo && <p className={styles.warning} role="alert">Agrega una URL HTTPS antes de publicar.</p>}
      <p className={styles.help}>Guarda la capacitación antes de cargar su portada. El video se registra mediante URL HTTPS; este formulario no crea inscripciones ni reservas.</p>
      <button type="submit" disabled={pending || missingVideo}>{pending ? "Guardando..." : training ? "Guardar capacitación" : "Crear capacitación"}</button>
    </fieldset>
    {state.status !== "idle" && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
  </form>;
}

function TrainingCoverUpload({ training }: { training: TrainingRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("image");
    if (!(file instanceof File) || file.size < 1 || file.size > 8_000_000 ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setResult({ status: "error", message: "Selecciona una imagen JPEG, PNG, WebP o AVIF de hasta 8 MB." });
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/training-covers", {
        method: "POST", body: formData, cache: "no-store"
      });
      const payload: unknown = await response.json();
      if (response.status !== 201 || typeof payload !== "object" || payload === null ||
        !("status" in payload) || payload.status !== "recorded") {
        const message = typeof payload === "object" && payload !== null && "error" in payload
          && typeof payload.error === "string" ? payload.error : "No se pudo guardar la portada.";
        setResult({ status: "error", message });
        return;
      }
      form.reset();
      setResult({ status: "success", message: "Portada guardada en el almacenamiento privado." });
      router.refresh();
    } catch {
      setResult({ status: "error", message: "No se pudo conectar con el almacenamiento. Reintenta." });
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.coverPanel} aria-labelledby="training-cover-title">
    <h3 id="training-cover-title">Portada de la capacitación</h3>
    {training.cover_path ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={styles.coverPreview} src={`/api/training-covers/${training.id}`} alt={`Portada: ${training.title}`} />
    ) : <p className={styles.help}>Sin portada registrada.</p>}
    <form onSubmit={submit} className={styles.coverForm}>
      <input type="hidden" name="trainingId" value={training.id} />
      <label><span>Imagen de portada</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required disabled={pending} /></label>
      <button type="submit" disabled={pending}>{pending ? "Guardando..." : training.cover_path ? "Reemplazar portada" : "Cargar portada"}</button>
    </form>
    <p className={styles.help}>La imagen se sirve solo desde la ruta controlada cuando la capacitación está publicada. El administrador puede ver la vista previa de borradores.</p>
    {result && <p className={result.status === "error" ? styles.error : styles.success} role={result.status === "error" ? "alert" : "status"}>{result.message}</p>}
  </section>;
}

function RelationForm({ trainingId, kind, operation, targetId, options }: {
  trainingId: string;
  kind: RelationKind;
  operation: "attach" | "detach";
  targetId?: string;
  options?: RelationOption[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveTrainingRelationAction, idle);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return <form action={action} className={styles.relationForm}>
    <input type="hidden" name="trainingId" value={trainingId} />
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="operation" value={operation} />
    {operation === "attach" ? <label><span>{kind === "product" ? "Producto publicado" : "Categoría activa"}</span>
      <select name="targetId" defaultValue="" required disabled={pending || !options?.length}>
        <option value="" disabled>Seleccionar</option>
        {options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label> : <input type="hidden" name="targetId" value={targetId} />}
    <button type="submit" disabled={pending || (operation === "attach" && !options?.length)}>
      {pending ? "Guardando..." : operation === "attach" ? "Asociar" : "Quitar"}
    </button>
    {state.status !== "idle" && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
  </form>;
}

function TrainingRelations({ trainingId, products, categories, productLinks, categoryLinks }: {
  trainingId: string;
  products: TrainingProductOption[];
  categories: TrainingCategoryOption[];
  productLinks: TrainingProductLink[];
  categoryLinks: TrainingCategoryLink[];
}) {
  const linkedProducts = productLinks.filter((item) => item.training_id === trainingId);
  const linkedCategories = categoryLinks.filter((item) => item.training_id === trainingId);
  const productNames = new Map(products.map((item) => [item.id, `${item.sku} · ${item.name}`]));
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
  const availableProducts = products.filter((item) => !linkedProducts.some((link) => link.product_id === item.id))
    .map((item) => ({ id: item.id, label: `${item.sku} · ${item.name}` }));
  const availableCategories = categories.filter((item) => !linkedCategories.some((link) => link.category_id === item.id))
    .map((item) => ({ id: item.id, label: item.name }));

  return <div className={styles.relations}>
    <h3>Relaciones públicas</h3>
    <p className={styles.help}>Vincula productos publicados o categorías activas. En la ficha pública solo aparecerán productos que continúen publicados con sus clasificaciones activas.</p>
    <div className={styles.relationColumns}>
      <section aria-labelledby="training-products-title"><h4 id="training-products-title">Productos</h4>
        {linkedProducts.length === 0 ? <p className={styles.help}>Sin productos vinculados.</p> : (
          <ul className={styles.relationList}>{linkedProducts.map((link) => <li key={link.product_id}>
            <span>{productNames.get(link.product_id) ?? "Producto ya no publicado"}</span>
            <RelationForm trainingId={trainingId} kind="product" operation="detach" targetId={link.product_id} />
          </li>)}</ul>
        )}
        <RelationForm trainingId={trainingId} kind="product" operation="attach" options={availableProducts} />
      </section>
      <section aria-labelledby="training-categories-title"><h4 id="training-categories-title">Categorías</h4>
        {linkedCategories.length === 0 ? <p className={styles.help}>Sin categorías vinculadas.</p> : (
          <ul className={styles.relationList}>{linkedCategories.map((link) => <li key={link.category_id}>
            <span>{categoryNames.get(link.category_id) ?? "Categoría ya no activa"}</span>
            <RelationForm trainingId={trainingId} kind="category" operation="detach" targetId={link.category_id} />
          </li>)}</ul>
        )}
        <RelationForm trainingId={trainingId} kind="category" operation="attach" options={availableCategories} />
      </section>
    </div>
  </div>;
}

export function TrainingAdmin({ trainings, products, categories, productLinks, categoryLinks, publicCatalogConnected, limitedRecords }: {
  trainings: TrainingRow[];
  products: TrainingProductOption[];
  categories: TrainingCategoryOption[];
  productLinks: TrainingProductLink[];
  categoryLinks: TrainingCategoryLink[];
  publicCatalogConnected: boolean;
  limitedRecords: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const training = trainings.find((item) => item.id === selectedId);
  return <div className={styles.shell}>
    <header className={styles.hero}>
      <div><span className="eyebrow">Panel administrativo</span><h1>Capacitaciones</h1><p>Mantén los videos de uso y cuidado de equipos GreenBel.</p></div>
      <div className={styles.links}><Link href="/admin/catalogo" className="secondary-dark-button">Catálogo</Link><Link href="/capacitaciones" className="secondary-dark-button">Vista pública</Link></div>
    </header>
    <p className={styles.notice} role="status">{publicCatalogConnected ? "La biblioteca pública consulta Supabase y solo muestra capacitaciones publicadas con video HTTPS." : "La biblioteca pública sigue en modo DEV sin videos ficticios. Los registros guardados aquí no aparecerán hasta conectar la fuente Supabase."}</p>
    {limitedRecords && <p className={styles.notice}>La vista alcanzó su límite de registros de capacitaciones o relaciones. Amplía la consulta antes de editar elementos que no aparecen aquí.</p>}
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="training-editor-title">
        <div className={styles.panelHeading}><h2 id="training-editor-title">{training ? "Editar video" : "Nuevo video"}</h2><label><span>Seleccionar registro</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Nuevo video</option>{trainings.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.publication_status}</option>)}</select></label></div>
        <TrainingEditor key={training?.id ?? "new"} training={training} />
        {training && <TrainingCoverUpload key={training.id} training={training} />}
        {training && <TrainingRelations trainingId={training.id} products={products} categories={categories} productLinks={productLinks} categoryLinks={categoryLinks} />}
      </section>
      <section className={styles.panel} aria-labelledby="training-list-title"><h2 id="training-list-title">Registros <span>{trainings.length}</span></h2>
        {trainings.length === 0 ? <p className={styles.help}>Todavía no hay capacitaciones guardadas.</p> : <ul className={styles.list}>{trainings.map((item) => <li key={item.id}><strong>{item.title}</strong><small>{item.slug} · {item.publication_status === "published" ? "Publicado" : item.publication_status === "archived" ? "Archivado" : "Borrador"}</small><span>{item.video_url ? "Video HTTPS registrado" : "Sin video"}{item.cover_path ? " · Portada registrada" : ""}</span><button type="button" onClick={() => setSelectedId(item.id)}>Editar</button></li>)}</ul>}
      </section>
    </div>
  </div>;
}
