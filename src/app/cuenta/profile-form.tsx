"use client";
import { useNotificationFeedback } from "@/presentation/notifications/notify";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera, Check, LoaderCircle, Save } from "lucide-react";
import { saveCustomerProfile, type ProfileActionState } from "./profile-actions";
import styles from "./profile.module.css";
import { CustomerAvatar } from "@/presentation/components/customer-avatar";
import { notifyAccountUpdated } from "@/presentation/events/account-events";

export function AvatarEditor({ src, name, customPhoto }: { src: string | null; name: string; customPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  useNotificationFeedback(feedback ? (feedback.error ? "error" : "success") : "idle", feedback?.text);
  async function save(file?: File) {
    if (busy) return;
    if (file && (file.size > 2_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setFeedback({ error: true, text: "Elige una foto JPG, PNG o WebP de hasta 2 MB." }); return;
    }
    setBusy(true); setFeedback(null);
    try {
      const body = file ? new FormData() : undefined;
      if (body && file) body.set("image", file);
      const response = await fetch("/api/account/avatar", { method: file ? "POST" : "DELETE", body });
      const result = await response.json();
      if (!response.ok || result.saved !== true) throw new Error(result.error || "No se pudo guardar la foto.");
      setFeedback({ error: false, text: result.cleanupPending ? "Foto actualizada. Quedó pendiente retirar la versión anterior." : file ? "Foto actualizada." : "Foto subida retirada." });
      notifyAccountUpdated();
      router.refresh();
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : "No pudimos guardar la foto." }); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div className={styles.photoEditor}>
    <CustomerAvatar key={src} src={src} name={name} size={72} />
    <div><strong>Tu foto de perfil</strong><p>JPG, PNG o WebP · hasta 2 MB</p>
      <div className={styles.photoActions}>
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={styles.photoButton}>
          {busy ? <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />} {busy ? "Guardando…" : "Cambiar foto"}
        </button>
        {customPhoto && <button type="button" className={styles.removePhoto} onClick={() => void save()} disabled={busy}>Quitar foto subida</button>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Seleccionar foto de perfil" className={styles.fileInput}
        onChange={event => { const file = event.target.files?.[0]; if (file) void save(file); }} />
    </div>
    {feedback && <p className={`${styles.photoFeedback} ${feedback.error ? styles.error : styles.success}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
  </div>;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button className="primary-button" disabled={pending} type="submit">{pending ? <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />} {pending ? "Guardando…" : "Guardar mis datos"}</button>;
}

export function ProfileForm({ name, phone, address, email, version }: { name: string; phone: string; address: string; email: string; version: string }) {
  const [state, action] = useActionState<ProfileActionState, FormData>(saveCustomerProfile, { status: "idle", message: "" });
  useNotificationFeedback(state.status, state.message);
  useEffect(() => { if (state.status === "success") notifyAccountUpdated(); }, [state]);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="version" value={version} />
    <div className={styles.formGrid}>
      <label className={styles.fullWidth}>Nombre completo<input name="displayName" defaultValue={name} autoComplete="name" placeholder="¿Cómo te llamas?" maxLength={160} required /></label>
      <label>Teléfono<input name="phone" type="tel" defaultValue={phone} autoComplete="tel" placeholder="Tu número de contacto" maxLength={40} /></label>
      <label>Correo de tu cuenta<input value={email} type="email" autoComplete="email" readOnly aria-describedby="profile-email-help" /><small id="profile-email-help">Usamos el correo con el que ingresaste.</small></label>
      <label className={styles.fullWidth}>Dirección de entrega preferida <span className={styles.optional}>Opcional</span>
        <textarea name="addressLine" defaultValue={address} autoComplete="street-address" rows={3} placeholder="Calle, zona, municipio y referencias útiles para la entrega" maxLength={500} />
        <small>Al comprar podrás copiarla y confirmar el destino y la cobertura.</small>
      </label>
    </div>
    {state.status !== "idle" && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" && <Check size={16} aria-hidden="true" />}{state.message}</p>}
    <div className={styles.saveRow}><p>Tus datos ayudan a completar tu próxima compra.</p><SaveButton /></div>
  </form>;
}
