"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, MessageSquareQuote, Send, Star } from "lucide-react";
import { CatalogDrawer } from "@/app/admin/catalogo/catalog-drawer";
import { useConfirm } from "@/presentation/notifications/notification-provider";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import styles from "./whatsapp-review.module.css";

export type WhatsAppReviewInvitation = { id: string; reference: string };
export function WhatsAppReviewDrawer({
  invitation,
  onClose,
  onSaved,
}: {
  invitation: WhatsAppReviewInvitation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0),
    [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false),
    [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();
  useNotificationFeedback(
    error ? "error" : saved ? "success" : "idle",
    error || (saved ? "Reseña guardada. Quedó pendiente de moderación." : ""),
  );
  async function close() {
    if (pending) return;
    if (
      !saved &&
      (rating || comment.trim()) &&
      !(await confirm({
        title: "Salir de la reseña",
        message: "Tu reseña aún no se ha guardado. ¿Quieres salir?",
        confirmLabel: "Salir sin guardar",
      }))
    )
      return;
    onClose();
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || saved) return;
    if (!rating || !comment.trim()) {
      setError("Selecciona tus estrellas y escribe un comentario.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/cart/whatsapp/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: invitation.id,
          rating,
          comment: comment.trim(),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const payload = await response.json();
      if (!response.ok || payload.status !== "saved")
        throw Error(
          payload.error || "No se pudo guardar tu reseña. Inténtalo de nuevo.",
        );
      setSaved(true);
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "No pudimos confirmar el guardado. Reintenta; no se duplicará tu reseña.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <CatalogDrawer
      id="whatsapp-review"
      title="Cuéntanos tu experiencia"
      kicker="Tu opinión cuenta"
      closeLabel="Cerrar formulario de reseña"
      busy={pending}
      onClose={() => void close()}
      returnFocusId="whatsapp-review-open"
    >
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.body}>
          {saved ? (
            <div className={styles.saved} role="status">
              <CheckCircle2 size={42} />
              <h3>Gracias por tu opinión</h3>
              <p>
                Tu reseña quedó guardada y pendiente de moderación. GreenBel la
                revisará antes de publicarla.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.intro}>
                <span>
                  <MessageSquareQuote size={25} />
                </span>
                <h3>¿Cómo fue preparar tu solicitud?</h3>
                <p>
                  Comparte tu experiencia con GreenBel al solicitar por
                  WhatsApp.
                </p>
                <small>Selección {invitation.reference}</small>
              </div>
              <fieldset className={styles.rating} disabled={pending}>
                <legend>
                  Tu calificación <span>*</span>
                </legend>
                <div onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} onMouseEnter={() => setHover(value)}>
                      <input
                        type="radio"
                        name="rating"
                        value={value}
                        checked={rating === value}
                        onChange={() => {
                          setRating(value);
                          setError("");
                        }}
                        required
                        aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
                      />
                      <Star
                        size={34}
                        fill={
                          (hover || rating) >= value ? "currentColor" : "none"
                        }
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                </div>
                <p>
                  {rating
                    ? `${rating} de 5 estrellas`
                    : "Selecciona de 1 a 5 estrellas"}
                </p>
              </fieldset>
              <label className={styles.comment}>
                Tu comentario <span>*</span>
                <textarea
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value);
                    setError("");
                  }}
                  name="comment"
                  required
                  maxLength={3000}
                  rows={6}
                  placeholder="¿Qué fue útil? ¿Qué podemos mejorar?"
                  disabled={pending}
                  aria-describedby="review-privacy"
                />
                <small>
                  {comment.length.toLocaleString("es-GT")} / 3,000 caracteres
                </small>
              </label>
              <p id="review-privacy" className={styles.note}>
                Tu comentario y nombre de pila podrán mostrarse al publicarse.
                Evita incluir teléfono, correo o datos personales. Esta opinión
                corresponde a tu experiencia de solicitud por WhatsApp.
              </p>
            </>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          {saved ? (
            <button
              type="button"
              className="primary-button full-width"
              onClick={onClose}
            >
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                className="secondary-dark-button"
                disabled={pending}
                onClick={() => void close()}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={pending || !rating || !comment.trim()}
              >
                <Send size={18} />
                {pending ? "Guardando…" : "Enviar reseña"}
              </button>
            </>
          )}
        </footer>
      </form>
    </CatalogDrawer>
  );
}
