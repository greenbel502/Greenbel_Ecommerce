"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";
import Link from "next/link";
import { useActionState, useState, useEffect, useRef } from "react";
import { Star, Check } from "lucide-react";
import {
  rateTraining,
  type TrainingRatingState,
} from "@/app/capacitaciones/rating-actions";
import type { RatingViewer } from "@/lib/trainings/types";
import styles from "@/app/capacitaciones/training.module.css";
const initial: TrainingRatingState = { status: "idle", message: "" };
export function TrainingRatingForm({
  id,
  viewer,
}: {
  id: string;
  viewer: RatingViewer;
}) {
  const [state, action, pending] = useActionState(
    rateTraining.bind(null, id),
    initial,
  );
  useNotificationFeedback(state.status, state.message);
  const [selected, setSelected] = useState(viewer.rating ?? 0),
    [hover, setHover] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  // React form actions reset native controls after resolving, including error results.
  // Restore the controlled choice so the visible stars and submitted radio stay in sync.
  useEffect(() => {
    form.current
      ?.querySelectorAll<HTMLInputElement>('input[name="rating"]')
      .forEach((input) => {
        input.checked = Number(input.value) === selected;
      });
  }, [state, selected]);
  const saved = state.status === "success" ? state.rating : viewer.rating;
  return (
    <section
      className={styles.ratingPanel}
      aria-labelledby="rate-training-title"
    >
      <span className="eyebrow">Tu opinión nos ayuda</span>
      <h2 id="rate-training-title">¿Qué te pareció el video?</h2>
      <p>Califica esta capacitación de 1 a 5 estrellas.</p>
      {viewer.status === "unauthenticated" && (
        <Link className="secondary-dark-button" href="/cuenta/ingresar">
          Iniciar sesión para calificar
        </Link>
      )}
      {viewer.status === "inactive" && (
        <p role="alert">Tu cuenta no está activa para enviar calificaciones.</p>
      )}
      {viewer.status === "unavailable" && (
        <p role="alert">
          No se pudo consultar tu calificación. Actualiza la página para
          reintentar.
        </p>
      )}
      {viewer.status === "ready" && (
        <form
          ref={form}
          action={action}
          onReset={(event) => event.preventDefault()}
        >
          <fieldset disabled={pending} className={styles.ratingChoices}>
            <legend>Tu calificación</legend>
            <div onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} onMouseEnter={() => setHover(value)}>
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={selected === value}
                    onChange={() => setSelected(value)}
                    required
                    aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
                  />
                  <Star
                    aria-hidden="true"
                    size={32}
                    fill={
                      (hover || selected) >= value ? "currentColor" : "none"
                    }
                  />
                </label>
              ))}
            </div>
            <span className={styles.ratingHint}>
              {selected
                ? `${selected} de 5 estrellas`
                : "Selecciona una estrella"}
            </span>
          </fieldset>
          <button
            type="submit"
            className="primary-button"
            disabled={pending || !selected || selected === saved}
          >
            {pending
              ? "Guardando…"
              : saved
                ? "Actualizar calificación"
                : "Guardar calificación"}
          </button>
          {saved && (
            <p className={styles.savedRating}>
              <Check size={16} /> Tu calificación guardada: {saved} de 5.
            </p>
          )}
          {state.status !== "idle" && (
            <p role={state.status === "error" ? "alert" : "status"}>
              {state.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
