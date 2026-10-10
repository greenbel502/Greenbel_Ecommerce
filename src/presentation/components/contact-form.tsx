"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { z } from "zod";
import { AnimatedTitle, Reveal } from "./motion-primitives";

const schema = z.object({
  name: z.string().trim().min(2, "Ingresa tu nombre").max(160, "Usa un máximo de 160 caracteres"),
  phone: z.string().trim().max(40, "Usa un máximo de 40 caracteres")
    .refine((value) => !value || value.length >= 8, "Ingresa un teléfono válido"),
  email: z.email("Ingresa un correo válido").max(254, "Usa un máximo de 254 caracteres"),
  type: z.string().trim().min(1).max(120),
  product: z.string().trim().max(160, "Usa un máximo de 160 caracteres").optional(),
  message: z.string().trim().min(10, "Cuéntanos un poco más para poder orientarte")
    .max(5000, "Usa un máximo de 5000 caracteres")
});
type ContactFields = z.infer<typeof schema>;

export function ContactForm() {
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ContactFields>({ resolver: zodResolver(schema), defaultValues: { type: "Comprar un equipo" } });
  const submit = handleSubmit(async (values) => {
    setSubmissionError(null);
    setSubmissionSuccess(false);
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          name: values.name,
          email: values.email,
          phone: values.phone || null,
          type: values.type || null,
          product: values.product || null,
          message: values.message
        })
      });
      const result: unknown = await response.json();
      if (response.ok && typeof result === "object" && result !== null
        && "status" in result && result.status === "recorded"
        && "notification" in result && result.notification === "disabled") {
        idempotencyKey.current = null;
        reset({ name: "", phone: "", email: "", type: "Comprar un equipo", product: "", message: "" });
        setSubmissionSuccess(true);
        return;
      }
      setSubmissionError(response.status === 409
        ? "Esta consulta cambió durante un reintento. Revísala y vuelve a registrarla."
        : response.status === 429
          ? "Se alcanzó el límite temporal de consultas. Tus datos siguen en el formulario; intenta más tarde."
        : "No se pudo confirmar el registro de tu consulta. Tus datos siguen en el formulario; intenta de nuevo.");
    } catch {
      setSubmissionError("No se pudo confirmar el registro de tu consulta. Tus datos siguen en el formulario; intenta de nuevo.");
    }
  });
  return (
    <form className="contact-form" onSubmit={submit} onChange={() => {
      setSubmissionError(null);
      setSubmissionSuccess(false);
      idempotencyKey.current = null;
    }} noValidate>
      <div className="form-heading">
        <Reveal as="span" className="eyebrow">Cuéntanos qué necesitas</Reveal>
        <AnimatedTitle lines={["Solicita asesoría"]} />
        <Reveal as="p" delay={0.16}>Te orientaremos según el tipo de trabajo y el equipo que ya utilizas.</Reveal>
        <p>Tu consulta se registra solo cuando recibes la confirmación en pantalla. El correo a GreenBel permanece pausado.</p>
      </div>
      <div className="form-grid">
        <Field label="Nombre" error={errors.name?.message}>
          <input {...register("name")} autoComplete="name" disabled={isSubmitting} />
        </Field>
        <Field label="Teléfono (opcional)" error={errors.phone?.message}>
          <input {...register("phone")} inputMode="tel" autoComplete="tel" disabled={isSubmitting} />
        </Field>
        <Field label="Correo" error={errors.email?.message} wide>
          <input {...register("email")} type="email" autoComplete="email" disabled={isSubmitting} />
        </Field>
        <Field label="Tipo de consulta">
          <select {...register("type")} disabled={isSubmitting}>
            {[
              "Comprar un equipo",
              "Solicitar asesoría",
              "Buscar un repuesto",
              "Reparar un equipo",
              "Garantía",
              "Distribución",
              "Otro"
            ].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Producto o código">
          <input {...register("product")} placeholder="Ej. AK-26GX" disabled={isSubmitting} />
        </Field>
        <Field label="Mensaje" error={errors.message?.message} wide>
          <textarea
            {...register("message")}
            placeholder="Describe el cultivo, terreno, jornada o equipo que deseas atender."
            disabled={isSubmitting}
          />
        </Field>
      </div>
      {submissionError && (
        <div className="financing-privacy-note" role="alert">
          <span>{submissionError}</span>
        </div>
      )}
      {submissionSuccess && (
        <div className="financing-success" role="status">
          <span>Consulta registrada. No se envió un correo; la notificación permanece pausada.</span>
        </div>
      )}
      <button className="primary-button" type="submit" disabled={isSubmitting}>
        <Send size={17} /> {isSubmitting ? "Guardando…" : "Registrar consulta"}
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
      {label}
      {children}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
