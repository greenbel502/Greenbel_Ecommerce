"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  submitProductReviewAction,
  type ProductReviewActionState,
  type ReviewEligibility
} from "@/app/productos/review-actions";

const idle: ProductReviewActionState = { status: "idle", message: "" };

export function ProductReviewForm({ productId, eligibility }: {
  productId: string;
  eligibility: ReviewEligibility;
}) {
  const [state, action, pending] = useActionState(submitProductReviewAction.bind(null, productId), idle);

  return <section aria-labelledby="review-form-title" className="section contact-form">
    <div className="form-heading">
      <span className="eyebrow">Compra entregada</span>
      <h2 id="review-form-title">Comparte tu experiencia</h2>
      <p>Tu reseña quedará pendiente de moderación antes de aparecer en la ficha.</p>
    </div>
    {eligibility.status === "unauthenticated" && (
      <p>Para opinar sobre una compra entregada, <Link href="/cuenta/ingresar">inicia sesión</Link> con la cuenta que hizo el pedido.</p>
    )}
    {eligibility.status === "unavailable" && (
      <p role="alert">No se pudo consultar tus compras entregadas. Inténtalo más tarde.</p>
    )}
    {eligibility.status === "inactive" && (
      <p role="alert">Tu cuenta no está activa para registrar reseñas.</p>
    )}
    {eligibility.status === "ready" && eligibility.items.length === 0 && (
      <p>No encontramos una compra entregada de este producto en tu cuenta.</p>
    )}
    {eligibility.status === "ready" && eligibility.items.length > 0 && (
      <form action={action}>
        <div className="financing-form-grid">
          <label>
            <span>Compra entregada</span>
            <select name="orderItemId" required defaultValue="">
              <option value="" disabled>Selecciona un pedido</option>
              {eligibility.items.map((item) => <option key={item.id} value={item.id}>Pedido {item.orderReference}</option>)}
            </select>
          </label>
          <label>
            <span>Calificación</span>
            <select name="rating" required defaultValue="">
              <option value="" disabled>Selecciona de 1 a 5</option>
              {[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating} de 5</option>)}
            </select>
          </label>
          <label className="field-wide">
            <span>Comentario</span>
            <textarea name="comment" required minLength={1} maxLength={3000} rows={5} placeholder="Describe tu experiencia con este producto." />
          </label>
        </div>
        <button className="primary-button" type="submit" disabled={pending || state.status === "success"}>
          {pending ? "Registrando…" : state.status === "success" ? "Reseña registrada" : "Enviar reseña a moderación"}
        </button>
        {state.status !== "idle" && (
          <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
        )}
      </form>
    )}
  </section>;
}
