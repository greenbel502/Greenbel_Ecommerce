/* eslint-disable @next/next/no-img-element -- Controlled private media routes and local object URL previews. */
"use client";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Eye,
  Film,
  ImageIcon,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import type {
  TrainingRecord,
  TrainingRating,
  RatingOverview,
} from "@/lib/trainings/types";
import { TrainingStars } from "@/presentation/components/training-stars";
import { CatalogDrawer } from "../catalogo/catalog-drawer";
import { CatalogDeleteDialog } from "../catalogo/catalog-delete-dialog";
import { TrainingEditor } from "./training-editor";
import { TrainingRelations } from "./training-relations";
import styles from "./training-admin.module.css";
export type TrainingRow = TrainingRecord;
export type TrainingProductOption = { id: string; name: string; sku: string };
export type TrainingCategoryOption = { id: string; name: string };
export type TrainingProductLink = { training_id: string; product_id: string };
export type TrainingCategoryLink = { training_id: string; category_id: string };
type Relations = {
  products: TrainingProductOption[];
  categories: TrainingCategoryOption[];
  productLinks: TrainingProductLink[];
  categoryLinks: TrainingCategoryLink[];
};
export function TrainingAdmin({
  trainings,
  listRows,
  selectedId,
  controls,
  pager,
  products,
  categories,
  productLinks,
  categoryLinks,
  ratings,
  publicCatalogConnected,
}: {
  trainings: TrainingRow[];
  listRows: TrainingRow[];
  selectedId: string;
  controls: ReactNode;
  pager: ReactNode;
  limitedRecords: boolean;
  publicCatalogConnected: boolean;
  products: TrainingProductOption[];
  categories: TrainingCategoryOption[];
  productLinks: TrainingProductLink[];
  categoryLinks: TrainingCategoryLink[];
  ratings: { stats: TrainingRating[]; overview: RatingOverview } | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(selectedId),
    [row, setRow] = useState(trainings.find((t) => t.id === selectedId)),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState(0),
    [localRows, setLocalRows] = useState<Record<string, TrainingRow>>({});
  const [relations, setRelations] = useState<Relations>({
      products,
      categories,
      productLinks,
      categoryLinks,
    }),
    [loadError, setLoadError] = useState(""),
    [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<TrainingRow | null>(null),
    [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set()),
    [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null),
    currentId = useRef(editing);
  const load = useCallback(async (id: string) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/admin/trainings/${id}`, {
        cache: "no-store",
        signal: AbortSignal.any([c.signal, AbortSignal.timeout(10000)]),
      });
      const data = await response.json();
      if (!response.ok || data.training?.id !== id)
        throw Error(data.error || "No se pudieron consultar los detalles.");
      if (c.signal.aborted || currentId.current !== id) return;
      setRow(data.training);
      setRelations(data);
    } catch (error) {
      if (!c.signal.aborted && currentId.current === id)
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los detalles.",
        );
    } finally {
      if (!c.signal.aborted && currentId.current === id) setLoading(false);
    }
  }, []);
  function url(id: string, replace = false) {
    const value = new URL(window.location.href);
    if (id) value.searchParams.set("edit", id);
    else value.searchParams.delete("edit");
    value.hash = "";
    window.history[replace ? "replaceState" : "pushState"](
      {},
      "",
      value.pathname + value.search,
    );
  }
  function open(id: string) {
    controller.current?.abort();
    currentId.current = id;
    setEditing(id);
    setSession((s) => s + 1);
    setLoadError("");
    setLoading(false);
    setRow(
      id === "new"
        ? undefined
        : localRows[id] || trainings.find((t) => t.id === id),
    );
    setRelations({
      products: [],
      categories: [],
      productLinks: [],
      categoryLinks: [],
    });
    url(id);
    if (id !== "new") void load(id);
  }
  async function close() {
    if (busy) return;
    if (
      document.querySelector('#editor-capacitacion [data-dirty="true"]') &&
      !(await confirm({
        title: "Descartar cambios",
        message: "Tienes cambios sin guardar. ¿Quieres cerrar y descartarlos?",
        confirmLabel: "Descartar",
      }))
    )
      return;
    controller.current?.abort();
    currentId.current = "";
    setEditing("");
    setRow(undefined);
    url("");
  }
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const pop = () => {
      controller.current?.abort();
      const id = new URLSearchParams(window.location.search).get("edit") ?? "";
      currentId.current = id;
      setEditing(id);
      setSession((s) => s + 1);
      setRow(trainings.find((t) => t.id === id));
      if (id && id !== "new") void load(id);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [load, trainings]);
  const relationChanged = useCallback(() => {
    if (currentId.current && currentId.current !== "new")
      void load(currentId.current);
    router.refresh();
  }, [load, router]);
  const overview = ratings?.overview;
  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <span className="eyebrow">Panel administrativo</span>
          <h1>Capacitaciones</h1>
          <p>Comparte conocimiento y conoce la opinión de tus clientes.</p>
        </div>
        <div className={styles.links}>
          <Link className={styles.secondary} href="/capacitaciones">
            <Eye size={17} />
            Vista pública
          </Link>
          <button
            id="new-training"
            type="button"
            className={styles.primary}
            onClick={() => open("new")}
          >
            <Plus size={18} />
            Nueva capacitación
          </button>
        </div>
      </header>
      <div className={styles.metrics}>
        <section>
          <span>
            <Star size={19} />
            Calificación general
          </span>
          <TrainingStars
            average={overview?.average_rating ?? null}
            count={Number(overview?.rating_count ?? 0)}
            unavailable={!ratings}
          />
          <p>Promedio de todas las calificaciones recibidas.</p>
        </section>
        <section>
          <span>
            <Users size={19} />
            Calificaciones recibidas
          </span>
          <strong>
            {overview
              ? Number(overview.rating_count).toLocaleString("es-GT")
              : "—"}
          </strong>
          <p>Una calificación por cuenta y video.</p>
        </section>
        <section>
          <span>
            <BookOpen size={19} />
            Capacitaciones valoradas
          </span>
          <strong>
            {overview
              ? Number(overview.rated_trainings).toLocaleString("es-GT")
              : "—"}
          </strong>
          <p>Videos que ya tienen opiniones de clientes.</p>
        </section>
      </div>
      {!publicCatalogConnected && (
        <p className={styles.notice}>
          La biblioteca pública está en modo de demostración. Los cambios se
          guardan en desarrollo.
        </p>
      )}
      <section
        className={styles.listPanel}
        aria-labelledby="training-list-title"
      >
        <div className={styles.listHeading}>
          <h2 id="training-list-title" tabIndex={-1}>
            Biblioteca de capacitaciones
          </h2>
          <p>
            Edita el contenido, revisa su publicación y consulta sus
            calificaciones.
          </p>
        </div>
        {controls}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Capacitación</th>
                <th scope="col">Estado</th>
                <th scope="col">Calificación</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listRows
                .filter((item) => !deletedIds.has(item.id))
                .map((original) => {
                  const item = localRows[original.id] ?? original;
                  const rating = ratings?.stats.find(
                    (r) => r.training_id === item.id,
                  );
                  return (
                    <tr key={item.id} data-selected={editing === item.id}>
                      <td>
                        <div className={styles.identity}>
                          <div className={styles.thumbnail}>
                            {item.cover_path ? (
                              <img
                                src={`/api/training-covers/${item.id}?v=${encodeURIComponent(item.cover_path)}`}
                                alt=""
                              />
                            ) : (
                              <ImageIcon size={23} />
                            )}
                          </div>
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              <Film size={13} />
                              {item.video_storage_path
                                ? "Video adjunto"
                                : item.video_url
                                  ? "Video por enlace"
                                  : "Sin video"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.badge}>
                          {
                            {
                              published: "Publicado",
                              draft: "Borrador",
                              archived: "Archivado",
                            }[item.publication_status]
                          }
                        </span>
                      </td>
                      <td>
                        <TrainingStars
                          average={rating?.average_rating ?? null}
                          count={Number(rating?.rating_count ?? 0)}
                          unavailable={!ratings}
                        />
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          {item.publication_status === "published" && (
                            <Link
                              className={styles.secondary}
                              href={`/capacitaciones/${item.slug}`}
                              aria-label={`Ver ${item.title}`}
                            >
                              <Eye size={16} />
                            </Link>
                          )}
                          <button
                            id={`edit-training-${item.id}`}
                            type="button"
                            onClick={() => open(item.id)}
                            className={styles.secondary}
                            aria-label={`Editar ${item.title}`}
                          >
                            <Pencil size={16} />
                            Editar
                          </button>
                          <button
                            type="button"
                            className={styles.deleteAction}
                            aria-label={`Eliminar ${item.title}`}
                            onClick={() => setDeleting(item)}
                          >
                            <Trash2 size={16} />
                            Eliminar
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
      </section>
      {deleting && (
        <CatalogDeleteDialog
          kind="training"
          record={{ id: deleting.id, name: deleting.title }}
          onClose={() => setDeleting(null)}
          onDeleted={(id, message) => {
            setDeletedIds((ids) => new Set(ids).add(id));
            setNotice(message);
            setDeleting(null);
            if (currentId.current === id) {
              controller.current?.abort();
              currentId.current = "";
              setEditing("");
              setRow(undefined);
              url("", true);
            }
            router.refresh();
          }}
        />
      )}
      {editing && (
        <CatalogDrawer
          id="editor-capacitacion"
          title={
            row?.title ??
            (editing === "new"
              ? "Nueva capacitación"
              : "Cargando capacitación…")
          }
          kicker={
            editing === "new" ? "Crear capacitación" : "Editar capacitación"
          }
          busy={busy}
          onClose={close}
          returnFocusId={
            editing === "new" ? "new-training" : `edit-training-${editing}`
          }
          closeLabel="Cerrar editor de capacitación"
          className={styles.drawer}
        >
          {row || editing === "new" ? (
            <TrainingEditor
              key={session}
              training={row}
              onBusy={setBusy}
              onIdCreated={(created) => {
                if (currentId.current === "new") {
                  // Keep the editor mounted while its files are uploading. The
                  // relation request must not be responsible for providing the
                  // newly created row: removing the editor aborts that upload.
                  setRow(created);
                  currentId.current = created.id;
                  setEditing(created.id);
                  url(created.id, true);
                  void load(created.id);
                }
              }}
              onSaved={(saved) => {
                setRow(saved);
                setLocalRows((rows) => ({ ...rows, [saved.id]: saved }));
                router.refresh();
              }}
              relations={
                <div className={styles.editorSection}>
                  <h3>Productos y categorías relacionados</h3>
                  {loading && (
                    <p role="status" className={styles.help}>
                      Actualizando asociaciones…
                    </p>
                  )}
                  {loadError && (
                    <p role="alert" className={styles.error}>
                      {loadError}{" "}
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => void load(editing)}
                      >
                        Reintentar
                      </button>
                    </p>
                  )}
                  <TrainingRelations
                    trainingId={editing}
                    {...relations}
                    onChanged={relationChanged}
                  />
                </div>
              }
            />
          ) : (
            <div className={styles.editorSection}>
              <p role={loadError ? "alert" : "status"}>
                {loadError || "Cargando los detalles de la capacitación…"}
              </p>
              {loadError && (
                <button
                  className={styles.secondary}
                  type="button"
                  onClick={() => void load(editing)}
                >
                  Reintentar
                </button>
              )}
            </div>
          )}
        </CatalogDrawer>
      )}
    </div>
  );
}
