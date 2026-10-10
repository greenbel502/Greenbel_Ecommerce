"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { quoteSelectionSignature } from "@/domain/quotes/selection-signature";
import { useCart } from "@/presentation/providers/cart-provider";

const financingSchema = z.object({
  name: z.string().trim().min(3, "Ingresa tu nombre completo").max(160, "Usa un máximo de 160 caracteres"),
  email: z.email("Ingresa un correo válido").max(254, "Usa un máximo de 254 caracteres"),
  phone: z.string().trim().refine((value) => !value || /^\+?[0-9\s-]{8,15}$/.test(value), "Ingresa un teléfono válido").optional(),
  message: z.string().trim().max(500, "Usa un máximo de 500 caracteres").optional(),
  consent: z.boolean().refine(Boolean, "Debes autorizar compartir tus datos con la cooperativa antes de continuar")
});

type FinancingFields = z.infer<typeof financingSchema>;
type IssuedQuote = { quoteId: string; reference: string; downloadToken: string; selectionSignature: string };

export function FinancingForm() {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [quote, setQuote] = useState<IssuedQuote | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const { lines, restoreStatus, storageError } = useCart();
  const quoteMatchesCart = Boolean(quote && restoreStatus === "ready" && !storageError
    && quote.selectionSignature === quoteSelectionSignature(lines));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FinancingFields>({
    resolver: zodResolver(financingSchema),
    defaultValues: { consent: false }
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("greenbel-current-quote-v1");
      if (!raw) return;
      const data: unknown = JSON.parse(raw);
      if (typeof data === "object" && data !== null
        && "quoteId" in data && typeof data.quoteId === "string"
        && "reference" in data && typeof data.reference === "string"
        && "downloadToken" in data && typeof data.downloadToken === "string"
        && "selectionSignature" in data && typeof data.selectionSignature === "string") {
        setQuote({ quoteId: data.quoteId, reference: data.reference,
          downloadToken: data.downloadToken, selectionSignature: data.selectionSignature });
      }
    } catch {
      // A missing or invalid browser session never authorizes the draft.
    }
  }, []);

  const submit = handleSubmit(async (values) => {
    setSubmissionError(null);
    setSubmissionSuccess(false);
    if (!quote || !quoteMatchesCart) {
      setSubmissionError("Primero emite una cotización privada para la selección actual del carrito.");
      return;
    }
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/financiamiento/borradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          quoteId: quote.quoteId,
          quoteAccessToken: quote.downloadToken,
          applicantName: values.name,
          email: values.email,
          phone: values.phone || null,
          message: values.message || null,
          consent: values.consent
        })
      });
      const result: unknown = await response.json();
      if (response.ok && typeof result === "object" && result !== null
        && "status" in result && result.status === "draft_recorded"
        && "verification" in result && result.verification === "pending"
        && "delivery" in result && result.delivery === "disabled") {
        setSubmissionSuccess(true);
        return;
      }
      setSubmissionError(response.status === 403
        ? "El acceso a la cotización venció o no es válido. Emite una nueva cotización desde el carrito."
        : response.status === 409
          ? "Los datos cambiaron durante un reintento. Revísalos e inicia un borrador nuevo."
          : "No pudimos confirmar el registro del borrador. Tus datos siguen aquí; reintenta.");
    } catch {
      setSubmissionError("No pudimos confirmar el registro del borrador. Tus datos siguen aquí; reintenta.");
    }
  });

  return (
    <form className="financing-form" onSubmit={submit} onChange={() => {
      setSubmissionError(null);
      setSubmissionSuccess(false);
      idempotencyKey.current = null;
    }} noValidate>
      <div className="financing-form-heading">
        <span className="eyebrow">Financiamiento</span>
        <h2>Solicita información de crédito</h2>
        <p>El borrador se guarda únicamente con una cotización PDF emitida. La verificación de correo y el envío a la cooperativa permanecen pausados.</p>
      </div>

      <div className="financing-privacy-note">
        <LockKeyhole size={17} />
        <p>{quoteMatchesCart && quote ? <>Cotización privada para este carrito: <strong>{quote.reference}</strong>.</>
          : restoreStatus === "loading" ? <>Actualizando la selección del carrito antes de comprobar la cotización.</>
            : <>No hay una cotización privada para la selección actual. <Link href="/carrito">Ve al carrito para emitirla.</Link></>}</p>
      </div>

      <div className="financing-form-grid">
        <Field label="Nombre completo" error={errors.name?.message}>
          <input {...register("name")} autoComplete="name" placeholder="Tu nombre" disabled={isSubmitting} />
        </Field>
        <Field label="Correo" error={errors.email?.message}>
          <input {...register("email")} type="email" autoComplete="email" placeholder="tu@correo.com" disabled={isSubmitting} />
        </Field>
        <Field label="Teléfono (opcional)" error={errors.phone?.message} wide>
          <input {...register("phone")} inputMode="tel" autoComplete="tel" placeholder="Ej. 5555 5555" disabled={isSubmitting} />
        </Field>
        <Field label="¿Qué deseas financiar? (opcional)" error={errors.message?.message} wide>
          <textarea {...register("message")} placeholder="Cuéntanos qué equipo o proyecto tienes en mente." disabled={isSubmitting} />
        </Field>
      </div>

      <label className="financing-privacy-note">
        <input {...register("consent")} type="checkbox" aria-invalid={Boolean(errors.consent)} disabled={isSubmitting} />
        <span>Autorizo a GreenBel a compartir mis datos y la cotización que seleccione con Cooperativa Concepción R.L. solo después de verificar mi correo y de que confirme el envío.</span>
      </label>
      {errors.consent && <span className="field-error" role="alert">{errors.consent.message}</span>}

      <div className="financing-privacy-note">
        <LockKeyhole size={17} />
        <p><strong>Envío pausado.</strong> Si se confirma el registro, quedará solo como borrador. No se verifica el correo ni se envía a la cooperativa. La aprobación, tasa y condiciones dependen exclusivamente de ella.</p>
      </div>

      {submissionError && (
        <div className="financing-privacy-note" role="alert">
          <span>{submissionError}</span>
        </div>
      )}

      {submissionSuccess && (
        <div className="financing-success" role="status">
          <span>Borrador registrado. La verificación de correo y el envío a la cooperativa siguen pendientes; no se envió ningún mensaje.</span>
        </div>
      )}

      <button className="primary-button financing-submit" type="submit" disabled={!quoteMatchesCart || isSubmitting || submissionSuccess}>
        <Send size={17} /> {isSubmitting ? "Guardando…" : "Registrar borrador"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  wide = false,
  children
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "field-wide" : ""}>
      <span>{label}</span>
      {children}
      {error && <small className="field-error" role="alert">{error}</small>}
    </label>
  );
}
