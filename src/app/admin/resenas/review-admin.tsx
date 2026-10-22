"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { moderateReviewAction, type ReviewModerationState } from "./actions";
import styles from "./reviews-admin.module.css";

export type PendingReviewRow = Readonly<{
  id: string;
  productName: string;
  productSku: string;
  rating: number;
  comment: string;
  createdAt: string;
  moderationStatus: string;
}>;

const idle: ReviewModerationState = { status: "idle", message: "" };

function ReviewCard({ review }: { review: PendingReviewRow }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(moderateReviewAction, idle);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <strong>{review.productName}</strong>
          <small>{review.productSku || "Sin código visible"}</small>
        </div>
        <time dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString("es-GT", {
            timeZone: "America/Guatemala",
          })}
        </time>
      </div>
      <p
        className={styles.rating}
        aria-label={`${review.rating} de 5 estrellas`}
      >
        {"★".repeat(review.rating)}
        {"☆".repeat(5 - review.rating)}
      </p>
      <p className={styles.comment}>{review.comment}</p>
      {review.moderationStatus === "pending" ? (
        <div className={styles.actions}>
          <form action={action}>
            <input type="hidden" name="id" value={review.id} />
            <input type="hidden" name="decision" value="visible" />
            <input type="hidden" name="reason" value="" />
            <button
              type="submit"
              disabled={pending || state.status === "success"}
            >
              Publicar
            </button>
          </form>
          <form action={action}>
            <input type="hidden" name="id" value={review.id} />
            <input type="hidden" name="decision" value="hidden" />
            <label>
              <span>Motivo para ocultar</span>
              <select
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              >
                <option value="">Seleccionar motivo</option>
                <option value="spam">Spam</option>
                <option value="personal_data">Datos personales</option>
                <option value="offensive_content">Contenido ofensivo</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={pending || !reason || state.status === "success"}
            >
              Ocultar
            </button>
          </form>
        </div>
      ) : (
        <span className="admin-tag">
          {review.moderationStatus === "visible" ? "Publicada" : "Oculta"}
        </span>
      )}
      {state.status !== "idle" && (
        <p
          className={state.status === "error" ? styles.error : styles.success}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </article>
  );
}

export function ReviewAdmin({
  reviews,
  hasMore,
}: {
  reviews: PendingReviewRow[];
  hasMore: boolean;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <span className="eyebrow">Panel administrativo</span>
          <h1>Moderar reseñas</h1>
          <p>
            Revisa comentarios de compras entregadas antes de mostrarlos al
            público.
          </p>
        </div>
        <Link href="/admin/catalogo" className="secondary-dark-button">
          Catálogo
        </Link>
      </header>
      <p className={styles.notice}>
        Solo se puede ocultar por spam, datos personales o contenido ofensivo.
        Una calificación baja no es motivo para ocultar.
      </p>
      <section aria-labelledby="pending-reviews-title">
        <h2 id="pending-reviews-title">
          Reseñas <span>{reviews.length}</span>
        </h2>
        {hasMore && (
          <p className={styles.notice}>
            Se muestran las 100 reseñas pendientes más antiguas. Atiende estas
            para ver las siguientes.
          </p>
        )}
        {reviews.length === 0 ? null : (
          <div className={styles.grid}>
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
