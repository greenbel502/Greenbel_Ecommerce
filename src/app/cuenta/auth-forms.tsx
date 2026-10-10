"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type AuthActionState
} from "./actions";
import styles from "./auth.module.css";

const initialState: AuthActionState = { status: "idle", message: "" };

function Feedback({ state }: { state: AuthActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`${styles.feedback} ${state.status === "error" ? styles.error : styles.notice}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="primary-button" type="submit" disabled={pending}>{pending ? "Procesando…" : children}</button>;
}

export function SignInForm({ invalidLink = false, returnTo }: { invalidLink?: boolean; returnTo?: "/checkout" }) {
  const [state, formAction] = useActionState(signInAction, initialState);
  return (
    <>
      <h2>Ingresar</h2>
      {invalidLink && <p className={`${styles.feedback} ${styles.error}`} role="alert">El enlace de Auth es inválido o venció. Solicita uno nuevo o inicia sesión.</p>}
      <form className={styles.form} action={formAction}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
        <Feedback state={state} />
        <SubmitButton>Ingresar a mi cuenta</SubmitButton>
      </form>
      <div className={styles.links}>
        <Link href={returnTo ? "/cuenta/registro?next=%2Fcheckout" : "/cuenta/registro"}>Crear cuenta</Link>
        <Link href="/cuenta/recuperar">Olvidé mi contraseña</Link>
      </div>
    </>
  );
}

export function SignUpForm({ returnTo }: { returnTo?: "/checkout" }) {
  const [state, formAction] = useActionState(signUpAction, initialState);
  return (
    <>
      <h2>Crear cuenta</h2>
      <form className={styles.form} action={formAction}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <label>Confirmar contraseña<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <Feedback state={state} />
        <SubmitButton>Crear cuenta</SubmitButton>
      </form>
      <div className={styles.links}><Link href={returnTo ? "/cuenta/ingresar?next=%2Fcheckout" : "/cuenta/ingresar"}>Ya tengo cuenta</Link></div>
    </>
  );
}

export function RecoverPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);
  return (
    <>
      <h2>Recuperar acceso</h2>
      <form className={styles.form} action={formAction}>
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <Feedback state={state} />
        <SubmitButton>Solicitar enlace de Auth</SubmitButton>
      </form>
      <div className={styles.links}><Link href="/cuenta/ingresar">Volver a ingresar</Link></div>
    </>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, initialState);
  return (
    <>
      <h2>Nueva contraseña</h2>
      <form className={styles.form} action={formAction}>
        <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <label>Confirmar contraseña<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <Feedback state={state} />
        <SubmitButton>Actualizar contraseña</SubmitButton>
      </form>
    </>
  );
}
