"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eye,
  MessageSquareQuote,
  ShieldCheck,
  Star,
} from "lucide-react";
import { CatalogDrawer } from "../catalogo/catalog-drawer";
import { moderateReviewAction, type ReviewModerationState } from "./actions";
import {
  reviewReasons,
  reviewStatusLabel,
  type AdminReview,
} from "@/lib/reviews/types";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import styles from "./reviews-admin.module.css";

const idle: ReviewModerationState = { status: "idle", message: "" };
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("es-GT", {
    timeZone: "America/Guatemala",
  });

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className={styles.stars}
      role="img"
      aria-label={`${rating} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={16}
          aria-hidden="true"
          fill={n <= rating ? "currentColor" : "none"}
        />
      ))}
      <strong aria-hidden="true">{rating}/5</strong>
    </span>
  );
}

function ReviewEditor({
  review,
  onClose,
  onSaved,
}: {
  review: AdminReview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<"visible" | "hidden">(
    review.moderationStatus === "pending" ? "visible" : review.moderationStatus,
  );
  const [reason, setReason] = useState(review.moderationReason ?? "");
  const confirm = useConfirm();
  const [state, action, pending] = useActionState(
    async (previous: ReviewModerationState, data: FormData) => {
      if (
        !(await confirm({
          title: decision === "visible" ? "Publicar reseña" : "Ocultar reseña",
          message:
            decision === "visible"
              ? "La opinión será visible al público con su calificación y comentario original."
              : "La opinión se ocultará y quedará registrado el motivo seleccionado.",
          confirmLabel:
            decision === "visible" ? "Publicar reseña" : "Ocultar reseña",
        }))
      )
        return previous;
      return moderateReviewAction(previous, data);
    },
    idle,
  );
  useNotificationFeedback(state.status, state.message);
  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [state, onSaved]);
  const changed =
    decision !== review.moderationStatus ||
    (decision === "hidden" && reason !== review.moderationReason);
  return (
    <CatalogDrawer
      id="review-editor"
      title="Revisar reseña"
      kicker="Moderación"
      closeLabel="Cerrar reseña"
      busy={pending}
      onClose={onClose}
      returnFocusId={`review-${review.source}-${review.id}`}
    >
      <form
        action={action}
        className={styles.editorForm}
        onReset={(e) => e.preventDefault()}
      >
        <input type="hidden" name="id" value={review.id} />
        <input type="hidden" name="source" value={review.source} />
        <input
          type="hidden"
          name="expectedStatus"
          value={review.moderationStatus}
        />
        <div className={styles.editorContent}>
          <section className={styles.detail}>
            <div className={styles.author}>
              <span className={styles.avatar}>
                {review.customerName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h3>{review.customerName}</h3>
                <time dateTime={review.createdAt}>
                  {dateLabel(review.createdAt)}
                </time>
              </div>
              <span className={styles.tag}>
                {reviewStatusLabel[review.moderationStatus]}
              </span>
            </div>
            <Stars rating={review.rating} />
            <blockquote>{review.comment}</blockquote>
            <dl className={styles.origin}>
              <div>
                <dt>Origen</dt>
                <dd>
                  {review.source === "whatsapp"
                    ? "Solicitud por WhatsApp"
                    : "Compra entregada"}
                </dd>
              </div>
              <div>
                <dt>
                  {review.source === "whatsapp"
                    ? "Referencia de selección"
                    : "Producto"}
                </dt>
                <dd>
                  {review.subject}
                  <small>{review.reference}</small>
                </dd>
              </div>
            </dl>
          </section>
          <section className={styles.detail}>
            <h3>
              <ShieldCheck size={19} /> Visibilidad de la reseña
            </h3>
            <p>
              Conserva las palabras y la calificación del cliente. Una
              valoración baja no es motivo para ocultar.
            </p>
            <label>
              Acción
              <select
                name="decision"
                value={decision}
                onChange={(e) =>
                  setDecision(e.target.value as "visible" | "hidden")
                }
                disabled={pending}
              >
                <option value="visible">Publicar reseña</option>
                <option value="hidden">Ocultar con motivo</option>
              </select>
            </label>
            {decision === "hidden" && (
              <label>
                Motivo para ocultar
                <select
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  disabled={pending}
                >
                  <option value="">Selecciona un motivo</option>
                  {Object.entries(reviewReasons).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {decision !== "hidden" && (
              <input type="hidden" name="reason" value="" />
            )}
          </section>
          {state.message && (
            <p
              className={styles.feedback}
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.message}
            </p>
          )}
        </div>
        <footer className={styles.editorFooter}>
          <button
            type="button"
            className="secondary-dark-button"
            onClick={onClose}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={pending || !changed || (decision === "hidden" && !reason)}
          >
            <Check size={18} />
            {pending ? "Guardando…" : "Guardar moderación"}
          </button>
        </footer>
      </form>
    </CatalogDrawer>
  );
}

export function ReviewAdmin({
  reviews,
  total,
  controls,
  pager,
  empty,
}: {
  reviews: AdminReview[];
  total: number;
  controls: ReactNode;
  pager: ReactNode;
  empty: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdminReview | null>(null);
  return (
    <section className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <span className="eyebrow">Panel administrativo</span>
          <h1>Reseñas de clientes</h1>
          <p>
            Revisa las opiniones, sus estrellas y su publicación desde un solo
            lugar.
          </p>
        </div>
      </header>
      <div className={styles.notice}>
        <ShieldCheck size={20} />
        <p>
          Publica opiniones auténticas. Oculta únicamente spam, datos personales
          o contenido ofensivo.
        </p>
      </div>
      {controls}
      <div className={styles.listHeading}>
        <h2>
          Listado de reseñas <span>{total}</span>
        </h2>
        <small>Las nuevas opiniones requieren moderación.</small>
      </div>
      {reviews.length ? (
        <div
          className={styles.tableWrap}
          role="region"
          aria-label="Reseñas de clientes"
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente y opinión</th>
                <th>Origen</th>
                <th>Calificación</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={`${r.source}-${r.id}`}>
                  <td>
                    <div className={styles.customer}>
                      <span className={styles.avatar}>
                        {r.customerName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{r.customerName}</strong>
                        <p>{r.comment}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong className={styles.source}>
                      {r.source === "whatsapp" ? "WhatsApp" : "Producto"}
                    </strong>
                    <small className={styles.reference}>
                      {r.reference || r.subject}
                    </small>
                  </td>
                  <td>
                    <Stars rating={r.rating} />
                  </td>
                  <td>
                    <span
                      className={`${styles.tag} ${styles[r.moderationStatus]}`}
                    >
                      {reviewStatusLabel[r.moderationStatus]}
                    </span>
                  </td>
                  <td>
                    <time dateTime={r.createdAt}>{dateLabel(r.createdAt)}</time>
                  </td>
                  <td>
                    <button
                      type="button"
                      id={`review-${r.source}-${r.id}`}
                      className={styles.rowAction}
                      onClick={() => setSelected(r)}
                    >
                      <Eye size={16} />
                      Revisar
                      <span className={styles.srOnly}>
                        {" "}
                        reseña de {r.customerName}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>
          <MessageSquareQuote size={28} />
          {empty}
        </div>
      )}
      {pager}
      {selected && (
        <ReviewEditor
          key={`${selected.source}-${selected.id}`}
          review={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
